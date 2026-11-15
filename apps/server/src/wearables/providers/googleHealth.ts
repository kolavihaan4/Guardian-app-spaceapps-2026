import type { Metric, SleepData, SleepStageType, SyncResult, Workout } from '@astrovitals/shared'
import type { Logger } from 'pino'
import type { Config } from '../../config.ts'
import { HttpError, UpstreamError } from '../../lib/errors.ts'
import { hmac, pkceChallenge, randomToken, type SecretBox } from '../../lib/crypto.ts'
import { getJson, type FetchLike } from '../../lib/http.ts'
import type { Repo } from '../../repo.ts'
import { dateOnly, durationToOffset, makeMetric, withOffset } from '../normalize.ts'
import { StoredDataProvider } from '../stored.ts'
import type { Availability, OAuthWearableProvider } from '../types.ts'

/**
 * Google Health API (replacement for the Fitbit Web API, which is turned off on 2026-10-30).
 * Covers Fitbit devices, Pixel Watch and other sources connected to the user's Google account.
 *
 * Verified 2026-10-05 against the official discovery document
 * https://health.googleapis.com/$discovery/rest?version=v4 and https://developers.google.com/health :
 *   data:    GET  https://health.googleapis.com/v4/users/me/dataTypes/{type}/dataPoints?filter=&pageSize=&pageToken=
 *            POST https://health.googleapis.com/v4/users/me/dataTypes/{type}/dataPoints:rollUp
 *            POST https://health.googleapis.com/v4/users/me/dataTypes/{type}/dataPoints:dailyRollUp
 *   oauth:   https://accounts.google.com/o/oauth2/v2/auth , https://oauth2.googleapis.com/token ,
 *            https://oauth2.googleapis.com/revoke
 *   limits:  300 requests/user/minute; heart-rate rollUp range max 14 days; list pageSize max 10000
 *            (25 for sleep/exercise).
 * Access: Google states it is "not onboarding new projects at this time" (setup page, updated
 * 2026-10-02); most scopes are restricted (unverified apps: 100 users, verification + CASA
 * assessment to go public). This provider is therefore disabled unless credentials are configured.
 */

const API = 'https://health.googleapis.com/v4/users/me/dataTypes'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

/** Least privilege: read-only, and only the three groups the dashboard displays. */
export const GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
] as const

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type: string
}

type Gdate = { year: number; month: number; day: number }
interface DataSource {
  platform?: string
  device?: { displayName?: string; manufacturer?: string; formFactor?: string }
  application?: { packageName?: string }
}
interface GDataPoint {
  dataSource?: DataSource
  dailyRestingHeartRate?: { date: Gdate; beatsPerMinute: string }
  dailyHeartRateVariability?: { date: Gdate; averageHeartRateVariabilityMilliseconds?: number }
  dailyOxygenSaturation?: { date: Gdate; averagePercentage: number }
  dailyRespiratoryRate?: { date: Gdate; breathsPerMinute: number }
  dailySleepTemperatureDerivations?: { date: Gdate; nightlyTemperatureCelsius: number; baselineTemperatureCelsius?: number }
  sleep?: {
    interval: { startTime: string; endTime: string; startUtcOffset?: string; endUtcOffset?: string }
    summary?: { minutesAsleep?: string; minutesAwake?: string }
    metadata?: { externalId?: string; nap?: boolean }
    stages?: { type: string; startTime: string; endTime: string; startUtcOffset?: string }[]
    type?: string
  }
  exercise?: {
    interval: { startTime: string; endTime: string; startUtcOffset?: string; endUtcOffset?: string }
    exerciseType?: string
    displayName?: string
    metricsSummary?: { caloriesKcal?: number; averageHeartRateBeatsPerMinute?: string; distanceMillimeters?: number }
  }
}
interface RollupPoint {
  startTime: string
  endTime: string
  heartRate?: { beatsPerMinuteAvg?: number; beatsPerMinuteMin?: number; beatsPerMinuteMax?: number }
}
interface DailyRollupPoint {
  civilStartTime: { date: Gdate }
  steps?: { countSum?: string }
  activeEnergyBurned?: { kcalSum?: number }
}

const STAGE_MAP: Record<string, SleepStageType> = {
  AWAKE: 'awake',
  LIGHT: 'light',
  DEEP: 'deep',
  REM: 'rem',
  ASLEEP: 'asleep',
  RESTLESS: 'restless',
}

