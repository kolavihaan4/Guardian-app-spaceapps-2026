import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Disclaimer, Loading, useAsync } from './components/common'
import { endIntroQuietly, forgetLocationForVisit, goToDashboard, HOME_ADDRESS, locationAccount, mountMark, nudgeMark, playIntro } from './guardian'
import { api, ApiError } from './lib/api'
import { AuthPage } from './pages/AuthPage'
const BaselinePage = lazy(() => import('./pages/BaselinePage').then(m => ({ default: m.BaselinePage })))
const CitationsPage = lazy(() => import('./pages/CitationsPage').then(m => ({ default: m.CitationsPage })))
const CorrelationPage = lazy(() => import('./pages/CorrelationPage').then(m => ({ default: m.CorrelationPage })))
const CrewAssessmentPage = lazy(() => import('./pages/CrewAssessmentPage').then(m => ({ default: m.CrewAssessmentPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })))
const SpacePage = lazy(() => import('./pages/SpacePage').then(m => ({ default: m.SpacePage })))

/** The app's pages. The navigation bar that links to them is shared with the home site: public/home/js/sitenav.js. */
const ROUTES = ['assessment', 'baseline', 'space', 'dashboard', 'correlation', 'citations', 'privacy'] as const

declare global {
  interface Window {
    GuardianNav?: { navHtml(): string; actionsHtml(): string; mark(id: string): void; account(user: { email: string } | null): void }
  }
}

/** The shared navigation bar and its buttons, drawn by the same script the home site uses. */
function SiteNav({ route, email }: { route: string; email: string }) {
  const html = useMemo(() => ({ nav: window.GuardianNav?.navHtml() ?? '', actions: window.GuardianNav?.actionsHtml() ?? '' }), [])
  useEffect(() => window.GuardianNav?.mark(`app:${route}`), [route])
  // the account button at the end of the bar shows who is signed in
  useEffect(() => window.GuardianNav?.account({ email }), [email])
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
    <a className="brand" id="brand" href="/home/index.html" aria-label="Guardian, home page" onMouseEnter={nudgeMark} onFocus={nudgeMark}>
      <span className="brand__slot" id="brandSlot" ref={slot} />
      <span className="brand__word" aria-hidden="true">
        <span className="brand__name">GUARDIAN</span>
      </span>
    </a>
  )
}
/** The simulated-data banner only belongs where that data is shown. */
const SIMULATED_ROUTES: readonly string[] = ['correlation']
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
  // Who is signed in comes from the Supabase session (lib/auth.ts); /api/me is asked only when there
  // is one. That answer decides where the crew's location is kept (guardian.ts), so it is passed on
  // before any page or the header reads the location.
  const justSignedIn = useRef(false)
  // Signing in or signing up always lands on the dashboard, on the home site; so does the sign-in
  // address when it is opened by someone who is already signed in.
  const [leaving, setLeaving] = useState(false)
  const me = useAsync(
    () =>
      api.me().then(
        (data) => {
          const arrived = justSignedIn.current || window.location.hash === '#/sign-in'
          locationAccount(data.user.id, justSignedIn.current)
          justSignedIn.current = false
          if (arrived) {
            setLeaving(true)
            goToDashboard()
          }
          return data
        },
        (error: unknown) => {
          justSignedIn.current = false
          locationAccount(null)
          throw error
        },
      ),
    [],
  )

  if (leaving) return <Loading what="your dashboard" />
  if (me.loading && !me.data && !me.error) return <Loading what="your account" />
  if (me.error instanceof ApiError && me.error.status === 401) return <><EndIntro /><AuthPage onSignedIn={() => { justSignedIn.current = true; me.reload() }} /></>
  if (me.error || !me.data) return <div className="shell"><EndIntro /><div className="banner error">Cannot reach the Guardian API. Is the server running? ({me.error?.message})</div></div>

  const realSources = me.data.providers.filter((p) => p.id !== 'demo' && p.connected).length
  return (
    <div className="shell">
      <PlayIntro />
      <header className="topbar" id="topbar">
        <div className="topbar__glass" aria-hidden="true" />
        <Brand />
        <SiteNav route={route} email={me.data.user.email} />
      </header>

      {me.data.user.demoMode && SIMULATED_ROUTES.includes(route) ? (
        <div className="banner sim" role="note">
          <strong>DEMO MODE:</strong> simulated health data is shown with dashed lines and SIMULATED badges. It is generated, never stored, and never mixed into real
          measurements. {realSources ? `${realSources} real source(s) are also connected and shown separately.` : ''}
        </div>
      ) : null}

      {/* Keyed by route, so each page slides up as it opens. */}
      <main id="main" key={route} className="page-enter">
        <Suspense fallback={<Loading what="this page" />}>
        {route === 'assessment' && <CrewAssessmentPage />}
        {route === 'dashboard' && <DashboardPage />}
        {route === 'space' && <SpacePage />}
        {route === 'baseline' && <BaselinePage />}
        {route === 'correlation' && <CorrelationPage />}
        {route === 'citations' && <CitationsPage />}
        {route === 'privacy' && <PrivacyPage me={me.data} onChange={me.reload} onSignedOut={() => { forgetLocationForVisit(); window.location.assign(HOME_ADDRESS) }} />}
        </Suspense>
      </main>
      <Disclaimer />
    </div>
  )
}
