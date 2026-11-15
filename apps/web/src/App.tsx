import { Fragment, useEffect, useState } from 'react'
import { Disclaimer, Loading, useAsync } from './components/common'
import { api, ApiError } from './lib/api'
import { AuthPage } from './pages/AuthPage'
import { BaselinePage } from './pages/BaselinePage'
import { CitationsPage } from './pages/CitationsPage'
import { ConnectionsPage } from './pages/ConnectionsPage'
import { CorrelationPage } from './pages/CorrelationPage'
import { CrewAssessmentPage } from './pages/CrewAssessmentPage'
import { DashboardPage } from './pages/DashboardPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { SpacePage } from './pages/SpacePage'

/** `short` is the visible link text and is always contained in `label`, which stays the accessible name. */
const ROUTES = [
  { path: 'assessment', label: 'Crew Triage & Body Map', short: 'Triage', group: 'main', icon: 'M12 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm0 0v7m-5-4.5h10m-8 11 3-6.5 3 6.5' },
  { path: 'baseline', label: 'NASA Lab Baseline', short: 'Lab Baseline', group: 'main', icon: 'M9 3h6m-5 0v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9' },
  { path: 'space', label: 'Space Radiation & Hazards', short: 'Hazards', group: 'main', icon: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-14v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4' },
  { path: 'dashboard', label: 'Dynamic Vitals Charts', short: 'Vitals', group: 'main', icon: 'M3 12h4l3-8 4 16 3-8h4' },
  { path: 'correlation', label: 'Hazard Overlay', short: 'Overlay', group: 'main', icon: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5' },
  { path: 'citations', label: 'Citations & Licenses', short: 'Citations', group: 'main', icon: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11' },
  { path: 'connections', label: 'Telemetry Sources', short: 'Sources', group: 'account', icon: 'M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1m2 3.7a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1' },
  { path: 'privacy', label: 'Settings & Privacy', short: 'Settings', group: 'account', icon: 'M4 6h8m4 0h4M4 12h2m4 0h10M4 18h10m4 0h2M14 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-6 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm8 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z' },
] as const

/** The wordmark from the Still template: a small mountain mark beside a lowercase serif name. */
export function Brand() {
  return (
    <a className="brand" href="#/assessment" aria-label="AstroVitals, Mission Baseline">
      <svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 17 8.5 6 15 17M11.5 11 15.5 5 22 17M5.7 11l2.8-4 2.8 4M3 21h18" />
      </svg>
      <span>
        astrovitals<span className="brand-dot">.</span>
      </span>
    </a>
  )
}
/** The simulated-wearable banner only belongs where wearable data is shown. */
const WEARABLE_ROUTES: readonly string[] = ['dashboard', 'correlation', 'connections']
type Route = (typeof ROUTES)[number]['path']

function useHashRoute(): Route {
  const read = (): Route => {
    const p = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Route
    return ROUTES.some((r) => r.path === p) ? p : 'assessment'
  }
  const [route, setRoute] = useState<Route>(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function App() {
  const route = useHashRoute()
  const me = useAsync(() => api.me(), [])

  if (me.loading && !me.data && !me.error) return <Loading what="Mission Baseline" />
  if (me.error instanceof ApiError && me.error.status === 401) return <AuthPage onSignedIn={me.reload} />
  if (me.error || !me.data) return <div className="shell"><div className="banner error">Cannot reach the Mission Baseline API. Is the server running? ({me.error?.message})</div></div>

  const realSources = me.data.providers.filter((p) => p.id !== 'demo' && p.connected).length
  return (
    <div className="shell">
      <header className="topbar">
        <Brand />
        <nav className="nav" aria-label="Main">
          {ROUTES.map((r, i) => (
            <Fragment key={r.path}>
              {r.group === 'account' && ROUTES[i - 1]?.group !== 'account' ? <span className="nav-divider" aria-hidden /> : null}
              <a href={`#/${r.path}`} aria-label={r.label} title={r.label} aria-current={route === r.path ? 'page' : undefined}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d={r.icon} />
                </svg>
                {r.short}
              </a>
            </Fragment>
          ))}
        </nav>
      </header>

      {me.data.user.demoMode && WEARABLE_ROUTES.includes(route) ? (
        <div className="banner sim" role="note">
          <strong>DEMO MODE:</strong> simulated wearable data is shown with dashed lines and SIMULATED badges. It is generated, never stored, and never mixed into real
          measurements. {realSources ? `${realSources} real source(s) are also connected and shown separately.` : ''}
        </div>
      ) : null}

      <main>
        {route === 'assessment' && <CrewAssessmentPage />}
        {route === 'dashboard' && <DashboardPage />}
        {route === 'space' && <SpacePage />}
        {route === 'baseline' && <BaselinePage />}
        {route === 'correlation' && <CorrelationPage />}
        {route === 'citations' && <CitationsPage />}
        {route === 'connections' && <ConnectionsPage onChange={me.reload} />}
        {route === 'privacy' && <PrivacyPage me={me.data} onChange={me.reload} onSignedOut={() => { window.location.hash = '#/assessment'; me.reload() }} />}
      </main>
      <Disclaimer />
    </div>
  )
}