const gdate = (d: Gdate) => dateOnly(d.year, d.month, d.day)
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const civil = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { date: { year: y!, month: m!, day: d! } }
}

function describeSource(ds: DataSource | undefined): { sourceDetail?: string; device?: string } {
  if (!ds) return {}
  const device = [ds.device?.manufacturer, ds.device?.displayName].filter(Boolean).join(' ') || undefined
  const sourceDetail = [ds.platform, ds.application?.packageName].filter(Boolean).join(' · ') || undefined
  return { ...(sourceDetail ? { sourceDetail } : {}), ...(device ? { device } : {}) }
}

/** Pure mapping of `list` responses → normalized models (unit-tested with schema-derived fixtures). */
export function mapDailyPoints(points: GDataPoint[]): Metric[] {
  const out: Metric[] = []
  for (const p of points) {
    const src = { source: 'google-health' as const, aggregation: 'daily' as const, ...describeSource(p.dataSource) }
    if (p.dailyRestingHeartRate) {
      out.push(makeMetric({ ...src, metricType: 'resting_heart_rate', value: Number(p.dailyRestingHeartRate.beatsPerMinute), timestamp: `${gdate(p.dailyRestingHeartRate.date)}T00:00:00Z` }))
    }
    if (p.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds !== undefined) {
      out.push(makeMetric({ ...src, metricType: 'hrv_rmssd', value: p.dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds, timestamp: `${gdate(p.dailyHeartRateVariability.date)}T00:00:00Z` }))
    }
    if (p.dailyOxygenSaturation) {
      out.push(makeMetric({ ...src, metricType: 'spo2', value: p.dailyOxygenSaturation.averagePercentage, timestamp: `${gdate(p.dailyOxygenSaturation.date)}T00:00:00Z` }))
    }
    if (p.dailyRespiratoryRate) {
      out.push(makeMetric({ ...src, metricType: 'respiratory_rate', value: p.dailyRespiratoryRate.breathsPerMinute, timestamp: `${gdate(p.dailyRespiratoryRate.date)}T00:00:00Z` }))
    }
    const t = p.dailySleepTemperatureDerivations
    if (t) {
      const ts = `${gdate(t.date)}T00:00:00Z`
      out.push(makeMetric({ ...src, metricType: 'skin_temperature', value: t.nightlyTemperatureCelsius, timestamp: ts }))
      if (t.baselineTemperatureCelsius !== undefined) {
        out.push(
          makeMetric({
            ...src,
            sourceDetail: `${src.sourceDetail ?? 'Google Health'} · derived: nightly − 30-day baseline`,
            metricType: 'skin_temperature_deviation',
            value: Math.round((t.nightlyTemperatureCelsius - t.baselineTemperatureCelsius) * 100) / 100,
            timestamp: ts,
          }),
        )
      }
    }
  }
  return out
}

export function mapSleep(points: GDataPoint[]): SleepData[] {
  return points
    .filter((p) => p.sleep)
    .map((p) => {
      const s = p.sleep!
      const off = durationToOffset(s.interval.startUtcOffset)
      const endOff = durationToOffset(s.interval.endUtcOffset ?? s.interval.startUtcOffset)
      return {
        start: withOffset(s.interval.startTime, off),
        end: withOffset(s.interval.endTime, endOff),
        minutesAsleep: Number(s.summary?.minutesAsleep ?? 0),
        ...(s.summary?.minutesAwake !== undefined ? { minutesAwake: Number(s.summary.minutesAwake) } : {}),
        stages: (s.stages ?? [])
          .filter((st) => STAGE_MAP[st.type])
          .map((st) => ({ stage: STAGE_MAP[st.type]!, start: withOffset(st.startTime, off), end: withOffset(st.endTime, off) })),
        ...(s.metadata?.externalId ? { externalId: s.metadata.externalId } : {}),
        source: 'google-health' as const,
        ...describeSource(p.dataSource),
        simulated: false,
      }
    })
}

