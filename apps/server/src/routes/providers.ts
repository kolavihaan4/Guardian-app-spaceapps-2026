import { PROVIDER_IDS, type DeviceTokenResponse, type ImportResult, type ProviderId } from '@astrovitals/shared'
import { Router, type Request } from 'express'
import { z } from 'zod'
import { parse, requireAuth } from '../auth.ts'
import type { AppContext } from '../context.ts'
import { hmac, randomId, randomToken } from '../lib/crypto.ts'
import { badRequest, HttpError, notFound } from '../lib/errors.ts'
import { safePath } from '../lib/logger.ts'
import { parseAppleHealthExport } from '../wearables/providers/appleHealthExport.ts'
import { isOAuthProvider, type OAuthWearableProvider } from '../wearables/types.ts'
import { providerStatuses } from './me.ts'

const providerParam = z.object({ id: z.enum(PROVIDER_IDS) })
const DAY = 86_400_000

function oauthProvider(ctx: AppContext, id: ProviderId): OAuthWearableProvider {
  const p = ctx.providers.get(id)
  if (!p || !isOAuthProvider(p)) throw badRequest(`${id} does not use OAuth`)
  return p
}

export function providerRoutes(ctx: AppContext): Router {
  const r = Router()

  /**
   * OAuth redirect target. Top-level GET navigation from the platform, so it is excluded from the
   * Origin check; protection comes from the single-use state (HMAC-stored, 10 min) bound to the
   * signed-in session, plus PKCE. Errors redirect back to the app without echoing upstream text.
   */
  r.get('/:id/callback', async (req, res) => {
    const back = (q: string) => res.redirect(303, `${ctx.cfg.APP_ORIGIN}/#/connections?${q}`)
    const { id } = parse(providerParam, req.params)
    const q = parse(z.object({ code: z.string().max(2048).optional(), state: z.string().max(256).optional(), error: z.string().max(200).optional() }), req.query)
    if (q.error || !q.code || !q.state) return back(`provider=${id}&status=denied`)
    if (!req.user) return back(`provider=${id}&status=signed_out`)
    try {
      await oauthProvider(ctx, id).handleOAuthCallback(q.code, q.state, req.user.id)
      return back(`provider=${id}&status=connected`)
    } catch (err) {
      ctx.log.warn({ provider: id, path: safePath(req.originalUrl), reason: (err as Error).message }, 'oauth callback failed')
      return back(`provider=${id}&status=error`)
    }
  })

  r.use(requireAuth)

  r.get('/', (req, res) => {
    res.json(providerStatuses(ctx, req.user!.id))
  })

  /** Returns the platform authorization URL (the browser navigates to it). */
  r.post('/:id/connect', (req, res) => {
    const { id } = parse(providerParam, req.params)
    const url = oauthProvider(ctx, id).getAuthorizationUrl(req.user!.id)
    res.json({ url })
  })

  r.post('/:id/sync', async (req, res) => {
    const { id } = parse(providerParam, req.params)
    const { days } = parse(z.object({ days: z.number().int().min(1).max(30).default(7) }), req.body ?? {})
    const end = new Date()
    const result = await oauthProvider(ctx, id).sync(req.user!.id, new Date(end.getTime() - days * DAY), end)
    ctx.repo.audit(req.user!.id, 'provider.sync', id)
    res.json(result)
  })

  /** Disconnect = revoke at the platform (OAuth) + delete tokens + delete that provider's stored data. */
  r.delete('/:id', async (req, res) => {
    const { id } = parse(providerParam, req.params)
    const userId = req.user!.id
    if (id === 'demo') throw badRequest('Demo data is not stored; turn demo mode off in Settings instead.')
    const p = ctx.providers.get(id)!
    if (isOAuthProvider(p)) await p.disconnect(userId)
    else ctx.repo.deleteConnection(userId, id)
    if (id === 'healthkit-companion') ctx.repo.deleteDeviceTokens(userId)
    ctx.repo.deleteProviderData(userId, id)
    ctx.repo.audit(userId, 'provider.disconnect', id)
    res.json({ ok: true })
  })

  /**
   * Apple Health export upload. Body = raw export.xml (streamed, never buffered whole).
   * Only records inside the retention window are kept.
   */
  r.post('/apple-health-export/import', async (req: Request, res) => {
    const ct = (req.headers['content-type'] ?? '').split(';')[0]!.trim()
    if (!['application/xml', 'text/xml', 'application/octet-stream'].includes(ct)) {
      throw new HttpError(415, 'unsupported_media_type', 'Upload the unzipped export.xml file (Content-Type application/xml).')
    }
    const userId = req.user!.id
    const { days: requested } = parse(z.object({ days: z.coerce.number().int().min(1).max(36_500).default(Math.min(30, ctx.cfg.RETENTION_DAYS)) }), req.query)
    // Anything older than the retention period would be purged by the next hourly sweep, so trim to it.
    const days = Math.min(requested, ctx.cfg.RETENTION_DAYS)
    const to = new Date()
    const from = new Date(to.getTime() - days * DAY)
    const summary = await parseAppleHealthExport(req, {
      from,
      to,
      onMetrics: (batch) => ctx.repo.saveHealthData(userId, 'apple-health-export', { metrics: batch }),
    }).catch((err: Error) => {
      throw badRequest(err.message.startsWith('This does not look') ? err.message : 'Could not read the export file.')
    })
    const saved = ctx.repo.saveHealthData(userId, 'apple-health-export', { sleep: summary.sleep, workouts: summary.workouts })
    ctx.repo.upsertConnection({ user_id: userId, provider: 'apple-health-export', status: 'connected', scopes: null, access_token_enc: null, refresh_token_enc: null, token_expires_at: null })
    ctx.repo.markSynced(userId, 'apple-health-export')
    ctx.repo.audit(userId, 'provider.import', `apple-health-export; ${summary.metrics} metrics`)
    const body: ImportResult = {
      provider: 'apple-health-export',
      metrics: summary.metrics,
      sleep: saved.sleep,
      activity: 0,
      workouts: saved.workouts,
      skippedRecords: summary.skippedRecords,
      unsupportedTypes: summary.unsupportedTypes.slice(0, 50),
      notes: [
        days < requested
          ? `Imported records from the last ${days} day(s); you asked for ${requested}, but data older than the ${ctx.cfg.RETENTION_DAYS}-day retention period is not kept.`
          : `Imported records from the last ${days} day(s).`,
        'Apple Watch HRV is SDNN, which is not comparable with Fitbit/Google RMSSD.'],
    }
    res.json(body)
  })

  // ── HealthKit companion device tokens ─────────────────────────────────────
  r.get('/healthkit-companion/tokens', (req, res) => {
    res.json(ctx.repo.deviceTokens(req.user!.id))
  })

  r.post('/healthkit-companion/tokens', (req, res) => {
    const { label } = parse(z.object({ label: z.string().trim().min(1).max(60) }), req.body)
    const userId = req.user!.id
    const token = randomToken(32)
    const id = randomId()
    ctx.repo.createDeviceToken({ id, userId, tokenHash: hmac(ctx.cfg.DEVICE_TOKEN_PEPPER, token), label })
    ctx.repo.upsertConnection({ user_id: userId, provider: 'healthkit-companion', status: 'connected', scopes: null, access_token_enc: null, refresh_token_enc: null, token_expires_at: null })
    ctx.repo.audit(userId, 'device_token.create')
    const body: DeviceTokenResponse = { token, id, label }
    res.status(201).json(body)
  })

  r.delete('/healthkit-companion/tokens/:tokenId', (req, res) => {
    const { tokenId } = parse(z.object({ tokenId: z.string().regex(/^[a-f0-9]{32}$/) }), req.params)
    if (!ctx.repo.deleteDeviceToken(req.user!.id, tokenId)) throw notFound('Token not found')
    ctx.repo.audit(req.user!.id, 'device_token.revoke')
    res.json({ ok: true })
  })

  return r
}
