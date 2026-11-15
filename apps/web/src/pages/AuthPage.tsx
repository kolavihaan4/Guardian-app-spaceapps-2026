import { MEDICAL_DISCLAIMER } from '@astrovitals/shared'
import { useState, type FormEvent } from 'react'
import { Brand } from '../App'
import { auth, MIN_PASSWORD } from '../lib/auth'

export function AuthPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(undefined)
    // a new password is checked here, before anything is sent (Supabase would refuse it as well)
    const problem = mode === 'register' ? auth.passwordProblem(password) : null
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      await (mode === 'login' ? auth.signIn(email, password) : auth.signUp(email, password))
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
      <h1>Sign in to the crew health assistant</h1>
      <p className="muted">Guardian watches over the crew’s health on the space station, the Moon, Mars and in deep space: triage, vital signs, lab baselines and space weather in one place. A NASA Space Apps 2026 prototype, not a diagnostic tool.</p>
      <p className="muted"><a href="/home/index.html">Back to the home page</a></p>
      <form onSubmit={submit}>
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password {mode === 'register' ? `(at least ${MIN_PASSWORD} characters)` : ''}
          <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {mode === 'register' ? (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 4 }} />
            <span style={{ fontSize: '0.85rem' }}>
              I understand this is a prototype, not a medical device. Health data I add is stored only to show it to me, kept for a limited time, never sold or used
              for ads, and I can export or delete it at any time.
            </span>
          </label>
        ) : null}
        {error ? <div className="banner error" role="alert">{error}</div> : null}
        <button className="primary" type="submit" disabled={busy || (mode === 'register' && !consent)}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 12 }}>Anything you enter in Guardian is saved to your account.</p>
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>Your email is only used to sign you in and keep your data with your account. It is not used for anything else.</p>
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
