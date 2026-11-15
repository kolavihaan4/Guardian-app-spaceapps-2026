import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'
import type { Metric } from '@astrovitals/shared'
import { describe, expect, it } from 'vitest'
import { downsampleHeartRate } from '../src/routes/vitals.ts'
import { appleDate, buildSleepSessions, convert, describeDevice, parseAppleHealthExport } from '../src/wearables/providers/appleHealthExport.ts'
import { DemoProvider } from '../src/wearables/providers/demo.ts'
import { mapDailyPoints, mapDailyRollup, mapExercise, mapHeartRateRollup, mapSleep } from '../src/wearables/providers/googleHealth.ts'
import { healthKitPayload, normalizeHealthKitPayload } from '../src/wearables/providers/healthkitCompanion.ts'
import { durationToOffset, withOffset } from '../src/wearables/normalize.ts'
import { fixtureJson, makeTestContext } from './helpers.ts'

const day = (s: string) => new Date(s)

describe('DemoProvider', () => {
  const demo = new DemoProvider()
  const start = day('2026-09-28T00:00:00Z')
  const end = day('2026-10-05T00:00:00Z')

  it('is deterministic per user and always labelled simulated', async () => {
    const a = await demo.getMetrics('user-a', start, end)
    const b = await demo.getMetrics('user-a', start, end)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(1000)
    expect(a.every((m) => m.simulated && m.source === 'demo')).toBe(true)
    expect(await demo.getMetrics('user-b', start, end)).not.toEqual(a)
  })

  it('produces every vital the dashboard supports, within the requested range', async () => {
    const m = await demo.getMetrics('u', start, end)
    const types = new Set(m.map((x) => x.metricType))
    for (const t of ['heart_rate', 'resting_heart_rate', 'hrv_rmssd', 'spo2', 'respiratory_rate', 'skin_temperature_deviation', 'steps', 'active_energy']) {
      expect(types.has(t as Metric['metricType'])).toBe(true)
    }
    for (const x of m) expect(Date.parse(x.timestamp)).toBeGreaterThanOrEqual(start.getTime())
  })

  it('injects an occasional implausible artefact that is flagged as data quality, not health', async () => {
    const m = await demo.getMetrics('u', day('2026-08-01T00:00:00Z'), day('2026-09-15T00:00:00Z'), ['spo2'])
    const bad = m.filter((x) => x.quality?.status === 'implausible')
    expect(bad.length).toBeGreaterThan(0)
    expect(bad[0]!.quality!.note).toMatch(/data or unit error/)
  })

  it('generates sleep with stages and workouts', async () => {
    const sleep = await demo.getSleep('u', start, end)
    expect(sleep.length).toBeGreaterThanOrEqual(6)
    expect(sleep[0]!.stages.some((s) => s.stage === 'deep')).toBe(true)
    expect(sleep[0]!.minutesAsleep).toBeGreaterThan(300)
    expect((await demo.getWorkouts('u', start, end)).length).toBeGreaterThan(0)
  })

  it('cannot be persisted', async () => {
    const { repo } = makeTestContext()
    repo.createUser({ id: 'u', email: 'u@example.com', passwordHash: 'x' })
    const m = await demo.getMetrics('u', start, end, ['spo2'])
    expect(() => repo.saveHealthData('u', 'demo', { metrics: m })).toThrow(/simulated/)
  })
})

