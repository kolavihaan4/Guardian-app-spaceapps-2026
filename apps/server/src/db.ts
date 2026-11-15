import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Schema. Design notes:
 *  - Health data (metrics, sleep_sessions, workouts) is keyed by user and provider so
 *    disconnecting a provider deletes exactly its data.
 *  - Simulated (DEMO) data is never written here; it is generated per request.
 *  - Secrets are stored encrypted (tokens, PKCE verifiers) or as HMACs (session ids,
 *    device tokens). Nothing in this file is reversible to a usable credential
 *    without TOKEN_ENCRYPTION_KEY / DEVICE_TOKEN_PEPPER.
 *  - `raw_value`/`raw_unit` preserve the original measurement when normalized.
 *  - ON DELETE CASCADE from users makes account deletion complete.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    demo_mode     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id_hash    TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE provider_connections (
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider          TEXT NOT NULL,
    status            TEXT NOT NULL,            -- 'connected' | 'error'
    scopes            TEXT,                     -- space-separated, as granted
    access_token_enc  TEXT,
    refresh_token_enc TEXT,
    token_expires_at  TEXT,
    connected_at      TEXT NOT NULL,
    last_sync_at      TEXT,
    PRIMARY KEY (user_id, provider)
  );

  CREATE TABLE oauth_states (
    state_hash        TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider          TEXT NOT NULL,
    code_verifier_enc TEXT NOT NULL,
    expires_at        TEXT NOT NULL
  );

  CREATE TABLE device_tokens (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,
    label        TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    last_used_at TEXT
  );

  CREATE TABLE metrics (
    id            INTEGER PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL,
    metric_type   TEXT NOT NULL,
    ts            TEXT NOT NULL,                -- original timestamp (ISO 8601, as reported, with offset)
    ts_utc        TEXT NOT NULL,                -- same instant normalized to UTC, for range queries
    ts_end        TEXT,
    value         REAL NOT NULL,                -- canonical unit
    unit          TEXT NOT NULL,
    raw_value     REAL,                         -- original value if converted
    raw_unit      TEXT,
    aggregation   TEXT NOT NULL,
    source_detail TEXT,
    device        TEXT,
    confidence    REAL,
    quality       TEXT NOT NULL DEFAULT 'ok',
    quality_note  TEXT,
    ingested_at   TEXT NOT NULL,
    UNIQUE (user_id, provider, metric_type, ts, aggregation)
  );
  CREATE INDEX metrics_lookup ON metrics(user_id, metric_type, ts_utc);

  CREATE TABLE sleep_sessions (
    id             INTEGER PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider       TEXT NOT NULL,
    start_ts       TEXT NOT NULL,
    end_ts         TEXT NOT NULL,
    start_utc      TEXT NOT NULL,
    minutes_asleep REAL NOT NULL,
    minutes_awake  REAL,
    stages_json    TEXT NOT NULL,
    external_id    TEXT,
    source_detail  TEXT,
    device         TEXT,
    ingested_at    TEXT NOT NULL,
    UNIQUE (user_id, provider, start_ts)
  );

  CREATE TABLE workouts (
    id               INTEGER PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         TEXT NOT NULL,
    start_ts         TEXT NOT NULL,
    end_ts           TEXT NOT NULL,
    start_utc        TEXT NOT NULL,
    activity_type    TEXT NOT NULL,
    display_name     TEXT NOT NULL,
    energy_kcal      REAL,
    avg_heart_rate   REAL,
    distance_m       REAL,
    source_detail    TEXT,
    ingested_at      TEXT NOT NULL,
    UNIQUE (user_id, provider, start_ts)
  );

  -- Operational audit trail: who did what, never health values.
  CREATE TABLE audit_log (
    id         INTEGER PRIMARY KEY,
    user_id    TEXT,
    action     TEXT NOT NULL,
    detail     TEXT,
    created_at TEXT NOT NULL
  );

  -- Cache of public NASA responses (no personal data).
  CREATE TABLE nasa_cache (
    cache_key  TEXT PRIMARY KEY,
    body       TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  `,
]

export type Db = DatabaseSync

export function openDatabase(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  migrate(db)
  return db
}

export function migrate(db: Db): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null }
  const current = row.v ?? 0
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[i]!)
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
