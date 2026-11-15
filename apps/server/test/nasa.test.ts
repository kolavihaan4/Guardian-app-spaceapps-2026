import { describe, expect, it } from 'vitest'
import { apodDateCode, htmlToText, parseLegacyApod, parseWpApod } from '../src/nasa/apod.ts'
import { flareClassToFlux, kpToGScale, parseCmes, parseDonki, parseFlares, parseSeps, parseStorms } from '../src/nasa/donki.ts'
import { parseEonetEvents } from '../src/nasa/eonet.ts'
import { parsePowerDaily } from '../src/nasa/power.ts'
import { parseRadiation } from '../src/nasa/swpc.ts'
import { fixture, fixtureJson, makeTestContext, mockFetch } from './helpers.ts'
import { UpstreamError } from '../src/lib/errors.ts'

/**
 * SYNTHETIC: a well-formed legacy APOD body in the documented api.nasa.gov shape. Every live legacy
 * response captured since the 2026 migration is the placeholder in fixtures/nasa/apod-legacy.json,
 * so no real well-formed one exists to capture.
 */
const LEGACY_APOD_WELLFORMED = {
  date: '2024-07-04',
  title: 'Synthetic Test Nebula',
  explanation: 'Synthetic explanation used only in tests.',
  url: 'https://apod.nasa.gov/apod/image/2407/test_1024.jpg',
  hdurl: 'https://apod.nasa.gov/apod/image/2407/test.jpg',
  media_type: 'image',
  copyright: ' Jane Doe ',
  service_version: 'v1',
}

describe('DONKI parsing (real responses)', () => {
  it('maps flares with GOES class, flux and instruments', () => {
    const events = parseFlares(fixtureJson('nasa/donki-FLR.json'))
    expect(events.length).toBeGreaterThan(0)
    const e = events[0]!
    expect(e.source).toBe('DONKI')
    expect(e.eventType).toBe('FLR')
    expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/)
    expect(e.severity?.scale).toBe('GOES X-ray class')
    expect(e.link).toMatch(/^https:\/\/ccmc\.gsfc\.nasa\.gov\/DONKI\/view\/FLR\//)
    expect(e.latitude).toBeUndefined() // solar coordinates never become Earth coordinates
  })

  it('maps the May 2024 storm to Kp and NOAA G-scale', () => {
    const storms = parseStorms(fixtureJson('nasa/donki-GST-2024-05.json'))
    const max = Math.max(...storms.map((s) => s.severity?.value ?? 0))
    expect(max).toBeGreaterThanOrEqual(8)
    const strongest = storms.find((s) => s.severity?.value === max)!
    expect(strongest.metadata.noaaGScale).toMatch(/^G[45]$/)
  })

  it('keeps CME heliographic coordinates in metadata only', () => {
    const cmes = parseCmes(fixtureJson('nasa/donki-CME.json'))
    for (const c of cmes) {
      expect(c.latitude).toBeUndefined()
      expect(c.longitude).toBeUndefined()
    }
    const withAnalysis = cmes.find((c) => c.metadata.analysis)
    expect(withAnalysis?.metadata.analysis).toHaveProperty('heliographicLatitude')
  })

  it('maps SEP events and tolerates empty / non-array bodies', () => {
    expect(parseSeps(fixtureJson('nasa/donki-SEP.json'))[0]?.eventType).toBe('SEP')
    expect(parseDonki('FLR', '')).toEqual([])
    expect(parseDonki('GST', null)).toEqual([])
  })

  it('converts flare classes and Kp correctly', () => {
    expect(flareClassToFlux('X1.0')).toBeCloseTo(1e-4)
    expect(flareClassToFlux('M2.4')).toBeCloseTo(2.4e-5)
    expect(flareClassToFlux('bogus')).toBeUndefined()
    expect(kpToGScale(4.67)).toBeUndefined()
    expect(kpToGScale(5)).toBe('G1')
    expect(kpToGScale(9)).toBe('G5')
  })
})

describe('EONET parsing (real responses)', () => {
  it('maps point events with [lon, lat] order', () => {
    const events = parseEonetEvents(fixtureJson('nasa/eonet-events-open.json'))
    expect(events.length).toBeGreaterThan(0)
    for (const e of events) {
      expect(e.source).toBe('EONET')
      if (e.latitude !== undefined) {
        expect(Math.abs(e.latitude)).toBeLessThanOrEqual(90)
        expect(Math.abs(e.longitude!)).toBeLessThanOrEqual(180)
      }
    }
  })

  it('repairs a polygon ring written as [lat, lon] (EONET_24511, Thailand)', () => {
    const [e] = parseEonetEvents(fixtureJson('nasa/eonet-events-polygon.json'))
    expect(e!.id).toBe('EONET_24511')
    expect(e!.latitude).toBeGreaterThan(5)
    expect(e!.latitude).toBeLessThan(21) // Thailand latitude band
    expect(e!.longitude).toBeGreaterThan(97)
    expect(e!.metadata.coordinateNote).toMatch(/swapped/)
  })
})

