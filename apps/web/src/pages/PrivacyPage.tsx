import type { MeResponse } from '@astrovitals/shared'
import { useState } from 'react'
import { ErrorNote } from '../components/common'
import { forgetSavedLocation } from '../guardian'
import { api } from '../lib/api'
import { auth } from '../lib/auth'

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
  // the server's copy (health data) and the cards kept with the account in Supabase, in one file
  const download = async () => {
    setError(undefined)
    try {
      const [data, cards] = await Promise.all([api.exportData(), auth.cards()])
      const url = URL.createObjectURL(new Blob([JSON.stringify({ ...data, cards }, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'guardian-export.json'
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg('Your data has been downloaded.')
    } catch (e) {
      setError(e as Error)
    }
  }
  return (
    <div className="stack">
      <h1>Your account and data</h1>
      <p>
        <a href="/home/index.html#/settings">← Back to Settings</a>
      </p>
      {msg ? <div className="banner" role="status">{msg}</div> : null}
      {error ? <ErrorNote error={error} /> : null}

      <section className="card stack">
        <h2>Demo mode</h2>
        <p>
          Demo mode adds <strong>simulated</strong> health data so the Vitals pages can be explored. Simulated data is generated on request, never stored, and
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
          <li>Health measurements are kept for <strong>{me.retentionDays} days</strong>, then deleted automatically.</li>
          <li>Your cards are kept with your account, and only you can read them.</li>
          <li>Sign-in is handled by Supabase: Guardian’s server never sees or stores your password.</li>
          <li>Health values are never written to application logs and never used for advertising or shared.</li>
        </ul>
        <div className="row">
          <button className="button" onClick={download}>
            Download my data (JSON)
          </button>
          <button
            className="danger"
            onClick={() =>
              window.confirm('Delete all stored health data and all your cards?') &&
              act(() => api.deleteHealthData().then(() => auth.deleteAllCards()).then(() => forgetSavedLocation(me.user.id)), 'All stored health data and your cards were deleted.')
            }
          >
            Delete all health data
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>Account</h2>
        <p className="muted">Signed in as {me.user.email}.</p>
        <div className="row">
          <button onClick={() => auth.signOut().finally(onSignedOut)}>Sign out</button>
          <button
            className="danger"
            onClick={() => {
              if (window.prompt('Type DELETE to permanently delete your account and all its data.') === 'DELETE') {
                auth.deleteAccount().then(() => { forgetSavedLocation(me.user.id); onSignedOut() }, (e: Error) => setError(e))
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
