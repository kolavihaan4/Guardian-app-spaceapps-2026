/**
 * Mission Baseline: compare a person's later lab readings with their own pre-mission readings.
 *
 * Method (agreed with Vihaan, 2026-10-11):
 *  - Baseline = the MEDIAN of the pre-mission readings (the middle of three). Robust to one odd draw.
 *  - Every later reading is reported as an absolute and a percentage change from that baseline.
 *  - Whether the reading sits inside the source lab's reference range is a SEPARATE fact.
 *  - Data-quality notices say why a comparison deserves caution (missing readings, fewer than three
 *    baseline readings, a reference range that changes between draws).
 * Nothing here is a statistical test or a diagnosis. A Reference Change Value needs verified analytical
 * (CVa) and within-subject (CVi) variation for the specific assay and is not used.
 *
 * Example: preflight sodium 143, 141, 142 → baseline 142. A later 137 is −5 (−3.5 %), and can still be
 * inside the lab range 135–146. Both facts are reported; neither is called dangerous.
 */

export interface LabPoint {
  /** Timepoint label as published, e.g. "L-92" (launch minus 92 days) or "R+1" (return plus 1 day). */
  timepoint: string
  /** Days relative to launch (negative) or return (positive). */
  day: number
  value: number | null
  /** The lab's reference range for this person and draw; either side may be absent (e.g. "≥ 60"). */
  refMin: number | null
  refMax: number | null
}

export type SourceRange = 'below' | 'within' | 'above' | 'no_range' | 'no_reading'

export interface ComparedPoint extends LabPoint {
  change: number | null
  percentChange: number | null
  sourceRange: SourceRange
}

export type NoticeKind = 'missing_reading' | 'limited_baseline' | 'no_baseline' | 'range_changed'

export interface DataNotice {
  kind: NoticeKind
  message: string
}

export interface BaselineComparison {
  baseline: { readings: LabPoint[]; n: number; median: number | null; min: number | null; max: number | null }
  followUp: ComparedPoint[]
  notices: DataNotice[]
}

/** Three preflight draws are the design of the dataset; fewer is a reason for caution. */
export const EXPECTED_BASELINE_READINGS = 3

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

export function sourceRange(p: Pick<LabPoint, 'value' | 'refMin' | 'refMax'>): SourceRange {
  if (p.value === null) return 'no_reading'
  if (p.refMin === null && p.refMax === null) return 'no_range'
  if (p.refMin !== null && p.value < p.refMin) return 'below'
  if (p.refMax !== null && p.value > p.refMax) return 'above'
  return 'within'
}

const rangeText = (p: LabPoint) =>
  p.refMin !== null && p.refMax !== null ? `${p.refMin}–${p.refMax}` : p.refMin !== null ? `≥ ${p.refMin}` : p.refMax !== null ? `≤ ${p.refMax}` : 'none'

/** Points with day < 0 form the baseline; the rest are compared against it, in day order. */
export function compareToBaseline(points: LabPoint[]): BaselineComparison {
  const sorted = [...points].sort((a, b) => a.day - b.day)
  const readings = sorted.filter((p) => p.day < 0)
  const values = readings.map((p) => p.value).filter((v): v is number => v !== null)
  const n = values.length
  const base = median(values)

  const followUp = sorted
    .filter((p) => p.day >= 0)
    .map((p): ComparedPoint => {
      const range = sourceRange(p)
      if (p.value === null || base === null) return { ...p, change: null, percentChange: null, sourceRange: range }
      const change = round(p.value - base, 6)
      return { ...p, change, percentChange: base === 0 ? null : round((change / Math.abs(base)) * 100, 1), sourceRange: range }
    })

  const notices: DataNotice[] = []
  if (n === 0) notices.push({ kind: 'no_baseline', message: 'No preflight reading exists, so no baseline can be formed and no change is calculated.' })
  else if (n < EXPECTED_BASELINE_READINGS)
    notices.push({ kind: 'limited_baseline', message: `The baseline rests on ${n} of ${EXPECTED_BASELINE_READINGS} preflight readings, so it is less dependable than usual.` })
  const missing = sorted.filter((p) => p.value === null).map((p) => p.timepoint)
  if (missing.length) notices.push({ kind: 'missing_reading', message: `No reading recorded at ${missing.join(', ')}.` })
  const ranges = [...new Set(sorted.filter((p) => p.value !== null).map(rangeText))]
  if (ranges.length > 1) notices.push({ kind: 'range_changed', message: `The source lab reported different reference ranges across draws (${ranges.join('; ')}), so range results are not strictly comparable.` })

  return { baseline: { readings, n, median: base, min: n ? Math.min(...values) : null, max: n ? Math.max(...values) : null }, followUp, notices }
}

/** Why a reading needs attention (amber), in plain words; empty when it does not. Change size alone never qualifies. */
export function attentionReasons(c: BaselineComparison, p: ComparedPoint): string[] {
  const out: string[] = []
  if (p.sourceRange === 'below' || p.sourceRange === 'above') out.push(`Outside the source lab’s reference range (${p.sourceRange} ${rangeText(p)}).`)
  if (p.sourceRange === 'no_reading') out.push(`No reading at ${p.timepoint}.`)
  for (const n of c.notices) if (n.kind !== 'missing_reading') out.push(n.message)
  return out
}

export interface SummaryRow {
  crew: string
  measurement: string
  unit: string
  comparison: BaselineComparison
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Downloadable comparison summary: one row per measurement × follow-up sample, with the calculation inputs. */
export function summaryCsv(rows: SummaryRow[], source: { id: string; doi: string; license: string }): string {
  const lines = [
    `# Mission Baseline comparison summary — source NASA OSDR ${source.id}, DOI ${source.doi}, licence ${source.license}`,
    '# Baseline = median of the preflight readings. Change = reading − baseline. Not a diagnosis or a statistical test.',
    ['crew', 'measurement', 'unit', 'preflight_readings', 'baseline_median', 'sample', 'days_after_return', 'reading', 'change', 'percent_change', 'lab_range_min', 'lab_range_max', 'lab_range_result', 'notices'].join(','),
  ]
  for (const r of rows) {
    const pre = r.comparison.baseline.readings.map((b) => `${b.timepoint}=${b.value ?? 'NA'}`).join(' ')
    const notices = r.comparison.notices.map((n) => n.message).join(' ')
    for (const p of r.comparison.followUp) {
      lines.push([r.crew, r.measurement, r.unit, pre, r.comparison.baseline.median, p.timepoint, p.day, p.value, p.change, p.percentChange, p.refMin, p.refMax, p.sourceRange, notices].map(csvCell).join(','))
    }
  }
  return lines.join('\n') + '\n'
}
