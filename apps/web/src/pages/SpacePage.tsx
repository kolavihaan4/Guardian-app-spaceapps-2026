import type { EnvironmentSeries, NASAEvent, RadiationStatus } from '@astrovitals/shared'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { DailyLine } from '../components/charts'
import { Card, ErrorNote, fmtDate, fmtDateTime, Loading, NasaBadge, useAsync } from '../components/common'
import { api } from '../lib/api'
import { DAY, isoDay } from '../lib/series'

export const LOCATIONS = [
  { name: 'Johnson Space Center, Houston', lat: 29.5502, lon: -95.097 },
  { name: 'Kennedy Space Center, Florida', lat: 28.5729, lon: -80.649 },
  { name: 'Baikonur Cosmodrome', lat: 45.965, lon: 63.305 },
  { name: 'European Astronaut Centre, Cologne', lat: 50.874, lon: 7.135 },
  { name: 'Tsukuba Space Center', lat: 36.065, lon: 140.128 },
]

const TYPE_ROW: Record<string, number> = { SEP: 0, GST: 1, CME: 2, FLR: 3 }
const TYPE_NAME = ['Solar energetic particles (SEP)', 'Geomagnetic storm (GST)', 'Coronal mass ejection (CME)', 'Solar flare (FLR)']

function SpaceWeatherTimeline({ events }: { events: NASAEvent[] }) {
  const data = events.filter((e) => e.eventType in TYPE_ROW).map((e) => ({ t: Date.parse(e.timestamp), row: TYPE_ROW[e.eventType]!, title: e.title }))
  if (!data.length) return <div className="empty">No DONKI events in this window.</div>
  return (
    <div className="chart" role="img" aria-label="Timeline of space-weather events by type">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={(t: number) => fmtDate(new Date(t).toISOString())} stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} minTickGap={40} />
          <YAxis dataKey="row" type="number" domain={[-0.5, 3.5]} ticks={[0, 1, 2, 3]} tickFormatter={(r: number) => ['SEP', 'GST', 'CME', 'FLR'][r] ?? ''} stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} width={44} />
          <ZAxis range={[64, 64]} />
          <Tooltip
            contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as { t: number; title: string; row: number } | undefined
              return p ? (
                <div className="card" style={{ padding: '6px 10px', fontSize: 12 }}>
                  <strong>{p.title}</strong>
                  <div className="muted">{fmtDateTime(new Date(p.t).toISOString())} · {TYPE_NAME[p.row]}</div>
                </div>
              ) : null
            }}
          />
          <Scatter data={data} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

function KpChart({ events }: { events: NASAEvent[] }) {
  const rows = events
    .filter((e) => e.eventType === 'GST')
    .flatMap((e) => ((e.metadata.kpIndex as { observedTime: string; kpIndex: number }[] | undefined) ?? []).map((k) => ({ t: k.observedTime, kp: k.kpIndex })))
    .sort((a, b) => a.t.localeCompare(b.t))
  if (!rows.length) return <div className="empty">No geomagnetic storms (Kp ≥ 5) reported by DONKI in this window.</div>
  // Several 3-hour readings can fall on one day; label those with the time so ticks stay distinct.
  const perDay = new Map<string, number>()
  for (const r of rows) perDay.set(fmtDate(r.t), (perDay.get(fmtDate(r.t)) ?? 0) + 1)
  const tick = (t: string) => ((perDay.get(fmtDate(t)) ?? 0) > 1 ? fmtDateTime(t) : fmtDate(t))
  return (
    <div className="chart small" role="img" aria-label="Kp index observations during DONKI geomagnetic storms">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="t" tickFormatter={tick} stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} minTickGap={30} />
          <YAxis domain={[0, 9]} ticks={[0, 3, 5, 7, 9]} stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} width={40} />
          <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelFormatter={(t) => fmtDateTime(String(t))} formatter={(v) => [`Kp ${v}`, '3-hour Kp']} />
          <Bar dataKey="kp" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** NOAA S-scale names (https://www.swpc.noaa.gov/noaa-scales-explanation). */
const S_NAMES = ['No radiation storm', 'Minor', 'Moderate', 'Strong', 'Severe', 'Extreme']
const S1_PFU = 10
const fmtFlux = (v: number) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : String(Number(v.toPrecision(2))))

