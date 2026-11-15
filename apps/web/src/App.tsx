import { useEffect, useMemo, useRef, useState } from 'react'
import { Disclaimer, Loading, useAsync } from './components/common'
import { endIntroQuietly, mountMark, nudgeMark, playIntro } from './guardian'
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

/** The app's pages. The navigation bar that links to them is shared with the home site: public/home/js/sitenav.js. */
const ROUTES = ['assessment', 'baseline', 'space', 'dashboard', 'correlation', 'citations', 'connections', 'privacy'] as const

declare global {
  interface Window {
    GuardianNav?: { navHtml(): string; actionsHtml(): string; mark(id: string): void }
  }
}

/** The shared navigation bar and its buttons, drawn by the same script the home site uses. */
function SiteNav({ route }: { route: string }) {
  const html = useMemo(() => ({ nav: window.GuardianNav?.navHtml() ?? '', actions: window.GuardianNav?.actionsHtml() ?? '' }), [])
  useEffect(() => window.GuardianNav?.mark(`app:${route}`), [route])
  return (
    <>
      <nav className="nav" id="nav" aria-label="Main" dangerouslySetInnerHTML={{ __html: html.nav }} />
      <div className="topbar__actions" id="actions" dangerouslySetInnerHTML={{ __html: html.actions }} />
    </>
  )
}

/** The wordmark from the Still template: a small mountain mark beside a lowercase serif name. */
/** Plays the opening once the header and page are on screen. */
function PlayIntro() {
  useEffect(playIntro, [])
  return null
}

/** Ends the opening without playing it, on screens that have no header. */
function EndIntro() {
  useEffect(endIntroQuietly, [])
  return null
}

export function Brand() {
  const slot = useRef<HTMLSpanElement>(null)
  useEffect(() => mountMark(slot.current), [])
  return (
    <a className="brand" id="brand" href="/home/index.html" aria-label="Guardian Space Agency, home page" onMouseEnter={nudgeMark} onFocus={nudgeMark}>
      <span className="brand__slot" id="brandSlot" ref={slot} />
      <span className="brand__word" aria-hidden="true">
        <span className="brand__name">GUARDIAN</span>
        <span className="brand__tag">SPACE AGENCY</span>
      </span>
    </a>
  )
}
/** The simulated-wearable banner only belongs where wearable data is shown. */
const WEARABLE_ROUTES: readonly string[] = ['dashboard', 'correlation', 'connections']
type Route = (typeof ROUTES)[number]

function useHashRoute(): Route {
  const read = (): Route => {
    const p = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Route
    return (ROUTES as readonly string[]).includes(p) ? p : 'assessment'
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

  if (me.loading && !me.data && !me.error) return <Loading what="crew health" />
  if (me.error instanceof ApiError && me.error.status === 401) return <><EndIntro /><AuthPage onSignedIn={me.reload} /></>
  if (me.error || !me.data) return <div className="shell"><EndIntro /><div className="banner error">Cannot reach the Guardian API. Is the server running? ({me.error?.message})</div></div>

  const realSources = me.data.providers.filter((p) => p.id !== 'demo' && p.connected).length
  return (
    <div className="shell">
      <PlayIntro />
      <header className="topbar" id="topbar">
        <div className="topbar__glass" aria-hidden="true" />
        <Brand />
        <SiteNav route={route} />
      </header>

      {me.data.user.demoMode && WEARABLE_ROUTES.includes(route) ? (
        <div className="banner sim" role="note">
          <strong>DEMO MODE:</strong> simulated wearable data is shown with dashed lines and SIMULATED badges. It is generated, never stored, and never mixed into real
          measurements. {realSources ? `${realSources} real source(s) are also connected and shown separately.` : ''}
        </div>
      ) : null}

      {/* Keyed by route, so each page slides up as it opens. */}
      <main id="main" key={route} className="page-enter">
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
