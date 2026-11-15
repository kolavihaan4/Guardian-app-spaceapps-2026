# REST API

Base: same origin as the web app (`/api`). JSON in/out. Cookie-authenticated routes require the
`av_session` cookie (`__Host-av_session` in production); state-changing requests must carry an
`Origin` (or `Referer`) equal to `APP_ORIGIN`. Errors: `{ "error": "<code>", "message": "…", "details"?: […] }`.
Validation errors list paths and messages but never echo submitted values.

## Auth
| Method & path | Body | Notes |
|---|---|---|
| `POST /api/auth/register` | `{ email, password }` (≥ 12 chars) | 201 + session cookie |
| `POST /api/auth/login` | `{ email, password }` | timing-equalized for unknown emails |
| `POST /api/auth/logout` | – | deletes the session |

Rate limits: 30 auth requests / 15 min / IP; 300 API requests / min / IP; 60 ingest requests / min / IP.

## Account & privacy
| Method & path | Notes |
|---|---|
| `GET /api/me` | `MeResponse`: user, provider statuses (availability + honest notes), retention days |
| `PATCH /api/me/settings` | `{ demoMode: boolean }` |
| `GET /api/me/export` | JSON download of all stored health data + connection metadata (never tokens) |
| `DELETE /api/me/data` | delete all stored wearable data |
| `DELETE /api/me` | `{ "confirm": "DELETE" }` — revokes OAuth grants, deletes everything (cascade) |

## Vitals
`GET /api/vitals?from=<ISO>&to=<ISO>` (default last 7 days, max 90) → `VitalsResponse`
`{ from, to, metrics: Metric[], sleep: SleepData[], activity: ActivityData[], workouts: Workout[], sources: [{ provider, simulated, metrics, sleep, activity, workouts }] }`.

## Providers
| Method & path | Notes |
|---|---|
| `GET /api/providers` | statuses |
| `POST /api/providers/:id/connect` | OAuth providers → `{ url }` to navigate to; 409 if not configured |
| `GET /api/providers/:id/callback?code&state` | OAuth redirect target → 303 to `/#/connections?provider=…&status=connected\|denied\|error\|signed_out` |
| `POST /api/providers/:id/sync` | `{ days?: 1–30 }` → `SyncResult` |
| `DELETE /api/providers/:id` | revoke (OAuth) + delete tokens + delete that provider's data |
| `POST /api/providers/apple-health-export/import?days=N` | raw `export.xml` body, `Content-Type: application/xml`; streamed → `ImportResult`. `days` larger than `RETENTION_DAYS` is trimmed to it (a note says so), not rejected |
| `GET/POST /api/providers/healthkit-companion/tokens` | list / create (`{ label }` → token shown once) |
| `DELETE /api/providers/healthkit-companion/tokens/:id` | revoke one token |

## Companion ingest (no cookie; bearer device token)
`POST /api/ingest/healthkit` with `Authorization: Bearer <token>`, body ≤ 5 MB:

```json
{
  "samples": [{ "type": "HKQuantityTypeIdentifierHeartRate", "value": 62, "unit": "count/min",
                "start": "2026-10-04T08:00:00-05:00", "end": "2026-10-04T08:00:00-05:00",
                "sourceName": "Apple Watch", "device": "Apple Watch (Watch7,4)" }],
  "sleep":   [{ "value": "HKCategoryValueSleepAnalysisAsleepDeep", "start": "…", "end": "…", "sourceName": "Apple Watch" }],
  "workouts":[{ "activityType": "Running", "start": "…", "end": "…", "energyKcal": 331.2, "averageHeartRate": 149, "distanceMeters": 5210 }]
}
```
Limits: 5,000 samples, 2,000 sleep segments, 500 workouts per request; unknown fields rejected;
unknown sample types reported back in `unsupportedTypes`.

## NASA (authenticated; proxied + cached)
| Method & path | Params | Upstream |
|---|---|---|
| `GET /api/nasa/space-weather` | `from`, `to` (YYYY-MM-DD, ≤ 90 days, default 30) | DONKI FLR, GST, CME, SEP |
| `GET /api/nasa/earth-events` | `days` 1–60, `limit` 1–100, `status` open\|closed\|all, `category` | EONET v3 |
| `GET /api/nasa/apod` | `date` (1995-06-16 … today) | APOD (new API, legacy fallback) |
| `GET /api/nasa/environment` | `lat`, `lon`, `from`, `to` (≤ 366 days) | POWER daily point |
| `GET /api/nasa/radiation` | – | NOAA SWPC GOES integral protons (24 h, ≥10 and ≥100 MeV) + NOAA scales → `RadiationStatus` |

Response: `{ data, source, fetchedAt, stale, notes? }`. Upstream failure with nothing cached → 502
`upstream_unavailable` (upstream bodies are never forwarded).

## Datasets (authenticated; bundled, no upstream call)
`GET /api/datasets/osd-575` → `BaselineDatasetResponse`: NASA OSDR OSD-575 (Inspiration4 comprehensive
metabolic panel, CC0-1.0, DOI 10.26030/mc5d-p710). For each of 17 measurements and each crew member:
the preflight readings and their **median** (the baseline), and every post-flight reading with absolute
and % change from it and `sourceRange` (`within` / `below` / `above` the lab's range, `no_range`,
`no_reading`), plus per-measurement `notices` (`limited_baseline`, `no_baseline`, `missing_reading`,
`range_changed`), the `featured` five for the overview, caveats and excluded columns.

## Health check
`GET /api/health` → `{ ok: true }` (no auth).
