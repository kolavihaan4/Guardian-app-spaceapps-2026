import '../hazards.css'
import type { EnvironmentSeries, NASAEvent } from '@astrovitals/shared'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { DailyLine } from '../components/charts'
import { HazardCards } from '../components/HazardCards'
import { Card, ErrorNote, Loading, NasaBadge, useAsync } from '../components/common'
import { api } from '../lib/api'
import { dailyParticleReports, hazardRange, HAZARD_HISTORY_DAYS } from '../lib/hazards'
import { useDailyDate } from '../lib/useDailyDate'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
const displayUnit = (unit: string) => unit === 'C' ? '°C' : unit === 'kW-hr/m^2/day' ? 'kWh/m²/day' : unit

export const LOCATIONS = [
  { name: 'Johnson Space Center, Houston', lat: 29.5502, lon: -95.097 },
  { name: 'Kennedy Space Center, Florida', lat: 28.5729, lon: -80.649 },
  { name: 'Baikonur Cosmodrome', lat: 45.965, lon: 63.305 },
  { name: 'European Astronaut Centre, Cologne', lat: 50.874, lon: 7.135 },
  { name: 'Tsukuba Space Center', lat: 36.065, lon: 140.128 },
]

const TYPE_ROW: Record<string, number> = { SEP: 0, GST: 1, CME: 2, FLR: 3 }
const TYPE_LABEL: Record<string, string> = { SEP: 'Fast particles', GST: 'Magnetic storm', CME: 'Solar cloud', FLR: 'Solar flare' }
const TYPE_NAME = ['Solar energetic particles (SEP)', 'Geomagnetic storm (GST)', 'Coronal mass ejection (CME)', 'Solar flare (FLR)']

function SpaceWeatherTimeline({ events }: { events: NASAEvent[] }) {
  const data = events.filter((e) => e.eventType in TYPE_ROW).map((e) => ({ t: Date.parse(e.timestamp), row: TYPE_ROW[e.eventType]!, title: e.title }))
  if (!data.length) return <div className="empty">No space-weather events were reported by NASA in this window.</div>
  return (
    <div className="chart" role="img" aria-label="Timeline of space-weather events by type">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={(t: number) => fmtDate(new Date(t).toISOString())} stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} minTickGap={40} />
          <YAxis dataKey="row" type="number" domain={[-0.5, 3.5]} ticks={[0, 1, 2, 3]} tickFormatter={(r: number) => ['Fast particles', 'Magnetic storm', 'Solar cloud', 'Solar flare'][r] ?? ''} stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} width={104} />
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
  if (!rows.length) return <div className="empty">No magnetic storms (Kp 5 or above) were reported by NASA in this window.</div>
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
      <p className="muted" style={{ fontSize: '0.75rem' }}>Dots mark approximate event locations. The middle line is the equator; north is up and east is right. Hover or focus a dot for details.</p>
    </div>
  )
}

const ENVIRONMENT_FIELDS = [
  { parameter: 'T2M', title: 'Air temperature', description: 'How warm the air is, in degrees Celsius (°C).' },
  { parameter: 'RH2M', title: 'Humidity', description: 'How much moisture is in the air. A higher percentage feels more humid.' },
  { parameter: 'ALLSKY_SFC_SW_DWN', title: 'Sunlight at the surface', description: 'Solar energy reaching each square metre in a day (kWh/m²/day). Higher values mean more sunlight.' },
  { parameter: 'WS10M', title: 'Wind speed', description: 'Air movement measured 10 metres above ground, in metres per second (m/s).' },
  { parameter: 'PS', title: 'Air pressure', description: 'The weight of the air above the site, in kilopascals (kPa).' },
  { parameter: 'ALLSKY_SFC_UV_INDEX', title: 'UV index', description: 'The strength of ultraviolet sunlight. A higher index means more potential for skin and eye damage.' },
]

function EnvironmentPanel({ series }: { series: EnvironmentSeries[] }) {
  return (
    <div className="hazards-environment-grid">
      {ENVIRONMENT_FIELDS.map((field) => {
        const s = series.find((item) => item.parameter === field.parameter)
        const latest = s?.points.filter((point) => point.value !== null).at(-1)
        const missing = s?.points.filter((point) => point.value === null).length ?? 0
        return (
          <div className="hazards-metric" key={field.parameter}>
            <h3>{field.title}</h3>
            <p className="hazards-explainer">{field.description}</p>
            {latest ? <p className="hazards-latest"><strong>{latest.value!.toFixed(1)} <small>{displayUnit(s!.unit)}</small></strong><span>Latest available · {fmtDate(latest.date)}</span></p> : null}
            {s ? <DailyLine points={s.points} unit={displayUnit(s.unit)} label={field.title} /> : <div className="empty">NASA has not supplied this measurement.</div>}
            {missing ? <p className="hazards-caption">{missing} day{missing === 1 ? '' : 's'} awaiting NASA data; gaps are left empty.</p> : null}
          </div>
        )
      })}
    </div>
  )
}

