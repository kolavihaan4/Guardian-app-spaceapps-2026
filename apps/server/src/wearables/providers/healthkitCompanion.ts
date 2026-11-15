import type { Metric, SleepStageType, Workout } from '@astrovitals/shared'
import { z } from 'zod'
import type { Repo } from '../../repo.ts'
import { makeMetric } from '../normalize.ts'
import { StoredDataProvider } from '../stored.ts'
import type { Availability } from '../types.ts'
import { buildSleepSessions, convert } from './appleHealthExport.ts'

/**
 * Live-ish Apple Watch path. HealthKit has no web/cloud API: data can only be read on the iPhone
 * by a native app the user has authorized. The companion app (see companion/ios/) uses
 * HKAnchoredObjectQuery + background delivery and POSTs new samples here with a per-device token
 * the user generated in the dashboard. This backend never talks to Apple.
 */

const QUANTITY: Record<string, { metric: Metric['metricType']; aggregation: Metric['aggregation'] }> = {
  HKQuantityTypeIdentifierHeartRate: { metric: 'heart_rate', aggregation: 'sample' },
  HKQuantityTypeIdentifierRestingHeartRate: { metric: 'resting_heart_rate', aggregation: 'daily' },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { metric: 'hrv_sdnn', aggregation: 'sample' },
  HKQuantityTypeIdentifierOxygenSaturation: { metric: 'spo2', aggregation: 'sample' },
  HKQuantityTypeIdentifierRespiratoryRate: { metric: 'respiratory_rate', aggregation: 'sample' },
  HKQuantityTypeIdentifierAppleSleepingWristTemperature: { metric: 'skin_temperature', aggregation: 'sample' },
  HKQuantityTypeIdentifierStepCount: { metric: 'steps', aggregation: 'interval' },
  HKQuantityTypeIdentifierActiveEnergyBurned: { metric: 'active_energy', aggregation: 'interval' },
}

const SLEEP: Record<string, SleepStageType> = {
  HKCategoryValueSleepAnalysisInBed: 'in_bed',
  HKCategoryValueSleepAnalysisAsleepUnspecified: 'asleep',
  HKCategoryValueSleepAnalysisAsleepCore: 'light',
  HKCategoryValueSleepAnalysisAsleepDeep: 'deep',
  HKCategoryValueSleepAnalysisAsleepREM: 'rem',
  HKCategoryValueSleepAnalysisAwake: 'awake',
}

const isoWithOffset = z.iso.datetime({ offset: true })

export const healthKitPayload = z
  .object({
    samples: z
      .array(
        z.object({
          type: z.string().max(100),
          value: z.number().finite(),
          unit: z.string().max(60),
          start: isoWithOffset,
          end: isoWithOffset,
          sourceName: z.string().max(200).optional(),
          device: z.string().max(200).optional(),
        }),
      )
      .max(5000)
      .default([]),
    sleep: z
      .array(z.object({ value: z.string().max(100), start: isoWithOffset, end: isoWithOffset, sourceName: z.string().max(200).optional() }))
      .max(2000)
      .default([]),
    workouts: z
      .array(
        z.object({
          activityType: z.string().max(100),
          start: isoWithOffset,
          end: isoWithOffset,
          energyKcal: z.number().nonnegative().optional(),
          distanceMeters: z.number().nonnegative().optional(),
          averageHeartRate: z.number().positive().optional(),
          sourceName: z.string().max(200).optional(),
        }),
      )
      .max(500)
      .default([]),
  })
  .strict()

export type HealthKitPayload = z.infer<typeof healthKitPayload>

export function normalizeHealthKitPayload(p: HealthKitPayload) {
  const metrics: Metric[] = []
  const unsupported = new Set<string>()
  let skipped = 0
  for (const s of p.samples) {
    const map = QUANTITY[s.type]
    if (!map) {
      unsupported.add(s.type)
      continue
    }
    const conv = convert(map.metric, s.value, s.unit)
    if (!conv) {
      skipped++
      continue
    }
    metrics.push(
      makeMetric({
        metricType: map.metric,
        value: conv.value,
        ...(conv.raw ? { raw: conv.raw } : {}),
        timestamp: map.aggregation === 'daily' ? `${s.start.slice(0, 10)}T00:00:00Z` : s.start,
        ...(map.aggregation === 'interval' ? { endTimestamp: s.end } : {}),
        aggregation: map.aggregation,
        source: 'healthkit-companion',
        sourceDetail: s.sourceName ?? 'HealthKit',
        ...(s.device ? { device: s.device } : {}),
      }),
    )
  }
  const sleep = buildSleepSessions(
    p.sleep.flatMap((x) => (SLEEP[x.value] ? [{ stage: SLEEP[x.value]!, start: x.start, end: x.end, sourceName: x.sourceName ?? 'HealthKit' }] : [])),
  ).map((s) => ({ ...s, source: 'healthkit-companion' as const }))
  const workouts: Workout[] = p.workouts.map((w) => ({
    start: w.start,
    end: w.end,
    activityType: w.activityType,
    displayName: w.activityType.replace(/([a-z])([A-Z])/g, '$1 $2'),
    ...(w.energyKcal !== undefined ? { energyKcal: w.energyKcal } : {}),
    ...(w.distanceMeters !== undefined ? { distanceMeters: w.distanceMeters } : {}),
    ...(w.averageHeartRate !== undefined ? { averageHeartRate: w.averageHeartRate } : {}),
    source: 'healthkit-companion',
    sourceDetail: w.sourceName ?? 'HealthKit',
    simulated: false,
  }))
  return { metrics, sleep, workouts, skipped, unsupported: [...unsupported] }
}

export class HealthKitCompanionProvider extends StoredDataProvider {
  readonly id = 'healthkit-companion' as const

  constructor(repo: Repo) {
    super(repo)
  }

  availability(): Availability {
    return {
      available: true,
      note: 'Needs the companion iOS app (Xcode on a Mac, HealthKit entitlement). Generate a device token here and paste it into the app.',
    }
  }
}
