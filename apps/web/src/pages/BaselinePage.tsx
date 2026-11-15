import { attentionReasons, summaryCsv, type BaselineComparison, type BaselineDatasetResponse, type ComparedPoint } from '@astrovitals/shared'
import { useMemo, useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, ErrorNote, Loading, useAsync, VitalsTabs } from '../components/common'
import { api } from '../lib/api'

type Analyte = BaselineDatasetResponse['analytes'][number]

/** Decimal places the lab reported for a measurement (max over its readings). */
const decimalsOf = (c: BaselineComparison) =>
  Math.max(0, ...[...c.baseline.readings, ...c.followUp].map((p) => (p.value === null ? 0 : (String(p.value).split('.')[1] ?? '').length)))
/** Derived numbers get one decimal more than the lab reported, never more: no false precision. */
const num = (v: number | null, dp: number) => (v === null ? '—' : String(Number(v.toFixed(dp))).replace('-', '−'))
const pct = (v: number | null) => (v === null ? '—' : `${String(v).replace('-', '−')}%`)
const rangeText = (p: { refMin: number | null; refMax: number | null }) =>
  p.refMin !== null && p.refMax !== null ? `${p.refMin}–${p.refMax}` : p.refMin !== null ? `≥ ${p.refMin}` : p.refMax !== null ? `≤ ${p.refMax}` : 'no range given'

function changeText(p: ComparedPoint, unit: string, dp: number) {
  if (p.change === null) return p.value === null ? 'No reading at this sample' : 'No baseline to compare with'
  const r = Number(p.change.toFixed(dp))
  if (r === 0) return 'Same as baseline'
  const pct = p.percentChange === null ? '' : ` (${r > 0 ? '+' : '−'}${Math.abs(p.percentChange)}%)`
  return `${r > 0 ? '↑' : '↓'} ${num(Math.abs(r), dp)} ${unit} ${r > 0 ? 'higher' : 'lower'} than baseline${pct}`
}

function rangeResult(p: ComparedPoint) {
  switch (p.sourceRange) {
    case 'within': return `Inside the lab’s range (${rangeText(p)})`
    case 'below': return `Below the lab’s range (${rangeText(p)})`
    case 'above': return `Above the lab’s range (${rangeText(p)})`
    case 'no_range': return 'The lab gave no reference range'
    default: return 'No reading, so no range result'
  }
}

function MeasurementCard({ a, c, p, selected, onOpen }: { a: Analyte; c: BaselineComparison; p: ComparedPoint; selected: boolean; onOpen: () => void }) {
  const dp = decimalsOf(c)
  const reasons = attentionReasons(c, p)
  return (
    <button type="button" className={`mb-card${reasons.length ? ' attention' : ''}`} aria-pressed={selected} onClick={onOpen}>
      <span className="name">{a.name}</span>
      <span className="big">{p.value === null ? '—' : p.value}<span className="unit">{a.unit}</span></span>
      <span className="line">Baseline {num(c.baseline.median, dp)} · median of {c.baseline.readings.map((b) => b.value ?? 'NA').join(', ')}</span>
      <span className="line" style={{ color: 'var(--text-primary)' }}>{changeText(p, a.unit, dp)}</span>
      <span className="line">{rangeResult(p)}</span>
      {reasons.map((r) => (
        <span key={r} className="mb-attention"><span className="dot" aria-hidden />{r}</span>
      ))}
    </button>
  )
}

