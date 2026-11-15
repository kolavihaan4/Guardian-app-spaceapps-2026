import { describeR, exploratoryCorrelation, METRIC_INFO, PROVIDER_INFO, type MetricType, type ProviderId } from '@astrovitals/shared'
import { useMemo, useState } from 'react'
import { DailyLine, PairScatter } from '../components/charts'
import { Card, ErrorNote, Loading, SourceBadge, useAsync } from '../components/common'
import { api } from '../lib/api'
import { dailyMean, dailySum, DAY, daysBetween, isoDay, OVERLAYS, overlaySeries, sleepPerNight, sourceColor, type OverlayKey } from '../lib/series'
import { LOCATIONS } from './SpacePage'

type VitalKey = MetricType | 'sleep_hours'
const VITALS: { key: VitalKey; label: string; unit: string }[] = [
  { key: 'resting_heart_rate', label: METRIC_INFO.resting_heart_rate.label, unit: 'bpm' },
  { key: 'heart_rate', label: 'Heart rate (daily mean)', unit: 'bpm' },
  { key: 'hrv_rmssd', label: METRIC_INFO.hrv_rmssd.label, unit: 'ms' },
  { key: 'hrv_sdnn', label: METRIC_INFO.hrv_sdnn.label, unit: 'ms' },
  { key: 'spo2', label: METRIC_INFO.spo2.label, unit: '%' },
  { key: 'respiratory_rate', label: METRIC_INFO.respiratory_rate.label, unit: 'br/min' },
  { key: 'skin_temperature_deviation', label: METRIC_INFO.skin_temperature_deviation.label, unit: '°C' },
  { key: 'steps', label: 'Steps per day', unit: 'steps' },
  { key: 'sleep_hours', label: 'Sleep duration', unit: 'h' },
]

