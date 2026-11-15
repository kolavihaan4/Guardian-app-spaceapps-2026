import { Router } from 'express'
import { deviceTokenUser, parse } from '../auth.ts'
import type { AppContext } from '../context.ts'
import { healthKitPayload, normalizeHealthKitPayload } from '../wearables/providers/healthkitCompanion.ts'

/**
 * Machine-to-machine ingestion from the HealthKit companion app. Authenticated with a per-device
 * bearer token (only its HMAC is stored); no cookies, so the browser Origin check does not apply.
 */
export function ingestRoutes(ctx: AppContext): Router {
  const r = Router()
  r.post('/healthkit', (req, res) => {
    const userId = deviceTokenUser(ctx, req)
    const payload = parse(healthKitPayload, req.body)
    const n = normalizeHealthKitPayload(payload)
    const saved = ctx.repo.saveHealthData(userId, 'healthkit-companion', { metrics: n.metrics, sleep: n.sleep, workouts: n.workouts })
    ctx.repo.markSynced(userId, 'healthkit-companion')
    res.json({ accepted: saved, skipped: n.skipped, unsupportedTypes: n.unsupported })
  })
  return r
}
