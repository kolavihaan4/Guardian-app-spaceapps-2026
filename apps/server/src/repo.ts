import type { ActivityData, Metric, MetricType, ProviderId, SleepData, Workout } from '@astrovitals/shared'
import { transaction, type Db } from './db.ts'

const now = () => new Date().toISOString()
export const toUtc = (iso: string) => new Date(iso).toISOString()

export interface UserRow {
  id: string
  email: string
  password_hash: string
  demo_mode: number
  created_at: string
}

export interface ConnectionRow {
  user_id: string
  provider: ProviderId
  status: string
  scopes: string | null
  access_token_enc: string | null
  refresh_token_enc: string | null
  token_expires_at: string | null
  connected_at: string
  last_sync_at: string | null
}

type MetricRow = {
  provider: ProviderId
  metric_type: MetricType
  ts: string
  ts_end: string | null
  value: number
  unit: string
  raw_value: number | null
  raw_unit: string | null
  aggregation: Metric['aggregation']
  source_detail: string | null
  device: string | null
  confidence: number | null
  quality: 'ok' | 'out_of_range' | 'implausible'
  quality_note: string | null
}

/** All SQL lives here. Every query is parameterized; every health query is scoped by user_id. */
export class Repo {
  constructor(readonly db: Db) {}

  // ── users ────────────────────────────────────────────────────────────────
  createUser(u: { id: string; email: string; passwordHash: string }): void {
    this.db
      .prepare('INSERT INTO users (id, email, password_hash, demo_mode, created_at) VALUES (?, ?, ?, 1, ?)')
      .run(u.id, u.email, u.passwordHash, now())
  }
  userByEmail(email: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined
  }
  userById(id: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
  }
  setDemoMode(userId: string, on: boolean): void {
    this.db.prepare('UPDATE users SET demo_mode = ? WHERE id = ?').run(on ? 1 : 0, userId)
  }
  deleteUser(userId: string): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId) // cascades to everything
  }

  // ── sessions ─────────────────────────────────────────────────────────────
  createSession(idHash: string, userId: string, expiresAt: string): void {
    this.db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(idHash, userId, now(), expiresAt)
  }
  sessionUser(idHash: string): UserRow | undefined {
    return this.db
      .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?')
      .get(idHash, now()) as UserRow | undefined
  }
  deleteSession(idHash: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash)
  }
  deleteUserSessions(userId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  }

  // ── OAuth state (CSRF + PKCE) ──────────────────────────────────────────────
  saveOAuthState(s: { stateHash: string; userId: string; provider: ProviderId; verifierEnc: string; expiresAt: string }): void {
    this.db
      .prepare('INSERT INTO oauth_states (state_hash, user_id, provider, code_verifier_enc, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(s.stateHash, s.userId, s.provider, s.verifierEnc, s.expiresAt)
  }
  /** Single use: the row is deleted whether or not it is still valid. */
  takeOAuthState(stateHash: string): { user_id: string; provider: ProviderId; code_verifier_enc: string; expires_at: string } | undefined {
    const row = this.db.prepare('SELECT * FROM oauth_states WHERE state_hash = ?').get(stateHash) as
      | { user_id: string; provider: ProviderId; code_verifier_enc: string; expires_at: string }
      | undefined
    this.db.prepare('DELETE FROM oauth_states WHERE state_hash = ?').run(stateHash)
    if (!row || row.expires_at <= now()) return undefined
    return row
  }

  // ── provider connections ───────────────────────────────────────────────────
  upsertConnection(c: Omit<ConnectionRow, 'connected_at' | 'last_sync_at'>): void {
    this.db
      .prepare(
        `INSERT INTO provider_connections (user_id, provider, status, scopes, access_token_enc, refresh_token_enc, token_expires_at, connected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, provider) DO UPDATE SET status = excluded.status, scopes = excluded.scopes,
           access_token_enc = excluded.access_token_enc,
           refresh_token_enc = COALESCE(excluded.refresh_token_enc, provider_connections.refresh_token_enc),
           token_expires_at = excluded.token_expires_at`,
      )
      .run(c.user_id, c.provider, c.status, c.scopes, c.access_token_enc, c.refresh_token_enc, c.token_expires_at, now())
  }
  connection(userId: string, provider: ProviderId): ConnectionRow | undefined {
    return this.db.prepare('SELECT * FROM provider_connections WHERE user_id = ? AND provider = ?').get(userId, provider) as
      | ConnectionRow
      | undefined
  }
  connections(userId: string): ConnectionRow[] {
    return this.db.prepare('SELECT * FROM provider_connections WHERE user_id = ?').all(userId) as unknown as ConnectionRow[]
  }
  markSynced(userId: string, provider: ProviderId): void {
    this.db.prepare('UPDATE provider_connections SET last_sync_at = ? WHERE user_id = ? AND provider = ?').run(now(), userId, provider)
  }
  deleteConnection(userId: string, provider: ProviderId): void {
    this.db.prepare('DELETE FROM provider_connections WHERE user_id = ? AND provider = ?').run(userId, provider)
  }

  // ── device tokens (HealthKit companion app) ───────────────────────────────
  createDeviceToken(t: { id: string; userId: string; tokenHash: string; label: string }): void {
    this.db.prepare('INSERT INTO device_tokens (id, user_id, token_hash, label, created_at) VALUES (?, ?, ?, ?, ?)').run(t.id, t.userId, t.tokenHash, t.label, now())
  }
  userForDeviceToken(tokenHash: string): string | undefined {
    const row = this.db.prepare('SELECT id, user_id FROM device_tokens WHERE token_hash = ?').get(tokenHash) as { id: string; user_id: string } | undefined
    if (!row) return undefined
    this.db.prepare('UPDATE device_tokens SET last_used_at = ? WHERE id = ?').run(now(), row.id)
    return row.user_id
  }
  deviceTokens(userId: string): { id: string; label: string; created_at: string; last_used_at: string | null }[] {
    return this.db.prepare('SELECT id, label, created_at, last_used_at FROM device_tokens WHERE user_id = ? ORDER BY created_at').all(userId) as never
  }
  deleteDeviceToken(userId: string, id: string): boolean {
    return Number(this.db.prepare('DELETE FROM device_tokens WHERE user_id = ? AND id = ?').run(userId, id).changes) > 0
  }
  deleteDeviceTokens(userId: string): void {
    this.db.prepare('DELETE FROM device_tokens WHERE user_id = ?').run(userId)
  }

  // ── health data store ─────────────────────────────────────────────────────
  /** Idempotent: re-importing the same records updates instead of duplicating. */
  saveHealthData(userId: string, provider: ProviderId, data: { metrics?: Metric[]; sleep?: SleepData[]; workouts?: Workout[] }): {
    metrics: number
    sleep: number
    workouts: number
  } {
    const ingested = now()
    const m = this.db.prepare(
      `INSERT INTO metrics (user_id, provider, metric_type, ts, ts_utc, ts_end, value, unit, raw_value, raw_unit, aggregation,
         source_detail, device, confidence, quality, quality_note, ingested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, provider, metric_type, ts, aggregation) DO UPDATE SET value = excluded.value, unit = excluded.unit,
         raw_value = excluded.raw_value, raw_unit = excluded.raw_unit, ts_end = excluded.ts_end, quality = excluded.quality,
         quality_note = excluded.quality_note, ingested_at = excluded.ingested_at`,
    )
    const s = this.db.prepare(
      `INSERT INTO sleep_sessions (user_id, provider, start_ts, end_ts, start_utc, minutes_asleep, minutes_awake, stages_json, external_id,
         source_detail, device, ingested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, provider, start_ts) DO UPDATE SET end_ts = excluded.end_ts, minutes_asleep = excluded.minutes_asleep,
         minutes_awake = excluded.minutes_awake, stages_json = excluded.stages_json, ingested_at = excluded.ingested_at`,
    )
    const w = this.db.prepare(
      `INSERT INTO workouts (user_id, provider, start_ts, end_ts, start_utc, activity_type, display_name, energy_kcal, avg_heart_rate,
         distance_m, source_detail, ingested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, provider, start_ts) DO UPDATE SET end_ts = excluded.end_ts, energy_kcal = excluded.energy_kcal,
         avg_heart_rate = excluded.avg_heart_rate, distance_m = excluded.distance_m, ingested_at = excluded.ingested_at`,
    )
    return transaction(this.db, () => {
      for (const x of data.metrics ?? []) {
        if (x.simulated) throw new Error('Refusing to persist simulated data')
        m.run(userId, provider, x.metricType, x.timestamp, toUtc(x.timestamp), x.endTimestamp ?? null, x.value, x.unit,
          x.raw?.value ?? null, x.raw?.unit ?? null, x.aggregation, x.sourceDetail ?? null, x.device ?? null, x.confidence ?? null,
          x.quality?.status ?? 'ok', x.quality?.note ?? null, ingested)
      }
      for (const x of data.sleep ?? []) {
        if (x.simulated) throw new Error('Refusing to persist simulated data')
        s.run(userId, provider, x.start, x.end, toUtc(x.start), x.minutesAsleep, x.minutesAwake ?? null, JSON.stringify(x.stages),
          x.externalId ?? null, x.sourceDetail ?? null, x.device ?? null, ingested)
      }
      for (const x of data.workouts ?? []) {
        if (x.simulated) throw new Error('Refusing to persist simulated data')
        w.run(userId, provider, x.start, x.end, toUtc(x.start), x.activityType, x.displayName, x.energyKcal ?? null,
          x.averageHeartRate ?? null, x.distanceMeters ?? null, x.sourceDetail ?? null, ingested)
      }
      return { metrics: data.metrics?.length ?? 0, sleep: data.sleep?.length ?? 0, workouts: data.workouts?.length ?? 0 }
    })
  }

  metrics(userId: string, fromIso: string, toIso: string, types?: MetricType[]): Metric[] {
    const typeFilter = types?.length ? `AND metric_type IN (${types.map(() => '?').join(',')})` : ''
    const rows = this.db
      .prepare(
        `SELECT provider, metric_type, ts, ts_end, value, unit, raw_value, raw_unit, aggregation, source_detail, device, confidence,
                quality, quality_note
         FROM metrics WHERE user_id = ? AND ts_utc >= ? AND ts_utc < ? ${typeFilter} ORDER BY ts_utc`,
      )
      .all(userId, toUtc(fromIso), toUtc(toIso), ...(types ?? [])) as unknown as MetricRow[]
    return rows.map((r) => ({
      timestamp: r.ts,
      ...(r.ts_end ? { endTimestamp: r.ts_end } : {}),
      metricType: r.metric_type,
      value: r.value,
      unit: r.unit,
      source: r.provider,
      ...(r.source_detail ? { sourceDetail: r.source_detail } : {}),
      ...(r.device ? { device: r.device } : {}),
      ...(r.confidence !== null ? { confidence: r.confidence } : {}),
      aggregation: r.aggregation,
      ...(r.raw_value !== null && r.raw_unit ? { raw: { value: r.raw_value, unit: r.raw_unit } } : {}),
      simulated: false,
      quality: { status: r.quality, ...(r.quality_note ? { note: r.quality_note } : {}) },
    }))
  }

  sleep(userId: string, fromIso: string, toIso: string): SleepData[] {
    const rows = this.db
      .prepare('SELECT * FROM sleep_sessions WHERE user_id = ? AND start_utc >= ? AND start_utc < ? ORDER BY start_utc')
      .all(userId, toUtc(fromIso), toUtc(toIso)) as Record<string, unknown>[]
    return rows.map((r) => ({
      start: r.start_ts as string,
      end: r.end_ts as string,
      minutesAsleep: r.minutes_asleep as number,
      ...(r.minutes_awake !== null ? { minutesAwake: r.minutes_awake as number } : {}),
      stages: JSON.parse(r.stages_json as string),
      ...(r.external_id ? { externalId: r.external_id as string } : {}),
      source: r.provider as ProviderId,
      ...(r.source_detail ? { sourceDetail: r.source_detail as string } : {}),
      ...(r.device ? { device: r.device as string } : {}),
      simulated: false,
    }))
  }

  workouts(userId: string, fromIso: string, toIso: string): Workout[] {
    const rows = this.db
      .prepare('SELECT * FROM workouts WHERE user_id = ? AND start_utc >= ? AND start_utc < ? ORDER BY start_utc')
      .all(userId, toUtc(fromIso), toUtc(toIso)) as Record<string, unknown>[]
    return rows.map((r) => ({
      start: r.start_ts as string,
      end: r.end_ts as string,
      activityType: r.activity_type as string,
      displayName: r.display_name as string,
      ...(r.energy_kcal !== null ? { energyKcal: r.energy_kcal as number } : {}),
      ...(r.avg_heart_rate !== null ? { averageHeartRate: r.avg_heart_rate as number } : {}),
      ...(r.distance_m !== null ? { distanceMeters: r.distance_m as number } : {}),
      source: r.provider as ProviderId,
      ...(r.source_detail ? { sourceDetail: r.source_detail as string } : {}),
      simulated: false,
    }))
  }

  deleteProviderData(userId: string, provider: ProviderId): void {
    transaction(this.db, () => {
      for (const t of ['metrics', 'sleep_sessions', 'workouts']) {
        this.db.prepare(`DELETE FROM ${t} WHERE user_id = ? AND provider = ?`).run(userId, provider)
      }
    })
  }

  deleteAllHealthData(userId: string): void {
    transaction(this.db, () => {
      for (const t of ['metrics', 'sleep_sessions', 'workouts']) this.db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId)
    })
  }

  /** Retention job. Returns rows deleted per table. */
  purgeHealthDataBefore(cutoffIso: string): Record<string, number> {
    const cutoff = toUtc(cutoffIso)
    return transaction(this.db, () => ({
      metrics: Number(this.db.prepare('DELETE FROM metrics WHERE ts_utc < ?').run(cutoff).changes),
      sleep_sessions: Number(this.db.prepare('DELETE FROM sleep_sessions WHERE start_utc < ?').run(cutoff).changes),
      workouts: Number(this.db.prepare('DELETE FROM workouts WHERE start_utc < ?').run(cutoff).changes),
      sessions: Number(this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now()).changes),
      oauth_states: Number(this.db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(now()).changes),
    }))
  }

  // ── audit (no health values, ever) ─────────────────────────────────────────
  audit(userId: string | null, action: string, detail?: string): void {
    this.db.prepare('INSERT INTO audit_log (user_id, action, detail, created_at) VALUES (?, ?, ?, ?)').run(userId, action, detail ?? null, now())
  }

  // ── NASA cache (public data only) ───────────────────────────────────────────
  cacheGet(key: string): { body: string; fetched_at: string; expires_at: string } | undefined {
    return this.db.prepare('SELECT body, fetched_at, expires_at FROM nasa_cache WHERE cache_key = ?').get(key) as never
  }
  cachePut(key: string, body: string, ttlSeconds: number): string {
    const fetched = now()
    const expires = new Date(Date.now() + ttlSeconds * 1000).toISOString()
    this.db
      .prepare('INSERT INTO nasa_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (cache_key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at')
      .run(key, body, fetched, expires)
    return fetched
  }
}

