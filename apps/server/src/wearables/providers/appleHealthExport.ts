import type { Metric, MetricType, SleepData, SleepStage, SleepStageType, Workout } from '@astrovitals/shared'
import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'
import type { Repo } from '../../repo.ts'
import { makeMetric } from '../normalize.ts'
import { StoredDataProvider } from '../stored.ts'
import type { Availability } from '../types.ts'

/**
 * Apple Watch data WITHOUT a Mac or Apple developer account:
 *   iPhone Health app → profile picture → "Export All Health Data" → export.zip → unzip → export.xml
 * (Apple Support: https://support.apple.com/guide/iphone/share-your-health-data-iph5ede58c3d/ios)
 *
 * The XML format is defined by the DTD embedded at the top of export.xml, not by a published API
 * contract, so the parser is defensive: it streams line by line (exports can be several GB),
 * reads only the attributes it understands, keeps original values/units in `raw` whenever it
 * converts, and reports unsupported record types instead of guessing.
 */

const QUANTITY_MAP: Record<string, { metric: MetricType; aggregation: Metric['aggregation'] }> = {
  HKQuantityTypeIdentifierHeartRate: { metric: 'heart_rate', aggregation: 'sample' },
  HKQuantityTypeIdentifierRestingHeartRate: { metric: 'resting_heart_rate', aggregation: 'daily' },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { metric: 'hrv_sdnn', aggregation: 'sample' },
  HKQuantityTypeIdentifierOxygenSaturation: { metric: 'spo2', aggregation: 'sample' },
  HKQuantityTypeIdentifierRespiratoryRate: { metric: 'respiratory_rate', aggregation: 'sample' },
  HKQuantityTypeIdentifierAppleSleepingWristTemperature: { metric: 'skin_temperature', aggregation: 'sample' },
  HKQuantityTypeIdentifierStepCount: { metric: 'steps', aggregation: 'interval' },
  HKQuantityTypeIdentifierActiveEnergyBurned: { metric: 'active_energy', aggregation: 'interval' },
}

const SLEEP_MAP: Record<string, SleepStageType> = {
  HKCategoryValueSleepAnalysisInBed: 'in_bed',
  HKCategoryValueSleepAnalysisAsleepUnspecified: 'asleep',
  HKCategoryValueSleepAnalysisAsleep: 'asleep',
  HKCategoryValueSleepAnalysisAsleepCore: 'light',
  HKCategoryValueSleepAnalysisAsleepDeep: 'deep',
  HKCategoryValueSleepAnalysisAsleepREM: 'rem',
  HKCategoryValueSleepAnalysisAwake: 'awake',
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e] ?? m),
  )

export function parseAttributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  // First occurrence wins, so a nested element on the same line cannot override the record's own attributes.
  for (const m of tag.matchAll(/([A-Za-z_][\w.-]*)="([^"]*)"/g)) if (!(m[1]! in out)) out[m[1]!] = decode(m[2]!)
  return out
}

/** "2026-10-01 07:58:00 -0500" → "2026-10-01T07:58:00-05:00" (offset preserved). */
export function appleDate(s: string | undefined): string | undefined {
  const m = s && /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/.exec(s.trim())
  return m ? `${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}` : undefined
}

/** "<<HKDevice: 0x..>, name:Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:Watch7,1, software:11.0>" */
export function describeDevice(device: string | undefined): string | undefined {
  if (!device) return undefined
  // Fields are separated by ", key:"; values may themselves contain commas (hardware:Watch7,4).
  const field = (key: string) => new RegExp(`${key}:(.+?)(?:, [a-zA-Z]+:|>|$)`).exec(device)?.[1]?.trim()
  const name = field('name')
  const hw = field('hardware')
  return name ? (hw ? `${name} (${hw})` : name) : undefined
}

/** Convert to canonical units; returns the raw original only when something changed. */
export function convert(metric: MetricType, value: number, unit: string): { value: number; raw?: { value: number; unit: string } } | null {
  const u = unit.trim()
  switch (metric) {
    case 'spo2':
      if (u === '%' && value <= 1) return { value: Math.round(value * 1000) / 10, raw: { value, unit: u } } // HealthKit stores a fraction
      return u === '%' ? { value } : null
    case 'skin_temperature':
      if (u === 'degC') return { value }
      if (u === 'degF') return { value: Math.round(((value - 32) * 5 * 100) / 9) / 100, raw: { value, unit: u } }
      return null
    case 'active_energy':
      if (u === 'kcal' || u === 'Cal') return { value, ...(u === 'Cal' ? { raw: { value, unit: u } } : {}) }
      if (u === 'kJ') return { value: Math.round((value / 4.184) * 10) / 10, raw: { value, unit: u } }
      return null
    case 'heart_rate':
    case 'resting_heart_rate':
    case 'respiratory_rate':
      return u === 'count/min' ? { value } : null
    case 'hrv_sdnn':
      return u === 'ms' ? { value } : null
    case 'steps':
      return u === 'count' ? { value } : null
    default:
      return null
  }
}

