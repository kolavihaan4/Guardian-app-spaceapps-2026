import type { Repo } from '../../repo.ts'
import { StoredDataProvider } from '../stored.ts'
import type { Availability } from '../types.ts'

/**
 * Garmin Health API — intentionally NOT implemented beyond this adapter slot.
 *
 * Findings (2026-10-05, see docs/WEARABLES.md):
 *  - Access is through the Garmin Connect Developer Program, approval-only and aimed at businesses;
 *    the application form was offline when checked. Summary payload schemas are only in the
 *    portal-gated "Health REST API Specification", so writing a parser now would mean guessing.
 *  - Auth: OAuth 2.0 with PKCE (token host diauth.garmin.com, per Garmin's OAuth2PKCE spec PDF).
 *  - Delivery: Garmin pushes (or pings) daily/epoch/sleep/stress/HRV/pulse-ox summaries to a
 *    partner webhook; there is no on-demand pull for arbitrary ranges outside backfill.
 *
 * When approved: implement OAuthWearableProvider, add a webhook route that verifies the
 * request, map summaries with makeMetric(), and store them via repo.saveHealthData().
 */
export class GarminProvider extends StoredDataProvider {
  readonly id = 'garmin' as const

  constructor(repo: Repo) {
    super(repo)
  }

  availability(): Availability {
    return {
      available: false,
      note: 'Requires approval in the Garmin Connect Developer Program (business-focused; application form offline as of 2026-10-05).',
    }
  }
}
