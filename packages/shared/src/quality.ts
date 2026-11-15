import { METRIC_INFO } from './catalog.ts'
import type { Aggregation, MetricType, QualityFlag } from './models.ts'

/**
 * Classify a reading as a data-quality concern. This is deliberately NOT a
 * health assessment: it only says whether a number is plausible for the
 * sensor/format, and the notes point at measurement causes (fit, motion, sync,
 * unit errors), never at the wearer's health.
 */
export function assessQuality(metricType: MetricType, value: number, aggregation: Aggregation): QualityFlag {
  const info = METRIC_INFO[metricType]
  if (!Number.isFinite(value)) {
    return { status: 'implausible', note: 'Value is not a finite number; likely a parsing or sync error.' }
  }
  const [hardMin, hardMax] = info.hard
  if (value < hardMin || value > hardMax) {
    return {
      status: 'implausible',
      note: `Outside what this sensor/format can report (${hardMin}–${hardMax} ${info.unit}); likely a data or unit error.`,
    }
  }
  const checkTypical = !info.typicalDailyOnly || aggregation === 'daily'
  const [lo, hi] = info.typical
  if (checkTypical && (value < lo || value > hi)) {
    return {
      status: 'out_of_range',
      note: `Unusual for consumer wearables (${lo}–${hi} ${info.unit}). Check sensor fit, motion artefacts or sync before relying on it. This is not a medical assessment.`,
    }
  }
  return { status: 'ok' }
}
