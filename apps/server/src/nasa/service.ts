import type { ApodEntry, EnvironmentSeries, NASAEvent, RadiationStatus, Sourced } from '@astrovitals/shared'
import type { Logger } from 'pino'
import type { Config } from '../config.ts'
import { UpstreamError } from '../lib/errors.ts'
import { getJson, type FetchLike } from '../lib/http.ts'
import type { Repo } from '../repo.ts'
import { apodDateCode, parseLegacyApod, parseWpApod } from './apod.ts'
import { DONKI_TYPES, parseDonki, type DonkiType } from './donki.ts'
import { parseEonetEvents } from './eonet.ts'
import { compactDate, parsePowerDaily, POWER_PARAMETERS } from './power.ts'
import { parseRadiation } from './swpc.ts'

const TTL = { donki: 30 * 60, eonet: 15 * 60, apod: 6 * 3600, power: 6 * 3600, swpc: 5 * 60 }

/**
 * All NASA traffic goes through the backend: keys stay server-side, responses are cached in
 * SQLite so many dashboard users share one upstream budget, and a stale copy is served (and
 * labelled stale) when an upstream is down.
 */
export class NasaService {
  constructor(
    private readonly cfg: Config,
    private readonly repo: Repo,
    private readonly log: Logger,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async cached<T>(key: string, ttl: number, source: string, load: () => Promise<T>): Promise<Sourced<T>> {
    const hit = this.repo.cacheGet(key)
    if (hit && hit.expires_at > new Date().toISOString()) {
      return { data: JSON.parse(hit.body) as T, source, fetchedAt: hit.fetched_at, stale: false }
    }
    try {
      const data = await load()
      const fetchedAt = this.repo.cachePut(key, JSON.stringify(data), ttl)
      return { data, source, fetchedAt, stale: false }
    } catch (err) {
      const reason = err instanceof UpstreamError ? err.message : 'upstream error'
      this.log.warn({ upstream: source, reason }, 'nasa upstream failed')
      if (hit) {
        return { data: JSON.parse(hit.body) as T, source, fetchedAt: hit.fetched_at, stale: true, notes: [`Live request failed (${reason}); showing cached data.`] }
      }
      throw err
    }
  }

  /** Space weather from DONKI: flares, geomagnetic storms, CMEs, SEP events. */
  spaceWeather(startDate: string, endDate: string, types: readonly DonkiType[] = DONKI_TYPES): Promise<Sourced<NASAEvent[]>> {
    const key = `donki:${types.join(',')}:${startDate}:${endDate}`
    return this.cached(key, TTL.donki, 'NASA DONKI (CCMC)', async () => {
      const all = await Promise.all(
        types.map(async (t) => {
          const url = `${this.cfg.NASA_DONKI_BASE}/${t}?startDate=${startDate}&endDate=${endDate}`
          const { data } = await getJson('DONKI', url, { fetchImpl: this.fetchImpl })
          return parseDonki(t, data)
        }),
      )
      return all.flat().sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    })
  }

  /** Natural events from EONET (wildfires, storms, volcanoes, ...). */
  earthEvents(opts: { days: number; limit: number; status: 'open' | 'closed' | 'all'; category?: string }): Promise<Sourced<NASAEvent[]>> {
    const q = new URLSearchParams({ status: opts.status, days: String(opts.days), limit: String(opts.limit) })
    if (opts.category) q.set('category', opts.category)
    return this.cached(`eonet:${q}`, TTL.eonet, 'NASA EONET v3', async () => {
      const { data } = await getJson('EONET', `${this.cfg.NASA_EONET_BASE}/events?${q}`, { fetchImpl: this.fetchImpl })
      return parseEonetEvents(data)
    })
  }

  /** Astronomy Picture of the Day: new WordPress endpoint first, legacy api.nasa.gov as fallback. */
  apod(date?: string): Promise<Sourced<ApodEntry>> {
    return this.cached(`apod:${date ?? 'latest'}`, TTL.apod, 'NASA APOD', async () => {
      try {
        const url = date ? `${this.cfg.NASA_APOD_BASE}/${apodDateCode(date)}` : `${this.cfg.NASA_APOD_BASE}?per_page=1`
        const { data } = await getJson('APOD', url, { fetchImpl: this.fetchImpl })
        return parseWpApod(data)
      } catch (err) {
        this.log.warn({ upstream: 'APOD', reason: (err as Error).message }, 'apod primary failed, trying legacy')
        const q = new URLSearchParams({ api_key: this.cfg.NASA_API_KEY })
        if (date) q.set('date', date)
        // The key travels only in this server-side request; it is never sent to the browser or logged.
        const { data } = await getJson('APOD legacy', `${this.cfg.NASA_APOD_LEGACY_BASE}?${q}`, { fetchImpl: this.fetchImpl, timeoutMs: 25_000 })
        return parseLegacyApod(data)
      }
    })
  }

  /** Near-Earth radiation environment from NOAA SWPC: GOES proton flux (24 h) + official NOAA S-scale. */
  radiation(): Promise<Sourced<RadiationStatus>> {
    return this.cached('swpc:radiation', TTL.swpc, 'NOAA SWPC (GOES)', async () => {
      const base = this.cfg.NOAA_SWPC_BASE
      const [protons, scales] = await Promise.all([
        getJson('NOAA SWPC', `${base}/json/goes/primary/integral-protons-1-day.json`, { fetchImpl: this.fetchImpl }),
        getJson('NOAA SWPC', `${base}/products/noaa-scales.json`, { fetchImpl: this.fetchImpl }),
      ])
      return parseRadiation(protons.data, scales.data)
    })
  }

  /** Daily environment at a location from POWER. Lat/lon are rounded to the 0.5° grid to share cache. */
  environment(lat: number, lon: number, startDate: string, endDate: string): Promise<Sourced<{ latitude: number; longitude: number; series: EnvironmentSeries[] }>> {
    const glat = Math.round(lat * 2) / 2
    const glon = Math.round(lon * 2) / 2
    const q = new URLSearchParams({
      parameters: POWER_PARAMETERS.join(','),
      community: 'RE',
      latitude: String(glat),
      longitude: String(glon),
      start: compactDate(startDate),
      end: compactDate(endDate),
      format: 'JSON',
    })
    return this.cached(`power:${q}`, TTL.power, 'NASA POWER (LaRC)', async () => {
      const { data } = await getJson('POWER', `${this.cfg.NASA_POWER_BASE}/daily/point?${q}`, { fetchImpl: this.fetchImpl, timeoutMs: 30_000 })
      return { latitude: glat, longitude: glon, series: parsePowerDaily(data) }
    })
  }
}
