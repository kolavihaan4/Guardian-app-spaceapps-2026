import type { ProviderId } from '@astrovitals/shared'
import type { Logger } from 'pino'
import type { Config } from './config.ts'
import type { SecretBox } from './lib/crypto.ts'
import type { NasaService } from './nasa/service.ts'
import type { Repo, UserRow } from './repo.ts'
import type { WearableProvider } from './wearables/types.ts'

export interface AppContext {
  cfg: Config
  repo: Repo
  box: SecretBox
  log: Logger
  nasa: NasaService
  providers: Map<ProviderId, WearableProvider>
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRow
    }
  }
}
