import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Writable } from 'node:stream'
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
  const ctx: AppContext = {
    cfg,
    repo,
    box,
    log,
    nasa: new NasaService(cfg, repo, log, fetchImpl),
    providers: createProviders({ repo, cfg, box, log, fetchImpl }),
  }
  const app = createApp(ctx, { staticDir: resolve(import.meta.dirname, '__no_static__') })
  return { ctx, app, db, repo, sink }
}