interface SleepSeg extends SleepStage {
  sourceName: string
  device?: string
}

export interface ParseOptions {
  from: Date
  to: Date
  /** Called with batches of metrics to keep memory bounded on multi-GB exports. */
  onMetrics: (batch: Metric[]) => void
  batchSize?: number
}

export interface ParseSummary {
  metrics: number
  sleep: SleepData[]
  workouts: Workout[]
  skippedRecords: number
  unsupportedTypes: string[]
  linesRead: number
}

export async function parseAppleHealthExport(input: Readable, opts: ParseOptions): Promise<ParseSummary> {
  const rl = createInterface({ input, crlfDelay: Infinity })
  const fromMs = opts.from.getTime()
  const toMs = opts.to.getTime()
  const inWindow = (iso: string) => {
    const t = Date.parse(iso)
    return t >= fromMs && t < toMs
  }
  const batchSize = opts.batchSize ?? 5000
  let batch: Metric[] = []
  let metrics = 0
  let skipped = 0
  let lines = 0
  const unsupported = new Set<string>()
  const sleepSegs: SleepSeg[] = []
  const workouts: Workout[] = []
  let openWorkout: Workout | null = null
  let sawHealthData = false
  let sawEnd = false

  const flush = () => {
    if (batch.length) {
      opts.onMetrics(batch)
      metrics += batch.length
      batch = []
    }
  }

  for await (const rawLine of rl) {
    lines++
    const line = rawLine.trim()
    if (!sawHealthData && line.startsWith('<HealthData')) sawHealthData = true
    if (line.startsWith('</HealthData>')) sawEnd = true

    if (line.startsWith('<Record ')) {
      const a = parseAttributes(line)
      const type = a.type ?? ''
      const start = appleDate(a.startDate)
      const end = appleDate(a.endDate)
      if (!start || !inWindow(start)) continue
      if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
        const stage = SLEEP_MAP[a.value ?? '']
        if (stage && end) sleepSegs.push({ stage, start, end, sourceName: a.sourceName ?? 'unknown', ...(describeDevice(a.device) ? { device: describeDevice(a.device)! } : {}) })
        else skipped++
        continue
      }
      const map = QUANTITY_MAP[type]
      if (!map) {
        unsupported.add(type)
        continue
      }
      const value = Number(a.value)
      const conv = Number.isFinite(value) ? convert(map.metric, value, a.unit ?? '') : null
      if (!conv) {
        skipped++
        continue
      }
      const device = describeDevice(a.device)
      batch.push(
        makeMetric({
          metricType: map.metric,
          value: conv.value,
          ...(conv.raw ? { raw: conv.raw } : {}),
          timestamp: map.aggregation === 'daily' ? `${start.slice(0, 10)}T00:00:00Z` : start,
          ...(map.aggregation === 'interval' && end ? { endTimestamp: end } : {}),
          aggregation: map.aggregation,
          source: 'apple-health-export',
          sourceDetail: a.sourceName ?? 'Apple Health',
          ...(device ? { device } : {}),
        }),
      )
      if (batch.length >= batchSize) flush()
      continue
    }

    if (line.startsWith('<Workout ')) {
      const a = parseAttributes(line)
      const start = appleDate(a.startDate)
      const end = appleDate(a.endDate)
      if (!start || !end || !inWindow(start)) {
        openWorkout = null
        continue
      }
      const type = (a.workoutActivityType ?? 'HKWorkoutActivityTypeOther').replace('HKWorkoutActivityType', '')
      openWorkout = {
        start,
        end,
        activityType: type,
        displayName: type.replace(/([a-z])([A-Z])/g, '$1 $2'),
        source: 'apple-health-export',
        sourceDetail: a.sourceName ?? 'Apple Health',
        simulated: false,
        // Older exports carry totals as attributes
        ...(a.totalEnergyBurned && a.totalEnergyBurnedUnit === 'kcal' ? { energyKcal: Number(a.totalEnergyBurned) } : {}),
        ...(a.totalDistance && a.totalDistanceUnit === 'km' ? { distanceMeters: Number(a.totalDistance) * 1000 } : {}),
      }
      workouts.push(openWorkout)
      if (line.endsWith('/>')) openWorkout = null
      continue
    }

    if (openWorkout && line.startsWith('<WorkoutStatistics ')) {
      const a = parseAttributes(line)
      if (a.type === 'HKQuantityTypeIdentifierActiveEnergyBurned' && a.sum && (a.unit === 'kcal' || a.unit === 'Cal')) openWorkout.energyKcal = Number(a.sum)
      if (a.type === 'HKQuantityTypeIdentifierHeartRate' && a.average && a.unit === 'count/min') openWorkout.averageHeartRate = Math.round(Number(a.average))
      if (a.type === 'HKQuantityTypeIdentifierDistanceWalkingRunning' && a.sum && a.unit === 'km') openWorkout.distanceMeters = Number(a.sum) * 1000
      continue
    }
    if (line.startsWith('</Workout>')) openWorkout = null
  }
  flush()
  if (!sawHealthData) throw new Error('This does not look like an Apple Health export.xml (no <HealthData> element).')
  // A file cut off part-way has no closing tag; reporting it as a finished import would hide the missing records.
  if (!sawEnd) throw new Error('This does not look like a complete Apple Health export.xml (the file ends before </HealthData>).')

  return { metrics, sleep: buildSleepSessions(sleepSegs), workouts, skippedRecords: skipped, unsupportedTypes: [...unsupported].sort(), linesRead: lines }
}

