import { Router } from 'express'
import { z } from 'zod'
import { parse } from '../auth.ts'
import type { AppContext } from '../context.ts'
import { badRequest } from '../lib/errors.ts'

const DAY = 86_400_000
const date = z.iso.date()
const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10)

function range(q: { from?: string; to?: string }, defaultDays: number, maxDays: number) {
  const to = q.to ?? today()
  const from = q.from ?? daysAgo(defaultDays)
  const span = (Date.parse(to) - Date.parse(from)) / DAY
  if (span < 0) throw badRequest('`from` must not be after `to`')
  if (span > maxDays) throw badRequest(`Range is limited to ${maxDays} days`)
  return { from, to }
}

/** Public NASA (and NOAA SWPC) data proxied through the backend (keys stay server-side; responses cached). */
export function nasaRoutes(ctx: AppContext): Router {
  const r = Router()

  r.get('/space-weather', async (req, res) => {
    const q = parse(z.object({ from: date.optional(), to: date.optional() }), req.query)
    const { from, to } = range(q, 30, 90)
    res.json(await ctx.nasa.spaceWeather(from, to))
  })

  r.get('/earth-events', async (req, res) => {
    const q = parse(
      z.object({
        days: z.coerce.number().int().min(1).max(60).default(30),
        limit: z.coerce.number().int().min(1).max(100).default(40),
        status: z.enum(['open', 'closed', 'all']).default('all'),
        category: z.string().regex(/^[a-zA-Z]{2,40}$/).optional(),
      }),
      req.query,
    )
    res.json(await ctx.nasa.earthEvents(q))
  })

  r.get('/apod', async (req, res) => {
    const q = parse(z.object({ date: date.optional() }), req.query)
    if (q.date && (q.date < '1995-06-16' || q.date > today())) throw badRequest('APOD dates run from 1995-06-16 to today')
    res.json(await ctx.nasa.apod(q.date))
  })

  r.get('/radiation', async (_req, res) => {
    res.json(await ctx.nasa.radiation())
  })

  r.get('/environment', async (req, res) => {
    const q = parse(
      z.object({
        lat: z.coerce.number().min(-90).max(90).default(ctx.cfg.DEFAULT_LATITUDE),
        lon: z.coerce.number().min(-180).max(180).default(ctx.cfg.DEFAULT_LONGITUDE),
        from: date.optional(),
        to: date.optional(),
      }),
      req.query,
    )
    const { from, to } = range(q, 14, 366)
    res.json(await ctx.nasa.environment(q.lat, q.lon, from, to))
  })

  return r
}