describe('Google Health mapping (schema-derived fixtures)', () => {
  it('maps daily vitals with canonical units and source detail', () => {
    const m = mapDailyPoints(fixtureJson<{ dataPoints: never[] }>('google-health/list-daily.json').dataPoints)
    const byType = Object.fromEntries(m.map((x) => [`${x.metricType}@${x.timestamp.slice(0, 10)}`, x]))
    expect(byType['resting_heart_rate@2026-10-03']!.value).toBe(58)
    expect(byType['resting_heart_rate@2026-10-03']!.device).toBe('Google Pixel Watch 4')
    expect(byType['hrv_rmssd@2026-10-03']!.unit).toBe('ms')
    expect(byType['spo2@2026-10-03']!.value).toBe(96.4)
    expect(byType['respiratory_rate@2026-10-03']!.value).toBe(14.6)
    expect(byType['skin_temperature@2026-10-03']!.value).toBe(33.91)
    expect(byType['skin_temperature_deviation@2026-10-03']!.value).toBe(0.29)
    expect(byType['skin_temperature_deviation@2026-10-03']!.sourceDetail).toMatch(/derived/)
    expect(byType['spo2@2026-10-04']!.quality?.status).toBe('implausible') // 104 % cannot exist
    expect(m.every((x) => !x.simulated && x.source === 'google-health')).toBe(true)
  })

  it('maps sleep sessions to local time and drops unknown stage types', () => {
    const [s] = mapSleep(fixtureJson<{ dataPoints: never[] }>('google-health/list-sleep.json').dataPoints)
    expect(s!.start).toBe('2026-10-02T23:10:00-05:00')
    expect(s!.minutesAsleep).toBe(412)
    expect(s!.stages.map((x) => x.stage)).toEqual(['light', 'deep', 'rem', 'awake'])
    expect(s!.externalId).toBe('sleep-abc-123')
  })

  it('maps exercise, heart-rate rollups and daily step rollups', () => {
    const [w] = mapExercise(fixtureJson<{ dataPoints: never[] }>('google-health/list-exercise.json').dataPoints)
    expect(w).toMatchObject({ activityType: 'RUNNING', energyKcal: 412.5, averageHeartRate: 151, distanceMeters: 6400 })
    const hr = mapHeartRateRollup(fixtureJson<{ rollupDataPoints: never[] }>('google-health/rollup-heart-rate.json').rollupDataPoints)
    expect(hr).toHaveLength(2) // window without data skipped
    expect(hr[0]).toMatchObject({ metricType: 'heart_rate', value: 71.4, aggregation: 'interval', endTimestamp: '2026-10-04T14:05:00Z' })
    const steps = mapDailyRollup(fixtureJson<{ rollupDataPoints: never[] }>('google-health/dailyrollup-steps.json').rollupDataPoints)
    expect(steps.map((s) => s.value)).toEqual([9234, 11012])
  })

  it('converts google-duration offsets', () => {
    expect(durationToOffset('-18000s')).toBe('-05:00')
    expect(durationToOffset('19800s')).toBe('+05:30')
    expect(durationToOffset(undefined)).toBe('Z')
    expect(withOffset('2026-10-03T04:10:00Z', '-05:00')).toBe('2026-10-02T23:10:00-05:00')
  })
})

describe('Apple Health export import (synthetic export.xml)', () => {
  const parse = async () => {
    const metrics: Metric[] = []
    const summary = await parseAppleHealthExport(createReadStream(resolve(import.meta.dirname, 'fixtures/apple-health/export-sample.xml')), {
      from: day('2026-10-01T00:00:00Z'),
      to: day('2026-10-06T00:00:00Z'),
      onMetrics: (b) => metrics.push(...b),
      batchSize: 3,
    })
    return { metrics, summary }
  }

  it('normalizes units and keeps the raw original', async () => {
    const { metrics } = await parse()
    const spo2 = metrics.find((m) => m.metricType === 'spo2')!
    expect(spo2.value).toBe(97)
    expect(spo2.raw).toEqual({ value: 0.97, unit: '%' })
    const temp = metrics.find((m) => m.metricType === 'skin_temperature')!
    expect(temp.value).toBe(35.5)
    expect(temp.raw).toEqual({ value: 95.9, unit: 'degF' })
    const kcal = metrics.find((m) => m.metricType === 'active_energy')!
    expect(kcal.value).toBe(50)
    expect(kcal.raw?.unit).toBe('kJ')
  })

  it('preserves original timestamps with offsets, device and source names', async () => {
    const { metrics } = await parse()
    const hr = metrics.find((m) => m.metricType === 'heart_rate' && m.value === 64)!
    expect(hr.timestamp).toBe('2026-10-04T08:00:00-05:00')
    expect(hr.device).toBe('Apple Watch (Watch7,4)')
    expect(hr.sourceDetail).toBe('Test’s Apple Watch')
    expect(metrics.find((m) => m.metricType === 'hrv_sdnn')!.value).toBe(52.3)
  })

  it('flags the impossible 320 bpm sample instead of dropping it', async () => {
    const { metrics } = await parse()
    expect(metrics.find((m) => m.value === 320)!.quality?.status).toBe('implausible')
  })

  it('skips records outside the window and reports unsupported types', async () => {
    const { metrics, summary } = await parse()
    expect(metrics.some((m) => m.timestamp.startsWith('2025'))).toBe(false)
    expect(summary.unsupportedTypes).toEqual(['HKQuantityTypeIdentifierBodyMass'])
    expect(summary.metrics).toBe(metrics.length)
  })

  it('builds one sleep session preferring staged Apple Watch data over iPhone in-bed time', async () => {
    const { summary } = await parse()
    expect(summary.sleep).toHaveLength(1)
    expect(summary.sleep[0]!.sourceDetail).toBe('Test’s Apple Watch')
    expect(summary.sleep[0]!.minutesAsleep).toBe(90 + 60 + 50)
    expect(summary.sleep[0]!.minutesAwake).toBe(10)
  })

  it('reads workouts with statistics', async () => {
    const { summary } = await parse()
    expect(summary.workouts[0]).toMatchObject({ activityType: 'Running', energyKcal: 331.2, averageHeartRate: 149 })
    expect(summary.workouts[0]!.distanceMeters).toBeCloseTo(5210)
  })

  it('rejects files that are not Health exports', async () => {
    const { Readable } = await import('node:stream')
    await expect(parseAppleHealthExport(Readable.from(['<html></html>']), { from: day('2026-01-01'), to: day('2027-01-01'), onMetrics: () => {} })).rejects.toThrow(/Apple Health export/)
  })

  it('helpers', () => {
    expect(appleDate('2026-10-01 07:58:00 +0530')).toBe('2026-10-01T07:58:00+05:30')
    expect(appleDate('garbage')).toBeUndefined()
    expect(describeDevice('<<HKDevice: 0x1>, name:Apple Watch, hardware:Watch6,1>')).toBe('Apple Watch (Watch6,1)')
    expect(convert('heart_rate', 60, 'count/s')).toBeNull() // unknown unit → skipped, never guessed
    expect(buildSleepSessions([])).toEqual([])
  })
})

