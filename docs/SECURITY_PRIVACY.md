# Security & privacy

AstroVitals handles consumer health data. This page lists every control the prototype implements,
where it lives in the code, and what a production deployment still needs. It is not legal advice.

## Controls implemented

| Area | Control | Where |
|---|---|---|
| Secrets | All secrets come from environment variables, validated at startup (process exits with a clear message if missing/malformed). Nothing secret is bundled into the web app. | `apps/server/src/config.ts`, `.env.example` |
| Token storage | OAuth access/refresh tokens and PKCE verifiers encrypted with **AES-256-GCM** (random 96-bit IV, auth tag, versioned `v1.` envelope, AAD binds each ciphertext to its user + provider row). | `lib/crypto.ts` (`SecretBox`), `googleHealth.ts` |
| Hashed identifiers | Session ids, OAuth `state` values and companion device tokens are stored only as HMAC-SHA256 (keyed by `DEVICE_TOKEN_PEPPER`), so a database leak alone cannot replay them. | `auth.ts`, `routes/providers.ts` |
| Passwords | Held by Supabase Auth, never by this server; ≥ 8 characters, checked in the page before sending and by Supabase. | `public/home/js/auth.js` |
| OAuth 2.0 | Authorization code + **PKCE S256**, single-use 10-minute `state`, **session binding** (the user who completes the callback must be the user who started it), exact redirect URI, `access_type=offline` for refresh, server-side token exchange, read-only least-privilege scopes, revocation on disconnect / account deletion. | `wearables/providers/googleHealth.ts` |
| Sessions | Supabase access tokens sent as `Authorization: Bearer`; the server verifies each with Supabase (`/auth/v1/user`), caching good answers 60 s by a hash of the token, never the token. | `auth.ts` |
| CSRF | Bearer tokens are not sent by the browser on its own; a strict `Origin`/`Referer` check on every state-changing request remains as a second line. | `auth.ts` (`requireSameOrigin`) |
| AuthZ | Every health query is scoped by `user_id`; all health and NASA routes require a session; ingest requires a device token. | `repo.ts`, `app.ts` |
| Input validation | Zod schemas for env, params, query, bodies and the ingest payload (`.strict()`, size caps); body limits 100 KB (5 MB ingest); XML import streamed with type checks. Validation errors never echo values. | `auth.ts` `parse()`, routes |
| SSRF | Upstream hosts are fixed configuration; user input only supplies validated dates, numbers and a slug. | `nasa/service.ts`, `lib/http.ts` |
| Headers | helmet: CSP (`default-src 'self'`, images only from NASA hosts, `frame-ancestors 'none'`), `nosniff`, `Referrer-Policy: no-referrer`, HSTS in production, no `X-Powered-By`. | `app.ts` |
| Rate limiting | API, auth and ingest limiters. | `app.ts` |
| Logging | Request logs contain method, **path without query string**, status, duration. pino redaction for cookies, auth headers, tokens, codes, emails, values. Errors log class + stack location only. A test asserts that emails, passwords, OAuth codes, tokens and health values never reach the log stream. | `lib/logger.ts`, `app.ts`, `test/api.test.ts` |
| Minimization | Only the metrics the dashboard displays are stored; unsupported HealthKit types are counted, not stored; Apple export import limited to a chosen window; POWER coordinates rounded to 0.5° before leaving the server; no location is stored for the user. | providers, `nasa/service.ts` |
| Retention | Hourly job deletes measurements older than `RETENTION_DAYS` (default 90) and expired sessions/OAuth states. | `retention.ts` |
| User control | Disconnect (revoke + delete provider data), revoke device tokens, delete all health data, export all data (JSON), delete account (cascade). | `routes/me.ts`, `routes/providers.ts`, Privacy page |
| Demo separation | Simulated data is generated per request, flagged `simulated: true`, never persisted (the store throws), drawn dashed with SIMULATED badges, never merged into a real series. | `providers/demo.ts`, `repo.ts`, web |
| No diagnosis | Out-of-range values are flagged as **data-quality** issues with sensor/sync wording; correlations are labelled exploratory with explicit caveats; medical disclaimer on every page. | `shared/quality.ts`, `shared/correlation.ts`, web |
| Errors | Upstream failures return a generic 502; upstream bodies (which could contain user data) are never forwarded or logged. | `app.ts`, `lib/http.ts` |

## Assumptions / still needed for production

- **TLS everywhere.** Run behind HTTPS; set `NODE_ENV=production`, an `https://` `APP_ORIGIN`
  (enforced at startup) and `TRUST_PROXY=1` behind a proxy.
- **Key management.** Keep `TOKEN_ENCRYPTION_KEY` / `DEVICE_TOKEN_PEPPER` in a secrets manager or
  KMS; add key rotation (the `v1.` prefix exists for this). Back up the key separately from the DB.
- **Database.** Move to managed Postgres with encryption at rest and backups that honour deletion.
- **Accounts.** Add email verification, password reset, MFA, account lockout.
- **Platform policies.** Google Health restricted scopes need OAuth verification + CASA assessment
  beyond 100 users; Apple App Review Guideline 5.1.3 for the companion app; Google Play health
  declaration for an Android companion. Publish a privacy policy.
- **Regulation.** A consumer wellness app is generally outside HIPAA, but the FTC Health Breach
  Notification Rule, GDPR Art. 9 (explicit consent for health data), Washington's My Health My Data
  Act and similar laws can apply depending on users and deployment — get qualified review before
  real users. The consent checkbox at sign-up is a prototype placeholder, not a compliance artefact.
- **Monitoring.** Alert on auth failures, 5xx spikes and retention-job failures — without adding
  health values to telemetry.
- `npm audit` was clean (0 vulnerabilities) at creation time; keep dependencies patched.

## Reporting

This is a hackathon prototype. Do not connect real users' data on a public deployment until the
production items above are done.
