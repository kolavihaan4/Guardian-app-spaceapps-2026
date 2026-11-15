import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import type { AppContext } from './context.ts'
import { openDatabase } from './db.ts'
import { SecretBox } from './lib/crypto.ts'
import { createLogger } from './lib/logger.ts'
import { NasaService } from './nasa/service.ts'
import { Repo } from './repo.ts'
import { startRetentionJob } from './retention.ts'
import { createProviders } from './wearables/registry.ts'

let cfg
try {
  cfg = loadConfig()
} catch (err) {
  console.error(`\n${(err as Error).message}\n`)
  process.exit(1)
}

const log = createLogger(cfg.LOG_LEVEL)
const repo = new Repo(openDatabase(cfg.DATABASE_PATH))
const box = new SecretBox(cfg.TOKEN_ENCRYPTION_KEY)
const ctx: AppContext = {
  cfg,
  repo,
  box,
  log,
  nasa: new NasaService(cfg, repo, log),
  providers: createProviders({ repo, cfg, box, log }),
}

const stopRetention = startRetentionJob(ctx)
const server = createApp(ctx).listen(cfg.PORT, () => {
  log.info({ port: cfg.PORT, origin: cfg.APP_ORIGIN, retentionDays: cfg.RETENTION_DAYS }, 'AstroVitals API listening')
})

const shutdown = () => {
  stopRetention()
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