export function mapExercise(points: GDataPoint[]): Workout[] {
  return points
    .filter((p) => p.exercise)
    .map((p) => {
      const e = p.exercise!
      const off = durationToOffset(e.interval.startUtcOffset)
      const m = e.metricsSummary
      return {
        start: withOffset(e.interval.startTime, off),
        end: withOffset(e.interval.endTime, durationToOffset(e.interval.endUtcOffset ?? e.interval.startUtcOffset)),
        activityType: e.exerciseType ?? 'EXERCISE_TYPE_UNSPECIFIED',
        displayName: e.displayName ?? e.exerciseType ?? 'Exercise',
        ...(m?.caloriesKcal !== undefined ? { energyKcal: m.caloriesKcal } : {}),
        ...(m?.averageHeartRateBeatsPerMinute !== undefined ? { averageHeartRate: Number(m.averageHeartRateBeatsPerMinute) } : {}),
        ...(m?.distanceMillimeters !== undefined ? { distanceMeters: m.distanceMillimeters / 1000 } : {}),
        source: 'google-health' as const,
        ...(describeSource(p.dataSource).sourceDetail ? { sourceDetail: describeSource(p.dataSource).sourceDetail } : {}),
        simulated: false,
      }
    })
}

export function mapHeartRateRollup(points: RollupPoint[]): Metric[] {
  return points
    .filter((p) => p.heartRate?.beatsPerMinuteAvg !== undefined)
    .map((p) =>
      makeMetric({
        source: 'google-health',
        sourceDetail: 'Google Health rollUp (5-min average of reconciled sources)',
        metricType: 'heart_rate',
        value: Math.round(p.heartRate!.beatsPerMinuteAvg! * 10) / 10,
        timestamp: p.startTime,
        endTimestamp: p.endTime,
        aggregation: 'interval',
      }),
    )
}

export function mapDailyRollup(points: DailyRollupPoint[]): Metric[] {
  const out: Metric[] = []
  for (const p of points) {
    const ts = `${gdate(p.civilStartTime.date)}T00:00:00Z`
    const src = { source: 'google-health' as const, sourceDetail: 'Google Health dailyRollUp (reconciled sources)', aggregation: 'daily' as const, timestamp: ts }
    if (p.steps?.countSum !== undefined) out.push(makeMetric({ ...src, metricType: 'steps', value: Number(p.steps.countSum) }))
    if (p.activeEnergyBurned?.kcalSum !== undefined) out.push(makeMetric({ ...src, metricType: 'active_energy', value: p.activeEnergyBurned.kcalSum }))
  }
  return out
}

export class GoogleHealthProvider extends StoredDataProvider implements OAuthWearableProvider {
  readonly id = 'google-health' as const
  readonly scopes = GOOGLE_HEALTH_SCOPES

  constructor(
    repo: Repo,
    private readonly cfg: Config,
    private readonly box: SecretBox,
    private readonly log: Logger,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    super(repo)
  }

  availability(): Availability {
    if (this.cfg.GOOGLE_HEALTH_CLIENT_ID && this.cfg.GOOGLE_HEALTH_CLIENT_SECRET) {
      return { available: true, note: 'OAuth credentials configured. Unverified Google apps are limited to 100 test users.' }
    }
    return {
      available: false,
      note:
        'Not configured. Google is not onboarding new Google Health API projects as of 2026-10-02, and the Fitbit Web API shuts down on 2026-10-30. ' +
        'Set GOOGLE_HEALTH_CLIENT_ID/SECRET if your Cloud project has access. Apple Watch users can use the Apple Health export instead.',
    }
  }

  private requireConfigured(): { clientId: string; clientSecret: string } {
    const { GOOGLE_HEALTH_CLIENT_ID: clientId, GOOGLE_HEALTH_CLIENT_SECRET: clientSecret } = this.cfg
    if (!clientId || !clientSecret) throw new HttpError(409, 'provider_unavailable', this.availability().note)
    return { clientId, clientSecret }
  }

  getAuthorizationUrl(userId: string): string {
    const { clientId } = this.requireConfigured()
    const state = randomToken(24)
    const verifier = randomToken(48) // 64 chars, RFC 7636 allows 43–128
    this.repo.saveOAuthState({
      stateHash: hmac(this.cfg.DEVICE_TOKEN_PEPPER, state),
      userId,
      provider: this.id,
      verifierEnc: this.box.encrypt(verifier, `pkce:${userId}`),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.cfg.GOOGLE_HEALTH_REDIRECT_URI,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
      access_type: 'offline', // required to receive a refresh token
      prompt: 'consent',
      include_granted_scopes: 'false',
    })
    return `${AUTH_URL}?${q}`
  }

