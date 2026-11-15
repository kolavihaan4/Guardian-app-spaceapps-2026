import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Metric } from '@astrovitals/shared'
import { dailyMean, latest, overlaySeries, seriesBySource } from '../lib/series'
import { Disclaimer, QualityNote, SourceBadge, VitalsTabs } from './common'

describe('labelling', () => {
  it('marks simulated sources unmistakably', () => {
    render(<SourceBadge source="demo" simulated />)
    expect(screen.getByText(/SIMULATED/)).toBeInTheDocument()
  })

  it('does not mark real sources as simulated', () => {
    render(<SourceBadge source="apple-health-export" simulated={false} />)
    expect(screen.queryByText(/SIMULATED/)).not.toBeInTheDocument()
    expect(screen.getByText(/Apple Health export/)).toBeInTheDocument()
  })

  it('links the three Vitals pages and marks the open one', () => {
    render(<VitalsTabs current="baseline" />)
    const links = screen.getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Over time', '#/dashboard'],
      ['Lab baseline', '#/baseline'],
      ['Compare with NASA data', '#/correlation'],
    ])
    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null])
  })

  it('shows the medical disclaimer', () => {
    render(<Disclaimer />)
    expect(screen.getByText(/Not a medical device/)).toBeInTheDocument()
  })

  it('words quality flags as data issues, with an icon and a label (not colour alone)', () => {
    render(<QualityNote quality={{ status: 'implausible', note: 'x' }} />)
    expect(screen.getByText(/data issue/)).toBeInTheDocument()
  })
})

describe('series helpers', () => {
  const m = (over: Partial<Metric>): Metric => ({
    timestamp: '2026-10-01T08:00:00-05:00',
    metricType: 'resting_heart_rate',
    value: 60,
    unit: 'bpm',
    source: 'apple-health-export',
    aggregation: 'daily',
    simulated: false,
    quality: { status: 'ok' },
    ...over,
  })

  it('keeps real and simulated series apart', () => {
    const s = seriesBySource([m({}), m({ source: 'demo', simulated: true })], 'resting_heart_rate')
    expect(s).toHaveLength(2)
  })

  it('uses the local date and excludes implausible readings from daily statistics', () => {
    const pts = dailyMean([m({ value: 60 }), m({ value: 64, timestamp: '2026-10-01T22:00:00-05:00' }), m({ value: 500, quality: { status: 'implausible' } })], 'resting_heart_rate', 'apple-health-export', false)
    expect(pts).toEqual([{ date: '2026-10-01', value: 62 }])
  })

  it('never headlines an implausible reading as the current value', () => {
    const cur = latest([m({ value: 61, timestamp: '2026-10-01T08:00:00-05:00' }), m({ value: 320, timestamp: '2026-10-01T09:00:00-05:00', quality: { status: 'implausible' } })], 'resting_heart_rate')
    expect(cur?.value).toBe(61)
  })

  it('leaves Kp empty on days without a DONKI storm instead of inventing zeros', () => {
    const days = ['2026-10-01', '2026-10-02']
    const kp = overlaySeries('kp_max', days, [{ id: 'g', source: 'DONKI', eventType: 'GST', timestamp: '2026-10-02T00:00:00Z', title: '', metadata: { kpIndex: [{ observedTime: '2026-10-02T03:00:00Z', kpIndex: 6.33 }] } }], [])
    expect(kp).toEqual([{ date: '2026-10-01', value: null }, { date: '2026-10-02', value: 6.33 }])
  })
})
