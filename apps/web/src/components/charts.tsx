import { METRIC_INFO, PROVIDER_INFO, type DailyPoint, type MetricType, type ProviderId } from '@astrovitals/shared'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { formatValue, sourceColor, type SourceSeries } from '../lib/series'
import { fmtDate, fmtDateTime } from './common'

const axisProps = {
  stroke: 'var(--axis)',
  tick: { fill: 'var(--text-muted)', fontSize: 11 },
  tickLine: false,
} as const

const tooltipStyle = {
  contentStyle: { background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-secondary)' },
  itemStyle: { color: 'var(--text-primary)' },
}

const seriesName = (s: { source: ProviderId; simulated: boolean }) => `${s.simulated ? 'SIMULATED · ' : ''}${PROVIDER_INFO[s.source].name}`

export function Legend({ series }: { series: { source: ProviderId; simulated: boolean }[] }) {
  if (series.length < 2) return null // a single series is named by the card title + badge
  return (
    <div className="legend" aria-label="Legend">
      {series.map((s) => (
        <span key={`${s.source}${s.simulated}`}>
          <i className={s.simulated ? 'dashed' : ''} style={{ background: sourceColor(s.source), color: sourceColor(s.source) }} />
          {seriesName(s)}
        </span>
      ))}
    </div>
  )
}

/** Ticks on day (or 6-hour) boundaries so a date label never repeats. */
function timeTicks(series: SourceSeries[]): { values: number[]; format: (t: number) => string } {
  const ts = series.flatMap((s) => s.points.map((p) => p.t))
  const min = Math.min(...ts)
  const max = Math.max(...ts)
  const H = 3_600_000
  const step = max - min > 36 * H ? 24 * H : 6 * H
  const values: number[] = []
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) values.push(t)
  while (values.length > 10) values.splice(1, values.length, ...values.slice(1).filter((_, i) => i % 2 === 1))
  const format = step === 24 * H ? (t: number) => fmtDate(new Date(t).toISOString()) : (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return { values, format }
}