  async handleOAuthCallback(code: string, state: string, sessionUserId: string): Promise<void> {
    const { clientId, clientSecret } = this.requireConfigured()
    const st = this.repo.takeOAuthState(hmac(this.cfg.DEVICE_TOKEN_PEPPER, state))
    if (!st || st.provider !== this.id) throw new HttpError(400, 'invalid_state', 'OAuth state is invalid or expired. Please start the connection again.')
    // Session binding: the browser finishing the flow must be the user who started it (prevents
    // an attacker from tricking a victim into attaching the victim's Google data to the attacker's account).
    if (st.user_id !== sessionUserId) throw new HttpError(400, 'invalid_state', 'This connection was started by a different account. Please start again.')
    const verifier = this.box.decrypt(st.code_verifier_enc, `pkce:${st.user_id}`)
    const token = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: this.cfg.GOOGLE_HEALTH_REDIRECT_URI,
      client_id: clientId,
      client_secret: clientSecret,
    })
    const granted = (token.scope ?? '').split(' ').filter(Boolean)
    const missing = this.scopes.filter((s) => !granted.includes(s))
    this.saveTokens(st.user_id, token)
    this.repo.audit(st.user_id, 'provider.connect', `google-health; missing scopes: ${missing.length}`)
    if (missing.length) this.log.info({ provider: this.id, missingScopes: missing.length }, 'user granted a subset of scopes')
  }

  private saveTokens(userId: string, t: TokenResponse): void {
    const aad = `${userId}:${this.id}`
    this.repo.upsertConnection({
      user_id: userId,
      provider: this.id,
      status: 'connected',
      scopes: t.scope ?? null,
      access_token_enc: this.box.encrypt(t.access_token, aad),
      refresh_token_enc: t.refresh_token ? this.box.encrypt(t.refresh_token, aad) : null,
      token_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    })
  }

  private async tokenRequest(form: Record<string, string>): Promise<TokenResponse> {
    const { data } = await getJson<TokenResponse>('Google OAuth', TOKEN_URL, {
      fetchImpl: this.fetchImpl,
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    })
    if (!data.access_token) throw new UpstreamError('Google OAuth', null, 'token response without access_token')
    return data
  }

  private async accessToken(userId: string, forceRefresh = false): Promise<string> {
    const c = this.repo.connection(userId, this.id)
    if (!c?.access_token_enc) throw new HttpError(409, 'not_connected', 'Google Health is not connected.')
    const aad = `${userId}:${this.id}`
    const fresh = c.token_expires_at && c.token_expires_at > new Date().toISOString()
    if (fresh && !forceRefresh) return this.box.decrypt(c.access_token_enc, aad)
    if (!c.refresh_token_enc) throw new HttpError(409, 'reconnect_required', 'Google Health session expired. Please reconnect.')
    const { clientId, clientSecret } = this.requireConfigured()
    const token = await this.tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: this.box.decrypt(c.refresh_token_enc, aad),
      client_id: clientId,
      client_secret: clientSecret,
    })
    this.saveTokens(userId, token)
    return token.access_token
  }

  /** Authenticated call with one transparent refresh on 401. */
  private async call<T>(userId: string, url: string, body?: unknown): Promise<T> {
    const doCall = async (token: string) =>
      getJson<T>('Google Health API', url, {
        fetchImpl: this.fetchImpl,
        method: body ? 'POST' : 'GET',
        headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        maxBytes: 20_000_000,
      })
    try {
      return (await doCall(await this.accessToken(userId))).data
    } catch (err) {
      if (err instanceof UpstreamError && err.status === 401) return (await doCall(await this.accessToken(userId, true))).data
      throw err
    }
  }

  private async listAll(userId: string, type: string, filter: string, pageSize: number): Promise<GDataPoint[]> {
    const out: GDataPoint[] = []
    let pageToken = ''
    for (let page = 0; page < 50; page++) {
      const q = new URLSearchParams({ filter, pageSize: String(pageSize) })
      if (pageToken) q.set('pageToken', pageToken)
      const res = await this.call<{ dataPoints?: GDataPoint[]; nextPageToken?: string }>(userId, `${API}/${type}/dataPoints?${q}`)
      out.push(...(res.dataPoints ?? []))
      if (!res.nextPageToken) break
      pageToken = res.nextPageToken
    }
    return out
  }

  private async rollupAll<T>(userId: string, type: string, method: 'rollUp' | 'dailyRollUp', body: Record<string, unknown>): Promise<T[]> {
    const out: T[] = []
    let pageToken = ''
    for (let page = 0; page < 20; page++) {
      const res = await this.call<{ rollupDataPoints?: T[]; nextPageToken?: string }>(userId, `${API}/${type}/dataPoints:${method}`, {
        ...body,
        ...(pageToken ? { pageToken } : {}),
      })
      out.push(...(res.rollupDataPoints ?? []))
      if (!res.nextPageToken) break
      pageToken = res.nextPageToken
    }
    return out
  }

  async sync(userId: string, start: Date, end: Date): Promise<SyncResult> {
    const notes: string[] = []
    const maxHrStart = new Date(end.getTime() - 14 * 86_400_000)
    const hrStart = start < maxHrStart ? maxHrStart : start
    if (hrStart !== start) notes.push('Heart-rate rollUp is limited to 14 days by the API; older heart-rate data was not requested.')
    const from = ymd(start)
    const to = ymd(new Date(end.getTime() + 86_400_000))
    const dateFilter = (field: string) => `${field}.date >= "${from}" AND ${field}.date < "${to}"`

    const [rhr, hrv, spo2, rr, temp, sleep, exercise, hr, daily] = await Promise.all([
      this.listAll(userId, 'daily-resting-heart-rate', dateFilter('daily_resting_heart_rate'), 1000),
      this.listAll(userId, 'daily-heart-rate-variability', dateFilter('daily_heart_rate_variability'), 1000),
      this.listAll(userId, 'daily-oxygen-saturation', dateFilter('daily_oxygen_saturation'), 1000),
      this.listAll(userId, 'daily-respiratory-rate', dateFilter('daily_respiratory_rate'), 1000),
      this.listAll(userId, 'daily-sleep-temperature-derivations', dateFilter('daily_sleep_temperature_derivations'), 1000),
      this.listAll(userId, 'sleep', `sleep.interval.end_time >= "${start.toISOString()}" AND sleep.interval.end_time < "${end.toISOString()}"`, 25),
      this.listAll(userId, 'exercise', `exercise.interval.civil_start_time >= "${from}" AND exercise.interval.civil_start_time < "${to}"`, 25),
      this.rollupAll<RollupPoint>(userId, 'heart-rate', 'rollUp', {
        range: { startTime: hrStart.toISOString(), endTime: end.toISOString() },
        windowSize: '300s',
        pageSize: 10000,
      }),
      Promise.all(
        (['steps', 'active-energy-burned'] as const).map((t) =>
          this.rollupAll<DailyRollupPoint>(userId, t, 'dailyRollUp', { range: { start: civil(from), end: civil(to) }, windowSizeDays: 1 }),
        ),
      ).then((xs) => xs.flat()),
    ])

    const metrics = [...mapDailyPoints([...rhr, ...hrv, ...spo2, ...rr, ...temp]), ...mapHeartRateRollup(hr), ...mapDailyRollup(daily)]
    const sleeps = mapSleep(sleep)
    const workouts = mapExercise(exercise)
    const saved = this.repo.saveHealthData(userId, this.id, { metrics, sleep: sleeps, workouts })
    this.repo.markSynced(userId, this.id)
    this.log.info({ provider: this.id, counts: { m: saved.metrics, s: saved.sleep, w: saved.workouts } }, 'sync complete')
    return { provider: this.id, metrics: saved.metrics, sleep: saved.sleep, activity: 0, workouts: saved.workouts, notes }
  }

  async disconnect(userId: string): Promise<void> {
    const c = this.repo.connection(userId, this.id)
    if (c) {
      const aad = `${userId}:${this.id}`
      const token = c.refresh_token_enc ? this.box.decrypt(c.refresh_token_enc, aad) : c.access_token_enc ? this.box.decrypt(c.access_token_enc, aad) : null
      if (token) {
        try {
          // RFC 7009-style revocation; revoking the refresh token also invalidates its access tokens.
          await getJson('Google OAuth revoke', REVOKE_URL, {
            fetchImpl: this.fetchImpl,
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token }).toString(),
          })
        } catch (err) {
          // Still delete locally; the user can also revoke at https://myaccount.google.com/permissions
          this.log.warn({ provider: this.id, reason: (err as Error).message }, 'token revocation failed')
        }
      }
    }
    this.repo.deleteConnection(userId, this.id)
  }
}