describe('APOD parsing (real responses)', () => {
  it('parses the new WordPress endpoint and strips HTML', () => {
    const a = parseWpApod(fixtureJson('nasa/apod-wp-261005.json'))
    expect(a.date).toBe('2026-10-05')
    expect(a.explanation).not.toMatch(/<[a-z]/i)
    expect(a.explanation).not.toMatch(/^Explanation:/)
    expect(a.credit).toBe('Engelbert Vollmer')
    expect(a.imageUrl).toMatch(/^https:\/\/assets\.science\.nasa\.gov\//)
  })

  it('parses the list form and the legacy endpoint', () => {
    expect(parseWpApod(fixtureJson('nasa/apod-wp-list.json')).title).toBeTruthy()
    const a = parseLegacyApod(LEGACY_APOD_WELLFORMED)
    expect(a.pageUrl).toBe('https://apod.nasa.gov/apod/ap240704.html')
    expect(a.imageUrl).toBe(LEGACY_APOD_WELLFORMED.hdurl)
    expect(a.credit).toBe('Jane Doe')
  })

  it('builds legacy date codes and decodes entities', () => {
    expect(apodDateCode('2026-10-05')).toBe('261005')
    expect(htmlToText('<a href="x">A&amp;B</a> &#8217;s<script>alert(1)</script>')).toBe('A&B ’s')
  })
})

describe('POWER parsing (real response)', () => {
  it('maps -999 fill values to null and keeps units', () => {
    const series = parsePowerDaily(fixtureJson('nasa/power-daily-point.json'))
    const t2m = series.find((s) => s.parameter === 'T2M')!
    expect(t2m.unit).toBe('C')
    expect(t2m.points[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(t2m.points.some((p) => p.value === null)).toBe(true)
    expect(t2m.points.every((p) => p.value === null || p.value > -100)).toBe(true)
  })
})

describe('NOAA SWPC radiation (real responses, captured 2026-10-12)', () => {
  const protons = () => fixtureJson<{ time_tag: string; flux: number; energy: string }[]>('nasa/swpc-protons-1-day.json')
  const scales = () => fixtureJson<Record<string, unknown>>('nasa/swpc-noaa-scales.json')

  it('pairs ≥10 and ≥100 MeV flux per 5-minute sample and reports the official S-scale', () => {
    const r = parseRadiation(protons(), scales())
    expect(r.series).toHaveLength(287)
    expect(r.series.every((p, i) => i === 0 || p.time > r.series[i - 1]!.time)).toBe(true)
    expect(r.observedAt).toBe('2026-10-12T02:25:00Z')
    expect(r.flux10MeV).toBeGreaterThan(0)
    expect(r.flux10MeV).toBeLessThan(10) // quiet day: below the S1 threshold
    expect(r.satellite).toBe(18)
    expect(r).toMatchObject({ sScale: 0, sText: 'none' })
    expect(r.forecast).toEqual([
      { date: '2026-10-12', s1Probability: 10 },
      { date: '2026-10-13', s1Probability: 5 },
      { date: '2026-10-14', s1Probability: 5 },
    ])
  })

  it('takes the S-scale from NOAA rather than recomputing it from one sample', () => {
    // SYNTHETIC variant of the real body: NOAA reporting an S1 storm in progress.
    const s = scales() as Record<string, { S: Record<string, unknown> }>
    s['0']!.S = { Scale: '1', Text: 'minor', Prob: null }
    expect(parseRadiation(protons(), s)).toMatchObject({ sScale: 1, sText: 'minor' })
  })

  it('says "unknown" instead of "none" when the scales feed is missing, and tolerates junk', () => {
    expect(parseRadiation(protons(), null)).toMatchObject({ sScale: null, sText: 'unknown', forecast: [] })
    const junk = parseRadiation([{ time_tag: '2026-10-12T00:00:00Z', flux: -1, energy: '>=10 MeV' }, null, 'x'], 'nope')
    expect(junk.series).toEqual([{ time: '2026-10-12T00:00:00Z', flux10MeV: null, flux100MeV: null }])
    expect(junk.flux10MeV).toBeNull()
  })
})

describe('NasaService', () => {
  const donkiRoute = (body: unknown, status = 200) => ({
    match: (u: string) => u.startsWith('https://ccmc.gsfc.nasa.gov/DONKI-API/get/'),
    respond: () => ({ status, body }),
  })

  it('calls the keyless DONKI-API base and caches results', async () => {
    const f = mockFetch([donkiRoute(JSON.parse(fixture('nasa/donki-FLR.json')))])
    const { ctx } = makeTestContext({ fetchImpl: f })
    const first = await ctx.nasa.spaceWeather('2026-09-05', '2026-10-05', ['FLR'])
    expect(first.stale).toBe(false)
    expect(f.calls[0]!.url).toBe('https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?startDate=2026-09-05&endDate=2026-10-05')
    expect(f.calls[0]!.url).not.toContain('api_key')
    await ctx.nasa.spaceWeather('2026-09-05', '2026-10-05', ['FLR'])
    expect(f.calls).toHaveLength(1) // served from cache
  })

  it('serves stale cache (labelled) when the upstream fails, and errors with no cache', async () => {
    let up = true
    const f = mockFetch([
      {
        match: (u) => u.includes('eonet'),
        respond: () => (up ? { body: fixtureJson('nasa/eonet-events-open.json') } : { status: 503, text: 'down' }),
      },
    ])
    const { ctx, repo } = makeTestContext({ fetchImpl: f })
    await ctx.nasa.earthEvents({ days: 30, limit: 5, status: 'all' })
    repo.db.prepare("UPDATE nasa_cache SET expires_at = '2000-01-01T00:00:00.000Z'").run()
    up = false
    const stale = await ctx.nasa.earthEvents({ days: 30, limit: 5, status: 'all' })
    expect(stale.stale).toBe(true)
    expect(stale.notes?.[0]).toMatch(/cached/)
    await expect(ctx.nasa.earthEvents({ days: 7, limit: 5, status: 'open' })).rejects.toThrow(/HTTP 503/)
  })

  it('treats an HTML page from a moved endpoint as an upstream error', async () => {
    const f = mockFetch([{ match: () => true, respond: () => ({ text: '<!DOCTYPE html><html>CCMC Announcements</html>' }) }])
    const { ctx } = makeTestContext({ fetchImpl: f })
    await expect(ctx.nasa.spaceWeather('2026-09-05', '2026-10-05', ['GST'])).rejects.toThrow(/non-JSON/)
  })

  it('falls back to the legacy APOD API with the server-side key', async () => {
    const f = mockFetch([
      { match: (u) => u.startsWith('https://science.nasa.gov/'), respond: () => ({ status: 500, text: 'oops' }) },
      { match: (u) => u.startsWith('https://api.nasa.gov/planetary/apod'), respond: () => ({ body: LEGACY_APOD_WELLFORMED }) },
    ])
    const { ctx } = makeTestContext({ fetchImpl: f, env: { NASA_API_KEY: 'test-key-123' } })
    const r = await ctx.nasa.apod()
    expect(r.data.title).toBe(LEGACY_APOD_WELLFORMED.title)
    expect(f.calls[1]!.url).toContain('api_key=test-key-123')
  })

  it('rejects the legacy APOD placeholder (NASA logo, title "NASA Science") instead of showing it', async () => {
    expect(() => parseLegacyApod(fixtureJson('nasa/apod-legacy.json'))).toThrow(UpstreamError)
    const f = mockFetch([
      { match: (u) => u.startsWith('https://science.nasa.gov/'), respond: () => ({ status: 500, text: 'oops' }) },
      { match: (u) => u.startsWith('https://api.nasa.gov/planetary/apod'), respond: () => ({ body: fixtureJson('nasa/apod-legacy.json') }) },
    ])
    const { ctx } = makeTestContext({ fetchImpl: f })
    await expect(ctx.nasa.apod('2025-03-14')).rejects.toThrow(UpstreamError)
  })

  it('fetches SWPC protons and scales once, then serves the cache', async () => {
    const f = mockFetch([
      { match: (u) => u === 'https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json', respond: () => ({ body: fixtureJson('nasa/swpc-protons-1-day.json') }) },
      { match: (u) => u === 'https://services.swpc.noaa.gov/products/noaa-scales.json', respond: () => ({ body: fixtureJson('nasa/swpc-noaa-scales.json') }) },
    ])
    const { ctx } = makeTestContext({ fetchImpl: f })
    const a = await ctx.nasa.radiation()
    const b = await ctx.nasa.radiation()
    expect(a.source).toBe('NOAA SWPC (GOES)')
    expect(b.data.flux10MeV).toBe(a.data.flux10MeV)
    expect(f.calls).toHaveLength(2)
  })

  it('rounds POWER coordinates to the 0.5° grid (shared cache, less precise location upstream)', async () => {
    const f = mockFetch([{ match: (u) => u.includes('power.larc.nasa.gov'), respond: () => ({ body: fixtureJson('nasa/power-daily-point.json') }) }])
    const { ctx } = makeTestContext({ fetchImpl: f })
    const r = await ctx.nasa.environment(29.5502, -95.097, '2026-09-21', '2026-10-04')
    expect(r.data.latitude).toBe(29.5)
    expect(r.data.longitude).toBe(-95)
    expect(f.calls[0]!.url).toContain('latitude=29.5&longitude=-95')
    expect(f.calls[0]!.url).toContain('community=RE')
  })
})
