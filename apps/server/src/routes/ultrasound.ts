import { HEART_FRAMES, type UltrasoundStatus } from '@astrovitals/shared'
import { Router } from 'express'
import { z } from 'zod'
import { parse } from '../auth.ts'
import type { AppContext } from '../context.ts'
import { HttpError } from '../lib/errors.ts'

// A frame arrives as base64 without a data: prefix. The browser shrinks frames to about 1000 pixels
// before sending, so 6 million characters (about 4.5 MB of image) is generous.
const image = z.string().min(100).max(6_000_000).regex(/^[A-Za-z0-9+/]+=*$/, 'must be base64')
const depthCm = z.number().min(1).max(30)
const jugularBody = z.object({ image, depthCm })
const heartBody = z.object({ frames: z.object(Object.fromEntries(HEART_FRAMES.map((f) => [f, image])) as Record<(typeof HEART_FRAMES)[number], typeof image>), depthCm })

const unavailable = () => new HttpError(503, 'ultrasound_unavailable', 'The ultrasound analysis service is not running.')

/**
 * Ultrasound analysis. The models run in a separate Python service (ai/ultrasound_service) that
 * only this server talks to; the browser never reaches it. Frames are passed through in memory and
 * are never stored or logged.
 */
export function ultrasoundRoutes(ctx: AppContext, fetchImpl: typeof fetch = fetch): Router {
  const r = Router()
  const base = ctx.cfg.ULTRASOUND_URL.replace(/\/$/, '')

  const analyse = async (path: string, body: unknown): Promise<unknown> => {
    let res: Response
    try {
      res = await fetchImpl(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) })
    } catch {
      throw unavailable()
    }
    const text = await res.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw unavailable()
    }
    if (res.status === 400) throw new HttpError(400, 'bad_scan', String((data as { message?: unknown }).message ?? 'That scan could not be read.'))
    if (!res.ok) {
      ctx.log.warn({ status: res.status, path }, 'ultrasound service error')
      throw new HttpError(502, 'ultrasound_failed', 'The scan could not be analysed.')
    }
    return data
  }

  r.get('/status', async (_req, res) => {
    let available = false
    try {
      available = (await fetchImpl(`${base}/health`, { signal: AbortSignal.timeout(2_000) })).ok
    } catch {
      // not running
    }
    res.json({ available } satisfies UltrasoundStatus)
  })

  r.post('/jugular', async (req, res) => {
    res.json(await analyse('/jugular', parse(jugularBody, req.body)))
  })

  r.post('/heart', async (req, res) => {
    res.json(await analyse('/heart', parse(heartBody, req.body)))
  })

  return r
}