function RadiationPanel({ r }: { r: RadiationStatus }) {
  const level = r.sScale
  const status = level === null ? 'unknown' : level >= 3 ? 'implausible' : level >= 1 ? 'out_of_range' : 'ok'
  const label = level === null ? 'S-scale unavailable' : level === 0 ? 'S0 · No radiation storm' : `S${level} · ${S_NAMES[level] ?? r.sText} solar radiation storm`
  const data = r.series.map((p) => ({ t: Date.parse(p.time), p10: p.flux10MeV, p100: p.flux100MeV }))
  const values = data.flatMap((d) => [d.p10, d.p100]).filter((v): v is number => v !== null)
  // Log axis snapped to powers of ten, always tall enough to show the S1 line.
  const lo = 10 ** Math.floor(Math.log10(values.length ? Math.max(1e-3, Math.min(...values)) : 0.01))
  const hi = 10 ** Math.ceil(Math.log10(Math.max(S1_PFU * 10, ...values)))
  const ticks: number[] = []
  for (let v = lo; v <= hi * 1.0001; v *= 10) ticks.push(v)
  return (
    <div className="stack">
      <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span className={`flag ${status}`} style={{ fontSize: '1rem', fontWeight: 650 }}>
          <span className="dot" aria-hidden />
          {label}
        </span>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {r.flux10MeV !== null && r.observedAt
            ? `≥10 MeV protons: ${fmtFlux(r.flux10MeV)} pfu (S1 starts at ${S1_PFU}) · ${r.satellite ? `GOES-${r.satellite} · ` : ''}${fmtDateTime(r.observedAt)}`
            : 'No recent proton measurement.'}
        </span>
      </div>
      {data.length ? (
        <div className="row" style={{ gap: 8, fontSize: '0.75rem' }}>
          <span className="badge"><span className="swatch" style={{ background: 'var(--series-1)' }} />≥10 MeV protons</span>
          <span className="badge"><span className="swatch" style={{ background: 'var(--series-4)' }} />≥100 MeV protons</span>
          <span className="muted">pfu, log scale, last 24 h</span>
        </div>
      ) : null}
      {data.length ? (
        <div className="chart small" role="img" aria-label="GOES integral proton flux over the last 24 hours, log scale, with the S1 threshold at 10 pfu">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} minTickGap={40} />
              <YAxis scale="log" domain={[lo, hi]} ticks={ticks} allowDataOverflow tickFormatter={(v: number) => fmtFlux(v)} stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} width={52} />
              <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelFormatter={(t) => fmtDateTime(new Date(Number(t)).toISOString())} formatter={(v, name) => [`${fmtFlux(Number(v))} pfu`, name]} />
              <ReferenceLine y={S1_PFU} stroke="var(--status-warning)" strokeDasharray="4 3" label={{ value: 'S1 threshold', fill: 'var(--text-secondary)', fontSize: 11, position: 'insideTopRight' }} />
              <Line dataKey="p10" name="≥10 MeV" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              <Line dataKey="p100" name="≥100 MeV" stroke="var(--series-4)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', fontSize: '0.8rem' }}>
        <span className="muted">Chance of an S1+ storm (NOAA):</span>
        {r.forecast.map((f) => (
          <span key={f.date} className="badge">{fmtDate(f.date)} · {f.s1Probability === null ? 'n/a' : `${f.s1Probability}%`}</span>
        ))}
      </div>
      <p className="muted" style={{ fontSize: '0.75rem' }}>
        Integral proton flux measured by NOAA's GOES satellite in geostationary orbit, and NOAA's official Solar Radiation Storm scale.
        It describes the space environment near Earth, not anyone's dose: on the ground the atmosphere and magnetic field shield people.
        For crews outside the magnetosphere, or on a spacewalk, rising ≥10 MeV flux is the signal mission control watches.
      </p>
    </div>
  )
}