/**
 * HealthKit stores sleep as category samples per source (iPhone bedtime schedule, Apple Watch
 * stages, third-party apps). We group each source's samples into sessions (gap > 90 min = new
 * session) and, where sessions from different sources overlap, keep the one with staged data /
 * most asleep minutes so a night is not counted twice.
 */
export function buildSleepSessions(segs: SleepSeg[]): SleepData[] {
  const bySource = new Map<string, SleepSeg[]>()
  for (const s of segs) bySource.set(s.sourceName, [...(bySource.get(s.sourceName) ?? []), s])
  const sessions: (SleepData & { _score: number })[] = []
  for (const [sourceName, list] of bySource) {
    list.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    let cur: SleepSeg[] = []
    const close = () => {
      if (!cur.length) return
      const minutes = (types: SleepStageType[]) =>
        cur.filter((x) => types.includes(x.stage)).reduce((acc, x) => acc + (Date.parse(x.end) - Date.parse(x.start)) / 60_000, 0)
      const asleep = minutes(['asleep', 'light', 'deep', 'rem'])
      const staged = cur.some((x) => x.stage === 'light' || x.stage === 'deep' || x.stage === 'rem')
      const end = cur.reduce((m, x) => (Date.parse(x.end) > Date.parse(m) ? x.end : m), cur[0]!.end)
      sessions.push({
        start: cur[0]!.start,
        end,
        minutesAsleep: Math.round(asleep),
        minutesAwake: Math.round(minutes(['awake'])),
        stages: cur.filter((x) => x.stage !== 'in_bed').map(({ stage, start, end }) => ({ stage, start, end })),
        source: 'apple-health-export',
        sourceDetail: sourceName,
        ...(cur[0]!.device ? { device: cur[0]!.device } : {}),
        simulated: false,
        _score: (staged ? 1e6 : 0) + asleep,
      })
      cur = []
    }
    for (const s of list) {
      const lastEnd = cur.length ? Math.max(...cur.map((x) => Date.parse(x.end))) : 0
      if (cur.length && Date.parse(s.start) - lastEnd > 90 * 60_000) close()
      cur.push(s)
    }
    close()
  }
  sessions.sort((a, b) => b._score - a._score)
  const kept: (SleepData & { _score: number })[] = []
  for (const s of sessions) {
    const overlaps = kept.some((k) => Date.parse(s.start) < Date.parse(k.end) && Date.parse(k.start) < Date.parse(s.end))
    if (!overlaps && s.minutesAsleep > 0) kept.push(s)
  }
  return kept.map(({ _score, ...s }) => s).sort((a, b) => a.start.localeCompare(b.start))
}

export class AppleHealthExportProvider extends StoredDataProvider {
  readonly id = 'apple-health-export' as const

  constructor(repo: Repo) {
    super(repo)
  }

  availability(): Availability {
    return {
      available: true,
      note: 'Works today with any Apple Watch: export from the iPhone Health app and upload export.xml. Manual, not live.',
    }
  }
}