describe('HealthKit companion payload', () => {
  it('validates strictly and normalizes', () => {
    const p = healthKitPayload.parse({
      samples: [
        { type: 'HKQuantityTypeIdentifierHeartRate', value: 61, unit: 'count/min', start: '2026-10-04T08:00:00-05:00', end: '2026-10-04T08:00:00-05:00' },
        { type: 'HKQuantityTypeIdentifierOxygenSaturation', value: 0.95, unit: '%', start: '2026-10-04T03:00:00-05:00', end: '2026-10-04T03:00:00-05:00' },
        { type: 'HKQuantityTypeIdentifierBloodGlucose', value: 5, unit: 'mmol<180.1558800000541>/L', start: '2026-10-04T03:00:00-05:00', end: '2026-10-04T03:00:00-05:00' },
      ],
    })
    const n = normalizeHealthKitPayload(p)
    expect(n.metrics.map((m) => [m.metricType, m.value])).toEqual([
      ['heart_rate', 61],
      ['spo2', 95],
    ])
    expect(n.unsupported).toEqual(['HKQuantityTypeIdentifierBloodGlucose'])
    expect(() => healthKitPayload.parse({ samples: [], extra: 1 })).toThrow()
    expect(() => healthKitPayload.parse({ samples: [{ type: 'x', value: 1, unit: 'u', start: 'yesterday', end: 'today' }] })).toThrow()
  })
})

describe('display downsampling', () => {
  it('averages long heart-rate series per source but never hides implausible readings', () => {
    const base = Date.parse('2026-10-01T00:00:00Z')
    const metrics: Metric[] = Array.from({ length: 6000 }, (_, i) => ({
      timestamp: new Date(base + i * 60_000).toISOString(),
      metricType: 'heart_rate',
      value: i === 10 ? 999 : 60,
      unit: 'bpm',
      source: 'apple-health-export',
      aggregation: 'sample',
      simulated: false,
      quality: { status: i === 10 ? 'implausible' : 'ok' },
    }))
    const out = downsampleHeartRate(metrics, new Date(base), new Date(base + 6000 * 60_000))
    expect(out.length).toBeLessThan(3100)
    expect(out.some((m) => m.value === 999 && m.quality?.status === 'implausible')).toBe(true)
    expect(out.filter((m) => m.value !== 999).every((m) => m.value === 60 && m.aggregation === 'interval')).toBe(true)
  })
})
