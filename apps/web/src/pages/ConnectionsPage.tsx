import type { ImportResult, ProviderStatusDto } from '@astrovitals/shared'
import { useState } from 'react'
import { ErrorNote, fmtDateTime, Loading, SourceBadge, useAsync } from '../components/common'
import { api, ApiError } from '../lib/api'

function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error>()
  const [message, setMessage] = useState<string>()
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const m = await fn()
      if (m) setMessage(m)
    } catch (e) {
      setError(e as Error)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, message, run }
}

function Status({ p }: { p: ProviderStatusDto }) {
  if (!p.available) return <span className="badge">Not available</span>
  if (p.id === 'demo') return null
  return p.connected ? <span className="badge">Connected{p.lastSyncAt ? ` · last data ${fmtDateTime(p.lastSyncAt)}` : ''}</span> : <span className="badge">Not connected</span>
}

function AppleExportCard({ p, reload }: { p: ProviderStatusDto; reload: () => void }) {
  const a = useAction()
  const [file, setFile] = useState<File>()
  const [days, setDays] = useState(30)
  const [result, setResult] = useState<ImportResult>()
  return (
    <div className="card provider">
      <div className="row"><h3>{p.name}</h3><Status p={p} /></div>
      <p className="path">{p.path}</p>
      <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.88rem' }}>
        <li>On your iPhone open <strong>Health</strong> → tap your profile picture → <strong>Export All Health Data</strong>.</li>
        <li>Save the <code>export.zip</code>, unzip it (Files app or your computer) and pick <code>apple_health_export/export.xml</code> below.</li>
        <li>Only records from the last {days} days are imported. The file is streamed and never stored as a file on the server.</li>
      </ol>
      <div className="row">
        <input type="file" accept=".xml,application/xml,text/xml" aria-label="export.xml" onChange={(e) => setFile(e.target.files?.[0])} />
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          Days
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <button className="primary" disabled={!file || a.busy} onClick={() => a.run(async () => { const r = await api.importAppleHealth(file!, days); setResult(r); reload() })}>
          {a.busy ? 'Importing…' : 'Import'}
        </button>
        {p.connected ? (
          <button className="danger" disabled={a.busy} onClick={() => a.run(async () => { await api.disconnect('apple-health-export'); setResult(undefined); reload(); return 'Imported Apple Health data deleted.' })}>
            Delete imported data
          </button>
        ) : null}
      </div>
      {result ? (
        <div className="banner">
          Imported {result.metrics.toLocaleString()} measurements, {result.sleep} sleep sessions and {result.workouts} workouts. {result.notes.join(' ')}
          {result.unsupportedTypes.length ? <div className="muted" style={{ fontSize: '0.8rem' }}>Not used by this dashboard: {result.unsupportedTypes.slice(0, 8).join(', ')}{result.unsupportedTypes.length > 8 ? '…' : ''}</div> : null}
        </div>
      ) : null}
      {a.message ? <div className="banner">{a.message}</div> : null}
      {a.error ? <ErrorNote error={a.error} /> : null}
    </div>
  )
}

function CompanionCard({ p, reload }: { p: ProviderStatusDto; reload: () => void }) {
  const a = useAction()
  const tokens = useAsync(() => api.deviceTokens(), [])
  const [label, setLabel] = useState('My iPhone')
  const [fresh, setFresh] = useState<string>()
  return (
    <div className="card provider">
      <div className="row"><h3>{p.name}</h3><Status p={p} /></div>
      <p className="path">{p.path}</p>
      <p className="muted" style={{ fontSize: '0.85rem' }}>{p.availabilityNote} See <code>companion/ios/README.md</code> in the project.</p>
      <div className="row">
        <input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Device label" maxLength={60} />
        <button className="primary" disabled={a.busy || !label.trim()} onClick={() => a.run(async () => { const t = await api.createDeviceToken(label.trim()); setFresh(t.token); tokens.reload(); reload() })}>
          Create device token
        </button>
      </div>
      {fresh ? (
        <div className="banner warn">
          Copy this token into the companion app now — it will not be shown again:
          <div><code>{fresh}</code></div>
          <small>Ingest endpoint: <code>{window.location.origin}/api/ingest/healthkit</code> with header <code>Authorization: Bearer &lt;token&gt;</code></small>
        </div>
      ) : null}
      {tokens.data?.length ? (
        <ul className="list">
          {tokens.data.map((t) => (
            <li key={t.id}>
              <strong>{t.label}</strong>
              <span className="muted">created {fmtDateTime(t.created_at)} · {t.last_used_at ? `last used ${fmtDateTime(t.last_used_at)}` : 'never used'}</span>
              <button className="danger" onClick={() => a.run(async () => { await api.revokeDeviceToken(t.id); tokens.reload() })}>Revoke</button>
            </li>
          ))}
        </ul>
      ) : null}
      {p.connected ? (
        <button className="danger" disabled={a.busy} onClick={() => a.run(async () => { await api.disconnect('healthkit-companion'); setFresh(undefined); tokens.reload(); reload(); return 'All device tokens revoked and companion data deleted.' })}>
          Disconnect &amp; delete data
        </button>
      ) : null}
      {a.message ? <div className="banner">{a.message}</div> : null}
      {a.error ? <ErrorNote error={a.error} /> : null}
    </div>
  )
}

function SimpleCard({ p }: { p: ProviderStatusDto }) {
  return (
    <div className="card provider">
      <div className="row"><h3>{p.name}</h3><Status p={p} />{p.id === 'demo' ? <SourceBadge source="demo" simulated /> : null}</div>
      <p className="path">{p.path}</p>
      <p className="muted" style={{ fontSize: '0.85rem' }}>{p.availabilityNote}</p>
      {p.id === 'demo' ? <p style={{ fontSize: '0.85rem' }}>Turn demo mode on or off in <a href="#/privacy">Settings</a>.</p> : null}
    </div>
  )
}

export function ConnectionsPage({ onChange }: { onChange: () => void }) {
  const providers = useAsync(() => api.providers(), [])
  const reload = () => {
    providers.reload()
    onChange()
  }
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  const status = params.get('status')
  return (
    <div>
      <h1>Telemetry & Data Sources</h1>
      <p className="muted">
        Import Earth-analog biotelemetry or configure simulated crew sensor feeds. Note: pulse oximetry may read 2% to 4% higher or lower than the true level (MedlinePlus), and strap fit and movement add error, so confirm low readings with a fingertip oximeter.
      </p>
      {status ? (
        <div className={`banner ${status === 'connected' ? '' : 'warn'}`} role="status">
          {status === 'connected' && 'Connected. Use "Sync" to pull your data.'}
          {status === 'denied' && 'You declined access, so nothing was connected.'}
          {status === 'signed_out' && 'Your session expired during the connection. Sign in and try again.'}
          {status === 'error' && 'The connection could not be completed. Please try again.'}
        </div>
      ) : null}
      {providers.error ? <ErrorNote error={providers.error instanceof ApiError ? providers.error : new Error('Could not load providers')} retry={providers.reload} /> : null}
      {providers.loading && !providers.data ? <Loading what="providers" /> : null}
      <div className="grid two">
        {providers.data
          ?.filter((p) => p.id !== 'google-health' && p.id !== 'garmin')
          .map((p) =>
            p.id === 'apple-health-export' ? <AppleExportCard key={p.id} p={p} reload={reload} />
            : p.id === 'healthkit-companion' ? <CompanionCard key={p.id} p={p} reload={reload} />
            : <SimpleCard key={p.id} p={p} />,
          )}
      </div>
    </div>
  )
}