/** Equirectangular lat/lon plot (no basemap, no third-party tiles). */
function EventMap({ events }: { events: NASAEvent[] }) {
  const pts = events.filter((e) => e.latitude !== undefined && e.longitude !== undefined)
  const x = (lon: number) => ((lon + 180) / 360) * 720
  const y = (lat: number) => ((90 - lat) / 180) * 360
  return (
    <div className="map">
      <svg viewBox="0 0 720 360" role="img" aria-label={`${pts.length} Earth events plotted by latitude and longitude`}>
        <rect className="land" x="0" y="0" width="720" height="360" rx="8" />
        {[-60, -30, 0, 30, 60].map((lat) => <line key={`lat${lat}`} className="gridline" x1="0" x2="720" y1={y(lat)} y2={y(lat)} />)}
        {[-120, -60, 0, 60, 120].map((lon) => <line key={`lon${lon}`} className="gridline" y1="0" y2="360" x1={x(lon)} x2={x(lon)} />)}
        {pts.map((e) => (
          <circle key={e.id} cx={x(e.longitude!)} cy={y(e.latitude!)} r={5} tabIndex={0}>
            <title>{`${e.title} (${String(e.metadata.categoryTitle ?? e.eventType)}) · ${e.latitude!.toFixed(1)}°, ${e.longitude!.toFixed(1)}°`}</title>
          </circle>
        ))}
      </svg>
      <p className="muted" style={{ fontSize: '0.75rem' }}>Latitude/longitude grid (equator and 30° lines); hover a point for details. EONET locations are approximate.</p>
    </div>
  )
}

const ENV_PARAMS = ['T2M', 'RH2M', 'ALLSKY_SFC_SW_DWN', 'WS10M', 'PS', 'ALLSKY_SFC_UV_INDEX']

function EnvironmentPanel({ series }: { series: EnvironmentSeries[] }) {
  return (
    <div className="grid two">
      {ENV_PARAMS.map((p) => series.find((s) => s.parameter === p)).filter(Boolean).map((s) => {
        const missing = s!.points.filter((p) => p.value === null).length
        return (
          <div key={s!.parameter}>
            <h3 style={{ fontSize: '0.85rem' }}>
              {s!.longName} <span className="muted">({s!.unit})</span>
            </h3>
            <DailyLine points={s!.points} unit={s!.unit} label={s!.longName} />
            {missing ? <p className="muted" style={{ fontSize: '0.75rem' }}>{missing} day(s) not yet available from POWER (processing latency).</p> : null}
          </div>
        )
      })}
    </div>
  )
}