/** Daily activity derived from step/energy metrics; per provider, daily aggregates win over summed intervals. */
export function deriveActivity(metrics: Metric[]): ActivityData[] {
  type Acc = { daily: Partial<Record<'steps' | 'active_energy', number>>; summed: Partial<Record<'steps' | 'active_energy', number>>; simulated: boolean }
  const byKey = new Map<string, Acc>()
  for (const m of metrics) {
    if (m.metricType !== 'steps' && m.metricType !== 'active_energy') continue
    if (m.quality?.status === 'implausible') continue
    const key = `${m.source}|${m.simulated ? 1 : 0}|${m.timestamp.slice(0, 10)}`
    const acc = byKey.get(key) ?? { daily: {}, summed: {}, simulated: m.simulated }
    const bucket = m.aggregation === 'daily' ? acc.daily : acc.summed
    bucket[m.metricType] = (bucket[m.metricType] ?? 0) + m.value
    byKey.set(key, acc)
  }
  const out: ActivityData[] = []
  for (const [key, acc] of byKey) {
    const [source, , date] = key.split('|') as [ProviderId, string, string]
    const steps = acc.daily.steps ?? acc.summed.steps
    const kcal = acc.daily.active_energy ?? acc.summed.active_energy
    out.push({
      date,
      source,
      simulated: acc.simulated,
      ...(steps !== undefined ? { steps: Math.round(steps) } : {}),
      ...(kcal !== undefined ? { activeEnergyKcal: Math.round(kcal) } : {}),
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source))
}