function Timeline({ a, c, sample }: { a: Analyte; c: BaselineComparison; sample: string }) {
  const points = [...c.baseline.readings, ...c.followUp]
  const data = points.map((p) => ({ label: p.timepoint, pre: p.day < 0 ? p.value : null, post: p.day >= 0 ? p.value : null, all: p.value }))
  const last = [...points].reverse().find((p) => p.refMin !== null || p.refMax !== null)
  const values = points.map((p) => p.value).filter((v): v is number => v !== null)
  const lo = Math.min(...values, last?.refMin ?? Infinity)
  const hi = Math.max(...values, last?.refMax ?? -Infinity)
  const pad = (hi - lo) * 0.15 || 1
  const dp = decimalsOf(c)
  return (
    <div className="chart" role="img" aria-label={`${a.name}: all seven recorded readings, preflight and after return, with the baseline and the lab's reference range`}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -6 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="label" stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} />
          <YAxis domain={[Number((lo - pad).toFixed(dp)), Number((hi + pad).toFixed(dp))]} stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} width={52} />
          {last && last.refMin !== null && last.refMax !== null ? (
            <ReferenceArea y1={last.refMin} y2={last.refMax} fill="var(--series-1)" fillOpacity={0.08} stroke="none" label={{ value: `lab range ${rangeText(last)}`, fill: 'var(--text-muted)', fontSize: 11, position: 'insideTopLeft' }} />
          ) : null}
          {c.baseline.median !== null ? (
            <ReferenceLine y={c.baseline.median} stroke="var(--text-secondary)" strokeDasharray="5 4" label={{ value: `baseline ${num(c.baseline.median, dp)}`, fill: 'var(--text-secondary)', fontSize: 11, position: 'insideBottomRight' }} />
          ) : null}
          <ReferenceLine x="R+1" stroke="var(--axis)" label={{ value: 'after return', fill: 'var(--text-muted)', fontSize: 11, position: 'insideTopRight' }} />
          <ReferenceLine x={sample} stroke="var(--accent)" strokeOpacity={0.5} />
          <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${v} ${a.unit}`, a.name]} />
          <Line dataKey="all" stroke="var(--axis)" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} legendType="none" />
          <Line dataKey="pre" name="Preflight" stroke="none" dot={{ r: 5, fill: 'var(--series-1)', strokeWidth: 0 }} isAnimationActive={false} />
          <Line dataKey="post" name="After return" stroke="none" dot={{ r: 5, fill: 'var(--text-primary)', strokeWidth: 0 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function Detail({ a, c, sample, onClose }: { a: Analyte; c: BaselineComparison; sample: string; onClose: () => void }) {
  const dp = decimalsOf(c)
  const p = c.followUp.find((x) => x.timepoint === sample)!
  const pre = c.baseline.readings
  return (
    <Card title={`${a.name} — every recorded reading`} actions={<button type="button" onClick={onClose}>Close</button>}>
      <div className="row" style={{ gap: 8, fontSize: '0.78rem', marginBottom: 4 }}>
        <span className="badge"><span className="swatch" style={{ background: 'var(--series-1)', height: 8, width: 8, borderRadius: 4 }} />Preflight (baseline) readings</span>
        <span className="badge"><span className="swatch" style={{ background: 'var(--text-primary)', height: 8, width: 8, borderRadius: 4 }} />After return</span>
        <span className="muted">dashed line = baseline (median) · shaded band = lab reference range · {a.unit}</span>
      </div>
      <Timeline a={a} c={c} sample={sample} />
      <div className="grid two" style={{ marginTop: 12 }}>
        <div className="stack">
          <h3>How {sample} was calculated</h3>
          <div className="mb-calc stack" style={{ gap: 4 }}>
            <span>Preflight readings: {pre.map((b) => `${b.timepoint} ${b.value ?? 'no reading'}`).join(' · ')}</span>
            <span>Baseline = median of {pre.filter((b) => b.value !== null).map((b) => b.value).join(', ') || 'no readings'} = <strong>{num(c.baseline.median, dp)} {a.unit}</strong></span>
            {p.change !== null ? (
              <>
                <span>Change = {p.value} − {num(c.baseline.median, dp)} = <strong>{num(p.change, dp)} {a.unit}</strong></span>
                <span>Percentage = {num(p.change, dp)} ÷ {num(c.baseline.median, dp)} × 100 = <strong>{pct(p.percentChange)}</strong></span>
              </>
            ) : <span>No change calculated: {p.value === null ? 'there is no reading at this sample.' : 'there is no baseline.'}</span>}
            <span>Source range result: {rangeResult(p)}.</span>
          </div>
          {c.notices.length ? (
            <div className="stack" style={{ gap: 4 }}>
              <h3>Data-quality notices</h3>
              {c.notices.map((n) => <span key={n.kind} className="mb-attention"><span className="dot" aria-hidden />{n.message}</span>)}
            </div>
          ) : <p className="muted" style={{ fontSize: '0.85rem' }}>No data-quality notices: all three preflight readings are present and the lab range did not change.</p>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead><tr><th>Sample</th><th>Reading</th><th>Change from baseline</th><th>Lab range</th></tr></thead>
            <tbody>
              {pre.map((b) => <tr key={b.timepoint}><td>{b.timepoint} <span className="muted">preflight</span></td><td>{b.value ?? 'no reading'}</td><td className="muted">part of baseline</td><td className="muted">{rangeText(b)}</td></tr>)}
              {c.followUp.map((f) => (
                <tr key={f.timepoint} style={f.timepoint === sample ? { background: 'var(--surface-2)' } : undefined}>
                  <td>{f.timepoint}</td><td>{f.value ?? 'no reading'}</td>
                  <td>{f.change === null ? '—' : `${f.change > 0 ? '+' : ''}${num(f.change, dp)} (${pct(f.percentChange)})`}</td>
                  <td>{f.sourceRange === 'within' ? 'inside' : f.sourceRange === 'below' || f.sourceRange === 'above' ? <strong>{f.sourceRange}</strong> : '—'} <span className="muted">{rangeText(f)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  )
}

function Evidence({ d }: { d: BaselineDatasetResponse }) {
  const missing = d.analytes.flatMap((a) => d.crew.flatMap((who) => {
    const c = a.byCrew[who]!
    return [...c.baseline.readings, ...c.followUp].filter((p) => p.value === null).map((p) => ({ who, a: a.name, t: p.timepoint }))
  }))
  return (
    <div className="grid two">
      <Card title="Source">
        <div className="stack" style={{ fontSize: '0.88rem' }}>
          <span>NASA Open Science Data Repository <strong>{d.dataset.id}</strong>: {d.dataset.title}.</span>
          <span>{d.dataset.mission}, {d.dataset.missionDays} days. {d.crew.length} coded crew profiles, {d.timepoints.length} serum draws each ({d.timepoints.map((t) => t.label).join(', ')}), {d.crew.length * d.timepoints.length} records.</span>
          <span>DOI <a href={`https://doi.org/${d.dataset.doi}`} target="_blank" rel="noreferrer">{d.dataset.doi}</a> · licence {d.dataset.license} · <a href={d.dataset.url} target="_blank" rel="noreferrer">NASA OSDR record</a></span>
          <span className="muted">Crew appear only as the dataset’s codes (C001–C004) and are never linked to names. The file is bundled unmodified; its checksum is recorded in the repository.</span>
        </div>
      </Card>
      <Card title="Limitations">
        <ul className="stack" style={{ paddingLeft: '1.1rem', fontSize: '0.85rem', margin: 0 }}>
          {d.caveats.map((c) => <li key={c}>{c}</li>)}
          {d.excluded.length ? <li>Not shown: eGFR. {d.excluded[0]!.reason}</li> : null}
        </ul>
      </Card>
      <Card title="Measurements and units">
        <table className="data"><thead><tr><th>Measurement</th><th>Unit</th><th>On overview</th></tr></thead>
          <tbody>{d.analytes.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.unit}</td><td>{d.featured.includes(a.id) ? 'yes' : <span className="muted">available</span>}</td></tr>)}</tbody></table>
      </Card>
      <Card title={`Missing readings (${missing.length})`}>
        {missing.length ? (
          <div className="table-wrap"><table className="data"><thead><tr><th>Crew</th><th>Measurement</th><th>Sample</th></tr></thead>
            <tbody>{missing.map((m) => <tr key={`${m.who}${m.a}${m.t}`}><td>{m.who}</td><td>{m.a}</td><td>{m.t}</td></tr>)}</tbody></table></div>
        ) : <p className="muted">None.</p>}
        <p className="muted" style={{ fontSize: '0.78rem' }}>Recorded as “NA”, “N/A” or blank in the source file; shown as missing, never as zero.</p>
      </Card>
    </div>
  )
}

