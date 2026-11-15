import { MEDICAL_DISCLAIMER } from '@astrovitals/shared'
import { useState, type FormEvent } from 'react'
import { Brand } from '../App'
import { api } from '../lib/api'

export function AuthPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await (mode === 'login' ? api.login(email, password) : api.register(email, password))
      onSignedIn()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth card">
      <Brand />
      <h1>Mission Baseline</h1>
      <p className="muted">Explore how astronauts’ recorded lab values changed compared with their own preflight readings, using NASA’s public Inspiration4 data. A NASA Space Apps 2026 prototype, not a diagnostic tool.</p>
      <form onSubmit={submit}>
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password {mode === 'register' ? '(at least 12 characters)' : ''}
          <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 12 : 1} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {mode === 'register' ? (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 4 }} />
            <span style={{ fontSize: '0.85rem' }}>
              I understand this is a prototype, not a medical device. Health data I connect is stored only to show it to me, kept for a limited time, never sold or used
              for ads, and I can export or delete it at any time.
            </span>
          </label>
        ) : null}
        {error ? <div className="banner error" role="alert">{error}</div> : null}
        <button className="primary" type="submit" disabled={busy || (mode === 'register' && !consent)}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p style={{ marginTop: 12 }}>
        {mode === 'login' ? 'New here? ' : 'Have an account? '}
        <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} style={{ padding: '0.1rem 0.5rem' }}>
          {mode === 'login' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
      <p className="disclaimer">{MEDICAL_DISCLAIMER}</p>
    </main>
  )
}
