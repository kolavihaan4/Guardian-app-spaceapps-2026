import type { Metric, ProviderId, VitalsResponse } from '@astrovitals/shared'
import { Router } from 'express'
import { z } from 'zod'
import { parse } from '../auth.ts'
import type { AppContext } from '../context.ts'
import { badRequest } from '../lib/errors.ts'
import { deriveActivity } from '../repo.ts'

const DAY = 86_400_000
const MAX_HR_POINTS_PER_SOURCE = 3000

/**
 * Display-only downsampling for long ranges: heart-rate samples are averaged into fixed buckets
 * per source. Stored data is untouched (see GET /api/me/export for raw values), and averaged points
 * say so in `sourceDetail` and use aggregation 'interval'.
 */
export function downsampleHeartRate(metrics: Metric[], from: Date, to: Date): Metric[] {
  const hr = metrics.filter((m) => m.metricType === 'heart_rate')
  const bySource = new Map<string, Metric[]>()
  for (const m of hr) bySource.set(`${m.source}|${m.simulated}`, [...(bySource.get(`${m.source}|${m.simulated}`) ?? []), m])
  const out = metrics.filter((m) => m.metricType !== 'heart_rate')
  const bucketMs = Math.max(5 * 60_000, Math.ceil((to.getTime() - from.getTime()) / MAX_HR_POINTS_PER_SOURCE / 60_000) * 60_000)
  for (const list of bySource.values()) {
    if (list.length <= MAX_HR_POINTS_PER_SOURCE) {
      out.push(...list)
      continue
    }
    const buckets = new Map<number, Metric[]>()
    for (const m of list) {
      if (m.quality?.status === 'implausible') {
        out.push(m) // never average away an implausible reading; it stays visible as a flag
        continue
      }
      const b = Math.floor(Date.parse(m.timestamp) / bucketMs) * bucketMs
      buckets.set(b, [...(buckets.get(b) ?? []), m])
    }
    for (const [b, ms] of buckets) {
      const first = ms[0]!
      out.push({
        ...first,
        timestamp: new Date(b).toISOString(),
        endTimestamp: new Date(b + bucketMs).toISOString(),
        value: Math.round((ms.reduce((a, m) => a + m.value, 0) / ms.length) * 10) / 10,
        aggregation: 'interval',
        sourceDetail: `${first.sourceDetail ?? first.source} · ${Math.round(bucketMs / 60_000)}-min display average of ${ms.length} samples`,
        quality: ms.some((m) => m.quality?.status === 'out_of_range') ? { status: 'out_of_range', note: 'Bucket contains readings outside the typical range.' } : { status: 'ok' },
      })
    }
  }
  return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

export function vitalsRoutes(ctx: AppContext): Router {
  const r = Router()

  r.get('/', async (req, res) => {
    const q = parse(
      z.object({
        from: z.iso.datetime({ offset: true }).optional(),
        to: z.iso.datetime({ offset: true }).optional(),
      }),
      req.query,
    )
    const to = q.to ? new Date(q.to) : new Date()
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 7 * DAY)
    if (from >= to) throw badRequest('`from` must be before `to`')
    if (to.getTime() - from.getTime() > 90 * DAY) throw badRequest('Range is limited to 90 days')

    const user = req.user!
    const connected = new Set<ProviderId>(ctx.repo.connections(user.id).map((c) => c.provider))
    if (user.demo_mode === 1) connected.add('demo')

    const body: VitalsResponse = { from: from.toISOString(), to: to.toISOString(), metrics: [], sleep: [], activity: [], workouts: [], sources: [] }
    for (const id of connected) {
      const p = ctx.providers.get(id)
      if (!p) continue
      const [metrics, sleep, workouts] = await Promise.all([p.getMetrics(user.id, from, to), p.getSleep(user.id, from, to), p.getWorkouts(user.id, from, to)])
      const activity = deriveActivity(metrics)
      body.metrics.push(...metrics)
      body.sleep.push(...sleep)
      body.activity.push(...activity)
      body.workouts.push(...workouts)
      body.sources.push({ provider: id, simulated: id === 'demo', metrics: metrics.length, sleep: sleep.length, activity: activity.length, workouts: workouts.length })
    }
    body.metrics = downsampleHeartRate(body.metrics, from, to)
    res.setHeader('cache-control', 'no-store')
    res.json(body)
  })

  return r
}
