import { METRIC_INFO, type Metric, type MetricType, type SleepData, type VitalsResponse } from '@astrovitals/shared'
import { useMemo, useState } from 'react'
import { DailyBarChart, SleepStagesChart, TimeSeriesChart } from '../components/charts'
import { Card, ErrorNote, fmtDate, fmtDateTime, Loading, QualityNote, SourceBadge, timeAgo, useAsync } from '../components/common'
import { api } from '../lib/api'
import { dailySum, DAY, formatValue, latest, seriesBySource } from '../lib/series'

const TILES: MetricType[] = ['heart_rate', 'resting_heart_rate', 'spo2', 'respiratory_rate', 'skin_temperature', 'skin_temperature_deviation', 'hrv_rmssd', 'hrv_sdnn']
const HISTORY: MetricType[] = ['resting_heart_rate', 'hrv_rmssd', 'hrv_sdnn', 'spo2', 'respiratory_rate', 'skin_temperature', 'skin_temperature_deviation']

export function useRange(defaultDays = 7) {
  const [days, setDays] = useState(defaultDays)
  const range = useMemo(() => {
    const to = new Date()
    return { days, from: new Date(to.getTime() - days * DAY).toISOString(), to: to.toISOString() }
  }, [days])
  return { ...range, setDays }
}

export function RangePicker({ days, setDays, options = [1, 7, 14, 30] }: { days: number; setDays: (d: number) => void; options?: number[] }) {
  return (
    <div className="row" role="group" aria-label="Time range">
      {options.map((d) => (
        <button key={d} type="button" aria-pressed={days === d} className={days === d ? 'primary' : ''} onClick={() => setDays(d)}>
          {d === 1 ? '24 h' : `${d} days`}
        </button>
      ))}
    </div>
  )
}

function VitalTile({ type, metrics }: { type: MetricType; metrics: Metric[] }) {
  const m = latest(metrics, type)
  const info = METRIC_INFO[type]
  if (!m) return null
  return (
    <div className="card tile">
      <div className="label">{info.label}</div>
      <div className="value">
        {formatValue(type, m.value)}
        <span className="unit">{info.unit}</span>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <SourceBadge source={m.source} simulated={m.simulated} />
        <span className="meta">
          {m.aggregation === 'daily' ? `Daily value for ${fmtDate(m.timestamp.slice(0, 10))}` : `${fmtDateTime(m.timestamp)} (${timeAgo(m.timestamp)})`}
          {m.raw ? ` · original ${m.raw.value} ${m.raw.unit}` : ''}
        </span>
        <QualityNote quality={m.quality} />
      </div>
    </div>
  )
}

function sleepNights(sleep: SleepData[]) {
  return sleep.map((s) => {
    const h = (stage: string) => s.stages.filter((x) => x.stage === stage).reduce((a, x) => a + (Date.parse(x.end) - Date.parse(x.start)) / 3_600_000, 0)
    return { date: s.end.slice(0, 10), deep: h('deep'), light: h('light'), rem: h('rem'), awake: h('awake'), asleep: s.stages.length ? h('asleep') : s.minutesAsleep / 60 }
  })
}

