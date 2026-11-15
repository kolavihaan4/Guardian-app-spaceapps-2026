/**
 * Exploratory statistics for the correlation view.
 *
 * The output is an observation about two series that happen to share dates.
 * It says nothing about cause: space weather and environmental events are not
 * shown to change anyone's vitals by this app, and the UI must say so.
 */

export interface DailyPoint {
  date: string
  value: number | null
}

export interface ExploratoryResult {
  /** Days where both series have a value. */
  n: number
  /** Pearson r, or null when n is below `minN` or a series has no variance. */
  r: number | null
  minN: number
  pairs: { date: string; a: number; b: number }[]
  caveats: string[]
}

export const EXPLORATORY_CAVEATS = [
  'Exploratory observation only. Correlation does not imply causation.',
  'Wearable vitals change with sleep, exercise, illness, stress, caffeine, alcohol, device fit and many other factors not shown here.',
  'NASA event data describe space weather or Earth events, not exposure of the wearer. On Earth, the atmosphere and magnetic field shield people from most space-weather radiation.',
  'Small samples produce large, unstable correlations by chance.',
]

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n !== ys.length || n < 2) return null
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]!
    sy += ys[i]!
  }
  const mx = sx / n
  const my = sy / n
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx
    const dy = ys[i]! - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  if (vx === 0 || vy === 0) return null
  return cov / Math.sqrt(vx * vy)
}

export function exploratoryCorrelation(a: DailyPoint[], b: DailyPoint[], minN = 7): ExploratoryResult {
  const bByDate = new Map<string, number>()
  for (const p of b) if (p.value !== null && Number.isFinite(p.value)) bByDate.set(p.date, p.value)
  const pairs: ExploratoryResult['pairs'] = []
  for (const p of a) {
    if (p.value === null || !Number.isFinite(p.value)) continue
    const other = bByDate.get(p.date)
    if (other !== undefined) pairs.push({ date: p.date, a: p.value, b: other })
  }
  pairs.sort((x, y) => x.date.localeCompare(y.date))
  const caveats = [...EXPLORATORY_CAVEATS]
  let r: number | null = null
  if (pairs.length >= minN) {
    r = pearson(
      pairs.map((p) => p.a),
      pairs.map((p) => p.b),
    )
    if (r === null) caveats.push('One of the series is constant over the overlapping days, so r is undefined.')
  } else {
    caveats.push(`Only ${pairs.length} overlapping day(s); at least ${minN} are needed before a coefficient is shown.`)
  }
  return { n: pairs.length, r, minN, pairs, caveats }
}

/** Plain-language strength label that avoids causal wording. */
export function describeR(r: number | null): string {
  if (r === null) return 'not computed'
  const a = Math.abs(r)
  const strength = a < 0.1 ? 'no visible' : a < 0.3 ? 'a weak' : a < 0.5 ? 'a moderate' : 'a strong'
  const dir = r > 0 ? 'positive' : 'negative'
  return a < 0.1 ? 'no visible linear association' : `${strength} ${dir} linear association (co-occurrence only)`
}
