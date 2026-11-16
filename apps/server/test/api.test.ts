import type { MeResponse, VitalsResponse } from '@astrovitals/shared'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { runRetention } from '../src/retention.ts'
import { fixture, fixtureJson, makeTestContext, mockFetch, ORIGIN, signedIn, supabaseToken, type MockRoute } from './helpers.ts'

describe('sign-in through Supabase', () => {
  it('trusts a Supabase access token: /me answers, with a local row keyed by the Supabase user id', async () => {
    const { app, db } = makeTestContext()
    const { token, id } = supabaseToken('astro@example.com')
    const me = (await request(app).get('/api/me').set('Authorization', `Bearer ${token}`).expect(200)).body as MeResponse
    expect(me.user.id).toBe(id)
    expect(me.user.email).toBe('astro@example.com')
    expect(me.user.demoMode).toBe(true)
    expect(me.providers.map((p) => p.id)).toEqual(['demo', 'google-health', 'apple-health-export', 'healthkit-companion', 'garmin'])
    await request(app).get('/api/me').set('Authorization', `Bearer ${token}`).expect(200)
    expect(db.prepare('SELECT id, email, password_hash FROM users').all()).toEqual([{ id, email: 'astro@example.com', password_hash: '' }])
  })

  it('refuses a missing, malformed or unknown token', async () => {
    const { app } = makeTestContext()
    await request(app).get('/api/me').expect(401)
    await request(app).get('/api/me').set('Authorization', 'Bearer short').expect(401)
    await request(app).get('/api/me').set('Authorization', 'Basic YWJjOmRlZg==').expect(401)
    await request(app).get('/api/me').set('Authorization', 'Bearer eyJ.not-a-token-supabase-knows').expect(401)
  })

  it('asks Supabase once a minute per token, keyed by a hash, and again for tokens it refused', async () => {
    const { app, supabaseCalls } = makeTestContext()
    const { token } = supabaseToken()
    for (let i = 0; i < 3; i++) await request(app).get('/api/me').set('Authorization', `Bearer ${token}`).expect(200)
    expect(supabaseCalls).toHaveLength(1)
    for (let i = 0; i < 2; i++) await request(app).get('/api/me').set('Authorization', 'Bearer eyJ.unknown-token-0123456789').expect(401)
    expect(supabaseCalls).toHaveLength(3)
  })

  it('answers 502, not 401, when Supabase cannot be reached', async () => {
    const { app, ctx } = makeTestContext()
    ctx.fetchImpl = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${supabaseToken().token}`).expect(502)
    expect(JSON.stringify(res.body)).not.toMatch(/eyJ/)
  })

  it('has no password routes of its own any more', async () => {
    const { app } = makeTestContext()
    for (const path of ['/api/auth/register', '/api/auth/login', '/api/auth/logout']) {
      await request(app).post(path).set('Origin', ORIGIN).send({ email: 'a@example.com', password: 'correct-horse-battery' }).expect(404)
    }
  })

  it('keeps the same local user when Supabase reports a new email, and never lets an old account block a new one', async () => {
    const { app, db, repo } = makeTestContext()
    db.prepare("INSERT INTO users (id, email, password_hash, demo_mode, created_at) VALUES ('old-local', 'shared@example.com', 'scrypt$x', 1, '2026-01-01')").run()
    const { token, id } = supabaseToken('shared@example.com')
    const me = (await request(app).get('/api/me').set('Authorization', `Bearer ${token}`).expect(200)).body as MeResponse
    expect(me.user).toMatchObject({ id, email: 'shared@example.com' })
    expect(repo.userById(id)?.email).toBe(`${id}@users.invalid`)
    expect(repo.userById('old-local')?.email).toBe('shared@example.com')
  })

  it('blocks cross-origin and origin-less state-changing requests (CSRF)', async () => {
    const { app } = makeTestContext()
    const agent = await signedIn(app)
    await agent.patch('/api/me/settings').send({ demoMode: false }).expect(403)
    await agent.patch('/api/me/settings').set('Origin', 'https://evil.example').send({ demoMode: false }).expect(403)
    await agent.patch('/api/me/settings').set('Origin', ORIGIN).send({ demoMode: false }).expect(200)
  })

  it('requires authentication for health and NASA data', async () => {
    const { app } = makeTestContext()
    for (const path of ['/api/vitals', '/api/nasa/apod', '/api/nasa/radiation', '/api/me', '/api/providers']) await request(app).get(path).expect(401)
  })

  it('sends security headers', async () => {
    const { app } = makeTestContext()
    const res = await request(app).get('/api/health').expect(200)
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})

describe('vitals', () => {
  it('returns DEMO data labelled simulated, and nothing once demo mode is off', async () => {
    const { app } = makeTestContext()
    const agent = await signedIn(app)
    const v = (await agent.get('/api/vitals').expect(200)).body as VitalsResponse
    expect(v.sources).toEqual([expect.objectContaining({ provider: 'demo', simulated: true })])
    expect(v.metrics.length).toBeGreaterThan(100)
    expect(v.metrics.every((m) => m.simulated)).toBe(true)
    expect(v.activity.length).toBeGreaterThan(0)
    await agent.patch('/api/me/settings').set('Origin', ORIGIN).send({ demoMode: false }).expect(200)
    const off = (await agent.get('/api/vitals').expect(200)).body as VitalsResponse
    expect(off.metrics).toHaveLength(0)
    expect(off.sources).toHaveLength(0)
  })

  it('validates the range', async () => {
    const { app } = makeTestContext()
    const agent = await signedIn(app)
    await agent.get('/api/vitals?from=2026-01-01T00:00:00Z&to=2026-10-01T00:00:00Z').expect(400)
    await agent.get('/api/vitals?from=not-a-date').expect(400)
  })
})

describe('Apple Health export import', () => {
  it('imports export.xml, keeps real and simulated data separate, and deletes on disconnect', async () => {
    const { app } = makeTestContext()
    const agent = await signedIn(app)
    await agent.post('/api/providers/apple-health-export/import').set('Origin', ORIGIN).set('content-type', 'text/plain').send('x').expect(415)
    const res = await agent
      .post('/api/providers/apple-health-export/import?days=90')
      .set('Origin', ORIGIN)
      .set('content-type', 'application/xml')
      .send(fixture('apple-health/export-sample.xml'))
    // The fixture dates are fixed (Oct 2026); with a relative 90-day window they are inside it until 2027.
    expect(res.status).toBe(200)
    expect(res.body.metrics).toBeGreaterThan(5)
    expect(res.body.sleep).toBe(1)
    expect(res.body.workouts).toBe(1)

    const v = (await agent.get('/api/vitals?from=2026-10-01T00:00:00Z&to=2026-10-06T00:00:00Z').expect(200)).body as VitalsResponse
    const real = v.metrics.filter((m) => m.source === 'apple-health-export')
    expect(real.length).toBeGreaterThan(5)
    expect(real.every((m) => !m.simulated)).toBe(true)
    expect(v.metrics.filter((m) => m.source === 'demo').every((m) => m.simulated)).toBe(true)
    expect(real.find((m) => m.metricType === 'spo2')?.raw).toEqual({ value: 0.97, unit: '%' })

    await agent.delete('/api/providers/apple-health-export').set('Origin', ORIGIN).expect(200)
    const after = (await agent.get('/api/vitals?from=2026-10-01T00:00:00Z&to=2026-10-06T00:00:00Z').expect(200)).body as VitalsResponse
    expect(after.metrics.filter((m) => m.source === 'apple-health-export')).toHaveLength(0)
  })

  it('trims a window longer than the retention period instead of rejecting it', async () => {
    const { app } = makeTestContext()
    const agent = await signedIn(app)
    const res = await agent
      .post('/api/providers/apple-health-export/import?days=3650')
      .set('Origin', ORIGIN)
      .set('content-type', 'application/xml')
      .send(fixture('apple-health/export-sample.xml'))
      .expect(200)
    expect(res.body.metrics).toBeGreaterThan(5)
    expect(res.body.notes[0]).toMatch(/last 90 day\(s\).*3650.*retention/)
    await agent.post('/api/providers/apple-health-export/import?days=0').set('Origin', ORIGIN).set('content-type', 'application/xml').send('<HealthData/>').expect(400)
  })

  it('rejects files that are not Health exports', async () => {
    const { app } = makeTestContext()
    const agent = await signedIn(app)
    const res = await agent.post('/api/providers/apple-health-export/import').set('Origin', ORIGIN).set('content-type', 'application/xml').send('<html/>').expect(400)
    expect(res.body.message).toMatch(/Apple Health export/)
  })
})

describe('HealthKit companion ingest', () => {
  it('issues a one-time device token, ingests with it, and stops after revocation', async () => {
    const { app, db } = makeTestContext()
    const agent = await signedIn(app)
    const created = await agent.post('/api/providers/healthkit-companion/tokens').set('Origin', ORIGIN).send({ label: 'My iPhone' }).expect(201)
    const token = created.body.token as string
    expect(JSON.stringify(db.prepare('SELECT * FROM device_tokens').all())).not.toContain(token)

    const payload = {
      samples: [{ type: 'HKQuantityTypeIdentifierHeartRate', value: 62, unit: 'count/min', start: '2026-10-04T08:00:00-05:00', end: '2026-10-04T08:00:00-05:00', sourceName: 'Apple Watch' }],
    }
    await request(app).post('/api/ingest/healthkit').send(payload).expect(401)
    await request(app).post('/api/ingest/healthkit').set('authorization', 'Bearer not-a-real-token-1234567890').send(payload).expect(401)
    const ok = await request(app).post('/api/ingest/healthkit').set('authorization', `Bearer ${token}`).send(payload).expect(200)
    expect(ok.body.accepted.metrics).toBe(1)
    await request(app).post('/api/ingest/healthkit').set('authorization', `Bearer ${token}`).send({ samples: [{ type: 'x' }] }).expect(400)

    const v = (await agent.get('/api/vitals?from=2026-10-04T00:00:00Z&to=2026-10-05T00:00:00Z').expect(200)).body as VitalsResponse
    expect(v.metrics.find((m) => m.source === 'healthkit-companion')?.value).toBe(62)

    await agent.delete(`/api/providers/healthkit-companion/tokens/${created.body.id}`).set('Origin', ORIGIN).expect(200)
    await request(app).post('/api/ingest/healthkit').set('authorization', `Bearer ${token}`).send(payload).expect(401)
  })
})

describe('Google Health OAuth (mocked Google endpoints)', () => {
  const env = { GOOGLE_HEALTH_CLIENT_ID: 'client-123.apps.googleusercontent.com', GOOGLE_HEALTH_CLIENT_SECRET: 'shh-secret' }

  function googleMocks(state: { revoked: string[]; tokenBodies: string[] }): MockRoute[] {
    const list = (name: string) => fixtureJson(`google-health/${name}.json`)
    return [
      {
        match: (u) => u === 'https://oauth2.googleapis.com/token',
        respond: (_u, init) => {
          state.tokenBodies.push(String(init?.body))
          return {
            body: {
              access_token: 'ya29.ACCESS-TOKEN-PLAINTEXT',
              refresh_token: '1//REFRESH-TOKEN-PLAINTEXT',
              expires_in: 3599,
              token_type: 'Bearer',
              scope: 'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly https://www.googleapis.com/auth/googlehealth.sleep.readonly',
            },
          }
        },
      },
      {
        match: (u) => u === 'https://oauth2.googleapis.com/revoke',
        respond: (_u, init) => {
          state.revoked.push(String(init?.body))
          return { text: '' }
        },
      },
      { match: (u) => u.includes('/dataTypes/heart-rate/dataPoints:rollUp'), respond: () => ({ body: list('rollup-heart-rate') }) },
      { match: (u) => u.includes('/dataTypes/steps/dataPoints:dailyRollUp'), respond: () => ({ body: list('dailyrollup-steps') }) },
      { match: (u) => u.includes(':dailyRollUp'), respond: () => ({ body: {} }) },
      { match: (u) => u.includes('/dataTypes/sleep/dataPoints?'), respond: () => ({ body: list('list-sleep') }) },
      { match: (u) => u.includes('/dataTypes/exercise/dataPoints?'), respond: () => ({ body: list('list-exercise') }) },
      { match: (u) => u.includes('/dataTypes/daily-resting-heart-rate/dataPoints?'), respond: () => ({ body: list('list-daily') }) },
      { match: (u) => u.startsWith('https://health.googleapis.com/v4/users/me/dataTypes/'), respond: () => ({ body: { dataPoints: [] } }) },
    ]
  }

  it('reports unavailable when not configured (no fake connect button)', async () => {
    const { app } = makeTestContext()
    const agent = await signedIn(app)
    const me = (await agent.get('/api/me')).body as MeResponse
    expect(me.providers.find((p) => p.id === 'google-health')).toMatchObject({ available: false, connected: false })
    await agent.post('/api/providers/google-health/connect').set('Origin', ORIGIN).expect(409)
  })

  it('runs authorize → callback → sync → disconnect with PKCE, encrypted tokens and revocation', async () => {
    const state = { revoked: [] as string[], tokenBodies: [] as string[] }
    const f = mockFetch(googleMocks(state))
    const { app, db } = makeTestContext({ fetchImpl: f, env })
    const agent = await signedIn(app)

    const { url } = (await agent.post('/api/providers/google-health/connect').set('Origin', ORIGIN).expect(200)).body as { url: string }
    const auth = new URL(url)
    expect(auth.origin + auth.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256')
    expect(auth.searchParams.get('access_type')).toBe('offline')
    expect(auth.searchParams.get('scope')!.split(' ')).toHaveLength(3)
    expect(auth.searchParams.get('scope')).not.toMatch(/writeonly/)
    const st = auth.searchParams.get('state')!

    // another signed-in user cannot complete this user's flow
    const attacker = await signedIn(app, 'mallory@example.com')
    const hijack = await attacker.get(`/api/providers/google-health/callback?code=abc&state=${st}`).expect(303)
    expect(hijack.headers.location).toContain('status=error')

    // state is single-use, so the legitimate user must start again
    const { url: url2 } = (await agent.post('/api/providers/google-health/connect').set('Origin', ORIGIN).expect(200)).body as { url: string }
    const st2 = new URL(url2).searchParams.get('state')!
    const ok = await agent.get(`/api/providers/google-health/callback?code=auth-code-1&state=${st2}`).expect(303)
    expect(ok.headers.location).toBe(`${ORIGIN}/#/connections?provider=google-health&status=connected`)
    expect(state.tokenBodies.at(-1)).toContain('code_verifier=')
    expect(state.tokenBodies.at(-1)).toContain('grant_type=authorization_code')

    const row = JSON.stringify(db.prepare('SELECT * FROM provider_connections').all())
    expect(row).not.toContain('ACCESS-TOKEN-PLAINTEXT')
    expect(row).not.toContain('REFRESH-TOKEN-PLAINTEXT')

    const sync = await agent.post('/api/providers/google-health/sync').set('Origin', ORIGIN).send({ days: 7 }).expect(200)
    expect(sync.body.metrics).toBeGreaterThan(5)
    expect(sync.body.sleep).toBe(1)
    const apiCall = f.calls.find((c) => c.url.includes('health.googleapis.com'))!
    expect((apiCall.init?.headers as Record<string, string>).authorization).toBe('Bearer ya29.ACCESS-TOKEN-PLAINTEXT')

    // Request bodies follow the v4 discovery document: rollUp takes a physical Interval
    // {startTime, endTime}; dailyRollUp takes a CivilTimeInterval {start, end} of CivilDateTime.
    const bodyOf = (part: string) => JSON.parse(String(f.calls.find((c) => c.url.includes(part))!.init!.body))
    const roll = bodyOf('/heart-rate/dataPoints:rollUp')
    expect(Object.keys(roll.range).sort()).toEqual(['endTime', 'startTime'])
    expect(roll.windowSize).toBe('300s')
    const daily = bodyOf('/steps/dataPoints:dailyRollUp')
    expect(Object.keys(daily.range).sort()).toEqual(['end', 'start'])
    expect(daily.range.start).toEqual({ date: { year: expect.any(Number), month: expect.any(Number), day: expect.any(Number) } })
    expect(daily.windowSizeDays).toBe(1)

    await agent.delete('/api/providers/google-health').set('Origin', ORIGIN).expect(200)
    expect(state.revoked[0]).toContain('token=1%2F%2FREFRESH-TOKEN-PLAINTEXT')
    expect(db.prepare("SELECT COUNT(*) AS n FROM metrics WHERE provider = 'google-health'").get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM provider_connections').get()).toEqual({ n: 0 })
  })

  it('redirects denied consent back to the app', async () => {
    const { app } = makeTestContext({ env })
    const agent = await signedIn(app)
    const res = await agent.get('/api/providers/google-health/callback?error=access_denied&state=x').expect(303)
    expect(res.headers.location).toContain('status=denied')
  })
})

describe('NASA routes', () => {
  it('proxies DONKI through the backend and validates parameters', async () => {
    const f = mockFetch([{ match: (u) => u.includes('DONKI-API'), respond: (u) => ({ body: u.includes('/FLR?') ? fixtureJson('nasa/donki-FLR.json') : [] }) }])
    const { app } = makeTestContext({ fetchImpl: f })
    const agent = await signedIn(app)
    const res = await agent.get('/api/nasa/space-weather?from=2026-09-05&to=2026-10-05').expect(200)
    expect(res.body.source).toBe('NASA DONKI (CCMC)')
    expect(res.body.data.length).toBeGreaterThan(0)
    await agent.get('/api/nasa/space-weather?from=2026-01-01&to=2026-10-05').expect(400)
    await agent.get('/api/nasa/earth-events?category=../../etc').expect(400)
    await agent.get('/api/nasa/apod?date=1990-01-01').expect(400)
  })

  it('returns 502 without leaking upstream details when NASA is down and nothing is cached', async () => {
    const f = mockFetch([{ match: () => true, respond: () => ({ status: 503, text: 'internal stack trace here' }) }])
    const { app } = makeTestContext({ fetchImpl: f })
    const agent = await signedIn(app)
    const res = await agent.get('/api/nasa/earth-events').expect(502)
    expect(JSON.stringify(res.body)).not.toContain('stack trace')
  })
})

describe('privacy controls', () => {
  it('exports data, deletes health data, and deletes the account', async () => {
    const { app, db } = makeTestContext()
    const agent = await signedIn(app)
    await agent.post('/api/providers/apple-health-export/import?days=90').set('Origin', ORIGIN).set('content-type', 'application/xml').send(fixture('apple-health/export-sample.xml')).expect(200)
    const exp = await agent.get('/api/me/export').expect(200)
    expect(exp.headers['content-disposition']).toMatch(/attachment/)
    expect(exp.body.metrics.length).toBeGreaterThan(0)
    expect(JSON.stringify(exp.body)).not.toMatch(/token_enc|password/)

    await agent.delete('/api/me/data').set('Origin', ORIGIN).expect(200)
    expect(db.prepare('SELECT COUNT(*) AS n FROM metrics').get()).toEqual({ n: 0 })

    await agent.delete('/api/me').set('Origin', ORIGIN).send({ confirm: 'nope' }).expect(400)
    await agent.delete('/api/me').set('Origin', ORIGIN).send({ confirm: 'DELETE' }).expect(200)
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 0 })
  })

  it('rejects an Apple Health export that is cut off before </HealthData>', async () => {
    const { app, db } = makeTestContext()
    const agent = await signedIn(app)
    const res = await agent.post('/api/providers/apple-health-export/import').set('Origin', ORIGIN).set('content-type', 'application/xml').send('<HealthData><Record').expect(400)
    expect(JSON.stringify(res.body)).toContain('complete Apple Health export')
    // A rejected file must not leave the provider marked as connected.
    expect((db.prepare("SELECT COUNT(*) AS n FROM provider_connections WHERE provider = 'apple-health-export'").get() as { n: number }).n).toBe(0)
  })

  it('retention job deletes measurements older than RETENTION_DAYS', async () => {
    const { app, ctx, db } = makeTestContext({ env: { RETENTION_DAYS: '3650' } })
    const agent = await signedIn(app)
    // The fixture's dates are fixed, so use a window wide enough that the test does not expire as time passes.
    await agent.post('/api/providers/apple-health-export/import?days=3650').set('Origin', ORIGIN).set('content-type', 'application/xml').send(fixture('apple-health/export-sample.xml')).expect(200)
    const before = (db.prepare('SELECT COUNT(*) AS n FROM metrics').get() as { n: number }).n
    expect(before).toBeGreaterThan(0)
    runRetention(ctx, new Date(Date.now() + 3651 * 86_400_000))
    expect(db.prepare('SELECT COUNT(*) AS n FROM metrics').get()).toEqual({ n: 0 })
  })
})

