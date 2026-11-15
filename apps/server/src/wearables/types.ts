import type { ActivityData, Metric, MetricType, ProviderId, SleepData, SyncResult, Workout } from '@astrovitals/shared'

export interface Availability {
  available: boolean
  /** Honest explanation shown in the UI (e.g. why Garmin is disabled). */
  note: string
}

/**
 * Read side shared by every wearable source. Each provider normalizes its platform's
 * data into the shared Metric/SleepData/ActivityData/Workout models; every metric is
 * optional because devices and platforms expose different measurements.
 */
export interface WearableProvider {
  readonly id: ProviderId
  availability(): Availability
  getHeartRate(userId: string, start: Date, end: Date): Promise<Metric[]>
  getSleep(userId: string, start: Date, end: Date): Promise<SleepData[]>
  getActivity(userId: string, start: Date, end: Date): Promise<ActivityData[]>
  /** All vitals (HR, RHR, HRV, SpO2, respiratory rate, temperature, steps, energy) or a subset. */
  getMetrics(userId: string, start: Date, end: Date, types?: MetricType[]): Promise<Metric[]>
  getWorkouts(userId: string, start: Date, end: Date): Promise<Workout[]>
}

/**
 * Cloud platforms reachable with OAuth 2.0 from our backend (Google Health API today).
 * Compared with the brief's suggested interface, the methods take the signed-in user and the
 * `state` value, because state/PKCE verification, session binding and per-user token storage need them.
 */
export interface OAuthWearableProvider extends WearableProvider {
  readonly scopes: readonly string[]
  getAuthorizationUrl(userId: string): string
  /** Must reject when the state was issued to a different user than the one completing the flow. */
  handleOAuthCallback(code: string, state: string, sessionUserId: string): Promise<void>
  /** Pull data from the platform into the encrypted-at-rest store. */
  sync(userId: string, start: Date, end: Date): Promise<SyncResult>
  /** Revoke the grant at the platform, then forget the tokens. */
  disconnect(userId: string): Promise<void>
}

export function isOAuthProvider(p: WearableProvider): p is OAuthWearableProvider {
  return typeof (p as OAuthWearableProvider).getAuthorizationUrl === 'function'
}
