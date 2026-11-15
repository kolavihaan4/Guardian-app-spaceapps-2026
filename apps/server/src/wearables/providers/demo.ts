import type { ActivityData, Metric, MetricType, SleepData, SleepStage, SleepStageType, Workout } from '@astrovitals/shared'
import { deriveActivity } from '../../repo.ts'
import { makeMetric } from '../normalize.ts'
import type { Availability, WearableProvider } from '../types.ts'

/**
 * DEMO provider — synthetic data for development, testing and judging without a device.
 *  - Generated on request, deterministic per (user, day) so charts are stable across reloads.
 *  - NEVER persisted (the store refuses `simulated: true`), always `simulated: true`,
 *    `source: 'demo'`, and labelled SIMULATED in the UI.
 *  - Shapes are plausible (circadian heart rate, 90-minute sleep cycles, workouts), and roughly
 *    every 11th day contains one deliberately implausible reading so the data-quality flags can
 *    be demonstrated. None of this represents a real person.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const DAY = 86_400_000
const isoZ = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z')
const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d

interface DayPlan {
  dayStart: number
  rng: () => number
  rhr: number
  sleepStart: number
  sleepEnd: number
  workout?: { start: number; end: number; type: string; name: string; intensity: number }
  artifact: boolean
}

export class DemoProvider implements WearableProvider {
  readonly id = 'demo' as const

  availability(): Availability {
    return { available: true, note: 'Always available: no watch, phone or platform account needed.' }
  }

  private plan(userId: string, dayStart: number): DayPlan {
    const rng = mulberry32(hashString(`${userId}:${isoZ(dayStart).slice(0, 10)}`))
    const dayIndex = Math.floor(dayStart / DAY)
    // Sleep for the night ENDING this day: ~23:00 previous day to ~07:00 (UTC wall clock).
    const sleepStart = dayStart - 60 * 60_000 + Math.floor(rng() * 60) * 60_000
    const sleepEnd = dayStart + 6.5 * 3600_000 + Math.floor(rng() * 75) * 60_000
    const plan: DayPlan = { dayStart, rng, rhr: 56 + rng() * 6, sleepStart, sleepEnd, artifact: dayIndex % 11 === 0 }
    if (dayIndex % 2 === 0) {
      const start = dayStart + 17.5 * 3600_000 + Math.floor(rng() * 60) * 60_000
      const types = [
        ['RUNNING', 'Run', 1],
        ['BIKING', 'Cycling', 0.8],
        ['STRENGTH_TRAINING', 'Resistance training (exercise countermeasure)', 0.6],
      ] as const
      const [type, name, intensity] = types[dayIndex % 3]!
      plan.workout = { start, end: start + (35 + Math.floor(rng() * 25)) * 60_000, type, name, intensity }
    }
    return plan
  }

  private days(start: Date, end: Date): number[] {
    const first = Math.floor(start.getTime() / DAY) * DAY
    const out: number[] = []
    for (let d = first; d < end.getTime(); d += DAY) out.push(d)
    return out
  }

  private heartRateAt(p: DayPlan, t: number): number {
    const hour = (t - p.dayStart) / 3600_000
    const asleep = t >= p.sleepStart && t < p.sleepEnd
    let hr = asleep ? p.rhr - 4 : p.rhr + 14 + 6 * Math.sin(((hour - 9) / 24) * 2 * Math.PI)
    if (p.workout && t >= p.workout.start && t < p.workout.end) {
      const prog = (t - p.workout.start) / (p.workout.end - p.workout.start)
      hr = 95 + 60 * p.workout.intensity * Math.sin(Math.PI * Math.min(1, prog * 1.3))
    }
    return hr + (p.rng() - 0.5) * 6
  }

  async getMetrics(userId: string, start: Date, end: Date, types?: MetricType[]): Promise<Metric[]> {
    const want = (t: MetricType) => !types || types.includes(t)
    const spanDays = (end.getTime() - start.getTime()) / DAY
    const hrStep = (spanDays > 8 ? 15 : 5) * 60_000
    const out: Metric[] = []
    const src = { source: 'demo' as const, sourceDetail: 'AstroVitals synthetic generator v1', device: 'Simulated wrist wearable', simulated: true }
    for (const dayStart of this.days(start, end)) {
      const p = this.plan(userId, dayStart)
      const dayIso = isoZ(dayStart)
      if (want('heart_rate')) {
        for (let t = dayStart; t < dayStart + DAY; t += hrStep) {
          if (t < start.getTime() || t >= end.getTime()) continue
          out.push(makeMetric({ ...src, metricType: 'heart_rate', value: round(this.heartRateAt(p, t)), timestamp: isoZ(t), aggregation: 'sample' }))
        }
      }
      const daily = (metricType: MetricType, value: number) => {
        if (want(metricType)) out.push(makeMetric({ ...src, metricType, value, timestamp: dayIso, aggregation: 'daily' }))
      }
      daily('resting_heart_rate', round(p.rhr))
      daily('hrv_rmssd', round(48 - (p.rhr - 56) * 2 + (p.rng() - 0.5) * 12))
      daily('spo2', p.artifact ? 101.5 : round(95.5 + p.rng() * 2.5, 1)) // 101.5 % = deliberate artefact
      daily('respiratory_rate', round(13.8 + p.rng() * 1.8, 1))
      daily('skin_temperature_deviation', round((p.rng() - 0.5) * 0.8, 2))
      if (want('steps') || want('active_energy')) {
        for (let h = 0; h < 24; h++) {
          const t = dayStart + h * 3600_000
          if (t < start.getTime() || t >= end.getTime()) continue
          const awake = t >= p.sleepEnd && h < 23
          const inWorkout = p.workout && t + 3600_000 > p.workout.start && t < p.workout.end
          const steps = awake ? Math.round(150 + p.rng() * 650 + (inWorkout && p.workout!.type === 'RUNNING' ? 3500 : 0)) : 0
          const kcal = awake ? round(8 + p.rng() * 25 + (inWorkout ? 250 * p.workout!.intensity : 0)) : 0
          const ts = { timestamp: isoZ(t), endTimestamp: isoZ(t + 3600_000), aggregation: 'interval' as const }
          if (want('steps')) out.push(makeMetric({ ...src, ...ts, metricType: 'steps', value: steps }))
          if (want('active_energy')) out.push(makeMetric({ ...src, ...ts, metricType: 'active_energy', value: kcal }))
        }
      }
    }
    return out
  }

  getHeartRate(userId: string, start: Date, end: Date): Promise<Metric[]> {
    return this.getMetrics(userId, start, end, ['heart_rate'])
  }

  async getSleep(userId: string, start: Date, end: Date): Promise<SleepData[]> {
    const out: SleepData[] = []
    for (const dayStart of this.days(start, end)) {
      const p = this.plan(userId, dayStart)
      if (p.sleepStart < start.getTime() - DAY || p.sleepStart >= end.getTime()) continue
      const stages: SleepStage[] = []
      let t = p.sleepStart
      const push = (stage: SleepStageType, mins: number) => {
        const e = Math.min(p.sleepEnd, t + mins * 60_000)
        if (e > t) stages.push({ stage, start: isoZ(t), end: isoZ(e) })
        t = e
      }
      push('awake', 8 + Math.floor(p.rng() * 10))
      let cycle = 0
      while (t < p.sleepEnd) {
        const deep = Math.max(5, 35 - cycle * 9 + Math.floor(p.rng() * 10))
        const rem = 10 + cycle * 7 + Math.floor(p.rng() * 8)
        push('light', 25 + Math.floor(p.rng() * 15))
        push('deep', deep)
        push('light', 15 + Math.floor(p.rng() * 10))
        push('rem', rem)
        if (p.rng() < 0.35) push('awake', 2 + Math.floor(p.rng() * 6))
        cycle++
      }
      const mins = (s: SleepStageType[]) =>
        stages.filter((x) => s.includes(x.stage)).reduce((a, x) => a + (Date.parse(x.end) - Date.parse(x.start)) / 60_000, 0)
      out.push({
        start: isoZ(p.sleepStart),
        end: isoZ(p.sleepEnd),
        minutesAsleep: Math.round(mins(['light', 'deep', 'rem'])),
        minutesAwake: Math.round(mins(['awake'])),
        stages,
        source: 'demo',
        sourceDetail: 'AstroVitals synthetic generator v1',
        device: 'Simulated wrist wearable',
        simulated: true,
      })
    }
    return out
  }

  async getActivity(userId: string, start: Date, end: Date): Promise<ActivityData[]> {
    return deriveActivity(await this.getMetrics(userId, start, end, ['steps', 'active_energy']))
  }

  async getWorkouts(userId: string, start: Date, end: Date): Promise<Workout[]> {
    const out: Workout[] = []
    for (const dayStart of this.days(start, end)) {
      const p = this.plan(userId, dayStart)
      if (!p.workout || p.workout.start < start.getTime() || p.workout.start >= end.getTime()) continue
      const mins = (p.workout.end - p.workout.start) / 60_000
      out.push({
        start: isoZ(p.workout.start),
        end: isoZ(p.workout.end),
        activityType: p.workout.type,
        displayName: p.workout.name,
        energyKcal: Math.round(mins * 9 * p.workout.intensity),
        averageHeartRate: Math.round(95 + 45 * p.workout.intensity),
        ...(p.workout.type === 'RUNNING' ? { distanceMeters: Math.round(mins * 170) } : {}),
        source: 'demo',
        sourceDetail: 'AstroVitals synthetic generator v1',
        simulated: true,
      })
    }
    return out
  }
}
