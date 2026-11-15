import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { makeTestContext, mockFetch, ORIGIN, signedIn, type MockRoute } from './helpers.ts'

const FRAME = 'iVBORw0KGgo'.repeat(20) // stands in for a base64 PNG; the model service is mocked
const service = (path: string, respond: MockRoute['respond']): MockRoute => ({ match: (url) => url === `http://127.0.0.1:8790${path}`, respond })

describe('ultrasound analysis routes', () => {
  it('requires sign-in and the same origin', async () => {
    const { app } = makeTestContext()
    await request(app).get('/api/ultrasound/status').expect(401)
    await request(app).post('/api/ultrasound/jugular').set('Origin', ORIGIN).send({ image: FRAME, depthCm: 4 }).expect(401)
    const agent = await signedIn(app)
    await agent.post('/api/ultrasound/jugular').send({ image: FRAME, depthCm: 4 }).expect(403)
  })

  it('reports whether the model service is running', async () => {
    const down = makeTestContext()
    expect((await (await signedIn(down.app)).get('/api/ultrasound/status').expect(200)).body).toEqual({ available: false })
    const up = makeTestContext({ fetchImpl: mockFetch([service('/health', () => ({ body: { ok: true } }))]) })
    expect((await (await signedIn(up.app)).get('/api/ultrasound/status').expect(200)).body).toEqual({ available: true })
  })

  it('passes a jugular frame to the model service and returns its result', async () => {
    const fetchImpl = mockFetch([service('/jugular', () => ({ body: { measurements: { veinFound: true, areaMm2: 76 }, quality: { accept: true, reasons: [] } } }))])
    const { app } = makeTestContext({ fetchImpl })
    const res = await (await signedIn(app)).post('/api/ultrasound/jugular').set('Origin', ORIGIN).send({ image: FRAME, depthCm: 4 }).expect(200)
    expect(res.body.measurements.areaMm2).toBe(76)
    const sent = JSON.parse(String(fetchImpl.calls.at(-1)!.init!.body)) as { image: string; depthCm: number }
    expect(sent).toEqual({ image: FRAME, depthCm: 4 })
  })

  it('passes all four heart frames, and refuses a request that lacks one', async () => {
    const fetchImpl = mockFetch([service('/heart', () => ({ body: { ejectionFraction: 55 } }))])
    const { app } = makeTestContext({ fetchImpl })
    const agent = await signedIn(app)
    const frames = { '2CH_ED': FRAME, '2CH_ES': FRAME, '4CH_ED': FRAME, '4CH_ES': FRAME }
    expect((await agent.post('/api/ultrasound/heart').set('Origin', ORIGIN).send({ frames, depthCm: 16 }).expect(200)).body.ejectionFraction).toBe(55)
    const { '4CH_ES': _, ...three } = frames
    await agent.post('/api/ultrasound/heart').set('Origin', ORIGIN).send({ frames: three, depthCm: 16 }).expect(400)
    expect(fetchImpl.calls.filter((c) => c.url.endsWith('/heart'))).toHaveLength(1)
  })

  it('refuses input that is not a base64 image or has an impossible depth, without calling the service', async () => {
    const fetchImpl = mockFetch([service('/jugular', () => ({ body: {} }))])
    const { app } = makeTestContext({ fetchImpl })
    const agent = await signedIn(app)
    await agent.post('/api/ultrasound/jugular').set('Origin', ORIGIN).send({ image: '<svg onload=alert(1)>'.repeat(10), depthCm: 4 }).expect(400)
    await agent.post('/api/ultrasound/jugular').set('Origin', ORIGIN).send({ image: FRAME, depthCm: 0 }).expect(400)
    await agent.post('/api/ultrasound/jugular').set('Origin', ORIGIN).send({ image: FRAME, depthCm: 400 }).expect(400)
    expect(fetchImpl.calls.filter((c) => c.url.endsWith('/jugular'))).toHaveLength(0)
  })

  it('says the service is not running when it cannot be reached', async () => {
    const fetchImpl = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    const { app } = makeTestContext({ fetchImpl })
    const res = await (await signedIn(app)).post('/api/ultrasound/jugular').set('Origin', ORIGIN).send({ image: FRAME, depthCm: 4 }).expect(503)
    expect(res.body.error).toBe('ultrasound_unavailable')
  })

  it("returns the service's explanation for a frame it cannot read, and hides its other failures", async () => {
    const unreadable = makeTestContext({ fetchImpl: mockFetch([service('/jugular', () => ({ status: 400, body: { error: 'bad_input', message: 'That file could not be read as an image.' } }))]) })
    const bad = await (await signedIn(unreadable.app)).post('/api/ultrasound/jugular').set('Origin', ORIGIN).send({ image: FRAME, depthCm: 4 }).expect(400)
    expect(bad.body.message).toBe('That file could not be read as an image.')
    const broken = makeTestContext({ fetchImpl: mockFetch([service('/jugular', () => ({ status: 500, body: { error: 'analysis_failed', message: 'internal detail' } }))]) })
    const failed = await (await signedIn(broken.app)).post('/api/ultrasound/jugular').set('Origin', ORIGIN).send({ image: FRAME, depthCm: 4 }).expect(502)
    expect(JSON.stringify(failed.body)).not.toContain('internal detail')
  })
})

describe('content security policy for the built site', () => {
  it('allows the pages own inline scripts by hash, WebAssembly and the font hosts, and nothing inline otherwise', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { createHash } = await import('node:crypto')
    const { createApp } = await import('../src/app.ts')
    const dir = mkdtempSync(join(tmpdir(), 'guardian-static-'))
    mkdirSync(join(dir, 'home'))
    const boot = "if (!location.hash) location.replace('/home/index.html')\n"
    // Written with Windows line endings: a browser hashes the script with plain newlines.
    writeFileSync(join(dir, 'index.html'), `<html><head><script>${boot.replace(/\n/g, '\r\n')}</script><script src="/app.js"></script></head></html>`)
    writeFileSync(join(dir, 'home', 'index.html'), '<html><head><script>var intro = true</script></head></html>')
    const { ctx } = makeTestContext()
    const policy = String((await request(createApp(ctx, { staticDir: dir })).get('/').expect(200)).headers['content-security-policy'])
    const scripts = /script-src ([^;]*)/.exec(policy)![1]!
    const hash = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`
    expect(scripts).toContain(hash(boot))
    expect(scripts).toContain(hash('var intro = true'))
    expect(scripts).toContain("'wasm-unsafe-eval'")
    expect(scripts).not.toContain("'unsafe-inline'")
    expect(scripts).not.toContain("'unsafe-eval'")
    expect(policy).toMatch(/style-src [^;]*https:\/\/fonts\.googleapis\.com/)
    expect(policy).toMatch(/font-src [^;]*https:\/\/fonts\.gstatic\.com/)
  })
})
