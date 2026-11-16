import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Writable } from 'node:stream'
import request from 'supertest'
import { createApp } from '../src/app.ts'
import { loadConfig, type Config } from '../src/config.ts'
import type { AppContext } from '../src/context.ts'
import { openDatabase } from '../src/db.ts'
import { SecretBox } from '../src/lib/crypto.ts'
import type { FetchLike } from '../src/lib/http.ts'
import { createLogger } from '../src/lib/logger.ts'
import { NasaService } from '../src/nasa/service.ts'
import { Repo } from '../src/repo.ts'
import { createProviders } from '../src/wearables/registry.ts'

export const ORIGIN = 'http://localhost:5173'
export const SUPABASE_URL = 'https://test-project.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_test-key'

/** Access tokens the stand-in Supabase knows, and whose they are. */
const supabaseUsers = new Map<string, { id: string; email: string }>()

/** A new Supabase user with a valid access token, as Supabase Auth would hand out on sign-in. */
export function supabaseToken(email = 'astro@example.com'): { token: string; id: string } {
  const id = randomUUID()
  const token = `eyJ.test.${randomBytes(24).toString('base64url')}`
  supabaseUsers.set(token, { id, email })
  return { token, id }
}

/** An agent that sends a signed-in user's bearer token with every request. */
export async function signedIn(app: ReturnType<typeof makeTestContext>['app'], email = 'astro@example.com') {
  const { token } = supabaseToken(email)
  return request.agent(app).set('Authorization', `Bearer ${token}`)
}

/**
 * Stands in for Supabase Auth's GET /auth/v1/user (no network): 200 with the user for a token
 * from supabaseToken(), 403 for any other. Everything else goes to `rest`.
 */
function withSupabase(rest: FetchLike, calls: string[]): FetchLike {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url !== `${SUPABASE_URL}/auth/v1/user`) return rest(input, init)
    const headers = new Headers(init?.headers)
    const token = /^Bearer (.+)$/.exec(headers.get('authorization') ?? '')?.[1] ?? ''
    calls.push(token)
    const user = headers.get('apikey') === SUPABASE_KEY ? supabaseUsers.get(token) : undefined
    if (!user) return new Response(JSON.stringify({ code: 403, error_code: 'bad_jwt', msg: 'invalid JWT' }), { status: 403, headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as FetchLike
}

export function fixture(path: string): string {
  return readFileSync(resolve(import.meta.dirname, 'fixtures', path), 'utf8')
}
export const fixtureJson = <T = unknown>(path: string): T => JSON.parse(fixture(path)) as T

export interface MockRoute {
  match: (url: string, init?: RequestInit) => boolean
  respond: (url: string, init?: RequestInit) => { status?: number; body?: unknown; text?: string }
}

/** A fetch stand-in: records calls, answers from routes, fails loudly on anything unexpected. */
export function mockFetch(routes: MockRoute[]): FetchLike & { calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = []
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    calls.push({ url, ...(init ? { init } : {}) })
    const route = routes.find((r) => r.match(url, init))
    if (!route) return new Response(`no mock for ${url}`, { status: 599 })
    const r = route.respond(url, init)
    return new Response(r.text ?? (r.body === undefined ? '' : JSON.stringify(r.body)), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } })
  }) as FetchLike & { calls: typeof calls }
  f.calls = calls
  return f
}

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    APP_ORIGIN: ORIGIN,
    DATABASE_PATH: ':memory:',
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    DEVICE_TOKEN_PEPPER: randomBytes(32).toString('base64'),
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY,
    LOG_LEVEL: 'info',
    ...overrides,
  })
}

/** Captures every log line so tests can assert that no health data or secrets are logged. */
export function logSink() {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk))
      cb()
    },
  })
  return { stream, lines, text: () => lines.join('') }
}

export function makeTestContext(opts: { fetchImpl?: FetchLike; env?: Record<string, string> } = {}) {
  const cfg = testConfig(opts.env)
  const sink = logSink()
  const log = createLogger(cfg.LOG_LEVEL, sink.stream)
  const db = openDatabase(':memory:')
  const repo = new Repo(db)
  const box = new SecretBox(cfg.TOKEN_ENCRYPTION_KEY)
  const fetchImpl = opts.fetchImpl ?? mockFetch([])
  const supabaseCalls: string[] = []
  const ctx: AppContext = {
    cfg,
    repo,
    box,
    log,
    nasa: new NasaService(cfg, repo, log, fetchImpl),
    providers: createProviders({ repo, cfg, box, log, fetchImpl }),
    fetchImpl: withSupabase(fetchImpl, supabaseCalls),
  }
  const app = createApp(ctx, { staticDir: resolve(import.meta.dirname, '__no_static__') })
  return { ctx, app, db, repo, sink, supabaseCalls }
}
