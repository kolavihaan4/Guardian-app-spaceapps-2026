import { assessQuality, METRIC_INFO, type Aggregation, type Metric, type MetricType, type ProviderId } from '@astrovitals/shared'

/** Build a Metric with the canonical unit and a data-quality flag attached. */
export function makeMetric(input: {
  metricType: MetricType
  value: number
  timestamp: string
  endTimestamp?: string
  aggregation: Aggregation
  source: ProviderId
  sourceDetail?: string
  device?: string
  raw?: { value: number; unit: string }
  simulated?: boolean
}): Metric {
  return {
    timestamp: input.timestamp,
    ...(input.endTimestamp ? { endTimestamp: input.endTimestamp } : {}),
    metricType: input.metricType,
    value: input.value,
    unit: METRIC_INFO[input.metricType].unit,
    source: input.source,
    ...(input.sourceDetail ? { sourceDetail: input.sourceDetail } : {}),
    ...(input.device ? { device: input.device } : {}),
    aggregation: input.aggregation,
    ...(input.raw ? { raw: input.raw } : {}),
    simulated: input.simulated ?? false,
    quality: assessQuality(input.metricType, input.value, input.aggregation),
  }
}

/** "−18000s" / "3600s" (google-duration) -> "-05:00" / "+01:00". */
export function durationToOffset(d: string | undefined): string {
  const secs = d ? Number.parseFloat(d) : 0
  if (!Number.isFinite(secs) || secs === 0) return 'Z'
  const sign = secs < 0 ? '-' : '+'
  const abs = Math.abs(secs)
  const hh = String(Math.floor(abs / 3600)).padStart(2, '0')
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, '0')
  return `${sign}${hh}:${mm}`
}

/** Render a UTC instant as local wall-clock ISO with the given offset (keeps the wearer's local date). */
export function withOffset(utcIso: string, offset: string): string {
  if (offset === 'Z') return new Date(utcIso).toISOString().replace('.000Z', 'Z')
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset)
  if (!m) return utcIso
  const mins = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
  const local = new Date(new Date(utcIso).getTime() + mins * 60_000).toISOString().slice(0, 19)
  return `${local}${offset}`
}

export const dateOnly = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
