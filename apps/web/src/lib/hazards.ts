import type { NASAEvent } from '@astrovitals/shared'
import { DAY, daysBetween, isoDay } from './series'

export const HAZARD_HISTORY_DAYS = 14

/** Inclusive UTC dates: today and the preceding 13 days. */
export function hazardRange(today: string) {
  return { from: isoDay(new Date(Date.parse(`${today}T00:00:00Z`) - (HAZARD_HISTORY_DAYS - 1) * DAY)), to: today }
}

/** Count catalog reports, not radiation dose or a continuous particle measurement. */
export function dailyParticleReports(events: NASAEvent[], from: string, to: string) {
  const dates = daysBetween(from, to)
  const counts = new Map(dates.map((date) => [date, 0]))
  const seen = new Set<string>()
  for (const event of events) {
    if (event.eventType !== 'SEP' || seen.has(event.id) || !Number.isFinite(Date.parse(event.timestamp))) continue
    seen.add(event.id)
    const date = isoDay(new Date(event.timestamp))
    if (counts.has(date)) counts.set(date, counts.get(date)! + 1)
  }
  return dates.map((date) => ({ date, reports: counts.get(date)! }))
}
