import type { AppContext } from './context.ts'

/** Deletes wearable data older than RETENTION_DAYS (plus expired sessions/OAuth states), hourly. */
export function runRetention(ctx: AppContext, now = new Date()): Record<string, number> {
  const cutoff = new Date(now.getTime() - ctx.cfg.RETENTION_DAYS * 86_400_000).toISOString()
  const deleted = ctx.repo.purgeHealthDataBefore(cutoff)
  // Logged as a flat string: object keys like `metrics` are redacted by the logger's safety net.
  const deletedRows = Object.entries(deleted).map(([table, n]) => `${table}=${n}`).join(' ')
  ctx.log.info({ deletedRows, retentionDays: ctx.cfg.RETENTION_DAYS }, 'retention sweep')
  return deleted
}

export function startRetentionJob(ctx: AppContext): () => void {
  runRetention(ctx)
  const timer = setInterval(() => runRetention(ctx), 60 * 60_000)
  timer.unref()
  return () => clearInterval(timer)
}
