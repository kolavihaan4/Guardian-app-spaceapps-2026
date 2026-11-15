import { Router } from 'express'
import { loadOsd575 } from '../datasets/osd575.ts'

/** Public research datasets bundled with the app (no upstream call; the file is vendored). */
export function datasetRoutes(): Router {
  const r = Router()
  r.get('/osd-575', (_req, res) => {
    res.setHeader('cache-control', 'private, max-age=3600')
    res.json(loadOsd575())
  })
  return r
}
