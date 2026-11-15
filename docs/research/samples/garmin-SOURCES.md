# Garmin sample sources (accessed 2026-10-05)

No Garmin user data was accessed. The Garmin Connect Developer Program is approval-only and the application form is offline, so **no authenticated Health API call could be made**. The files here are therefore (a) verbatim examples copied from Garmin's official OAuth2 PKCE specification PDF and (b) real, unauthenticated responses from Garmin's live hosts.

| File | Kind | Source (official) | Notes |
|---|---|---|---|
| `garmin-oauth2-token.json` | Doc example, verbatim | https://developerportal.garmin.com/sites/default/files/OAuth2PKCE_1.pdf, "STEP 2: Access Token Request", Response | Copied exactly as printed. The PDF omits the comma after the `refresh_token` line, so the file is **not valid JSON as printed**; values were not edited. |
| `garmin-oauth2-refresh.json` | Doc example, verbatim | same PDF, "Refresh Token", Response | Valid JSON. |
| `garmin-user-id.json` | Doc example, verbatim | same PDF, "User ID" (`GET https://apis.garmin.com/wellness-api/rest/user/id`) | Valid JSON. |
| `garmin-user-permissions.json` | Doc example, verbatim | same PDF, "User Permission endpoint" (`GET https://apis.garmin.com/wellness-api/rest/user/permissions`) | Copied exactly as printed (`{[ ... ]}`), which is **not valid JSON**; Garmin's PDF prints it this way. Permission names are the authoritative part. |
| `garmin-live-user-id-unauthenticated.json` | Real live response | `GET https://apis.garmin.com/wellness-api/rest/user/id` with no Authorization header -> HTTP 400 | Body copied as received. |
| `garmin-live-token-unauthenticated.json` | Real live response | `POST https://diauth.garmin.com/di-oauth2-service/oauth/token` with empty form body -> HTTP 401 | Body copied as received. |
| `garmin-live-checks.json` | Real measurements | curl status/latency for each official page and host listed inside | Researcher's own measurements, no credentials. |

Not included on purpose: Health API summary payloads (dailies, epochs, sleeps, etc.). Their schema lives in the "Health REST API Specification" PDF that is only served to logged-in portal users (`https://developerportal.garmin.com/developer-programs/programs-docs` -> HTTP 403 "You are not authorized to access this page"). No public official page prints a summary payload, so none was copied.
