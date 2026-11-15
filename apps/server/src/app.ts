import express, { type ErrorRequestHandler, type Express } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadUser, requireAuth, requireSameOrigin } from './auth.ts'
import type { AppContext } from './context.ts'
import { HttpError, UpstreamError } from './lib/errors.ts'
import { safePath } from './lib/logger.ts'
import { aiRoutes } from './routes/ai.ts'
import { datasetRoutes } from './routes/datasets.ts'
import { ingestRoutes } from './routes/ingest.ts'
import { meRoutes } from './routes/me.ts'
import { nasaRoutes } from './routes/nasa.ts'
import { providerRoutes } from './routes/providers.ts'
import { ultrasoundRoutes } from './routes/ultrasound.ts'
import { vitalsRoutes } from './routes/vitals.ts'

/**
 * Content-security-policy hashes for the inline scripts in the built pages (each page decides before
 * first paint whether to play its opening). Hashing what is actually on disk allows exactly those
 * scripts and nothing else, and stays right when a page's script changes.
 */
function inlineScriptHashes(dir: string): string[] {
  if (!existsSync(dir)) return []
  const hashes = new Set<string>()
  for (const name of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    if (!name.endsWith('.html')) continue
    // A browser reads every line ending as a plain newline before it hashes a script, so do the same.
    const html = readFileSync(resolve(dir, name), 'utf8').replace(/\r\n?/g, '\n')
    for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=/i.test(attrs!) || !body) continue
      hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`)
    }
  }
  return [...hashes]
}

export function createApp(ctx: AppContext, opts: { staticDir?: string; fetchImpl?: typeof fetch } = {}): Express {
  const app = express()
  app.disable('x-powered-by')
  if (ctx.cfg.TRUST_PROXY === '1') app.set('trust proxy', 1)
  const staticDir = opts.staticDir ?? resolve(import.meta.dirname, '../../web/dist')

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Our own scripts, the pages' own inline start-up scripts (by hash), and WebAssembly for the
          // 3D body's model decoder. No third-party scripts at all.
          scriptSrc: ["'self'", "'wasm-unsafe-eval'", ...inlineScriptHashes(staticDir)],
          // APOD images (new + legacy hosts).
          imgSrc: ["'self'", 'data:', 'https://assets.science.nasa.gov', 'https://science.nasa.gov', 'https://apod.nasa.gov'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], // chart library sets inline style attributes; the typefaces' stylesheet
          fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
          connectSrc: ["'self'", new URL(ctx.cfg.SUPABASE_URL).origin],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: ctx.cfg.isProduction ? [] : null,
        },
      },
      strictTransportSecurity: ctx.cfg.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  )

  // Operational request log: method, path WITHOUT query string, status, duration. Nothing else.
  app.use((req, res, next) => {
    const start = process.hrtime.bigint()
    res.on('finish', () => {
      ctx.log.info({ method: req.method, path: safePath(req.originalUrl), status: res.statusCode, ms: Number(process.hrtime.bigint() - start) / 1e6 }, 'request')
    })
    next()
  })

  const limiter = (windowMs: number, limit: number) => rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false })

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  // Companion-app ingestion: bearer token, larger JSON bodies, its own limiter. Mounted before the
  // sign-in/Origin middleware because it is not a browser endpoint.
  app.use('/api/ingest', limiter(60_000, 60), express.json({ limit: '5mb' }), ingestRoutes(ctx))

  // Ultrasound frames are images, so these routes take larger bodies and a tighter limiter. Mounted
  // before the general JSON parser, with the same cookie and Origin checks.
  app.use('/api/ultrasound', limiter(60_000, 30), express.json({ limit: '25mb' }), loadUser(ctx), requireSameOrigin(ctx), requireAuth, ultrasoundRoutes(ctx, opts.fetchImpl))

  app.use('/api', limiter(60_000, 300), express.json({ limit: '100kb' }), loadUser(ctx), requireSameOrigin(ctx))
  app.use('/api/me', requireAuth, meRoutes(ctx))
  app.use('/api/providers', providerRoutes(ctx))
  app.use('/api/vitals', requireAuth, vitalsRoutes(ctx))
  app.use('/api/nasa', requireAuth, nasaRoutes(ctx))
  app.use('/api/datasets', requireAuth, datasetRoutes())
  app.use('/api/ai', requireAuth, aiRoutes(ctx))
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found', 'Unknown API route')))

  // Production: serve the built React app from the same origin (sign-in stays on the same origin).
  const dir = staticDir
  if (existsSync(dir)) {
    app.use(express.static(dir, { index: false, maxAge: '1h' }))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(resolve(dir, 'index.html')))
  }

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) })
      return
    }
    if (err instanceof UpstreamError) {
      ctx.log.warn({ upstream: err.upstream, status: err.status, path: safePath(req.originalUrl) }, 'upstream error')
      res.status(502).json({ error: 'upstream_unavailable', message: `${err.upstream} is unavailable right now. Please try again later.` })
      return
    }
    const status = (err as { status?: number; type?: string }).status
    if (status === 413 || status === 400) {
      res.status(status).json({ error: status === 413 ? 'payload_too_large' : 'bad_request', message: status === 413 ? 'Request body too large' : 'Malformed request body' })
      return
    }
    // Log only the error class and stack location; never the request body or the message of
    // errors that could embed user data.
    ctx.log.error({ err: { name: (err as Error).name, stack: (err as Error).stack?.split('\n').slice(0, 4).join(' | ') }, path: safePath(req.originalUrl) }, 'unhandled error')
    res.status(500).json({ error: 'internal', message: 'Something went wrong.' })
  }
  app.use(onError)
  return app
}
