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

const ROUTES = [
  { path: 'assessment', label: 'Crew Triage & Body Map', group: 'main' },
  { path: 'baseline', label: 'NASA Lab Baseline', group: 'main' },
  { path: 'space', label: 'Space Radiation & Hazards', group: 'main' },
  { path: 'dashboard', label: 'Dynamic Vitals Charts', group: 'main' },
  { path: 'correlation', label: 'Hazard Overlay', group: 'main' },
  { path: 'citations', label: 'Citations & Licenses', group: 'main' },
  { path: 'connections', label: 'Telemetry Sources', group: 'account' },
  { path: 'privacy', label: 'Settings & Privacy', group: 'account' },
] as const
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
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
            <circle cx="16" cy="16" r="14" fill="var(--accent)" />
            <path d="M6 17h5l3-7 4 13 3-6h5" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Mission Baseline
        </div>
        <nav className="nav" aria-label="Main">
          {ROUTES.map((r, i) => (
            <Fragment key={r.path}>
              {r.group === 'account' && ROUTES[i - 1]?.group !== 'account' ? <span className="nav-group">System</span> : null}
              <a href={`#/${r.path}`} aria-current={route === r.path ? 'page' : undefined}>
                {r.label}
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
