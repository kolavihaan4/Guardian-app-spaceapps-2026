import { act, cleanup, renderHook } from '@testing-library/react'
import type { NASAEvent } from '@astrovitals/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dailyParticleReports, hazardRange } from './hazards'
import { useDailyDate } from './useDailyDate'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Hazards daily data', () => {
  it('keeps exactly fourteen inclusive dates across a month and year boundary', () => {
    expect(hazardRange('2027-01-04')).toEqual({ from: '2026-12-22', to: '2027-01-04' })
    expect(dailyParticleReports([], '2026-12-22', '2027-01-04')).toHaveLength(14)
  })

  it('counts unique NASA SEP reports on their UTC date and excludes unrelated/outside reports', () => {
    const report = (id: string, timestamp: string, eventType = 'SEP'): NASAEvent => ({ id, source: 'DONKI', timestamp, eventType, title: 'Test catalog report', metadata: {} })
    const a = report('a', '2026-11-15T23:30:00-02:00')
    expect(dailyParticleReports([
      a, a, report('b', '2026-11-16T15:00:00Z'),
      report('c', '2026-11-16T16:00:00Z', 'FLR'),
      report('d', '2026-11-14T12:00:00Z'),
      report('e', 'invalid'),
    ], '2026-11-15', '2026-11-16')).toEqual([
      { date: '2026-11-15', reports: 0 }, { date: '2026-11-16', reports: 2 },
    ])
  })

  it('advances while the page stays open across UTC midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-15T23:59:59Z'))
    const { result, unmount } = renderHook(() => useDailyDate())
    expect(result.current).toBe('2026-11-15')
    act(() => { vi.advanceTimersByTime(1200) })
    expect(result.current).toBe('2026-11-16')
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('catches up when a sleeping browser regains focus', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'))
    const { result } = renderHook(() => useDailyDate())
    vi.setSystemTime(new Date('2026-11-18T08:00:00Z'))
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(result.current).toBe('2026-11-18')
    expect(vi.getTimerCount()).toBe(1)
  })
})
