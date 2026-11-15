# Research notes (2026-10-05)

Raw, cited research produced while building the prototype. These are working notes: the curated,
cross-checked conclusions are in [`../NASA_APIS.md`](../NASA_APIS.md) and [`../WEARABLES.md`](../WEARABLES.md).

| File | Content |
|---|---|
| `challenge.md` | The 2026 challenge page, Space Apps FAQ/rules/judging context, implications for the build |
| `nasa-open-apis.md` | api.nasa.gov: keys, DEMO_KEY vs registered limits, headers, catalog, deprecations |
| `apod.md` | APOD legacy vs new WordPress endpoint, fields, errors, attribution |
| `eonet.md` | EONET v3 endpoints, params, fields, rate-limit headers, coordinate quirks |
| `power.md` | NASA POWER endpoints, parameters, latency, fill values, guidance |
| `samples/` | Real API responses captured that day (NASA, NOAA SWPC, OSDR, EPIC, Images), Apple docs JSON, Garmin doc examples, and the Google Health API v4 discovery document |

Not covered by a finished report (the automated research run was interrupted by a usage limit):
DONKI, Fitbit/Google Health, HealthKit, Health Connect, Garmin, other wearables, security law.
Those topics were verified manually instead — see the source columns in `../WEARABLES.md` and
`../NASA_APIS.md`.

**Important finding in `challenge.md`:** the Space Apps FAQ states that full challenge statements
are released on October 28 and that *"Teams are not allowed to begin working on the challenges prior
to the hackathon"* (November 14–15, 2026). Check the current rules before submitting work started
earlier.
