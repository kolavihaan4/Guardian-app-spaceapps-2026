import { MEDICAL_DISCLAIMER, PROVIDER_INFO, type ProviderId, type QualityFlag } from '@astrovitals/shared'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { sourceColor } from '../lib/series'

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true })
  const seq = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)
  const reload = useCallback(() => {
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true, error: undefined }))
    run().then(
      (data) => id === seq.current && setState({ data, loading: false }),
      (error: Error) => id === seq.current && setState({ error, loading: false }),
    )
  }, [run])
  useEffect(reload, [reload])
  return { ...state, reload }
}

/** Vitals is one link in the top bar and three pages; this row of links moves between them. */
const VITALS_TABS = [
  { route: 'dashboard', label: 'Over time' },
  { route: 'baseline', label: 'Lab baseline' },
  { route: 'correlation', label: 'Compare with NASA data' },
] as const
export function VitalsTabs({ current }: { current: (typeof VITALS_TABS)[number]['route'] }) {
  return (
    <nav className="section-tabs" aria-label="Vitals">
      {VITALS_TABS.map((t) => (
        <a key={t.route} href={`#/${t.route}`} aria-current={t.route === current ? 'page' : undefined}>
          {t.label}
        </a>
      ))}
    </nav>
  )
}

/** Every chart and number says where it came from. Simulated data is impossible to miss. */
export function SourceBadge({ source, simulated }: { source: ProviderId; simulated: boolean }) {
  return (
    <span className={`badge${simulated ? ' sim' : ''}`} title={PROVIDER_INFO[source].path}>
      <span className={`swatch${simulated ? ' dashed' : ''}`} style={{ background: sourceColor(source), color: sourceColor(source) }} aria-hidden />
      {simulated ? 'SIMULATED · ' : ''}
      {PROVIDER_INFO[source].name}
    </span>
  )
}

export function NasaBadge({ source, fetchedAt, stale }: { source: string; fetchedAt: string; stale: boolean }) {
  return (
    <span className="badge" title={`Fetched ${new Date(fetchedAt).toLocaleString()}`}>
      {source} · {stale ? 'cached (live request failed)' : `updated ${timeAgo(fetchedAt)}`}
    </span>
  )
}

export function QualityNote({ quality }: { quality?: QualityFlag }) {
  if (!quality || quality.status === 'ok') return null
  const label = quality.status === 'implausible' ? 'Implausible value — data issue' : 'Unusual value — check sensor'
  return (
    <span className={`flag ${quality.status}`} title={quality.note}>
      <span className="dot" aria-hidden />
      {label}
    </span>
  )
}

export function Card({ title, actions, children, table }: { title: ReactNode; actions?: ReactNode; children: ReactNode; table?: ReactNode }) {
  const [showTable, setShowTable] = useState(false)
  return (
    <section className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <span className="spacer" />
        {actions}
        {table ? (
          <button type="button" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable} style={{ padding: '0.15rem 0.55rem', fontSize: '0.8rem' }}>
            {showTable ? 'Chart' : 'Table'}
          </button>
        ) : null}
      </div>
      {showTable && table ? <div className="table-wrap">{table}</div> : children}
    </section>
  )
}

export function ErrorNote({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="banner error" role="alert">
      {error.message}{' '}
      {retry ? (
        <button type="button" onClick={retry} style={{ marginLeft: 8 }}>
          Retry
        </button>
      ) : null}
    </div>
  )
}

export function Loading({ what }: { what: string }) {
  return (
    <div className="simple-loading" aria-busy="true" role="status">
      <span className="simple-loading-dot" aria-hidden="true" />
      <span>Loading {what}…</span>
    </div>
  )
}

export function Disclaimer() {
  return (
    <footer className="disclaimer">
      <strong>Not a medical device.</strong> {MEDICAL_DISCLAIMER} NASA data are public scientific data products; space-weather and Earth events are shown for
      context and are not measurements of any person.
    </footer>
  )
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 90) return 'just now'
  if (s < 5400) return `${Math.round(s / 60)} min ago`
  if (s < 129600) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
export const fmtDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