function MetricTable({ metrics, type }: { metrics: Metric[]; type: MetricType }) {
  const rows = metrics.filter((m) => m.metricType === type).slice(-500).reverse()
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Time (original)</th>
          <th>Value</th>
          <th>Source</th>
          <th>Quality</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m, i) => (
          <tr key={i}>
            <td>{m.timestamp}</td>
            <td>
              {formatValue(type, m.value)} {m.unit}
              {m.raw ? ` (raw ${m.raw.value} ${m.raw.unit})` : ''}
            </td>
            <td>{m.simulated ? 'SIMULATED · ' : ''}{m.sourceDetail ?? m.source}</td>
            <td>{m.quality?.status ?? 'ok'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function DashboardPage() {
  const { days, from, to, setDays } = useRange(7)
  const vitals = useAsync(() => api.vitals(from, to), [from, to])
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h1>Crew vitals</h1>
        <RangePicker days={days} setDays={setDays} />
      </div>
      {vitals.error ? <ErrorNote error={vitals.error} retry={vitals.reload} /> : null}
      {vitals.loading && !vitals.data ? <Loading what="vitals" /> : null}
      {vitals.data ? <VitalsView v={vitals.data} /> : null}
    </div>
  )
}

function VitalsView({ v }: { v: VitalsResponse }) {
  if (!v.sources.length) {
    return (
      <div className="card">
        <h2>No wearable data yet</h2>
        <p>
          Connect a source on the <a href="#/connections">Connections</a> page (Apple Health export works with any Apple Watch today), or turn on demo mode in{' '}
          <a href="#/privacy">Settings</a> to explore with clearly labelled simulated data.
        </p>
      </div>
    )
  }
  const flagged = v.metrics.filter((m) => m.quality && m.quality.status !== 'ok')
  const hr = seriesBySource(v.metrics, 'heart_rate')
  const stepRows = v.sources.map((s) => ({ source: s.provider, simulated: s.simulated, points: dailySum(v.metrics, 'steps', s.provider, s.simulated) })).filter((r) => r.points.length)
  const kcalRows = v.sources.map((s) => ({ source: s.provider, simulated: s.simulated, points: dailySum(v.metrics, 'active_energy', s.provider, s.simulated) })).filter((r) => r.points.length)

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="muted">Showing:</span>
        {v.sources.map((s) => (
          <SourceBadge key={s.provider} source={s.provider} simulated={s.simulated} />
        ))}
      </div>

      <section className="section">
        <h2>Current vitals</h2>
        <div className="grid tiles">
          {TILES.map((t) => (
            <VitalTile key={t} type={t} metrics={v.metrics} />
          ))}
          {(() => {
            const today = v.activity.filter((a) => a.date === v.activity.at(-1)?.date)
            return today.map((a) => (
              <div className="card tile" key={`act-${a.source}`}>
                <div className="label">Activity · {fmtDate(a.date)}</div>
                <div className="value">
                  {a.steps?.toLocaleString() ?? '—'}
                  <span className="unit">steps</span>
                </div>
                <div className="meta">{a.activeEnergyKcal !== undefined ? `${a.activeEnergyKcal} active kcal` : ''}</div>
                <SourceBadge source={a.source} simulated={a.simulated} />
              </div>
            ))
          })()}
        </div>
      </section>

      <section className="section grid">
        <Card title="Heart rate" table={<MetricTable metrics={v.metrics} type="heart_rate" />}>
          <TimeSeriesChart series={hr} type="heart_rate" />
        </Card>
      </section>

      <section className="section">
        <h2>History</h2>
        <div className="grid two">
          {HISTORY.filter((t) => v.metrics.some((m) => m.metricType === t)).map((t) => (
            <Card key={t} title={METRIC_INFO[t].label} table={<MetricTable metrics={v.metrics} type={t} />}>
              <TimeSeriesChart series={seriesBySource(v.metrics, t)} type={t} small />
              <p className="muted" style={{ fontSize: '0.78rem' }}>{METRIC_INFO[t].description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="section grid two">
        {v.sources
          .filter((s) => v.sleep.some((x) => x.source === s.provider))
          .map((s) => {
            const sessions = v.sleep.filter((x) => x.source === s.provider && x.simulated === s.simulated)
            const nights = sleepNights(sessions)
            return (
              <Card
                key={`sleep-${s.provider}`}
                title={<>Sleep <SourceBadge source={s.provider} simulated={s.simulated} /></>}
                table={
                  <table className="data">
                    <thead><tr><th>Start</th><th>End</th><th>Asleep</th><th>Awake</th></tr></thead>
                    <tbody>{sessions.map((x) => <tr key={x.start}><td>{x.start}</td><td>{x.end}</td><td>{(x.minutesAsleep / 60).toFixed(1)} h</td><td>{x.minutesAwake ?? '—'} min</td></tr>)}</tbody>
                  </table>
                }
              >
                <SleepStagesChart nights={nights} />
              </Card>
            )
          })}
        {stepRows.length ? (
          <Card title="Steps per day" table={<DailyTable rows={stepRows} unit="steps" />}>
            <DailyBarChart rows={stepRows} unit="steps" />
          </Card>
        ) : null}
        {kcalRows.length ? (
          <Card title="Active energy per day" table={<DailyTable rows={kcalRows} unit="kcal" />}>
            <DailyBarChart rows={kcalRows} unit="kcal" />
          </Card>
        ) : null}
      </section>

      <section className="section grid two">
        <Card title="Workouts / exercise sessions">
          {v.workouts.length ? (
            <ul className="list">
              {[...v.workouts].reverse().map((w) => (
                <li key={`${w.source}${w.start}`}>
                  <strong>{w.displayName}</strong>
                  <span className="muted">{fmtDateTime(w.start)} · {Math.round((Date.parse(w.end) - Date.parse(w.start)) / 60000)} min</span>
                  {w.energyKcal !== undefined ? <span>{Math.round(w.energyKcal)} kcal</span> : null}
                  {w.averageHeartRate !== undefined ? <span>avg {w.averageHeartRate} bpm</span> : null}
                  <SourceBadge source={w.source} simulated={w.simulated} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">No workouts in this range.</div>
          )}
        </Card>
        <Card title="Data-quality flags">
          {flagged.length ? (
            <ul className="list">
              {flagged.slice(-30).reverse().map((m, i) => (
                <li key={i}>
                  <QualityNote quality={m.quality} />
                  <span>
                    {METRIC_INFO[m.metricType].label}: {m.value} {m.unit}
                  </span>
                  <span className="muted">{m.timestamp}</span>
                  <SourceBadge source={m.source} simulated={m.simulated} />
                  <small style={{ flexBasis: '100%' }}>{m.quality?.note}</small>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">No readings flagged in this range.</div>
          )}
          <p className="muted" style={{ fontSize: '0.78rem' }}>
            Flags describe measurement plausibility (sensor fit, motion, sync or unit errors). They are not health findings and are not a substitute for medical care.
          </p>
        </Card>
      </section>
    </>
  )
}

export function DailyTable({ rows, unit }: { rows: { source: string; simulated: boolean; points: { date: string; value: number | null }[] }[]; unit: string }) {
  return (
    <table className="data">
      <thead><tr><th>Date</th><th>Source</th><th>{unit}</th></tr></thead>
      <tbody>
        {rows.flatMap((r) =>
          r.points.map((p) => (
            <tr key={`${r.source}${p.date}`}><td>{p.date}</td><td>{r.simulated ? 'SIMULATED · ' : ''}{r.source}</td><td>{p.value === null ? '—' : Math.round(p.value).toLocaleString()}</td></tr>
          )),
        )}
      </tbody>
    </table>
  )
}