export function BaselinePage() {
  const data = useAsync(() => api.osd575(), [])
  const [tab, setTab] = useState<'overview' | 'evidence'>('overview')
  const [who, setWho] = useState('C001')
  const [sample, setSample] = useState('R+1')
  const [open, setOpen] = useState<string | null>(null)

  const featured = useMemo(() => {
    const d = data.data
    return d ? d.featured.map((id) => d.analytes.find((a) => a.id === id)!).filter(Boolean) : []
  }, [data.data])

  if (data.error) return <><VitalsTabs current="baseline" /><ErrorNote error={data.error} retry={data.reload} /></>
  if (!data.data) return <><VitalsTabs current="baseline" /><Loading what="Inspiration4 lab data" /></>
  const d = data.data
  const post = d.timepoints.filter((t) => t.phase === 'post')
  const opened = featured.find((a) => a.id === open)

  const download = () => {
    const csv = summaryCsv(featured.map((a) => ({ crew: who, measurement: a.name, unit: a.unit, comparison: a.byCrew[who]! })), d.dataset)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: `mission-baseline-${who}.csv` })
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div>
      <VitalsTabs current="baseline" />
      <div style={{ marginBottom: 12 }}>
        <h1>NASA study readings</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Explore recorded astronaut lab results before and after a mission. A baseline is the person’s usual reading before flight. These are study results, not your saved cards or live health readings.
        </p>
      </div>
      <div className="mb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>Overview</button>
        <button type="button" role="tab" aria-selected={tab === 'evidence'} onClick={() => setTab('evidence')}>Evidence</button>
      </div>

      {tab === 'evidence' ? <Evidence d={d} /> : (
        <>
          <div className="mb-controls">
            <div>
              <div className="group-label">Study participant</div>
              <div className="row" role="group" aria-label="Study participant">
                {d.crew.map((c) => <button key={c} type="button" className={c === who ? 'primary' : ''} aria-pressed={c === who} onClick={() => setWho(c)}>{c}</button>)}
              </div>
            </div>
            <div>
              <div className="group-label">Reading after return</div>
              <div className="row" role="group" aria-label="Reading after return">
                {post.map((t) => (
                  <button key={t.label} type="button" className={t.label === sample ? 'primary' : ''} aria-pressed={t.label === sample} onClick={() => setSample(t.label)} title={`${t.day} days after return`}>
                    {t.label} <span style={{ fontWeight: 400, opacity: 0.8 }}>· {t.day} d</span>
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={download} style={{ marginLeft: 'auto' }}>Download summary (CSV)</button>
          </div>

          <div className="mb-cards">
            {featured.map((a) => {
              const c = a.byCrew[who]!
              const p = c.followUp.find((x) => x.timepoint === sample)!
              return <MeasurementCard key={a.id} a={a} c={c} p={p} selected={open === a.id} onOpen={() => setOpen(open === a.id ? null : a.id)} />
            })}
          </div>
          <p className="page-note">
            Amber marks a reading outside the lab’s reference range or a data-quality notice, with the reason written out. How large a change is never turns a card amber on its own. Select a card for its timeline and calculation.
          </p>
          {opened ? <section className="section"><Detail a={opened} c={opened.byCrew[who]!} sample={sample} onClose={() => setOpen(null)} /></section> : null}
        </>
      )}
    </div>
  )
}
