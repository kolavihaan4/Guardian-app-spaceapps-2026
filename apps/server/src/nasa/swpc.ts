import type { RadiationStatus } from '@astrovitals/shared'

/**
 * NOAA Space Weather Prediction Center (keyless JSON, CORS-open, `cache-control: max-age=60`).
 *  - GET https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json
 *      5-minute GOES integral proton flux, 24 h, one row per energy threshold (≥1 … ≥500 MeV), in pfu.
 *  - GET https://services.swpc.noaa.gov/products/noaa-scales.json
 *      NOAA R/S/G scales: key "0" = current, "1" = today's forecast, "2"/"3" = next days, "-1" = yesterday.
 * S1 (minor solar radiation storm) starts at ≥10 MeV flux ≥ 10 pfu. We report NOAA's published scale
 * rather than recomputing it, because NOAA applies persistence rules a single sample cannot.
 */

interface ProtonRow {
  time_tag: string
  satellite?: number
  flux: number | null
  energy: string
}

interface ScaleDay {
  DateStamp: string
  S?: { Scale: string | null; Text: string | null; Prob?: string | null }
}

const positive = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
const int = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

export function parseRadiation(protons: unknown, scales: unknown): RadiationStatus {
  const rows = Array.isArray(protons) ? (protons as ProtonRow[]) : []
  const byTime = new Map<string, { time: string; flux10MeV: number | null; flux100MeV: number | null }>()
  let satellite: number | undefined
  for (const r of rows) {
    if (!r || typeof r.time_tag !== 'string') continue
    const key = r.energy === '>=10 MeV' ? 'flux10MeV' : r.energy === '>=100 MeV' ? 'flux100MeV' : null
    if (!key) continue
    const point = byTime.get(r.time_tag) ?? { time: r.time_tag, flux10MeV: null, flux100MeV: null }
    point[key] = positive(r.flux)
    byTime.set(r.time_tag, point)
    if (typeof r.satellite === 'number') satellite = r.satellite
  }
  const series = [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time))
  const latest = [...series].reverse().find((p) => p.flux10MeV !== null)

  const s = (scales && typeof scales === 'object' ? scales : {}) as Record<string, ScaleDay>
  const now = s['0']?.S
  const forecast = ['1', '2', '3']
    .map((k) => s[k])
    .filter((d): d is ScaleDay => !!d && typeof d.DateStamp === 'string')
    .map((d) => ({ date: d.DateStamp, s1Probability: int(d.S?.Prob) }))

  return {
    sScale: int(now?.Scale),
    sText: int(now?.Scale) === null ? 'unknown' : now?.Text?.trim() || 'none',
    flux10MeV: latest?.flux10MeV ?? null,
    observedAt: latest?.time ?? null,
    ...(satellite !== undefined ? { satellite } : {}),
    series,
    forecast,
  }
}
