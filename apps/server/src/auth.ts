import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ZodType } from 'zod'
import type { AppContext } from './context.ts'
import { hmac, randomToken } from './lib/crypto.ts'
import { badRequest, forbidden, unauthorized } from './lib/errors.ts'

export function sessionCookieName(ctx: AppContext): string {
  // __Host- prefix: browser enforces Secure, Path=/ and no Domain (production only; needs HTTPS).
  return ctx.cfg.isProduction ? '__Host-av_session' : 'av_session'
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return undefined
}

export function startSession(ctx: AppContext, res: Response, userId: string): void {
  const token = randomToken(32)
  const ttlMs = ctx.cfg.SESSION_TTL_HOURS * 3600_000
  ctx.repo.createSession(hmac(ctx.cfg.DEVICE_TOKEN_PEPPER, token), userId, new Date(Date.now() + ttlMs).toISOString())
  res.cookie(sessionCookieName(ctx), token, {
    httpOnly: true, // not readable by JavaScript
    secure: ctx.cfg.isProduction,
    sameSite: 'lax', // sent on top-level OAuth redirects back to us, not on cross-site POSTs
    path: '/',
    maxAge: ttlMs,
  })
}

export function endSession(ctx: AppContext, req: Request, res: Response): void {
  const token = readCookie(req, sessionCookieName(ctx))
  if (token) ctx.repo.deleteSession(hmac(ctx.cfg.DEVICE_TOKEN_PEPPER, token))
  res.clearCookie(sessionCookieName(ctx), { path: '/' })
}

export function loadUser(ctx: AppContext): RequestHandler {
  return (req, _res, next) => {
    const token = readCookie(req, sessionCookieName(ctx))
    if (token) req.user = ctx.repo.sessionUser(hmac(ctx.cfg.DEVICE_TOKEN_PEPPER, token))
    next()
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized())
  next()
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests: SameSite=Lax cookies plus a
 * strict Origin check (falls back to Referer). Requests without either header are rejected.
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
