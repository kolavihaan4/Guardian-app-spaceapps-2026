import { PROVIDER_INFO, type MeResponse, type ProviderStatusDto } from '@astrovitals/shared'
import { Router } from 'express'
import { z } from 'zod'
import { parse } from '../auth.ts'
import type { AppContext } from '../context.ts'
import { isOAuthProvider } from '../wearables/types.ts'

export function providerStatuses(ctx: AppContext, userId: string): ProviderStatusDto[] {
  const conns = new Map(ctx.repo.connections(userId).map((c) => [c.provider, c]))
  return [...ctx.providers.values()].map((p) => {
    const a = p.availability()
    const c = conns.get(p.id)
    return {
      ...PROVIDER_INFO[p.id],
      available: a.available,
      availabilityNote: a.note,
      connected: p.id === 'demo' ? true : Boolean(c),
      ...(c ? { connectedAt: c.connected_at } : {}),
      ...(c?.last_sync_at ? { lastSyncAt: c.last_sync_at } : {}),
      ...(c?.scopes ? { scopes: c.scopes.split(' ') } : isOAuthProvider(p) ? { scopes: [...p.scopes] } : {}),
    }
  })
}

export function meRoutes(ctx: AppContext): Router {
  const r = Router()

  r.get('/', (req, res) => {
    const u = req.user!
    const body: MeResponse = {
      user: { id: u.id, email: u.email, demoMode: u.demo_mode === 1, createdAt: u.created_at },
      providers: providerStatuses(ctx, u.id),
      retentionDays: ctx.cfg.RETENTION_DAYS,
    }
    res.json(body)
  })

  r.patch('/settings', (req, res) => {
    const { demoMode } = parse(z.object({ demoMode: z.boolean() }).strict(), req.body)
    ctx.repo.setDemoMode(req.user!.id, demoMode)
    ctx.repo.audit(req.user!.id, 'settings.demo_mode', String(demoMode))
    res.json({ ok: true })
  })

  /** Data portability: everything we store about the user's health, as JSON. Tokens are never exported. */
  r.get('/export', (req, res) => {
    const u = req.user!
    const all = { from: '1970-01-01T00:00:00Z', to: '9999-12-31T00:00:00Z' }
    ctx.repo.audit(u.id, 'data.export')
    res.setHeader('content-disposition', 'attachment; filename="astrovitals-export.json"')
    res.setHeader('cache-control', 'no-store')
    res.json({
      exportedAt: new Date().toISOString(),
      user: { email: u.email, createdAt: u.created_at },
      connections: ctx.repo.connections(u.id).map((c) => ({ provider: c.provider, connectedAt: c.connected_at, lastSyncAt: c.last_sync_at, scopes: c.scopes })),
      metrics: ctx.repo.metrics(u.id, all.from, all.to),
      sleep: ctx.repo.sleep(u.id, all.from, all.to),
      workouts: ctx.repo.workouts(u.id, all.from, all.to),
    })
  })

  /** Delete all stored health data but keep the account and connections. */
  r.delete('/data', (req, res) => {
    ctx.repo.deleteAllHealthData(req.user!.id)
    ctx.repo.audit(req.user!.id, 'data.delete_all')
    res.json({ ok: true })
  })

  /**
   * Delete this server's copy of the account: revoke every OAuth grant, then cascade-delete everything.
   * The sign-in itself lives in Supabase and is deleted there by the page (delete_my_account()).
   */
  r.delete('/', async (req, res) => {
    parse(z.object({ confirm: z.literal('DELETE') }), req.body)
    const u = req.user!
    for (const p of ctx.providers.values()) {
      if (isOAuthProvider(p) && ctx.repo.connection(u.id, p.id)) await p.disconnect(u.id)
    }
    ctx.repo.deleteUser(u.id)
    ctx.repo.audit(null, 'user.delete')
    res.json({ ok: true })
  })

  return r
}
