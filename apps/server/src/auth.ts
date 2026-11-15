import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { createHash } from 'node:crypto'
import type { ZodType } from 'zod'
import type { AppContext } from './context.ts'
import { hmac } from './lib/crypto.ts'
import { badRequest, forbidden, unauthorized, UpstreamError } from './lib/errors.ts'

/** Who an access token belongs to, as Supabase itself answers. */
export interface SupabaseUser {
  id: string
  email: string
}

const CACHE_MS = 60_000
const CACHE_MAX = 5_000
const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]{20,4096})$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Sign-in is Supabase Auth; this server keeps no passwords and no sessions of its own. A request
 * carries `Authorization: Bearer <Supabase access token>`, and the token is checked by asking
 * Supabase who it belongs to (`GET {SUPABASE_URL}/auth/v1/user`). Good answers are kept for 60 s,
 * keyed by a SHA-256 of the token, never the token itself. Unknown, expired or revoked tokens are
 * not kept, so they are asked about again.
 */
export function supabaseVerifier(ctx: AppContext): (token: string) => Promise<SupabaseUser | null> {
  const cache = new Map<string, { user: SupabaseUser; until: number }>()
  const url = `${ctx.cfg.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`
  return async (token) => {
    const key = createHash('sha256').update(token).digest('base64url')
    const now = Date.now()
    const hit = cache.get(key)
    if (hit && hit.until > now) return hit.user
    if (hit) cache.delete(key)
    let res: Awaited<ReturnType<typeof fetch>>
    try {
      res = await (ctx.fetchImpl ?? fetch)(url, {
        headers: { apikey: ctx.cfg.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      })
    } catch {
      throw new UpstreamError('Supabase', null, 'The sign-in check could not reach Supabase.')
    }
    // 429 and 5xx: Supabase cannot answer now, which is not the same as "this token is no good".
    if (res.status === 429 || res.status >= 500) throw new UpstreamError('Supabase', res.status, 'The sign-in check failed upstream.')
    if (!res.ok) return null
    const body = (await res.json().catch(() => null)) as { id?: unknown; email?: unknown } | null
    if (!body || typeof body.id !== 'string' || !UUID.test(body.id)) return null
    const user: SupabaseUser = { id: body.id.toLowerCase(), email: typeof body.email === 'string' ? body.email : '' }
    if (cache.size >= CACHE_MAX) {
      for (const [k, v] of cache) if (v.until <= now) cache.delete(k)
      if (cache.size >= CACHE_MAX) cache.clear()
    }
    cache.set(key, { user, until: now + CACHE_MS })
    return user
  }
}

/**
 * Reads the bearer token, if any, and sets `req.user` to the local row for that Supabase user
 * (created on first sight, keyed by the Supabase user id), so every per-user route keeps working.
 * The email shown is Supabase's. No token, or one Supabase does not know: `req.user` stays unset.
 */
export function loadUser(ctx: AppContext): RequestHandler {
  const verify = supabaseVerifier(ctx)
  return async (req, _res, next) => {
    const m = BEARER.exec(req.headers.authorization ?? '')
    if (!m) return next()
    const who = await verify(m[1]!)
    if (who) req.user = { ...ctx.repo.userForSupabase(who.id, who.email), email: who.email }
    next()
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized())
  next()
}

/**
 * Defence in depth for state-changing requests: a strict Origin check (falls back to Referer).
 * Requests without either header are rejected. (Sign-in is a bearer token the page sends itself,
 * which a cross-site form cannot do, so this is a second line rather than the only one.)
 */
export function requireSameOrigin(ctx: AppContext): RequestHandler {
  const allowed = new Set([new URL(ctx.cfg.APP_ORIGIN).origin])
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
    const origin = req.headers.origin ?? (req.headers.referer ? safeOrigin(req.headers.referer) : undefined)
    if (!origin || !allowed.has(origin)) return next(forbidden('Cross-origin request blocked'))
    next()
  }
}

function safeOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

/** Validate input with zod; never echoes the rejected values (they may be health data). */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data)
  if (!r.success) {
    throw badRequest(
      'Invalid request',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    )
  }
  return r.data
}

export function deviceTokenUser(ctx: AppContext, req: Request): string {
  const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(req.headers.authorization ?? '')
  const userId = m ? ctx.repo.userForDeviceToken(hmac(ctx.cfg.DEVICE_TOKEN_PEPPER, m[1]!)) : undefined
  if (!userId) throw unauthorized('Invalid or revoked device token')
  return userId
}
