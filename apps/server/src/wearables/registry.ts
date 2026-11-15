import { PROVIDER_IDS, type ProviderId } from '@astrovitals/shared'
import type { Logger } from 'pino'
import type { Config } from '../config.ts'
import type { SecretBox } from '../lib/crypto.ts'
import type { FetchLike } from '../lib/http.ts'
import type { Repo } from '../repo.ts'
import { AppleHealthExportProvider } from './providers/appleHealthExport.ts'
import { DemoProvider } from './providers/demo.ts'
import { GarminProvider } from './providers/garmin.ts'
import { GoogleHealthProvider } from './providers/googleHealth.ts'
import { HealthKitCompanionProvider } from './providers/healthkitCompanion.ts'
import type { WearableProvider } from './types.ts'

/** Adding a provider = implement WearableProvider (or OAuthWearableProvider) and register it here. */
export function createProviders(deps: { repo: Repo; cfg: Config; box: SecretBox; log: Logger; fetchImpl?: FetchLike }): Map<ProviderId, WearableProvider> {
  const { repo, cfg, box, log, fetchImpl } = deps
  const list: WearableProvider[] = [
    new DemoProvider(),
    new GoogleHealthProvider(repo, cfg, box, log, fetchImpl),
    new AppleHealthExportProvider(repo),
    new HealthKitCompanionProvider(repo),
    new GarminProvider(repo),
  ]
  const map = new Map(list.map((p) => [p.id, p] as const))
  for (const id of PROVIDER_IDS) if (!map.has(id)) throw new Error(`Provider ${id} not registered`)
  return map
}
