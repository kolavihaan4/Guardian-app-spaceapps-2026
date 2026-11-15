# NASA Open APIs (api.nasa.gov umbrella) — research report

Research date: 2026-10-05 (all URLs below were opened on this date). Topic: the api.nasa.gov umbrella — key signup, DEMO_KEY vs registered-key limits, rate-limit headers and errors, the hosted API catalog, terms/attribution. Live calls were limited to two api.nasa.gov requests (shared per-IP DEMO_KEY budget); keyless hosts were called freely.

## Overview

| Item | Finding | Source |
|---|---|---|
| What api.nasa.gov is | "Welcome to the NASA API portal. The objective of this site is to make NASA data, including imagery, eminently accessible to application developers. This catalog focuses on broadly useful and user friendly APIs and does not hold every NASA API." | https://api.nasa.gov/assets/html/overview.html (accessed 2026-10-05) |
| What the site does / does not hold | "this page acts as a central catalog and key service for public APIs. It does not hold the actual API code. For bugs in the APIs, please look for a link to the individual API pages and reach out there. For a problem in this page, please add an issue or pull request to the GitHub repository" (link: https://github.com/nasa/api-docs) | https://api.nasa.gov/assets/html/browseAPI.html (accessed 2026-10-05) |
| Gateway technology | Every api.nasa.gov response carries `Via: ... api-umbrella (ApacheTrafficServer ...)` and `X-Api-Umbrella-Request-Id`; the signup form is loaded from `https://api.data.gov/static/javascripts/signup_embed.js`. api.nasa.gov is therefore an api.data.gov / API Umbrella deployment, and the api.data.gov developer manual describes the generic behaviour (keys, limits, error codes). | Live headers (this report, "Rate limits"); https://api.nasa.gov/ page source (accessed 2026-10-05); https://api.data.gov/docs/developer-manual/ (accessed 2026-10-05) |
| Catalog size | `assets/json/apis.json` lists exactly 16 APIs (see "Base URL and endpoints"). The catalog no longer contains an "Earth" or "Mars Rover Photos" entry. | https://api.nasa.gov/assets/json/apis.json (accessed 2026-10-05) |
| Current notices (site banner) | "⚠ Please Note: The APOD API has been updated. It now returns information from https://science.nasa.gov/wp-json/wp/v2/apod-basic. The legacy APOD API will be archived on December 1, 2026. Full documentation on the new APOD API can be found here. The Earth API has been archived and replaced with Earthdata GIBS API. The Mars Rover API has also been archived. Please update your bookmarks or projects as needed." | https://api.nasa.gov/assets/html/header.html (accessed 2026-10-05) |
| Why it matters for a space-health dashboard | The umbrella is the single key/quota gateway in front of DONKI (space-weather events), NeoWs (asteroid close approaches), EPIC (whole-Earth imagery with coordinates) and APOD. One registered key, one rolling hourly quota and one set of headers (`X-RateLimit-*`) govern all of them, so the backend proxy design (server-side key, caching, 429 handling) is shared infrastructure for every NASA widget. | https://api.nasa.gov/assets/html/authentication.html (accessed 2026-10-05) |

## Official documentation

| URL | What it is | Accessed |
|---|---|---|
| https://api.nasa.gov/ | Portal shell: `Generate API Key` section with the `apiUmbrellaSignupOptions` config, loads the fragments and `assets/js/APILoader.js` | 2026-10-05 |
| https://api.nasa.gov/assets/html/authentication.html | "Authentication", "Web Service Rate Limits", "DEMO_KEY Rate Limits", "How Do I See My Current Usage?" | 2026-10-05 |
| https://api.nasa.gov/assets/html/overview.html | Portal purpose statement | 2026-10-05 |
| https://api.nasa.gov/assets/html/recoverKey.html | "API Key Recovery" | 2026-10-05 |
| https://api.nasa.gov/assets/html/header.html | Site banner with APOD migration / Earth / Mars Rover archive notices | 2026-10-05 |
| https://api.nasa.gov/assets/html/browseAPI.html | "Browse APIs" section, bug-reporting note, GitHub link | 2026-10-05 |
| https://api.nasa.gov/assets/js/APILoader.js | Shows the catalog is loaded from `assets/json/apis.json` (`name`, `summary`, `html_template` fields) | 2026-10-05 |
| https://api.nasa.gov/assets/json/apis.json | Machine-readable catalog of the 16 APIs (HTTP 200, 166,186 bytes) | 2026-10-05 |
| https://api.nasa.gov/assets/files/apod/APOD-APIs-and-RSS-info.pdf | Linked from the banner as the new APOD documentation (HTTP 200, 315,980 bytes). UNVERIFIED content: the PDF could not be text-extracted in this environment (no poppler; fonts are hex-encoded). The same migration facts are in the APOD catalog entry of apis.json. | 2026-10-05 |
| https://api.data.gov/static/javascripts/signup_embed.js | The signup form implementation embedded by api.nasa.gov (fields, POST target, success text, terms link) | 2026-10-05 |
| https://api.data.gov/docs/developer-manual/ | Platform developer manual: API key usage (3 ways to pass a key), rate limits, DEMO_KEY, headers, 429, general error codes and error body formats | 2026-10-05 |
| https://api.data.gov/docs/rate-limits/ | Meta-refresh redirect (HTTP 200, 285 bytes) to the developer manual | 2026-10-05 |
| https://api.data.gov/docs/agency-manual/ | Platform agency manual: default 1,000/hour, per-API-backend and per-user custom limits, website-backend routing exempt from key/rate limits | 2026-10-05 |
| https://raw.githubusercontent.com/NREL/api-umbrella/main/docs/api-consumer/rate-limits.md | API Umbrella (the open-source gateway) consumer rate-limit doc; same wording as api.data.gov | 2026-10-05 |
| https://www.nasa.gov/nasa-brand-center/images-and-media/ | NASA media usage guidelines (attribution, copyright, insignia) | 2026-10-05 |
| https://science.nasa.gov/wp-json/wp/v2/apod-basic | New APOD endpoint named in the banner; called live (keyless) | 2026-10-05 |

## Base URL and endpoints

Base URL for every hosted API: `https://api.nasa.gov` (HTTPS; the platform returns error `HTTPS_REQUIRED` 400 for non-HTTPS where enforced — https://api.data.gov/docs/developer-manual/ (accessed 2026-10-05)).

### Umbrella-level endpoints (verified live today)

| Method | Path | Purpose | Key required? | Verified live today (HTTP status, latency) | Source |
|---|---|---|---|---|---|
| GET | `https://api.nasa.gov/` | Portal page (HTML shell; static site served through the gateway — headers show `X-Github-Request-Id`, `Via: 1.1 varnish, http/1.1 api-umbrella`) | No | 200, 0.25 s, 4,737 B | live call; https://api.nasa.gov/ (accessed 2026-10-05) |
| GET | `https://api.nasa.gov/assets/html/authentication.html` | Rate-limit documentation fragment | No | 200, 0.35 s, 3,679 B | live call (accessed 2026-10-05) |
| GET | `https://api.nasa.gov/assets/json/apis.json` | Catalog JSON (array of 16 objects) | No | 200, 0.66 s, 166,186 B | live call (accessed 2026-10-05) |
| GET | `https://api.nasa.gov/assets/files/apod/APOD-APIs-and-RSS-info.pdf` | New-APOD documentation PDF | No | 200, 315,980 B, `application/pdf` | live call (accessed 2026-10-05) |
| GET | `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY` | Legacy APOD (archived 2026-12-01 per banner); used here as the canonical umbrella probe | Yes (`api_key`) | 200, 2.58 s; `X-Ratelimit-Limit: 10`, `X-Ratelimit-Remaining: 9` | live call (accessed 2026-10-05) |
| GET | `https://api.nasa.gov/planetary/apod` (no key) | Error-path probe | — | 403, 0.27 s, body `{"error":{"code":"API_KEY_MISSING",...}}` | live call (accessed 2026-10-05) |
| GET | `https://science.nasa.gov/wp-json/wp/v2/apod-basic` | New APOD source (not behind api.nasa.gov) | No key was needed | 200, 0.84 s (`?per_page=2` returned 2 items; `X-WP-Total: 11427`) | live call (accessed 2026-10-05) |
| POST | `https://api.data.gov/api-umbrella/v1/users.json` | Key signup (what the embedded form submits; JSON body, `X-Api-Key` header carrying the embed's own key, `credentials: "omit"`) | Embed key | Not called (UNVERIFIED live) | https://api.data.gov/static/javascripts/signup_embed.js (accessed 2026-10-05); base `https://api.data.gov/` is the constant in that script; the exact `apiUrlRoot` composition is minified, UNVERIFIED |

Why the static assets need no key: "Website backend routing is not subject to our normal API key or rate limiting restrictions" — https://api.data.gov/docs/agency-manual/ (accessed 2026-10-05).

### Catalog: the 16 APIs listed on api.nasa.gov

All rows from https://api.nasa.gov/assets/json/apis.json (accessed 2026-10-05). "Summary" is the catalog's `summary` field verbatim. "Base path" is what the catalog's own `html_template` shows. "Key" = whether the catalog examples carry `api_key` (i.e. the service is proxied through api.nasa.gov). None of these were called live in this task (budget rule) unless stated.

| # | Name | Summary (verbatim) | Base path / example shown in catalog | Key | Notes from catalog text |
|---|---|---|---|---|---|
| 1 | APOD | Astronomy Picture of the Day | New: `GET https://science.nasa.gov/wp-json/wp/v2/apod-basic` (example `.../apod-basic/?api_key=DEMO_KEY`); legacy: `https://api.nasa.gov/planetary/apod` (swagger_data: host `api.nasa.gov`, basePath `/planetary`, path `/apod`) | legacy: yes | "As of September 10, 2026 this API has been migrated to use the new WordPress API ... The legacy APOD API will be taken offline December 1, 2026. You will need to migrate by then." "concept_tags, hd, and thumbs are now disabled in this service." |
| 2 | Asteroids NeoWs | Near Earth Object Web Service | `GET https://api.nasa.gov/neo/rest/v1/feed?start_date=START_DATE&end_date=END_DATE&api_key=API_KEY`; `GET https://api.nasa.gov/neo/rest/v1/neo/{asteroid_id}`; `GET https://api.nasa.gov/neo/rest/v1/neo/browse/` | yes | `end_date` default "7 days after start_date"; lookup by "NASA JPL small body (SPK-ID) ID" |
| 3 | DONKI | Space Weather Database Of Notifications, Knowledge, Information | `https://api.nasa.gov/DONKI/{CME, CMEAnalysis, GST, IPS, FLR, SEP, MPC, RBE, HSS, WSAEnlilSimulations, notifications}?startDate=yyyy-MM-dd&endDate=yyyy-MM-dd&api_key=DEMO_KEY` | yes | Source system: https://ccmc.gsfc.nasa.gov/tools/DONKI/ |
| 4 | EONET | The Earth Observatory Natural Event Tracker | No api.nasa.gov path; links to `http://eonet.gsfc.nasa.gov/docs/v2.1` | no | "prototype web service"; curated natural-event metadata |
| 5 | EPIC | Earth Polychromatic Imaging Camera | `https://api.nasa.gov/EPIC/api/natural/images?api_key=DEMO_KEY`; `.../EPIC/api/natural/date/2019-05-30`; `.../EPIC/api/natural/all`; `.../EPIC/archive/natural/2019/05/30/png/epic_1b_20190530011359.png`; routes `natural`, `natural/date`, `natural/all`, `natural/available`, `enhanced`, `enhanced/date`, `enhanced/all`, `enhanced/available` | yes (via api.nasa.gov) | Metadata per image: "Image [name], Date, Caption, centroid_coordinates, dscovr_j2000_position, lunar_j2000_position, sun_j2000_position, attitude_quaternions"; also links https://epic.gsfc.nasa.gov/about/api |
| 6 | Exoplanet | Programmatic access to NASA's Exoplanet Archive database | `https://exoplanetarchive.ipac.caltech.edu/cgi-bin/nstedAPI/nph-nstedAPI?...` | no | External host (Caltech/IPAC) |
| 7 | GIBS | Standardized web services that deliver global, full-resolution satellite imagery, enabling interactive exploration of Earth. | Links to https://nasa-gibs.github.io/gibs-api-docs/ and Earthdata GIBS API page | no | Replacement for the archived Earth API (banner) |
| 8 | Insight | Mars Weather Service API | `GET https://api.nasa.gov/insight_weather/?api_key=DEMO_KEY&feedtype=json&ver=1.0` | yes | "(Last Updated: 3/30/2021) THIS SERVICE HAS SIGNIFICANT MISSING DATA DUE TO INSIGHT NEEDING TO MANAGE POWER USE"; "The rate limit for this API is every hour no more than 2000 hits for each individual IP." |
| 9 | NASA Image and Video Library | API to access the NASA Image and Video Library site at images.nasa.gov | `GET https://images-api.nasa.gov` — `/search?q={q}`, `/asset/{nasa_id}`, `/metadata/{nasa_id}`, `/captions/{nasa_id}` | no | Separate host, no api_key in examples |
| 10 | Open Science Data Repository | Programmatic interface for the Open Science Data Repository website | `https://osdr.nasa.gov/osdr/data/osd/files/{OSD_STUDY_IDs}/`, `/osdr/data/osd/meta/{OSD_STUDY_ID}`, `/osdr/data/search`, `/geode-py/ws/api/{experiments,missions,payloads,hardware,vehicles,...}` | no | Spaceflight biology datasets (relevant to "space health" context) |
| 11 | Satellite Situation Center | System to cast geocentric spacecraft location information into a framework of (empirical) geophysical regions | `https://sscweb.gsfc.nasa.gov/WebServices/REST/` | no | SPDF/NSSDC |
| 12 | SSD/CNEOS | Solar System Dynamics and Center for Near-Earth Object Studies | `http://ssd-api.jpl.nasa.gov/` — components CAD, Fireball, Mission Design, NHATS, Scout, Sentry | no | JPL host |
| 13 | Techport | API to make NASA technology project data available in a machine-readable format | Catalog gives only https://techport.nasa.gov/help/articles/api ("For complete API documentation please visit the TechPort website") | UNVERIFIED | Entry has `swagger_data` |
| 14 | TechTransfer | Patents, Software, and Tech Transfer Reports | `GET https://api.nasa.gov/techtransfer` (example `.../techtransfer/patent/?engine&api_key=DEMO_KEY`); params `patent`, `patent_issued`, `software`, `Spinoff` | yes | |
| 15 | TLE API | Two line element data for earth-orbiting objects at a given point in time | `GET http://tle.ivanstanojevic.me` — `/api/tle?search={q}`, `/api/tle/{q}` | no | Listed host is not a nasa.gov domain ("data is updated daily from CelesTrak") |
| 16 | Vesta/Moon/Mars Trek WMTS | A Web Map Tile Service for the Vesta, Moon, and Mars Trek imagery projects | `https://api.nasa.gov/mars-wmts/catalog/`, `https://api.nasa.gov/vesta-wmts/catalog/` (+ `/{product}/1.0.0/WMTSCapabilities.xml`); Moon tiles on `http://moontrek.jpl.nasa.gov/trektiles/...` | not shown in examples | OGC WMTS tile template `http://{WMTS endpoint}/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png` |

## Parameters

### Universal gateway parameter (all api.nasa.gov-hosted services)

| Name | Type | Required | Allowed values / format | Default | Notes | Source |
|---|---|---|---|---|---|---|
| `api_key` | string (query) | Yes for proxied services (403 `API_KEY_MISSING` otherwise — observed live) | A registered key ("This 40 character string is your API key") or the literal `DEMO_KEY` | none (catalog tables show "DEMO_KEY" as the documented default for examples) | Platform also documents `X-Api-Key` header and HTTP Basic-Auth username (empty password) as alternatives; UNVERIFIED on api.nasa.gov (not tested, budget). "Note: The GET query parameter may be used for non-GET requests (such as POST and PUT)." | https://api.data.gov/docs/developer-manual/ (accessed 2026-10-05); live 403 (accessed 2026-10-05); https://api.nasa.gov/assets/json/apis.json (accessed 2026-10-05) |

### Legacy `GET /planetary/apod` (from the catalog's `swagger_data`, Swagger 2.0; stale in places)

| Name | Type | Required | Allowed values / format | Default | Notes | Source |
|---|---|---|---|---|---|---|
| `date` | string (query), schema "date" | No | "The date of the APOD image to retrieve" | — | Swagger lists a 400 described as "Date must be between Jun 16, 1995 and Mar 28, 2019." (clearly stale: today's date returned 200) | `swagger_data` in https://api.nasa.gov/assets/json/apis.json (accessed 2026-10-05) |
| `hd` | boolean (query) | No | true/false | — | "Retrieve the URL for the high resolution image" | same |
| `api_key` | query, `securityDefinitions.api_key` (type apiKey, in query) | Yes | | | | same |

### New `GET https://science.nasa.gov/wp-json/wp/v2/apod-basic` (from the catalog's APOD `html_template`)

| Name | Type | Required | Allowed values / format | Default | Notes | Source |
|---|---|---|---|---|---|---|
| `date` | YYYY-MM-DD | No | date | today | "The date of the APOD image to retrieve" | https://api.nasa.gov/assets/json/apis.json (accessed 2026-10-05) |
| `start_date` | YYYY-MM-DD | No | date | none | "Cannot be used with date" | same |
| `end_date` | YYYY-MM-DD | No | date | today | "when used with start_date" | same |
| `count` | int | No | "Cannot exceed 25" | none | "count randomly chosen images will be returned. Cannot be used with date or start_date and end_date." | same |
| `concept_tags`, `hd`, `thumbs` | — | — | — | — | "concept_tags, hd, and thumbs are now disabled in this service." | same |
| `api_key` | string | listed | | DEMO_KEY | Listed as "api.nasa.gov key for expanded usage"; my keyless call succeeded, so whether it is honoured on science.nasa.gov is UNVERIFIED | same; live call (accessed 2026-10-05) |
| `per_page` | int | No | | | Observed only: a standard WordPress REST parameter; `?per_page=2` returned 2 items. Not in the catalog docs. | live call (accessed 2026-10-05) |

### Signup form (`Generate API Key`)

| Field (label verbatim) | HTML name | Required | Source |
|---|---|---|---|
| First Name * | `user[first_name]` | yes | https://api.data.gov/static/javascripts/signup_embed.js (accessed 2026-10-05) |
| Last Name * | `user[last_name]` | yes | same |
| Email * | `user[email]` | yes | same |
| Website (optional) | `user[website]` | no | same |
| How will you use the APIs? (optional) | `user[use_description]` | no | same |
| "I have read and agree to the terms and conditions." | `user[terms_and_conditions]` (checkbox, `required`; feedback "You must agree to the terms and conditions to signup.") | yes | same |

## Authentication

| Aspect | Finding | Source |
|---|---|---|
| Is a key needed to explore? | "You do not need to authenticate in order to explore the NASA data. However, if you will be intensively using the APIs to, say, support a mobile application, then you should sign up for a NASA developer key." (In practice the gateway rejects requests with no key: observed 403 `API_KEY_MISSING`; "exploring" means using `DEMO_KEY`.) | https://api.nasa.gov/assets/html/authentication.html (accessed 2026-10-05); live 403 (accessed 2026-10-05) |
| How the key is passed | Query parameter `api_key` in every catalog example (e.g. `?api_key=DEMO_KEY`). Platform-wide alternatives: `X-Api-Key` request header; HTTP Basic auth with the key as username and empty password. | https://api.nasa.gov/assets/json/apis.json (accessed 2026-10-05); https://api.data.gov/docs/developer-manual/ (accessed 2026-10-05) |
| How to obtain a key | The `Generate API Key` form on https://api.nasa.gov/ is the api.data.gov embed (`signup_embed.js`) configured with `registrationSource: 'web-admin'`, `contactUrl: 'mailto:hq-open-innovation@mail.nasa.gov'`, `siteName: 'https://api.nasa.gov'`, `emailFromName: 'NASA'`, `exampleApiUrl: 'https://api.nasa.gov/planetary/apod?api_key={{api_key}}'`. Config comment: siteName "will appear in the subject of the welcome e-mail as 'Your {{siteName}} API key'". Requires JavaScript ("Please enable JavaScript to signup for an api.data.gov API key."). | https://api.nasa.gov/ page source (accessed 2026-10-05) |
| What happens after submit | Form POSTs JSON to the api.data.gov user-creation endpoint (`.../v1/users.json`, header `X-Api-Key` = the embed's own key). Success text: "Your API key for {email} has been e-mailed to you. You can use your API key to begin making web service requests immediately." Alternative success text "Your API key for {email} is:" (inline display). "If you don't receive your API Key via e-mail within a few minutes, please contact us." Script defaults: `sendWelcomeEmail: true`, `verifyEmail: false`. | https://api.data.gov/static/javascripts/signup_embed.js (accessed 2026-10-05) |
| Key properties | "After signing up, you'll be given your own, unique API key. This 40 character string is your API key. The key: Uniquely identifies you. Gives you access to all APIs from agencies participating in api.data.gov's service. Should be kept private and should not be shared." | https://api.data.gov/docs/developer-manual/ (accessed 2026-10-05) |
| Cross-agency use | "Anyone can register for an api.nasa.gov key, which can be used to access data across federal agencies." | https://api.nasa.gov/assets/html/authentication.html (accessed 2026-10-05) |
| Key recovery / multiple keys | "Please contact us for help recovering an old API key. You may apply for multiple keys as needed." | https://api.nasa.gov/assets/html/recoverKey.html (accessed 2026-10-05) |
| reCAPTCHA | The embed shows "This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply." only when a `recaptchaV2SiteKey`/`recaptchaV3SiteKey` option is set; NASA's page-source config sets neither. UNVERIFIED whether reCAPTCHA is active on api.nasa.gov. | https://api.data.gov/static/javascripts/signup_embed.js and https://api.nasa.gov/ (accessed 2026-10-05) |
| Keys in browser code | api.nasa.gov answers browser requests directly (`Access-Control-Allow-Origin: *` observed on both 200 and 403; `Access-Control-Expose-Headers: X-RateLimit-Limit, X-RateLimit-Remaining`). CORS being open means a frontend could call NASA directly, but any key placed in the React bundle is readable by anyone (page source / DevTools network tab) regardless of CORS, and the platform says the key "Should be kept private and should not be shared". Keep the key in the Node backend and proxy. | live headers (accessed 2026-10-05); https://api.data.gov/docs/developer-manual/ (accessed 2026-10-05) |

## Rate limits

### Documented numbers

| Key type | Limit (verbatim) | Scope | Reset behaviour | Source |
|---|---|---|---|---|
| Registered key (default) | "Hourly Limit: 1,000 requests per hour" | "For each API key, these limits are applied across all api.nasa.gov API requests." (per key, across all hosted services; "Rate limits may vary by service, but the defaults are: ...") | "Exceeding these limits will lead to your API key being temporarily blocked from making further requests. The block will automatically be lifted by waiting an hour." "The hourly counters for your API key reset on a rolling basis." Example: 500 requests at 10:15 + 500 at 10:25 → blocked until 11:15 (500 available), 11:25 (another 500). | https://api.nasa.gov/assets/html/authentication.html (accessed 2026-10-05) |
| DEMO_KEY | "Hourly Limit: 30 requests per IP address per hour"; "Daily Limit: 50 requests per IP address per day" | per IP address | same mechanism; "it has much lower rate limits, so you're encouraged to signup for your own API key if you plan to use the API" | https://api.nasa.gov/assets/html/authentication.html (accessed 2026-10-05) |
| Higher limits | "If you need higher rate limits, contact us." (api.nasa.gov); "please reach out to the agency responsible for the API" (platform). Agency admins can set per-API-backend and per-user custom limits and typically keep "a short duration rate limit in place too (for example, a per-second or per-15 second limit)". | https://api.nasa.gov/assets/html/authentication.html; https://api.data.gov/docs/developer-manual/; https://api.data.gov/docs/agency-manual/ (all accessed 2026-10-05) |
| Service-specific example | Insight: "The rate limit for this API is every hour no more than 2000 hits for each individual IP." | per IP | | https://api.nasa.gov/assets/json/apis.json (accessed 2026-10-05) |

### Headers (documented)

"Your can check your current rate limit and usage details by inspecting the X-RateLimit-Limit and X-RateLimit-Remaining HTTP headers that are returned on every API response. For example, if an API has the default hourly limit of 1,000 request, after making 2 requests, you will receive this HTTP header in the response of the second request: X-RateLimit-Remaining: 998" — https://api.nasa.gov/assets/html/authentication.html (accessed 2026-10-05). The platform page shows both `X-RateLimit-Limit: 1000` and `X-RateLimit-Remaining: 998` — https://api.data.gov/docs/developer-manual/ (accessed 2026-10-05). No reset/period header is documented on either page.

### Headers observed live today (first DEMO_KEY request from this IP in this session; the request given in the task)

`curl -s -D - -o samples/nasa-open-apis-planetary-apod.json -w '%{http_code} %{time_total}' "https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY"` → `200 2.583099 s`

| Header | Value |
|---|---|
| Date | Mon, 05 Oct 2026 23:42:09 GMT |
| Content-Type | application/json |
| Content-Length | 1275 |
| Access-Control-Allow-Origin | * |
| Access-Control-Expose-Headers | X-RateLimit-Limit, X-RateLimit-Remaining |
| Age | 2 |
| Referrer-Policy | strict-origin-when-cross-origin |
| Strict-Transport-Security | max-age=31536000; includeSubDomains; preload |
| Via | https/1.1 api-umbrella (ApacheTrafficServer [cMsSf ]) |
| X-Api-Umbrella-Request-Id | d11pp36msfqh72h11l8g |
| X-Cache | MISS |
| X-Content-Type-Options | nosniff |
| X-Powered-By | appdat |
| **X-Ratelimit-Limit** | **10** |
| **X-Ratelimit-Remaining** | **9** |
| X-Using-Nginx-Controller | true |
| X-Vcap-Request-Id | 8e0be53a-df8d-4111-7fda-ce8880e41e63 |
| X-Xss-Protection | 1; mode=block |
| X-Frame-Options | SAMEORIGIN |

Full capture: `samples/nasa-open-apis-planetary-apod-headers.json`. No `Retry-After`, `X-RateLimit-Reset` or similar header was present.

### Reconciling documented DEMO_KEY limits (30/hour, 50/day per IP) with the observed `X-RateLimit-Limit: 10`

| Fact | Status |
|---|---|
| Documentation says DEMO_KEY = 30 requests/IP/hour and 50 requests/IP/day. | Documented — https://api.nasa.gov/assets/html/authentication.html (accessed 2026-10-05) |
| Today the very first DEMO_KEY response from this IP reported `X-Ratelimit-Limit: 10` and `X-Ratelimit-Remaining: 9`. | Observed live (accessed 2026-10-05) |
| The two numbers do not match either documented figure; the header carries no time window, so the limit's period (per hour? per day? per shorter window?) cannot be inferred from one response. | UNVERIFIED: the effective DEMO_KEY configuration on api.nasa.gov today. The platform's agency manual states limits are configurable per API backend and per user and that admins commonly add short-duration limits alongside hourly ones (https://api.data.gov/docs/agency-manual/, accessed 2026-10-05), which is consistent with a configured limit that differs from the published text, but no NASA page states "10". |
| Practical consequence for the team | Treat DEMO_KEY as a ~10-request budget shared by everyone behind the same public IP (office/hackathon NAT) and register a key for anything beyond a smoke test. Note the task statement for this research reports the same `X-RateLimit-Limit: 10` value seen earlier today, so the value is not a one-off. |

### Behaviour when exceeded (documented; NOT triggered live, to protect the shared budget)

| Item | Finding | Source |
|---|---|---|
| HTTP status | "If your API key exceeds the rate limits, you will receive a response with an HTTP status code of 429 (Too Many Requests)." | https://api.data.gov/docs/developer-manual/ (accessed 2026-10-05); identical wording in https://raw.githubusercontent.com/NREL/api-umbrella/main/docs/api-consumer/rate-limits.md (accessed 2026-10-05) |
| Error code | `OVER_RATE_LIMIT` — 429 — "The API key has exceeded the rate limits. See rate limits for more details or contact the API owner at the agency that offers the service for assistance." | https://api.data.gov/docs/developer-manual/ (accessed 2026-10-05) |
| Body shape | "The error response body will contain an error code value from the table above and a brief description of the error. The descriptions are subject to change, so it's suggested any error handling use the HTTP status code or the error code value for error handling (and not the content of the message description)." JSON example: `{"error": {"code": "API_KEY_MISSING", "message": "No api_key was supplied. Get one at https://api.data.gov"}}`; "Depending on the detected format of the request, the error message response may be returned in JSON, XML, CSV, or HTML. Requests of an unknown format will return errors in JSON format." | https://api.data.gov/docs/developer-manual/ (accessed 2026-10-05) |
| Exact 429 message text on api.nasa.gov | UNVERIFIED (not triggered). Expect the api.nasa.gov-branded variant as seen on the 403 below. | — |
| `Retry-After` on 429 | UNVERIFIED (not documented on any page read; absent on the 200/403 observed). | — |

### Other gateway error codes (documented)

| Code | HTTP | Description (verbatim) | Source |
|---|---|---|---|
| API_KEY_MISSING | 403 | "An API key was not supplied. See API key usage for details on how to pass your API key to the API." | https://api.data.gov/docs/developer-manual/ (accessed 2026-10-05) |
| API_KEY_INVALID | 403 | "An invalid API key was supplied. Double check that the API key being passed in is valid, or signup for an API key." | same |
| API_KEY_DISABLED | 403 | "The API key supplied has been disabled by an administrator. ..." | same |
| API_KEY_UNAUTHORIZED | 403 | "The API key supplied is not authorized to access the given service. ..." | same |
| API_KEY_UNVERIFIED | 403 | "The API key supplied has not been verified yet. Please check your e-mail to verify the API key. ..." | same |
| HTTPS_REQUIRED | 400 | "Requests to this API must be made over HTTPS. Ensure that the URL being used is over HTTPS." | same |
| OVER_RATE_LIMIT | 429 | see above | same |
| NOT_FOUND | 404 | "An API could not be found at the given URL. Check your URL." | same |

Observed live on api.nasa.gov (second and last api.nasa.gov request of this task): `GET https://api.nasa.gov/planetary/apod` with no key → `403` in 0.27 s, `Access-Control-Allow-Origin: *`, no `X-RateLimit-*` headers, body:

```json
{
  "error": {
    "code": "API_KEY_MISSING",
    "message": "No api_key was supplied. Get one at https://api.nasa.gov:443"
  }
}
```
(saved as `samples/nasa-open-apis-planetary-apod-nokey-403.json`; headers in `samples/nasa-open-apis-planetary-apod-nokey-403-headers.json`). The message is the NASA-branded variant of the platform template (note the literal `:443`).

## Response fields

### `GET https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY` (legacy APOD) — from `samples/nasa-open-apis-planetary-apod.json`

Top-level: JSON object (1,275 bytes).

| Field | Type | Units / format | Nullable | Observed value today (unedited) | Source |
|---|---|---|---|---|---|
| `date` | string | YYYY-MM-DD | not observed null | "2026-10-05" | live sample (accessed 2026-10-05) |
| `explanation` | string | plain text, 975 chars; contains the APOD prose plus trailing site text and tab characters | not observed null | "A deep image of the Sombrero galaxy reveals surprises. ... Tomorrow's picture: a smile\t\t\t\t\t\t" | same |
| `hdurl` | string | URL | UNVERIFIED (presence on video days not observed) | "https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png" | same |
| `media_type` | string | "image" observed | not observed null | "image" | same |
| `service_version` | string | | | "v1" | same |
| `title` | string | | | "NASA Science" | same |
| `url` | string | URL | | same NASA-logo PNG as `hdurl` | same |

Data-quality observation (real, unedited): for 2026-10-05 the legacy endpoint returned `title: "NASA Science"` and `url`/`hdurl` pointing at the science.nasa.gov theme logo, while the new `apod-basic` endpoint for the same date returned `title: "M104: The Sombrero Galaxy's Tidal Streams"` and a real image `hdurl`. The legacy endpoint is therefore unreliable for `title`/`url` right now (consistent with the migration notice). UNVERIFIED whether this is persistent.

### `GET https://api.nasa.gov/planetary/apod` without key — from `samples/nasa-open-apis-planetary-apod-nokey-403.json`

| Field | Type | Nullable | Value | Source |
|---|---|---|---|---|
| `error` | object | no | | live sample (accessed 2026-10-05) |
| `error.code` | string | no | "API_KEY_MISSING" | same |
| `error.message` | string | no | "No api_key was supplied. Get one at https://api.nasa.gov:443" | same |

### `GET https://science.nasa.gov/wp-json/wp/v2/apod-basic?per_page=2` (new APOD) — from `samples/nasa-open-apis-science-apod-basic.json`

Top-level: JSON array (2 items kept in full; `X-WP-Total: 11427`, `X-WP-TotalPages: 5714` headers). Each item:

| Field | Type | Units / format | Nullable | Example (item 1, truncated for display only) | Source |
|---|---|---|---|---|---|
| `date` | string | YYYY-MM-DD | not observed null | "2026-10-05" | live sample (accessed 2026-10-05) |
| `post_id` | number | WordPress post id | | 1455641 | same |
| `title` | string | | | "M104: The Sombrero Galaxy's Tidal Streams" | same |
| `permalink` | string | URL of the article page | | "https://science.nasa.gov/image-article/apod-2026-october-5-..." | same |
| `media_type` | string | "image" observed on both items; video days UNVERIFIED | | "image" | same |
| `explanation` | string | **HTML** (contains `<strong>`, `<a href>`), 2,461 chars | | "<strong>Explanation: </strong>A deep image ..." | same |
| `credit` | string | HTML anchor | | "<a href=\"https://app.astrobin.com/u/Fox368\">Engelbert Vollmer</a>" | same |
| `copyright` | string | HTML anchor | UNVERIFIED (may be empty for public-domain images) | same as credit | same |
| `alt` | string | alt text, plain | | "A starfield has an bright blobby mess in middle. ..." | same |
| `url` | string | URL — NOTE: the article permalink, not the image | | same as `permalink` | same |
| `hdurl` | string | image URL on assets.science.nasa.gov with `w`,`h`,`fit`,`crop` query params | | "https://assets.science.nasa.gov/dynamicimage/assets/science/cds/apod/apod/2026/october/M10..." | same |
| `basic_html` | string | a complete HTML document (7,963 chars) | | "<!doctype html>\n<html>..." | same |
| `basic_html_url` | string | URL | | "https://science.nasa.gov/wp-json/wp/v2/apod-basic/261005/html" (YYMMDD path) | same |

The catalog's documented example response for this endpoint lists the same 13 keys (`date, post_id, title, permalink, media_type, explanation, credit, copyright, alt, url, hdurl, basic_html, basic_html_url`) — https://api.nasa.gov/assets/json/apis.json (accessed 2026-10-05).

### `GET https://api.nasa.gov/assets/json/apis.json` (catalog) — from `samples/nasa-open-apis-assets-json-apis.json` (first 3 full entries) and `samples/nasa-open-apis-catalog-index.json` (field subset `id,name,summary,tags` for all 16, plus two derived booleans)

| Field | Type | Nullable | Notes | Source |
|---|---|---|---|---|
| `id` | string | no | "1".."16" | live sample (accessed 2026-10-05) |
| `name` | string | no | e.g. "APOD" | same |
| `summary` | string | no | one-line description | same |
| `tags` | array of strings | absent on "Insight" | placeholder values `["tags1","tags2","tags3","tags4"]` on all other entries | same |
| `html_template` | string (HTML) | no | the documentation panel; up to 67,905 chars (OSDR) after tag-stripping | same |
| `configurations` | object | only on APOD | an empty API-Umbrella backend config template (keys `overview, global_request_settings, sub_url_request_settings, advanced_requests_rewriting, advanced_settings`; `advanced_settings` names the error templates `api_key_missing, api_key_invalid, api_key_disabled, api_key_unauthorized, over_rate_limit, https_required`) | same |
| `swagger_data` | object | only on APOD and Techport | Swagger 2.0 document (APOD: host `api.nasa.gov`, basePath `/planetary`, path `/apod`, `securityDefinitions.api_key` in query, contact `evan.t.yates@nasa.gov`, license Apache 2.0) | same |

## Sample requests

All files are under `C:/Users/Eesha/AppData/Local/Temp/claude/C--Users-Eesha/057441e4-62ce-45c9-9629-2b1d6914ac67/scratchpad/research/samples/`. Values are unedited; only array length was limited where stated.

| # | Command | Saved file(s) | Result |
|---|---|---|---|
| 1 | `curl -s -D - -o samples/nasa-open-apis-planetary-apod.json -w '%{http_code} %{time_total}' "https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY"` | `nasa-open-apis-planetary-apod.json` (body), `nasa-open-apis-planetary-apod-headers.json` (headers) | 200, 2.58 s, Limit 10 / Remaining 9 |
| 2 | `curl -s -D - -o samples/nasa-open-apis-planetary-apod-nokey-403.json -w '%{http_code} %{time_total}' "https://api.nasa.gov/planetary/apod"` | `nasa-open-apis-planetary-apod-nokey-403.json`, `nasa-open-apis-planetary-apod-nokey-403-headers.json` | 403, 0.27 s |
| 3 | `curl -s -D - -o samples/nasa-open-apis-science-apod-basic.json -w '%{http_code} %{time_total}' "https://science.nasa.gov/wp-json/wp/v2/apod-basic?per_page=2"` | `nasa-open-apis-science-apod-basic.json` (array of 2, full objects) | 200, 0.84 s |
| 4 | `curl -sL -o apis.json "https://api.nasa.gov/assets/json/apis.json"` then first 3 entries / field-subset index written with Node | `nasa-open-apis-assets-json-apis.json` (entries 1-3 complete), `nasa-open-apis-catalog-index.json` (all 16: `id,name,summary,tags` + derived `has_swagger_data`, `has_configurations`) | 200, 0.66 s, 166,186 B |
| 5 | `curl -sL "https://api.nasa.gov/assets/html/authentication.html"` (and overview/recoverKey/header/browseAPI fragments) | not saved as samples (documentation text, quoted above) | 200 |

Total api.nasa.gov API requests made in this task: 2 (one with DEMO_KEY, one without a key). Remaining after request 1: 9.

## Availability and caveats

| Topic | Finding | Source |
|---|---|---|
| Status today | Portal, catalog JSON, documentation fragments and the legacy APOD endpoint all answered 200; the gateway is up. | live calls (accessed 2026-10-05) |
| Deprecations / archives | Legacy APOD (`/planetary/apod`) "will be archived on December 1, 2026" (banner) / "taken offline December 1, 2026" (catalog); migrated "As of September 10, 2026" to `https://science.nasa.gov/wp-json/wp/v2/apod-basic`. "The Earth API has been archived and replaced with Earthdata GIBS API. The Mars Rover API has also been archived." Neither Earth nor Mars Rover appears in the 16-entry catalog. Insight: last updated 3/30/2021 with "SIGNIFICANT MISSING DATA". | https://api.nasa.gov/assets/html/header.html; https://api.nasa.gov/assets/json/apis.json (both accessed 2026-10-05) |
| Legacy APOD data quality | Today's legacy response carried the wrong `title`/`url`/`hdurl` (site logo) for 2026-10-05 while the new endpoint was correct — do not build on the legacy endpoint. | live samples (accessed 2026-10-05) |
| New APOD endpoint CORS | Response to a non-browser request (no `Origin` header) contained `Access-Control-Expose-Headers: X-WP-Total, X-WP-TotalPages, Link` and `Access-Control-Allow-Headers: Authorization, X-WP-Nonce, Content-Disposition, Content-MD5, Content-Type` but no `Access-Control-Allow-Origin` (and `Vary: Accept-Encoding, Origin`). UNVERIFIED whether browsers may call it directly; the backend proxy avoids the question. | live headers (accessed 2026-10-05) |
| api.nasa.gov CORS | `Access-Control-Allow-Origin: *` on the 200 and the 403; `Access-Control-Expose-Headers: X-RateLimit-Limit, X-RateLimit-Remaining` on the 200. Observed only on `/planetary/apod` and the portal page; UNVERIFIED whether identical on every hosted backend. | live headers (accessed 2026-10-05) |
| Caching | `X-Cache: MISS`, `Age: 2` on the APOD 200 — the gateway can cache API responses when the backend sends cache headers ("api.data.gov can serve as an HTTP caching layer ... To enable caching, your API must return HTTP headers to control the cache duration."). | live headers (accessed 2026-10-05); https://api.data.gov/docs/agency-manual/ (accessed 2026-10-05) |
| Shared DEMO_KEY budget | DEMO_KEY limits are "per IP address"; everyone behind one NAT shares them; observed Limit 10 today. | https://api.nasa.gov/assets/html/authentication.html (accessed 2026-10-05); live (accessed 2026-10-05) |
| Empty results | Not applicable at umbrella level; see per-service reports (DONKI/EONET/NeoWs). | — |
| Date-range limits | APOD new endpoint: `count` "Cannot exceed 25"; NeoWs `end_date` default "7 days after start_date". Other services: see their own reports. | https://api.nasa.gov/assets/json/apis.json (accessed 2026-10-05) |
| Data latency | APOD: one item per calendar day (`date` field); the 2026-10-05 item was already served at 23:42 UTC on 2026-10-05. | live samples (accessed 2026-10-05) |
| Terms and conditions | The signup checkbox links to `${base}/terms/` with base `https://api.data.gov/` → `https://api.data.gov/terms/`, which returned **HTTP 404 "Page Not Found - api.data.gov"** today (also 404 for `/terms` and `/docs/terms/`). No api.nasa.gov-specific terms page exists in the fragments. UNVERIFIED: the actual terms text. | https://api.data.gov/static/javascripts/signup_embed.js; https://api.data.gov/terms/ (both accessed 2026-10-05) |
| Attribution / content use (NASA-wide media guidelines) | "NASA content ... generally are not subject to copyright in the United States." "You may use this material for educational or informational purposes, including photo collections, textbooks, public exhibits, computer graphical simulations and Internet Web pages." "NASA should be acknowledged as the source of the material." Commercial use "must not explicitly or implicitly convey NASA's endorsement of commercial goods or services." "The NASA Insignia, Logotype, identifiers, and imagery are not in the public domain. The use of the Insignia, Logotype and NASA identifiers is protected by law." "NASA occasionally uses copyright-protected material of third parties with permission on its website. Those images will be marked identified as copyright protected with the name of the copyright holder. NASA's use does not convey any rights to others to use the same material." | https://www.nasa.gov/nasa-brand-center/images-and-media/ (accessed 2026-10-05) |
| Attribution in practice for APOD | Today's APOD carries `credit`/`copyright` = a named photographer (third-party copyright). A dashboard must display `credit`/`copyright` with every APOD image and should not reuse copyrighted images beyond display with credit. | live sample `nasa-open-apis-science-apod-basic.json` (accessed 2026-10-05); https://www.nasa.gov/nasa-brand-center/images-and-media/ (accessed 2026-10-05) |
| Licensing of the catalog's APOD API definition | `swagger_data.info.license` = Apache 2.0 (applies to that API definition, not to images). | https://api.nasa.gov/assets/json/apis.json (accessed 2026-10-05) |
| Support contact | `mailto:hq-open-innovation@mail.nasa.gov` (signup `contactUrl`); platform admin contact `api.data.gov@gsa.gov` (agency manual). | https://api.nasa.gov/ (accessed 2026-10-05); https://api.data.gov/docs/agency-manual/ (accessed 2026-10-05) |

## Dashboard relevance

### Architecture decisions this research supports

| Decision | Rationale | Source |
|---|---|---|
| Keep `NASA_API_KEY` in the Node backend only; expose `/api/nasa/...` proxy routes to the React app. | Key "Should be kept private and should not be shared"; CORS `*` means a browser-side key would work and therefore leak. | https://api.data.gov/docs/developer-manual/; live headers (accessed 2026-10-05) |
| Register one team key (form on https://api.nasa.gov/) before the hackathon; never ship DEMO_KEY. | DEMO_KEY is per-IP (30/h, 50/day documented; 10 observed) and shared by the whole venue. | https://api.nasa.gov/assets/html/authentication.html (accessed 2026-10-05); live |
| Budget 1,000 requests/hour per key across ALL hosted services (DONKI + NeoWs + EPIC + APOD together). | "For each API key, these limits are applied across all api.nasa.gov API requests." | https://api.nasa.gov/assets/html/authentication.html (accessed 2026-10-05) |
| Read `X-RateLimit-Remaining` on every proxied response; when it is low or a `429`/`OVER_RATE_LIMIT` arrives, serve cached data and show a "NASA quota" state. Branch on `error.code`, not on `message`. | Headers "returned on every API response"; "it's suggested any error handling use the HTTP status code or the error code value for error handling (and not the content of the message description)". | https://api.nasa.gov/assets/html/authentication.html; https://api.data.gov/docs/developer-manual/ (accessed 2026-10-05) |
| Cache per endpoint in the backend (APOD: 1 item/day → cache ≥ 1 h; DONKI/NeoWs date-range queries → cache by query string). | Rolling hourly block lasts up to an hour once exceeded. | https://api.nasa.gov/assets/html/authentication.html (accessed 2026-10-05) |
| Use `https://science.nasa.gov/wp-json/wp/v2/apod-basic` for APOD, not `/planetary/apod`. | Legacy is archived 2026-12-01 and returned wrong title/url today. | https://api.nasa.gov/assets/html/header.html; live samples (accessed 2026-10-05) |
| Sanitize `explanation`/`credit`/`copyright` (they are HTML) before rendering in React. | Observed HTML in fields. | live sample (accessed 2026-10-05) |

### Widgets enabled

| Widget | Data | Notes |
|---|---|---|
| "Space picture of the day" tile beside the vitals panel | apod-basic `title`, `hdurl`, `alt`, `credit`, `copyright`, `permalink` | Display credit line; `alt` gives ready-made accessibility text. |
| NASA quota / key-health indicator (ops widget) | proxied `X-RateLimit-Limit`, `X-RateLimit-Remaining` | Show remaining/limit as a meter; turn red on 429. |
| Service-status strip | Catalog banner notices (legacy APOD archive date, Earth/Mars Rover archived) | Static text; refresh from `assets/html/header.html` occasionally. |
| Space-weather event timeline, asteroid close-approach list, Earth-disc image | DONKI, NeoWs, EPIC (all via this same key/quota) | Field-level mapping is in the per-service reports; the umbrella contributes the shared proxy, quota and error contract. |

### Mapping into `NASAEvent {id, source, eventType, timestamp, latitude?, longitude?, metadata}`

| NASAEvent field | APOD (apod-basic) | Gateway error (for an "events" feed of operational incidents, optional) |
|---|---|---|
| `id` | `"apod-" + date` (or `post_id`) | `X-Api-Umbrella-Request-Id` |
| `source` | `"apod"` | `"api.nasa.gov"` |
| `eventType` | `"picture-of-the-day"` | `error.code` (e.g. `OVER_RATE_LIMIT`, `API_KEY_MISSING`) |
| `timestamp` | `date` (calendar date; no time zone is given — UNVERIFIED which zone the APOD day boundary uses; store as `YYYY-MM-DDT00:00:00Z` and label as "date") | response `Date` header |
| `latitude`/`longitude` | none (omit) | none |
| `metadata` | `{title, media_type, url: hdurl, permalink, credit, copyright, alt, basic_html_url}` | `{status, message, rateLimitLimit, rateLimitRemaining}` |

## Open questions

1. UNVERIFIED: why `X-RateLimit-Limit` is `10` for DEMO_KEY on api.nasa.gov today (documented: 30/hour and 50/day per IP) and what time window that `10` applies to; no NASA page states it, and the headers carry no period.
2. UNVERIFIED: whether api.nasa.gov accepts the `X-Api-Key` header and HTTP Basic-auth username forms documented for the platform (not tested because of the two-request budget).
3. UNVERIFIED: the exact 429 body text on api.nasa.gov and whether a `Retry-After` header accompanies it (not triggered).
4. UNVERIFIED: the content of the terms and conditions the signup checkbox refers to — the link target https://api.data.gov/terms/ returned 404 today.
5. UNVERIFIED: whether reCAPTCHA is active on the api.nasa.gov signup form (no site key in the page-source config).
6. UNVERIFIED: whether every hosted service uses the 1,000/hour default ("Rate limits may vary by service"); Insight documents 2,000/hour per IP.
7. UNVERIFIED: the APOD migration PDF's contents (downloaded but not text-extractable here); the catalog's APOD entry was used instead.
8. UNVERIFIED: whether `https://science.nasa.gov/wp-json/wp/v2/apod-basic` sends `Access-Control-Allow-Origin` to browsers, whether it honours `api_key`, and whether `per_page` is officially supported.
9. UNVERIFIED: Techport's api.nasa.gov base path (catalog only links to techport.nasa.gov).
10. UNVERIFIED: whether the legacy `/planetary/apod` title/url anomaly observed today is persistent, and the field set returned on video days (`media_type` other than "image") for both APOD endpoints.
11. UNVERIFIED: whether `Access-Control-Allow-Origin: *` is uniform across all api.nasa.gov backends (observed on `/planetary/apod` and the portal only).