describe('log hygiene', () => {
  it('never writes health values, access tokens, emails or OAuth codes to the logs', async () => {
    const state = { revoked: [] as string[], tokenBodies: [] as string[] }
    const env = { GOOGLE_HEALTH_CLIENT_ID: 'client-123', GOOGLE_HEALTH_CLIENT_SECRET: 'shh-secret' }
    const f = mockFetch([
      { match: (u) => u === 'https://oauth2.googleapis.com/token', respond: () => ({ body: { access_token: 'ya29.LEAKCHECK', refresh_token: '1//LEAKCHECK-R', expires_in: 3599, token_type: 'Bearer', scope: '' } }) },
      { match: () => true, respond: () => ({ body: { dataPoints: [] } }) },
    ])
    const { app, sink } = makeTestContext({ fetchImpl: f, env })
    void state
    const { token } = supabaseToken('secret.person@example.com')
    const agent = request.agent(app).set('Authorization', `Bearer ${token}`)
    await agent.post('/api/providers/apple-health-export/import?days=90').set('Origin', ORIGIN).set('content-type', 'application/xml').send(fixture('apple-health/export-sample.xml')).expect(200)
    const { url } = (await agent.post('/api/providers/google-health/connect').set('Origin', ORIGIN)).body as { url: string }
    await agent.get(`/api/providers/google-health/callback?code=SUPER-SECRET-CODE&state=${new URL(url).searchParams.get('state')}`).expect(303)
    await agent.get('/api/vitals').expect(200)

    const logs = sink.text()
    expect(logs.length).toBeGreaterThan(0)
    for (const forbidden of ['secret.person@example.com', token, token.slice(-24), 'SUPER-SECRET-CODE', 'LEAKCHECK', 'shh-secret', '"value":', '0.97', 'Test’s Apple Watch']) {
      expect(logs).not.toContain(forbidden)
    }
    expect(logs).toContain('"path":"/api/providers/google-health/callback"') // path kept, query string stripped
  })
})