/** Time series of one metric; one line per source. Simulated series are dashed; flagged readings get a status dot. */
export function TimeSeriesChart({ series, type, small }: { series: SourceSeries[]; type: MetricType; small?: boolean }) {
  const info = METRIC_INFO[type]
  if (!series.some((s) => s.points.length)) return <div className="empty">No {info.label.toLowerCase()} data for this range.</div>
  const flagged = series.flatMap((s) => s.points.filter((p) => p.flagged).map((p) => ({ ...p, source: s.source })))
  const all = series.flatMap((s) => s.points.filter((p) => !p.flagged).map((p) => p.value))
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const pad = Math.max(1, (hi - lo) * 0.1)
  const ticks = timeTicks(series)
  return (
    <>
      <Legend series={series} />
      <div className={`chart${small ? ' small' : ''}`} role="img" aria-label={`${info.label} over time, ${series.length} source(s)`}>
        <ResponsiveContainer>
          <LineChart margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" ticks={ticks.values} tickFormatter={ticks.format} {...axisProps} minTickGap={24} />
            <YAxis {...axisProps} domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]} allowDataOverflow width={48} unit={info.unit === 'steps' ? '' : ''} />
            <Tooltip
              {...tooltipStyle}
              labelFormatter={(t) => fmtDateTime(new Date(Number(t)).toISOString())}
              formatter={(v, name) => [`${formatValue(type, Number(v))} ${info.unit}`, name]}
            />
            {series.map((s) => (
              <Line
                key={`${s.source}${s.simulated}`}
                data={s.points.filter((p) => !p.flagged)}
                dataKey="value"
                name={seriesName(s)}
                stroke={sourceColor(s.source)}
                strokeWidth={2}
                strokeDasharray={s.simulated ? '5 4' : undefined}
                dot={s.points.length < 40 ? { r: 3, strokeWidth: 0, fill: sourceColor(s.source) } : false}
                activeDot={{ r: 5, stroke: 'var(--surface-1)', strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {flagged.length ? (
        <p className="flag implausible" style={{ fontSize: '0.78rem' }}>
          <span className="dot" aria-hidden /> {flagged.length} reading(s) flagged as data-quality issues are excluded from the line (see table).
        </p>
      ) : null}
    </>
  )
}

/** Daily bars (steps, sleep hours). Grouped per source with a 2px surface gap. */
export function DailyBarChart({ rows, unit, decimals = 0 }: { rows: { source: ProviderId; simulated: boolean; points: DailyPoint[] }[]; unit: string; decimals?: number }) {
  const dates = [...new Set(rows.flatMap((r) => r.points.map((p) => p.date)))].sort()
  if (!dates.length) return <div className="empty">No data for this range.</div>
  const data = dates.map((date) => {
    const row: Record<string, number | string | null> = { date }
    for (const r of rows) row[`${r.source}${r.simulated}`] = r.points.find((p) => p.date === date)?.value ?? null
    return row
  })
  return (
    <>
      <Legend series={rows} />
      <div className="chart" role="img" aria-label={`Daily ${unit} per source`}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} {...axisProps} minTickGap={20} />
            <YAxis {...axisProps} width={48} />
            <Tooltip {...tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} labelFormatter={(d) => fmtDate(String(d))} formatter={(v, name) => [`${Number(v).toFixed(decimals)} ${unit}`, name]} />
            {rows.map((r) => (
              <Bar
                key={`${r.source}${r.simulated}`}
                dataKey={`${r.source}${r.simulated}`}
                name={seriesName(r)}
                fill={sourceColor(r.source)}
                fillOpacity={r.simulated ? 0.55 : 1}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

/** Small single-series daily line, for NASA environment small multiples and the correlation view. */
export function DailyLine({ points, unit, label, color = 'var(--series-1)', dashed }: { points: DailyPoint[]; unit: string; label: string; color?: string; dashed?: boolean }) {
  if (!points.some((p) => p.value !== null)) return <div className="empty">No values in this range.</div>
  return (
    <div className="chart small" role="img" aria-label={label}>
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -12 }} syncId="correlation">
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDate} {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} width={48} domain={['auto', 'auto']} />
          <Tooltip {...tooltipStyle} labelFormatter={(d) => fmtDate(String(d))} formatter={(v) => [v === null ? 'no value' : `${Number(v).toFixed(2)} ${unit}`, label]} />
          <Line dataKey="value" stroke={color} strokeWidth={2} strokeDasharray={dashed ? '5 4' : undefined} dot={{ r: 3, strokeWidth: 0, fill: color }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Scatter of paired daily values — the honest form for "do these co-vary?". */
export function PairScatter({ pairs, xLabel, yLabel, color }: { pairs: { date: string; a: number; b: number }[]; xLabel: string; yLabel: string; color: string }) {
  if (!pairs.length) return <div className="empty">No overlapping days.</div>
  return (
    <div className="chart" role="img" aria-label={`Scatter of ${yLabel} against ${xLabel}`}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 6, right: 12, bottom: 18, left: -6 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis type="number" dataKey="b" name={xLabel} {...axisProps} domain={['auto', 'auto']} label={{ value: xLabel, position: 'insideBottom', offset: -10, fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis type="number" dataKey="a" name={yLabel} {...axisProps} domain={['auto', 'auto']} width={52} />
          <ZAxis range={[64, 64]} />
          <Tooltip {...tooltipStyle} cursor={{ stroke: 'var(--axis)' }} formatter={(v, name) => [Number(v).toFixed(2), name]} />
          <Scatter data={pairs} fill={color} stroke="var(--surface-1)" strokeWidth={2} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

const STAGE_FILL: Record<string, string> = { deep: '#184f95', light: '#5598e7', rem: '#9ec5f4', awake: 'var(--status-serious)', asleep: '#3987e5', restless: 'var(--status-warning)' }

/** Stacked sleep stages per night (ordinal blue ramp for sleep depth; awake in a status hue with a label). */
export function SleepStagesChart({ nights }: { nights: { date: string; deep: number; light: number; rem: number; awake: number; asleep: number }[] }) {
  if (!nights.length) return <div className="empty">No sleep sessions in this range.</div>
  const keys = (['deep', 'light', 'rem', 'asleep', 'awake'] as const).filter((k) => nights.some((n) => n[k] > 0))
  return (
    <>
      <div className="legend">
        {keys.map((k) => (
          <span key={k}>
            <i style={{ background: STAGE_FILL[k], height: 8, width: 8, borderRadius: 2 }} />
            {k === 'asleep' ? 'asleep (unstaged)' : k}
          </span>
        ))}
      </div>
      <div className="chart" role="img" aria-label="Sleep stages per night in hours">
        <ResponsiveContainer>
          <BarChart data={nights} margin={{ top: 6, right: 8, bottom: 0, left: -12 }} barCategoryGap="25%">
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} {...axisProps} minTickGap={20} />
            <YAxis {...axisProps} width={40} unit="h" />
            <Tooltip {...tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} labelFormatter={(d) => `Night ending ${fmtDate(String(d))}`} formatter={(v, name) => [`${Number(v).toFixed(1)} h`, name]} />
            {keys.map((k, i) => (
              <Bar key={k} dataKey={k} stackId="s" fill={STAGE_FILL[k]} stroke="var(--surface-1)" strokeWidth={2} radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
