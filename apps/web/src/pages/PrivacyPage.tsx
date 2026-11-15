import type { MeResponse } from '@astrovitals/shared'
import { useState } from 'react'
import { ErrorNote } from '../components/common'
import { api } from '../lib/api'

export function PrivacyPage({ me, onChange, onSignedOut }: { me: MeResponse; onChange: () => void; onSignedOut: () => void }) {
  const [error, setError] = useState<Error>()
  const [msg, setMsg] = useState<string>()
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setError(undefined)
    try {
      await fn()
      setMsg(done)
      onChange()
    } catch (e) {
      setError(e as Error)
    }
  }
  return (
    <div className="stack">
      <h1>Settings &amp; privacy</h1>
      {msg ? <div className="banner" role="status">{msg}</div> : null}
      {error ? <ErrorNote error={error} /> : null}

      <section className="card stack">
        <h2>Demo mode</h2>
        <p>
          Demo mode adds a <strong>simulated</strong> wearable so the dashboard can be explored without a device. Simulated data is generated on request, never stored, and
          always labelled SIMULATED (dashed lines, purple badges). It never represents a real person.
        </p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-primary)' }}>
          <input type="checkbox" checked={me.user.demoMode} onChange={(e) => act(() => api.setDemoMode(e.target.checked), e.target.checked ? 'Demo mode on.' : 'Demo mode off.')} />
          Show simulated demo data
        </label>
      </section>

      <section className="card stack">
        <h2>Your data</h2>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>Wearable measurements are kept for <strong>{me.retentionDays} days</strong>, then deleted automatically.</li>
          <li>OAuth tokens are encrypted at rest (AES-256-GCM); sessions and device tokens are stored only as keyed hashes.</li>
          <li>Health values are never written to application logs and never used for advertising or shared.</li>
          <li>Disconnecting a source revokes its access (where the platform supports it) and deletes the data it provided.</li>
        </ul>
        <div className="row">
          <a className="button" href="/api/me/export" download>
            Download my data (JSON)
          </a>
          <button className="danger" onClick={() => window.confirm('Delete all stored wearable data? Connections stay in place.') && act(() => api.deleteHealthData(), 'All stored wearable data deleted.')}>
            Delete all wearable data
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>Account</h2>
        <p className="muted">Signed in as {me.user.email}.</p>
        <div className="row">
          <button onClick={() => api.logout().finally(onSignedOut)}>Sign out</button>
          <button
            className="danger"
            onClick={() => {
              if (window.prompt('Type DELETE to permanently delete your account, all data and all connections.') === 'DELETE') {
                api.deleteAccount().then(onSignedOut, (e: Error) => setError(e))
              }
            }}
          >
            Delete account
          </button>
        </div>
      </section>
    </div>
  )
}