function ParticleReports({ events, from, to }: { events: NASAEvent[]; from: string; to: string }) {
  const data = dailyParticleReports(events, from, to)
  const total = data.reduce((sum, day) => sum + day.reports, 0)
  return (
    <>
      <p className="hazards-explainer">Fast particles released by the Sun are one source of space radiation. Each bar counts solar energetic particle (SEP) events reported in NASA’s DONKI catalog on that date.</p>
      <p className="hazards-latest"><strong>{total} <small>report{total === 1 ? '' : 's'}</small></strong><span>Across the displayed dates</span></p>
      <div className="chart small" role="img" aria-label={`Daily NASA solar particle event reports: ${total} reports from ${from} to ${to}`}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -14 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} domain={[0, (max: number) => Math.max(1, max)]} stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} width={40} />
            <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelFormatter={(date) => fmtDate(String(date))} formatter={(v) => [`${v} report(s)`, 'Solar particle events']} />
            <Bar dataKey="reports" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="hazards-caption">{total === 0 ? 'No solar particle events were reported in this window. ' : ''}Zero means no catalog reports for that day. This is not a radiation-dose measurement or a safety rating; other space radiation is not shown.</p>
    </>
  )
}

export function SpacePage() {
  const today = useDailyDate()
  const [loc, setLoc] = useState(0)
  const range = useMemo(() => hazardRange(today), [today])
  const apod = useAsync(() => api.apod(), [today])
  const sw = useAsync(() => api.spaceWeather(range.from, range.to), [range])
  const earth = useAsync(() => api.earthEvents(HAZARD_HISTORY_DAYS), [today])
  const L = LOCATIONS[loc]!
  const env = useAsync(() => api.environment(L.lat, L.lon, range.from, range.to), [L, range])
  // Do not label the previous site's readings as the newly selected location while loading.
  const environment = env.data?.data.latitude === Math.round(L.lat * 2) / 2 && env.data?.data.longitude === Math.round(L.lon * 2) / 2 ? env.data : undefined

  return (
    <div className="hazards-page">
      <header className="hazards-header">
        <div>
          <p className="hazards-eyebrow">NASA HUMAN RESEARCH PROGRAM</p>
          <h1>Hazards of spaceflight</h1>
          <p className="hazards-intro">Five challenges crews face beyond Earth, explained simply.</p>
        </div>
        <a className="hazards-citations" href="#/citations">Sources &amp; citations <span aria-hidden="true">↗</span></a>
      </header>

      <section className="hazards-overview" aria-labelledby="hazards-overview-title">
        <h2 id="hazards-overview-title">The five hazards</h2>
        <p className="hazards-section-note">These challenges can affect one another. The cards explain the hazards; the NASA observations below add context.</p>
        <HazardCards />
      </section>

      <section className="hazards-data" aria-labelledby="hazards-data-title">
        <div className="hazards-section-heading">
          <div>
            <h2 id="hazards-data-title">NASA observations</h2>
            <p className="hazards-section-note">A rolling two-week view, refreshed every day at midnight UTC as NASA publishes data.</p>
          </div>
          <span className="badge hazards-date">{fmtDate(range.from)} – {fmtDate(range.to)} · UTC</span>
        </div>

        <Card title="Solar particle events" actions={sw.data ? <NasaBadge {...sw.data} /> : null}>
          {sw.error ? <ErrorNote error={sw.error} retry={sw.reload} /> : null}
          {sw.loading && !sw.data ? <Loading what="NASA particle reports" /> : null}
          {sw.data ? <ParticleReports events={sw.data.data} from={range.from} to={range.to} /> : null}
        </Card>

        <Card title="Space weather" actions={sw.data ? <NasaBadge {...sw.data} /> : null}
          table={sw.data ? (
            <table className="data"><thead><tr><th>Time (UTC)</th><th>Type</th><th>Event</th></tr></thead>
              <tbody>{sw.data.data.map((e) => <tr key={e.id}><td>{e.timestamp.slice(0, 16)}</td><td>{TYPE_LABEL[e.eventType] ?? e.eventType}</td><td>{e.link ? <a href={e.link} target="_blank" rel="noreferrer">{e.title}</a> : e.title}</td></tr>)}</tbody></table>
          ) : undefined}
        >
          <p className="hazards-explainer">NASA’s DONKI catalog records activity from the Sun and disturbances around Earth. These reports describe the space environment, not a crew member’s exposure.</p>
          {sw.error ? <ErrorNote error={sw.error} retry={sw.reload} /> : null}
          {sw.loading && !sw.data ? <Loading what="space weather" /> : null}
          {sw.data ? (
            <div className="hazards-weather-grid">
              <div>
                <h3>When events were reported</h3>
                <p className="hazards-explainer">Each dot is a report. Flares are bursts of light; solar clouds are eruptions of gas; fast particles can add to radiation; magnetic storms disturb Earth’s magnetic field.</p>
                <SpaceWeatherTimeline events={sw.data.data} />
              </div>
              <div>
                <h3>Magnetic storm strength</h3>
                <p className="hazards-explainer">Kp is a 0–9 scale of disturbance in Earth’s magnetic field. Higher means more disturbance. NASA’s storm catalog lists storm readings at Kp 5 or above, rather than a continuous record.</p>
                <KpChart events={sw.data.data} />
              </div>
            </div>
          ) : null}
          <p className="hazards-caption">NASA DONKI research reports may be revised. Missing reports do not mean conditions are safe.</p>
        </Card>

        <Card title="Surface environment on Earth" actions={<>
          <select aria-label="Location" value={loc} onChange={(e) => setLoc(Number(e.target.value))}>
            {LOCATIONS.map((l, i) => <option key={l.name} value={i}>{l.name}</option>)}
          </select>
          {environment ? <NasaBadge {...environment} /> : null}
        </>}>
          <p className="hazards-explainer">Daily NASA POWER estimates for the selected Earth location. These help explain environmental measurements; they do not describe conditions inside a spacecraft or on the Moon or Mars.</p>
          {env.error ? <ErrorNote error={env.error} retry={env.reload} /> : null}
          {env.loading && !environment ? <Loading what="NASA surface data" /> : null}
          {environment ? <EnvironmentPanel series={environment.data.series} /> : null}
          <p className="hazards-caption">Values represent a surrounding grid area, not a sensor at the site. Weather usually arrives 2–3 days later, sunlight 5–7 days later; UV data can take longer. Graphs keep missing days empty.</p>
        </Card>

        <div className="hazards-context-grid">
          <Card title="Natural events on Earth" actions={earth.data ? <NasaBadge {...earth.data} /> : null}>
            <p className="hazards-explainer">Wildfires, storms and other events tracked by NASA EONET. This Earth context is separate from the five spaceflight hazards.</p>
            {earth.error ? <ErrorNote error={earth.error} retry={earth.reload} /> : null}
            {earth.loading && !earth.data ? <Loading what="Earth events" /> : null}
            {earth.data ? <>
              <EventMap events={earth.data.data} />
              {!earth.data.data.length ? <div className="empty">No Earth events were returned for this window.</div> : null}
              <ul className="list scroll">
                {earth.data.data.slice(0, 40).map((e) => <li key={e.id}>
                  <span className="badge">{String(e.metadata.categoryTitle ?? e.eventType)}</span>
                  <a href={e.link} target="_blank" rel="noreferrer">{e.title}</a>
                  <span className="muted">Last observed {fmtDate(typeof e.metadata.lastObserved === 'string' ? e.metadata.lastObserved : e.timestamp)}{e.severity ? ` · ${e.severity.label}` : ''}</span>
                </li>)}
              </ul>
              <p className="hazards-caption">Up to 60 events requested; the first 40 are listed. Locations are approximate and intended for general information.</p>
            </> : null}
          </Card>

          <Card title="Astronomy Picture of the Day" actions={apod.data ? <NasaBadge {...apod.data} /> : null}>
            {apod.error ? <ErrorNote error={apod.error} retry={apod.reload} /> : null}
            {apod.loading && !apod.data ? <Loading what="NASA’s daily picture" /> : null}
            {apod.data ? <div className="apod stack">
              {apod.data.data.imageUrl ? <img src={apod.data.data.imageUrl} alt={apod.data.data.altText ?? apod.data.data.title} loading="lazy" referrerPolicy="no-referrer" /> : null}
              <strong>{apod.data.data.title}</strong>
              <span className="credit">{fmtDate(apod.data.data.date)} · {apod.data.data.credit ? `Image credit & copyright: ${apod.data.data.credit}` : 'Credit: NASA'} · <a href={apod.data.data.pageUrl} target="_blank" rel="noreferrer">source</a></span>
              <p>{apod.data.data.explanation.slice(0, 420)}{apod.data.data.explanation.length > 420 ? '…' : ''}</p>
            </div> : null}
          </Card>
        </div>
      </section>
    </div>
  )
}
