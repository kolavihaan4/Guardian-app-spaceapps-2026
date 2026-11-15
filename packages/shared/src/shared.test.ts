import { describe, expect, it } from 'vitest'
import { assessQuality, attentionReasons, compareToBaseline, describeR, exploratoryCorrelation, median, pearson, sourceRange, summaryCsv } from './index.ts'

describe('assessQuality', () => {
  it('accepts typical values', () => {
    expect(assessQuality('heart_rate', 62, 'sample').status).toBe('ok')
    expect(assessQuality('spo2', 97, 'sample').status).toBe('ok')
  })

  it('flags impossible values as implausible data, not as a health finding', () => {
    const q = assessQuality('spo2', 104, 'sample')
    expect(q.status).toBe('implausible')
    expect(q.note).toMatch(/data or unit error/)
    expect(q.note).not.toMatch(/hypox|disease|doctor|danger/i)
  })

  it('flags unusual but possible values as out_of_range with a sensor-fit note', () => {
    const q = assessQuality('heart_rate', 25, 'sample')
    expect(q.status).toBe('out_of_range')
    expect(q.note).toMatch(/not a medical assessment/)
  })

  it('only applies typical step bounds to daily totals', () => {
    expect(assessQuality('steps', 150_000, 'interval').status).toBe('ok')
    expect(assessQuality('steps', 150_000, 'daily').status).toBe('out_of_range')
    expect(assessQuality('steps', -1, 'interval').status).toBe('implausible')
  })

  it('treats NaN as a parsing problem', () => {
    expect(assessQuality('heart_rate', Number.NaN, 'sample').status).toBe('implausible')
  })
})

describe('exploratory correlation', () => {
  it('computes Pearson r', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1)
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1)
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
  })

  it('only pairs days present in both series and withholds r for small n', () => {
    const a = [
      { date: '2026-10-01', value: 60 },
      { date: '2026-10-02', value: null },
      { date: '2026-10-03', value: 64 },
    ]
    const b = [
      { date: '2026-10-01', value: 3 },
      { date: '2026-10-02', value: 5 },
      { date: '2026-10-03', value: 4 },
    ]
    const res = exploratoryCorrelation(a, b)
    expect(res.n).toBe(2)
    expect(res.r).toBeNull()
    expect(res.caveats.join(' ')).toMatch(/does not imply causation/)
  })

  it('computes r once enough days overlap', () => {
    const days = Array.from({ length: 10 }, (_, i) => `2026-09-${String(i + 10)}`)
    const a = days.map((d, i) => ({ date: d, value: i }))
    const b = days.map((d, i) => ({ date: d, value: i * 2 + 1 }))
    const res = exploratoryCorrelation(a, b)
    expect(res.n).toBe(10)
    expect(res.r).toBeCloseTo(1)
    expect(describeR(res.r)).toMatch(/co-occurrence only/)
  })
})

describe('Mission Baseline comparison', () => {
  const p = (timepoint: string, day: number, value: number | null, refMin: number | null = 135, refMax: number | null = 146) => ({ timepoint, day, value, refMin, refMax })
  const sodium = [p('L-92', -92, 143), p('L-44', -44, 141), p('L-3', -3, 142), p('R+1', 1, 137), p('R+45', 45, 133)]

  it('uses the median of the three preflight readings (the spec example: 143, 141, 142 → 142; 137 is −5, −3.5 %)', () => {
    const c = compareToBaseline(sodium)
    expect(c.baseline).toMatchObject({ n: 3, median: 142, min: 141, max: 143 })
    expect(c.followUp[0]).toMatchObject({ timepoint: 'R+1', value: 137, change: -5, percentChange: -3.5, sourceRange: 'within' })
    expect(c.notices).toEqual([])
    expect(median([1, 100, 3])).toBe(3) // one odd draw does not move the baseline
    expect(median([2, 4])).toBe(3)
  })

  it('reports the source-range result separately and makes only that, or a data notice, need attention', () => {
    const c = compareToBaseline(sodium)
    expect(c.followUp[1]).toMatchObject({ value: 133, sourceRange: 'below' })
    expect(attentionReasons(c, c.followUp[0]!)).toEqual([]) // a 3.5 % drop inside the lab range is neutral
    expect(attentionReasons(c, c.followUp[1]!)).toEqual(['Outside the source lab’s reference range (below 135–146).'])
    expect(sourceRange({ value: 55, refMin: 60, refMax: null })).toBe('below') // one-sided range, e.g. ≥ 60
    expect(sourceRange({ value: 5, refMin: null, refMax: null })).toBe('no_range')
  })

  it('raises data-quality notices for missing readings, a limited baseline and changing ranges — and never invents a value', () => {
    const c = compareToBaseline([p('L-92', -92, null), p('L-44', -44, 10, 8.6, 10.2), p('L-3', -3, 12, 8.6, 10.4), p('R+1', 1, null), p('R+45', 45, 11, 8.6, 10.2)])
    expect(c.baseline).toMatchObject({ n: 2, median: 11 })
    expect(c.followUp[0]).toMatchObject({ value: null, change: null, sourceRange: 'no_reading' })
    expect(c.notices.map((n) => n.kind)).toEqual(['limited_baseline', 'missing_reading', 'range_changed'])
    expect(c.notices[1]!.message).toBe('No reading recorded at L-92, R+1.')
    expect(compareToBaseline([p('L-3', -3, null), p('R+1', 1, 5)]).followUp[0]).toMatchObject({ change: null, percentChange: null })
  })

  it('writes a downloadable CSV summary with the calculation inputs and the source', () => {
    const csv = summaryCsv([{ crew: 'C001', measurement: 'Sodium', unit: 'mmol/L', comparison: compareToBaseline(sodium) }], { id: 'OSD-575', doi: '10.26030/mc5d-p710', license: 'CC0-1.0' })
    const lines = csv.trim().split('\n')
    expect(lines[0]).toContain('OSD-575, DOI 10.26030/mc5d-p710, licence CC0-1.0')
    expect(lines[2]!.split(',')).toContain('baseline_median')
    expect(lines[3]).toBe('C001,Sodium,mmol/L,L-92=143 L-44=141 L-3=142,142,R+1,1,137,-5,-3.5,135,146,within,')
    expect(lines).toHaveLength(5)
  })
})
