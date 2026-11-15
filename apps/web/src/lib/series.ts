import { METRIC_INFO, type DailyPoint, type EnvironmentSeries, type Metric, type MetricType, type NASAEvent, type ProviderId, type SleepData } from '@astrovitals/shared'

/** Fixed identity colors per source (validated categorical slots 1–4; see docs/DESIGN.md). */
export const SOURCE_SLOT: Record<ProviderId, number> = {
  demo: 1,
  'apple-health-export': 2,
  'google-health': 3,
  'healthkit-companion': 4,
  garmin: 4,
}
export const sourceColor = (p: ProviderId) => `var(--series-${SOURCE_SLOT[p]})`

export const DAY = 86_400_000
export const isoDay = (d: Date) => d.toISOString().slice(0, 10)
export const daysBetween = (from: string, to: string): string[] => {
  const out: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) out.push(isoDay(new Date(t)))
  return out
}

/** Local calendar date of a reading (the date part of its original, offset-bearing timestamp). */
export const localDate = (m: { timestamp: string }) => m.timestamp.slice(0, 10)

export interface SourceSeries {
  source: ProviderId
  simulated: boolean
  points: { t: number; value: number; flagged: boolean }[]
}

/** One series per (source, simulated): real and simulated data are never merged. */
export function seriesBySource(metrics: Metric[], type: MetricType): SourceSeries[] {
  const map = new Map<string, SourceSeries>()
  for (const m of metrics) {
    if (m.metricType !== type) continue
    const key = `${m.source}|${m.simulated}`
    const s = map.get(key) ?? { source: m.source, simulated: m.simulated, points: [] }
    s.points.push({ t: Date.parse(m.timestamp), value: m.value, flagged: m.quality?.status !== undefined && m.quality.status !== 'ok' })
    map.set(key, s)
  }
  for (const s of map.values()) s.points.sort((a, b) => a.t - b.t)
  return [...map.values()]
}

/** Daily mean per source; implausible readings are excluded from statistics (still shown as flags). */
export function dailyMean(metrics: Metric[], type: MetricType, source: ProviderId, simulated: boolean): DailyPoint[] {
  const acc = new Map<string, { sum: number; n: number }>()
  for (const m of metrics) {
    if (m.metricType !== type || m.source !== source || m.simulated !== simulated || m.quality?.status === 'implausible') continue
    const d = localDate(m)
    const a = acc.get(d) ?? { sum: 0, n: 0 }
    a.sum += m.value
    a.n++
    acc.set(d, a)
  }
  return [...acc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, a]) => ({ date, value: a.sum / a.n }))
}

/** Daily sum (steps, energy) per source. */
export function dailySum(metrics: Metric[], type: MetricType, source: ProviderId, simulated: boolean): DailyPoint[] {
  const acc = new Map<string, number>()
  for (const m of metrics) {
    if (m.metricType !== type || m.source !== source || m.simulated !== simulated || m.quality?.status === 'implausible') continue
    acc.set(localDate(m), (acc.get(localDate(m)) ?? 0) + m.value)
  }
  return [...acc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }))
}

/** Sleep minutes attributed to the date the session ENDS (the morning you wake up). */
export function sleepPerNight(sleep: SleepData[], source: ProviderId, simulated: boolean): DailyPoint[] {
  return sleep
    .filter((s) => s.source === source && s.simulated === simulated)
    .map((s) => ({ date: s.end.slice(0, 10), value: s.minutesAsleep / 60 }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Most recent plausible reading; implausible ones stay visible in the data-quality panel instead. */
export function latest(metrics: Metric[], type: MetricType): Metric | undefined {
  let best: Metric | undefined
  for (const m of metrics) if (m.metricType === type && m.quality?.status !== 'implausible' && (!best || m.timestamp > best.timestamp)) best = m
  return best
}

export const formatValue = (type: MetricType, v: number) => v.toFixed(METRIC_INFO[type].decimals)

// ── NASA-derived daily series for the correlation view ───────────────────────

export type OverlayKey = 'kp_max' | 'flare_count' | 'cme_count' | 'power_T2M' | 'power_RH2M' | 'power_ALLSKY_SFC_SW_DWN'

export const OVERLAYS: { key: OverlayKey; label: string; unit: string; note: string }[] = [
  { key: 'kp_max', label: 'Max Kp of DONKI geomagnetic storms', unit: 'Kp', note: 'Days without a DONKI storm have no value (DONKI lists storms, not quiet days).' },
  { key: 'flare_count', label: 'Solar flares catalogued by DONKI', unit: 'flares/day', note: 'Counts DONKI-catalogued flares; 0 on days with none.' },
  { key: 'cme_count', label: 'CMEs catalogued by DONKI', unit: 'CMEs/day', note: 'Counts DONKI-catalogued coronal mass ejections; 0 on days with none.' },
  { key: 'power_T2M', label: 'Air temperature at 2 m (NASA POWER)', unit: '°C', note: 'Daily mean for the chosen location; 2–3 days latency.' },
  { key: 'power_RH2M', label: 'Relative humidity at 2 m (NASA POWER)', unit: '%', note: 'Daily mean for the chosen location; 2–3 days latency.' },
  { key: 'power_ALLSKY_SFC_SW_DWN', label: 'Surface solar irradiance (NASA POWER)', unit: 'kWh/m²/day', note: 'Daily total; 5–7 days latency.' },
]

export function overlaySeries(key: OverlayKey, days: string[], events: NASAEvent[], env: EnvironmentSeries[]): DailyPoint[] {
  if (key === 'kp_max') {
    const max = new Map<string, number>()
    for (const e of events) {
      if (e.eventType !== 'GST') continue
      for (const k of (e.metadata.kpIndex as { observedTime: string; kpIndex: number }[] | undefined) ?? []) {
        const d = k.observedTime.slice(0, 10)
        max.set(d, Math.max(max.get(d) ?? 0, k.kpIndex))
      }
    }
    return days.map((date) => ({ date, value: max.get(date) ?? null }))
  }
  if (key === 'flare_count' || key === 'cme_count') {
    const type = key === 'flare_count' ? 'FLR' : 'CME'
    const n = new Map<string, number>()
    for (const e of events) if (e.eventType === type) n.set(e.timestamp.slice(0, 10), (n.get(e.timestamp.slice(0, 10)) ?? 0) + 1)
    return days.map((date) => ({ date, value: n.get(date) ?? 0 }))
  }
  const param = key.slice('power_'.length)
  const s = env.find((x) => x.parameter === param)
  const byDate = new Map((s?.points ?? []).map((p) => [p.date, p.value]))
  return days.map((date) => ({ date, value: byDate.get(date) ?? null }))
}
