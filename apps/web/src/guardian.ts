/**
 * Bridges to the team's home site scripts (public/home/js/mark.js, loader.js and scenery.js, loaded
 * as plain scripts in index.html). They own the logo mark and the opening animation, so the app
 * and the home page share one implementation.
 */
interface GuardianMark {
  el: HTMLElement
  svg: SVGElement
  park(): void
  setBoost(value: number): void
  day(on: boolean): void
  still(on: boolean): void
  nudge(): void
}
interface StillGlobal {
  createMark?: () => GuardianMark
  intro?: { start(mark: GuardianMark): { finish(ready: Promise<unknown>): Promise<void> } }
  scenery?: { render(el: Element | null): Promise<void> }
}
const still = (): StillGlobal => (window as unknown as { Still?: StillGlobal }).Still ?? {}

/** Set once the opening has played in this browser session, by the app or by the home site. */
const SEEN_KEY = 'guardian.introSeen'

let mark: GuardianMark | null = null
let introSettled = false

/** The one logo mark, created on first use. Null when the home site's scripts did not load. */
function getMark(): GuardianMark | null {
  const create = still().createMark
  if (!mark && create) {
    mark = create()
    // The script's image paths are relative to the home site; point them at its folder.
    mark.svg.querySelectorAll('image').forEach((image) => image.setAttribute('href', `/home/${image.getAttribute('href') ?? ''}`))
  }
  return mark
}

/** Puts the logo mark into a header slot. */
export function mountMark(slot: HTMLElement | null): void {
  const m = getMark()
  if (slot && m && m.el.parentElement !== slot) slot.appendChild(m.el)
}

export function nudgeMark(): void {
  if (introSettled) mark?.nudge()
}

function rememberIntro(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* storage blocked: the opening simply plays again next time */
  }
}

/**
 * Plays the opening: the ship orbits the emblem on a deep-blue screen, then the app is revealed
 * and the emblem flies into the header. Needs the header (#topbar), its logo slot (#brandSlot)
 * and the page (#main) on screen. Runs once; later calls do nothing.
 */
export function playIntro(): void {
  if (introSettled) return
  const m = getMark()
  const intro = still().intro
  if (!m || !intro || !document.getElementById('topbar') || !document.getElementById('main')) {
    endIntroQuietly()
    return
  }
  introSettled = true
  document.addEventListener('still:intro-done', rememberIntro, { once: true })
  void intro.start(m).finish(Promise.resolve())
}

/** Ends the opening without playing it, for screens that have no header (sign-in, errors). */
export function endIntroQuietly(): void {
  if (introSettled) return
  introSettled = true
  document.getElementById('loader')?.remove()
  document.documentElement.classList.remove('intro-active', 'intro-chrome', 'intro-revealing')
  const m = getMark()
  if (!m) return
  m.park()
  m.setBoost(1)
  m.day(true)
  m.still(true)
}

/** Draws the misty mountains and pines behind every page. */
export function renderScenery(): void {
  void still().scenery?.render(document.getElementById('scenery'))
}

const HOME_KEY = 'still.v1'
/** The home site's environment ids and the app's. */
const ENVIRONMENT_FOR_HOME: Record<string, 'iss_leo' | 'mars_surface' | 'lunar_base' | 'deep_space_transit'> = {
  iss: 'iss_leo',
  mars: 'mars_surface',
  moon: 'lunar_base',
  spacecraft: 'deep_space_transit',
}

/** The environment chosen on the home site, as one of the app's environment ids, if any. */
export function environmentFromHome(): 'iss_leo' | 'mars_surface' | 'lunar_base' | 'deep_space_transit' | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(HOME_KEY) ?? '{}') as { env?: string }
    return saved.env ? ENVIRONMENT_FOR_HOME[saved.env] : undefined
  } catch {
    return undefined
  }
}

/** Saves the app's environment back, so the home site shows the same one. Others are left alone. */
export function saveEnvironmentForHome(environment: string): void {
  const home = Object.entries(ENVIRONMENT_FOR_HOME).find(([, id]) => id === environment)?.[0]
  if (!home) return
  try {
    const saved = JSON.parse(localStorage.getItem(HOME_KEY) ?? '{}') as Record<string, unknown>
    localStorage.setItem(HOME_KEY, JSON.stringify({ ...saved, env: home }))
  } catch {
    /* storage blocked */
  }
}