export function SpacePage() {
  const [days, setDays] = useState(30)
  const [loc, setLoc] = useState(0)
  const range = useMemo(() => ({ from: isoDay(new Date(Date.now() - days * DAY)), to: isoDay(new Date()) }), [days])
  const apod = useAsync(() => api.apod(), [])
  const sw = useAsync(() => api.spaceWeather(range.from, range.to), [range])
  const earth = useAsync(() => api.earthEvents(Math.min(days, 60)), [days])
  const L = LOCATIONS[loc]!
  const env = useAsync(() => api.environment(L.lat, L.lon, range.from, range.to), [L, range])
  const rad = useAsync(() => api.radiation(), [])

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h1>Space &amp; environment</h1>
        <div className="row" role="group" aria-label="Time range">
          {[7, 30, 60].map((d) => (
            <button key={d} type="button" className={d === days ? 'primary' : ''} aria-pressed={d === days} onClick={() => setDays(d)}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      <section className="section" style={{ marginTop: 0, marginBottom: 16 }}>
        <Card title="Radiation environment — NOAA SWPC" actions={rad.data ? <NasaBadge {...rad.data} /> : null}>
          {rad.error ? <ErrorNote error={rad.error} retry={rad.reload} /> : null}
          {rad.loading && !rad.data ? <Loading what="radiation data" /> : null}
          {rad.data ? <RadiationPanel r={rad.data.data} /> : null}
        </Card>
      </section>

      <div className="grid two">
        <Card title="Space weather — NASA DONKI" actions={sw.data ? <NasaBadge {...sw.data} /> : null}
          table={sw.data ? (
            <table className="data"><thead><tr><th>Time (UTC)</th><th>Type</th><th>Event</th></tr></thead>
              <tbody>{sw.data.data.map((e) => <tr key={e.id}><td>{e.timestamp.slice(0, 16)}</td><td>{e.eventType}</td><td>{e.link ? <a href={e.link} target="_blank" rel="noreferrer">{e.title}</a> : e.title}</td></tr>)}</tbody></table>
          ) : undefined}
        >
          {sw.error ? <ErrorNote error={sw.error} retry={sw.reload} /> : null}
          {sw.loading && !sw.data ? <Loading what="space weather" /> : null}
          {sw.data ? (
            <>
              <SpaceWeatherTimeline events={sw.data.data} />
              <h3 style={{ marginTop: 8 }}>Kp index during geomagnetic storms</h3>
              <KpChart events={sw.data.data} />
              <p className="muted" style={{ fontSize: '0.78rem' }}>
                Flares (GOES X-ray class), CMEs (speed), geomagnetic storms (Kp 0–9; G1 = Kp 5) and solar energetic particle events from NASA's CCMC.
                For crews, SEP events matter most: they raise radiation dose outside Earth's protective magnetosphere.
              </p>
            </>
          ) : null}
        </Card>

        <Card title="Astronomy Picture of the Day" actions={apod.data ? <NasaBadge {...apod.data} /> : null}>
          {apod.error ? <ErrorNote error={apod.error} retry={apod.reload} /> : null}
          {apod.loading && !apod.data ? <Loading what="APOD" /> : null}
          {apod.data ? (
            <div className="apod stack">
              {apod.data.data.imageUrl ? <img src={apod.data.data.imageUrl} alt={apod.data.data.altText ?? apod.data.data.title} loading="lazy" referrerPolicy="no-referrer" /> : null}
              <strong>{apod.data.data.title}</strong>
              <span className="credit">
                {fmtDate(apod.data.data.date)} · {apod.data.data.credit ? `Image credit & copyright: ${apod.data.data.credit}` : 'Credit: NASA'} ·{' '}
                <a href={apod.data.data.pageUrl} target="_blank" rel="noreferrer">
                  source
                </a>
              </span>
              <p style={{ fontSize: '0.85rem' }}>{apod.data.data.explanation.slice(0, 420)}{apod.data.data.explanation.length > 420 ? '…' : ''}</p>
            </div>
          ) : null}
        </Card>
      </div>

      <section className="section grid two">
        <Card title="Earth events — NASA EONET" actions={earth.data ? <NasaBadge {...earth.data} /> : null}>
          {earth.error ? <ErrorNote error={earth.error} retry={earth.reload} /> : null}
          {earth.loading && !earth.data ? <Loading what="Earth events" /> : null}
          {earth.data ? (
            <>
              <EventMap events={earth.data.data} />
              <ul className="list scroll">
                {earth.data.data.slice(0, 40).map((e) => (
                  <li key={e.id}>
                    <span className="badge">{String(e.metadata.categoryTitle ?? e.eventType)}</span>
                    <a href={e.link} target="_blank" rel="noreferrer">{e.title}</a>
                    <span className="muted">{fmtDate(e.timestamp)}{e.severity ? ` · ${e.severity.label}` : ''}</span>
                  </li>
                ))}
              </ul>
              <p className="muted" style={{ fontSize: '0.75rem' }}>EONET: "for visualization and general information purposes only"; extents are approximations.</p>
            </>
          ) : null}
        </Card>

        <Card
          title="Surface environment — NASA POWER"
          actions={
            <>
              <select aria-label="Location" value={loc} onChange={(e) => setLoc(Number(e.target.value))}>
                {LOCATIONS.map((l, i) => <option key={l.name} value={i}>{l.name}</option>)}
              </select>
              {env.data ? <NasaBadge {...env.data} /> : null}
            </>
          }
        >
          {env.error ? <ErrorNote error={env.error} retry={env.reload} /> : null}
          {env.loading && !env.data ? <Loading what="POWER data" /> : null}
          {env.data ? <EnvironmentPanel series={env.data.data.series} /> : null}
          <p className="muted" style={{ fontSize: '0.75rem' }}>
            Grid-cell values (≈0.5° meteorology, 1° solar) for the selected site, rounded to the POWER grid. Meteorology lags 2–3 days, solar 5–7 days; the UV index product can lag months.
          </p>
        </Card>
      </section>
    </div>
  )
}