export function CorrelationPage() {
  const [days, setDays] = useState(30)
  const [vital, setVital] = useState<VitalKey>('resting_heart_rate')
  const [overlay, setOverlay] = useState<OverlayKey>('kp_max')
  const [loc, setLoc] = useState(0)
  const [sourceKey, setSourceKey] = useState<string>('')

  const range = useMemo(() => {
    const to = new Date()
    const from = new Date(to.getTime() - days * DAY)
    return { fromIso: from.toISOString(), toIso: to.toISOString(), from: isoDay(from), to: isoDay(to) }
  }, [days])
  const L = LOCATIONS[loc]!
  const vitals = useAsync(() => api.vitals(range.fromIso, range.toIso), [range])
  const sw = useAsync(() => api.spaceWeather(range.from, range.to), [range])
  const env = useAsync(() => api.environment(L.lat, L.lon, range.from, range.to), [L, range])

  const sources = vitals.data?.sources ?? []
  const active = sources.find((s) => `${s.provider}|${s.simulated}` === sourceKey) ?? sources.find((s) => !s.simulated) ?? sources[0]
  const allDays = daysBetween(range.from, range.to)

  const vitalPoints = useMemo(() => {
    if (!vitals.data || !active) return []
    const { provider, simulated } = active
    const pts =
      vital === 'sleep_hours'
        ? sleepPerNight(vitals.data.sleep, provider, simulated)
        : vital === 'steps'
          ? dailySum(vitals.data.metrics, 'steps', provider, simulated)
          : dailyMean(vitals.data.metrics, vital, provider, simulated)
    const byDate = new Map(pts.map((p) => [p.date, p.value]))
    return allDays.map((date) => ({ date, value: byDate.get(date) ?? null }))
  }, [vitals.data, active, vital, allDays])

  const overlayPoints = useMemo(() => overlaySeries(overlay, allDays, sw.data?.data ?? [], env.data?.data.series ?? []), [overlay, allDays, sw.data, env.data])
  const result = useMemo(() => exploratoryCorrelation(vitalPoints, overlayPoints), [vitalPoints, overlayPoints])
  const vInfo = VITALS.find((v) => v.key === vital)!
  const oInfo = OVERLAYS.find((o) => o.key === overlay)!
  const color = active ? sourceColor(active.provider as ProviderId) : 'var(--series-1)'

  return (
    <div>
      <h1>Exploratory overlay</h1>
      <div className="banner warn" role="note">
        <strong>Exploratory observations only.</strong> This view lines up your wearable data with NASA data by date. It cannot show that space weather or
        environmental events caused any change in your body, and it is not medical advice.
      </div>

      <div className="card row" style={{ marginBottom: 12, alignItems: 'end' }}>
        <label>
          Wearable measurement
          <select value={vital} onChange={(e) => setVital(e.target.value as VitalKey)}>
            {VITALS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </label>
        <label>
          Source
          <select value={active ? `${active.provider}|${active.simulated}` : ''} onChange={(e) => setSourceKey(e.target.value)}>
            {sources.map((s) => (
              <option key={`${s.provider}|${s.simulated}`} value={`${s.provider}|${s.simulated}`}>
                {s.simulated ? 'SIMULATED · ' : ''}{PROVIDER_INFO[s.provider].name}
              </option>
            ))}
          </select>
        </label>
        <label>
          NASA data
          <select value={overlay} onChange={(e) => setOverlay(e.target.value as OverlayKey)}>
            {OVERLAYS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        {overlay.startsWith('power_') ? (
          <label>
            Location
            <select value={loc} onChange={(e) => setLoc(Number(e.target.value))}>
              {LOCATIONS.map((l, i) => <option key={l.name} value={i}>{l.name}</option>)}
            </select>
          </label>
        ) : null}
        <label>
          Window
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
      </div>

      {vitals.error ? <ErrorNote error={vitals.error} retry={vitals.reload} /> : null}
      {sw.error && !overlay.startsWith('power_') ? <ErrorNote error={sw.error} retry={sw.reload} /> : null}
      {env.error && overlay.startsWith('power_') ? <ErrorNote error={env.error} retry={env.reload} /> : null}
      {vitals.loading && !vitals.data ? <Loading what="data" /> : null}
      {vitals.data && !active ? <div className="card empty">No wearable source is connected and demo mode is off.</div> : null}

      {active ? (
        <div className="grid two">
          <Card
            title="Both series by day"
            table={
              <table className="data">
                <thead><tr><th>Date</th><th>{vInfo.label}</th><th>{oInfo.label}</th></tr></thead>
                <tbody>{allDays.map((d, i) => <tr key={d}><td>{d}</td><td>{vitalPoints[i]?.value?.toFixed(2) ?? '—'}</td><td>{overlayPoints[i]?.value?.toFixed(2) ?? '—'}</td></tr>)}</tbody>
              </table>
            }
          >
            <h3 style={{ fontSize: '0.85rem' }}>
              {vInfo.label} ({vInfo.unit}) <SourceBadge source={active.provider} simulated={active.simulated} />
            </h3>
            <DailyLine points={vitalPoints} unit={vInfo.unit} label={vInfo.label} color={color} dashed={active.simulated} />
            <h3 style={{ fontSize: '0.85rem', marginTop: 8 }}>
              {oInfo.label} ({oInfo.unit}) <span className="badge">NASA</span>
            </h3>
            <DailyLine points={overlayPoints} unit={oInfo.unit} label={oInfo.label} color="var(--text-secondary)" />
            <p className="muted" style={{ fontSize: '0.75rem' }}>Two separate charts on the same dates (never a shared dual axis). {oInfo.note}</p>
          </Card>

          <Card title="Paired days">
            <PairScatter pairs={result.pairs} xLabel={`${oInfo.label} (${oInfo.unit})`} yLabel={`${vInfo.label} (${vInfo.unit})`} color={color} />
            <div className="stack" style={{ gap: 4 }}>
              <div>
                <strong>Days with both values:</strong> {result.n}
                {result.r !== null ? (
                  <>
                    {' '}· <strong>Pearson r:</strong> {result.r.toFixed(2)} — {describeR(result.r)}
                  </>
                ) : (
                  <> · coefficient not shown</>
                )}
              </div>
              {active.simulated ? <div className="banner sim">This uses SIMULATED wearable data; any pattern here is an artefact of the generator.</div> : null}
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem' }} className="muted">
                {result.caveats.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
