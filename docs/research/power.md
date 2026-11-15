# NASA POWER API — research report (key: `power`)

Researched 2026-10-05 for the Space Apps 2026 space-health dashboard (React/TS + Node/TS). All URLs below were opened on 2026-10-05; every live call was made with curl on 2026-10-05 from a Windows host via CloudFront POP ATL59. POWER is **independent of api.nasa.gov** (no key, no DEMO_KEY budget). Statements that could not be confirmed are prefixed `UNVERIFIED:`.

## Overview

| Item | Fact | Source |
|---|---|---|
| What POWER is | "NASA Prediction Of Worldwide Energy Resources" (Langley Research Center) — Analysis Ready Data (ARD) of solar radiation and meteorology, served by community-specific APIs: Temporal APIs (ARD products), Application APIs (reports/validation), System APIs (configuration). | https://power.larc.nasa.gov/docs/services/api/ (accessed 2026-10-05); https://power.larc.nasa.gov/docs/ (accessed 2026-10-05) |
| Data basis | "parameters provided by POWER are based upon solar radiation derived from satellite observations and meteorological data from assimilation models". | https://power.larc.nasa.gov/docs/tutorials/parameters/ (accessed 2026-10-05) |
| Grids | Meteorology: MERRA-2 / GEOS-IT on a ½° lat × ⅝° lon grid; solar: 1° × 1° grid. "The POWER data products are currently available at a 0.5 x 0.625 degree resolution for meteorology and 1 x 1 for solar parameters." | https://power.larc.nasa.gov/docs/methodology/data/sources/ (accessed 2026-10-05); https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/ (accessed 2026-10-05) |
| Temporal levels | Hourly (point only), Daily, Monthly/Annual, Climatology (point + regional for Daily/Monthly/Climatology). | https://power.larc.nasa.gov/docs/services/api/temporal/ (accessed 2026-10-05) |
| Why it matters here | Gives per-location daily/hourly ambient temperature, humidity, pressure, wind, precipitation, solar irradiance and UV index for the wearer's location to place next to smartwatch vitals (HR, HRV, sleep, SpO2). Keyless, CORS-open, sub-second, JSON. Data is 2–3 days behind real time for meteorology and 5–7 days for solar (see Availability). | Live calls in this report; https://power.larc.nasa.gov/docs/faqs/data/ (accessed 2026-10-05) |

## Official documentation

All accessed 2026-10-05.

| URL | What it gave |
|---|---|
| https://power.larc.nasa.gov/docs/services/api/ | API overview; HTTP codes 200 / 422 / 429; "As a general rule the higher the temporal level (Hourly vs Climatology) and the greater number of parameters requested will slightly slow down the API's response." |
| https://power.larc.nasa.gov/docs/services/api/temporal/ | Temporal levels, point vs regional availability, output formats per level |
| https://power.larc.nasa.gov/docs/services/api/temporal/daily/ | Daily point/regional params, 20-parameter limit, regional 1 parameter, 1981-01-01 start, LST default |
| https://power.larc.nasa.gov/docs/services/api/temporal/hourly/ | Hourly point params, 15-parameter limit, 2001-01-01 start, mm/hour precipitation, EPW |
| https://power.larc.nasa.gov/docs/services/api/temporal/monthly/ | Monthly point/regional, start/end = YYYY |
| https://power.larc.nasa.gov/docs/services/api/temporal/climatology/ | Climatology point/regional, optional start/end years |
| https://power.larc.nasa.gov/docs/services/api/system/ | System APIs overview (Manager is JSON only) |
| https://power.larc.nasa.gov/docs/services/api/system/manager/ | Manager purpose (parameter catalog sync, surface aliases, groupings); points to API Pages `/api/pages/?urls.primaryName=Manager` |
| https://power.larc.nasa.gov/docs/services/api/system/resources/ | Resources API page (no usage-limit text) |
| https://power.larc.nasa.gov/docs/tutorials/parameters/ | Parameter Dictionary (interactive tool) |
| https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/ | Example URLs, concurrency guidance, resolution statement, 2–3 month climate-quality replacement |
| https://power.larc.nasa.gov/docs/tutorials/api-getting-started/ | Comma or `%2C` delimiter for parameters |
| https://power.larc.nasa.gov/docs/methodology/data/sources/ | Source latency table (GEOS-IT 2 days; FLASHFlux 5–7 days; SYN1deg NRT −3–4 months; MERRA-2 month behind; IMERG Late 14 h) |
| https://power.larc.nasa.gov/docs/methodology/meteorology/ | MERRA-2 grid and coverage statement |
| https://power.larc.nasa.gov/docs/methodology/energy-fluxes/ | CERES SYN1deg / FLASHFlux latency, 1°×1° grid, UV statement |
| https://power.larc.nasa.gov/docs/faqs/data/ | "the POWER Data Archive has a latency of 2–3 days for meteorological parameters and 5–7 days for solar parameters." |
| https://power.larc.nasa.gov/docs/services/aws/ | "This service has rate, data transfer, and timeout limits…"; AWS Open Data buckets |
| https://power.larc.nasa.gov/docs/referencing/ | Required citation text |
| https://power.larc.nasa.gov/docs/ | Docs index, contact larc-power-project@mail.nasa.gov, POWER Data v10 migration note |
| https://power.larc.nasa.gov/status/ | Status page (JavaScript app; no static status text) |
| https://power.larc.nasa.gov/api/pages/ | Swagger UI "API Pages" (HTTP 200 live) |
| https://power.larc.nasa.gov/api/temporal/daily/openapi.json | Official OpenAPI 3.0.2 spec, "POWER Daily API" v2.10.0 (fetched live, HTTP 200) |
| https://power.larc.nasa.gov/api/temporal/hourly/openapi.json | OpenAPI spec, "POWER Hourly API" v2.10.2 (HTTP 200) |
| https://power.larc.nasa.gov/api/temporal/monthly/openapi.json | OpenAPI spec, "POWER Monthly and Annual API" v2.10.0 (HTTP 200) |
| https://power.larc.nasa.gov/api/temporal/climatology/openapi.json | OpenAPI spec, "POWER Climatology API" v2.10.0 (HTTP 200) |
| https://power.larc.nasa.gov/api/system/manager/openapi.json | OpenAPI spec, "POWER Manager API" v2.9.1 (HTTP 200) |

## Base URL and endpoints

Base URL: `https://power.larc.nasa.gov` (all paths below are relative to it; the OpenAPI specs declare paths under `/api/...` and no `servers` block — https://power.larc.nasa.gov/api/temporal/daily/openapi.json (accessed 2026-10-05)). All endpoints are GET, keyless. Latency = curl `time_total` on 2026-10-05.

| Method | Path | Purpose | Key required? | Verified live today (HTTP status, latency) | Source |
|---|---|---|---|---|---|
| GET | `/api/temporal/daily/point` | Daily time series for one lat/lon | No | 200, 0.597 s (6 params, 14 days, 2267 B); 200, 0.494 s (PS/SW/UV); 200, 0.446 s (UV+SW, 2026-03-01→10-04, 8200 B); 200, 0.440 s (units=imperial, header=false, time-standard=utc) | spec: https://power.larc.nasa.gov/api/temporal/daily/openapi.json; docs: https://power.larc.nasa.gov/docs/services/api/temporal/daily/ (accessed 2026-10-05) |
| GET | `/api/temporal/daily/regional` | Daily gridded series for a bounding box (1 parameter) | No | 200, 0.388 s (2°×2° box, 2 days, 2654 B); 422 for 1°×1° box ("at least a 2 degree range"); 422 for 11°×11° box ("maximum of 10 degree range") | same as above |
| GET | `/api/temporal/daily/configuration` | Daily API metadata: version, communities, start/end of archive | No | 200, 0.311 s (`settings.start` 1981-01-01, `settings.end` 2026-10-05) | https://power.larc.nasa.gov/api/temporal/daily/openapi.json (accessed 2026-10-05) |
| GET | `/api/temporal/hourly/point` | Hourly time series for one lat/lon (point only) | No | 200, 0.873 s (6 params, 2 days, UTC, 6492 B) | https://power.larc.nasa.gov/api/temporal/hourly/openapi.json; https://power.larc.nasa.gov/docs/services/api/temporal/hourly/ (accessed 2026-10-05) |
| GET | `/api/temporal/hourly/configuration` | Hourly API metadata | No | 200, 0.245 s (`formats` list, communities RE/SB/AG, start 2001-01-01, end 2026-10-05) | https://power.larc.nasa.gov/api/temporal/hourly/openapi.json (accessed 2026-10-05) |
| GET | `/api/temporal/monthly/point` | Monthly + annual values per year | No | 200, 0.386 s (2 params, year 2025, 943 B) | https://power.larc.nasa.gov/api/temporal/monthly/openapi.json; https://power.larc.nasa.gov/docs/services/api/temporal/monthly/ (accessed 2026-10-05) |
| GET | `/api/temporal/monthly/regional` | Monthly gridded (1 parameter) | No | Not called (documented in spec) | same |
| GET | `/api/temporal/monthly/configuration` | Monthly API metadata | No | Not called (documented in spec) | same |
| GET | `/api/temporal/climatology/point` | 20-year monthly/annual climatology (default 2001–2020) | No | 200, 0.469 s (5 params, 1833 B) | https://power.larc.nasa.gov/api/temporal/climatology/openapi.json; https://power.larc.nasa.gov/docs/services/api/temporal/climatology/ (accessed 2026-10-05) |
| GET | `/api/temporal/climatology/regional` | Climatology gridded (1 parameter) | No | Not called (documented in spec) | same |
| GET | `/api/temporal/climatology/configuration` | Climatology API metadata | No | Not called (documented in spec) | same |
| GET | `/api/system/manager/parameters` | Parameter catalog (names, units, definitions) filtered by community + temporal, optional `parameters` filter | No | 200, 0.398 s (full RE/daily catalog, 46 449 B); 200, 0.27–0.29 s for 9-parameter filters across RE/AG/SB × daily/hourly | https://power.larc.nasa.gov/api/system/manager/openapi.json; https://power.larc.nasa.gov/docs/services/api/system/manager/ (accessed 2026-10-05) |
| GET | `/api/system/manager/parameters/{parameter}` | One parameter's attributes across all temporal levels and communities | No | 200, 0.304 s (`/parameters/T2M`, 816 B) | https://power.larc.nasa.gov/api/system/manager/openapi.json (accessed 2026-10-05) |
| GET | `/api/system/manager/surface` | Wind-surface alias list with monthly roughness | No | 200, 0.167 s (5001 B; keys like `vegtype_1`) | same |
| GET | `/api/system/manager/surface/{alias}` | One surface alias | No | Not called (documented in spec) | same |
| GET | `/api/system/manager/system/groupings` | Parameter groupings by community/temporal/category (used by the Data Access Viewer) | No | 200, 0.422 s (96 386 B) | same |
| GET | `/api/system/manager/configuration` | Manager API version info | No | 200, 0.271 s | same |
| GET | `/api/pages/` | Swagger UI for all POWER APIs | No | 200, 0.397 s | https://power.larc.nasa.gov/docs/services/api/system/manager/ (accessed 2026-10-05) |

Not available: `/api/temporal/hourly/regional` does not exist (hourly is point only — https://power.larc.nasa.gov/docs/services/api/temporal/ (accessed 2026-10-05); the hourly OpenAPI spec lists only `/point` and `/configuration` — https://power.larc.nasa.gov/api/temporal/hourly/openapi.json (accessed 2026-10-05)).

## Parameters

Types, required flags, enums and defaults are taken from the official OpenAPI specs (accessed 2026-10-05): daily https://power.larc.nasa.gov/api/temporal/daily/openapi.json, hourly https://power.larc.nasa.gov/api/temporal/hourly/openapi.json, monthly https://power.larc.nasa.gov/api/temporal/monthly/openapi.json, climatology https://power.larc.nasa.gov/api/temporal/climatology/openapi.json, manager https://power.larc.nasa.gov/api/system/manager/openapi.json. Doc-page limits are cited per row.

### `/api/temporal/daily/point` (and hourly/monthly/climatology point, differences noted)

| Name | Type | Required | Allowed values / format | Default | Notes |
|---|---|---|---|---|---|
| `parameters` | string | yes | Comma-separated parameter codes (`,` or `%2C`) | — | Daily/monthly/climatology point: "A maximum of 20 parameters can currently be requested in one submission for a single point" (https://power.larc.nasa.gov/docs/services/api/temporal/daily/ (accessed 2026-10-05)); live 21 codes → HTTP 422 "A maximum of 20 parameters are can currently be requested in one submission." Hourly: "A maximum of 15 parameters can currently be requested in one submission" (https://power.larc.nasa.gov/docs/services/api/temporal/hourly/ (accessed 2026-10-05)). Delimiter: https://power.larc.nasa.gov/docs/tutorials/api-getting-started/ (accessed 2026-10-05) |
| `community` | string | yes | spec enum `ag`,`hy`,`sb`,`re`; spec text: "RE (Renewable Energy), AG (Agroclimatology), SB (Sustainable Buildings)"; `/configuration` lists `["RE","SB","AG"]` | — | Live: `RE`, `AG`, `SB` accepted (upper-case accepted although the enum is lower-case); `HY` → 422 "Please provide a correct user community value." Community selects units (e.g. solar in kW-hr/m²/day for RE) |
| `longitude` | number | yes | −180.0 … 180.0 decimal degrees, East positive | — | spec min/max |
| `latitude` | number | yes | −90.0 … 90.0 decimal degrees, North positive | — | spec min/max |
| `start` | integer | yes (climatology: no) | Daily/hourly `YYYYMMDD` (daily "Must be >= 19810101"; hourly from 2001-01-01 per docs and `/configuration`); monthly `YYYY`; climatology `YYYY` optional | climatology: 2001 | Daily docs: "Daily UTC and LST time standards data are available from 1981/01/01 to Near Real Time (NRT)" (https://power.larc.nasa.gov/docs/services/api/temporal/daily/ (accessed 2026-10-05)) |
| `end` | integer | yes (climatology: no) | Same format as `start`; "Must be >= start date" | climatology: 2020 | Live: `end=20261231` (future) → HTTP 200 with the series clamped to `header.end = "20261005"` and `-999` fills; no error |
| `format` | string | no | Daily point: `csv`,`json`,`ascii`,`netcdf`,`icasa`,`xarray`; daily regional / monthly / climatology: `csv`,`json`,`ascii`,`netcdf`,`xarray`; hourly: `csv`,`json`,`ascii`,`netcdf`,`epw`,`epw_csv`,`xarray`,`sam`,`srw` | spec text: "JSON (default)" | **No GeoJSON value**: `format=GEOJSON` → 422 `Input should be 'csv', 'json', 'ascii', 'netcdf', 'icasa' or 'xarray'`. The JSON body is itself a GeoJSON `Feature` (point) / `FeatureCollection` (regional). Upper-case `JSON` accepted. Doc pages list `format` as required — pass it explicitly. ICASA is AG-only (https://power.larc.nasa.gov/docs/services/api/temporal/ (accessed 2026-10-05)) |
| `units` | string | no | `metric`, `imperial` | `metric` (spec text) | Live `units=imperial`: T2M in `F`, WS10M in `mph` |
| `time-standard` | string | no | `lst`, `utc` | `LST` (spec text and daily/hourly doc pages) | Hourly docs: "LST is created on-the-fly within the API" (https://power.larc.nasa.gov/docs/services/api/temporal/hourly/ (accessed 2026-10-05)). Response echoes it in `header.time_standard` |
| `header` | boolean | no | `true`/`false` | `true` | Spec: "Include header metadata in CSV/ASCII output." Live: JSON still contains the `header` object with `header=false` |
| `user` | string | no | free text | — | "Optional username or identifier for request tracking and analytics. Not required." |
| `site-elevation` | number | no | metres | — | "Custom site elevation in meters for atmospheric pressure correction. If omitted, MERRA-2 elevation is used." Point requests only (daily docs) |
| `wind-elevation` | number | no | metres; docs: 10–300 m | — | "Custom height in meters above ground for wind speed adjustment." Point only (daily docs) |
| `wind-surface` | string | no | alias from `/api/system/manager/surface` (e.g. `vegtype_1`); daily docs mention `SeaIce` | — | Daily docs: requires `wind-elevation`. UNVERIFIED: exact alias strings beyond the live `vegtype_*` keys |

### `/api/temporal/daily/regional` (monthly/climatology regional analogous)

| Name | Type | Required | Allowed values / format | Default | Notes |
|---|---|---|---|---|---|
| `latitude-min`, `latitude-max` | number | yes | −90…90; min < max | — | Live: span must be ≥ 2° and ≤ 10° (422 messages "Please provide at least a 2 degree range in latitude; otherwise use the point endpoint." / "Please provide a maximum of 10 degree range in latitude.") |
| `longitude-min`, `longitude-max` | number | yes | −180…180; min < max | — | Same 2°–10° span rule observed for longitude |
| `parameters` | string | yes | one code | — | "Regional requests are limited to one parameter" (https://power.larc.nasa.gov/docs/services/api/temporal/daily/ (accessed 2026-10-05)) |
| `community`, `start`, `end`, `format`, `units`, `user`, `header`, `time-standard` | as point | | | | No `site-elevation`/`wind-elevation`/`wind-surface` on regional (spec) |

### `/api/system/manager/parameters`

| Name | Type | Required | Allowed values | Default | Notes |
|---|---|---|---|---|---|
| `community` | string | yes | `ag`, `sb`, `re` | — | upper-case accepted live |
| `temporal` | string | yes | `hourly`, `daily`, `monthly`, `climatology` | — | |
| `parameters` | string | no | comma-separated codes | — | Omit → full catalog for that community/temporal (46 KB for RE/daily) |
| `metadata` | boolean | no | `true`/`false` | `false` | `true` adds `units_min`, `units_max`, `units_digits`, `data_type` (`float32`), `time_start`, `time_end`, `time_standard`, `display_*`, `search_aliases` (live) |

### Target parameters for the environment panel — existence verified live via the manager endpoint (RE community; also present for AG and SB)

| Code | Daily (RE) | Hourly (RE) | Units (RE, metric) | Longname / definition (manager) | Source |
|---|---|---|---|---|---|
| `T2M` | yes | yes | `C` | "Temperature at 2 Meters" — average dry-bulb air temperature at 2 m | `GET /api/system/manager/parameters?community=RE&temporal=daily&parameters=…` and `…temporal=hourly…` (2026-10-05) |
| `T2M_MAX` | yes | **no** (not in hourly catalog) | `C` | "Temperature at 2 Meters Maximum" (max hourly value in period) | same |
| `T2M_MIN` | yes | **no** | `C` | "Temperature at 2 Meters Minimum" | same |
| `RH2M` | yes | yes | `%` | "Relative Humidity at 2 Meters" | same |
| `PS` | yes | yes | `kPa` | "Surface Pressure" | same |
| `WS10M` | yes | yes | `m/s` | "Wind Speed at 10 Meters" | same |
| `ALLSKY_SFC_SW_DWN` | yes | yes | daily `kW-hr/m^2/day`; hourly `Wh/m^2` | "All Sky Surface Shortwave Downward Irradiance" (GHI) | same; hourly units from live hourly response |
| `ALLSKY_SFC_UV_INDEX` | yes | yes | `W m-2 x 40` | "All Sky Surface UV Index" — "The ultraviolet radiation exposure index." `units_min` 0, `units_max` 30 (metadata=true) | same |
| `PRECTOTCORR` | yes | yes | daily/monthly `mm/day`; hourly response `mm/hour` | "Precipitation Corrected" — "average MERRA-2 bias corrected total precipitation" | same; hourly docs: "Precipitation values will be shown in mm/hour" (https://power.larc.nasa.gov/docs/services/api/temporal/hourly/ (accessed 2026-10-05)). Note the manager catalog lists hourly PRECTOTCORR units as `mm/day` while the hourly data response says `mm/hour` — trust the response `parameters` block |

## Authentication

| Item | Fact | Source |
|---|---|---|
| Mechanism | **None.** No API key, token or registration. All live calls in this report were made with no credentials. None of the five OpenAPI specs defines a `securitySchemes`/`security` entry. | https://power.larc.nasa.gov/api/temporal/daily/openapi.json and the other four specs (accessed 2026-10-05); live calls 2026-10-05 |
| Optional identification | `user` query string: "Optional username or identifier for request tracking and analytics. Not required." | https://power.larc.nasa.gov/api/temporal/daily/openapi.json (accessed 2026-10-05) |
| Relation to api.nasa.gov | POWER is hosted at power.larc.nasa.gov and does not use `api_key`; the api.nasa.gov DEMO_KEY budget is irrelevant to it. No api.nasa.gov request was made in this task. | live calls 2026-10-05 |
| Attribution | "The data was obtained from National Aeronautics and Space Administration (NASA) Langley Research Center's Prediction Of Worldwide Energy Resources (POWER) project funded through the NASA Earth Science Division." and a data reference naming service, version and access date, e.g. "The data was obtained from the POWER Project's Hourly 2.x.x version on YYYY/MM/DD." | https://power.larc.nasa.gov/docs/referencing/ (accessed 2026-10-05) |

## Rate limits

| Item | Fact | Source |
|---|---|---|
| Documented numeric limit | **None published.** The docs list `429 Too Many Requests` as a possible response but give no requests-per-minute figure. | https://power.larc.nasa.gov/docs/services/api/ (accessed 2026-10-05); specs list responses 200/422/429/500/503 (https://power.larc.nasa.gov/api/temporal/daily/openapi.json, accessed 2026-10-05) |
| Concurrency guidance | "Please do not go more than five concurrent requests." | https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/ (accessed 2026-10-05) |
| Blocking guidance | "Please ensure you do not submit too many synchronous requests. If the server determines that you are negatively impacting performance, it may block your access." | https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/ (accessed 2026-10-05) |
| Repeated same-location requests | UNVERIFIED: a site search attributes the sentence "If an application persists in requesting the same relative location, it will potentially be blocked." to https://power.larc.nasa.gov/docs/services/api/temporal/daily/ , but the sentence was not returned in the fetched page text. | search result only (2026-10-05) |
| Service-level limits | "This service has rate, data transfer, and timeout limits due to a balance of user-experience optimization and cost-saving measures." "By connecting directly to data in AWS, users can bypass service limitations." | https://power.larc.nasa.gov/docs/services/aws/ (accessed 2026-10-05) |
| Performance note | "As a general rule the higher the temporal level (Hourly vs Climatology) and the greater number of parameters requested will slightly slow down the API's response." | https://power.larc.nasa.gov/docs/services/api/ (accessed 2026-10-05) |
| Headers observed | No `X-RateLimit-*`, `RateLimit-*` or `Retry-After` header on any of the ~25 responses captured (200 and 422). Observed headers: `x-app-name`, `x-app-version` (daily v2.10.0, hourly v2.10.2, manager v2.9.1), `x-service-time`, `x-archive-time`, `x-process-time`, `x-data-sources` (e.g. `geosit,power`; `syn1deg,geosit,power`; `flashflux,geosit`), `content-disposition: inline; filename=POWER_Point_Daily_20260921_20261004_029d55N_095d10W_LST.json`, CloudFront `Via`/`X-Cache: Miss from cloudfront`. | live calls 2026-10-05 (headers saved under `samples/power-raw/*_headers.txt`) |
| Behaviour on 429 | UNVERIFIED: not triggered during this task; body format and any `Retry-After` unknown. | — |
| Practical guidance for the dashboard | Data changes once per day (see latency), so cache per (grid cell, parameter set, date range) server-side for ≥ 6 h, issue ≤ 5 concurrent requests, and never poll the same location in a loop. | derived from the two tutorial statements above |

## Response fields

Structure taken from the live samples (2026-10-05). Fill value is `-999.0` (`header.fill_value`) in every temporal response.

### Point responses (`daily/point`, `hourly/point`, `monthly/point`, `climatology/point`) — GeoJSON Feature

| Field | Type | Units / format | Nullable | Notes (from samples) |
|---|---|---|---|---|
| `type` | string | `"Feature"` | no | |
| `geometry.type` | string | `"Point"` | no | |
| `geometry.coordinates` | number[3] | `[longitude, latitude, third]` | no | Live: `[-95.097, 29.55, 8.9]` — the requested point rounded to 3 decimals (not the grid centre). UNVERIFIED: the third value is presumed site elevation in metres (spec says MERRA-2 elevation is used when `site-elevation` is omitted) |
| `properties.parameter.<CODE>` | object | map of time key → number | no | Keys: daily `YYYYMMDD` (`"20260921"`); hourly `YYYYMMDDHH` (`"2026100300"`, 00–23 in the requested time standard); monthly `YYYYMM` plus `YYYY13` = annual (observed `"202513"`; UNVERIFIED that "13" is documented as the annual key); climatology `JAN`…`DEC` + `ANN` |
| `properties.parameter.<CODE>.<key>` | number | per `parameters.<CODE>.units` | no (missing = `-999.0`) | Values are floats with 2–4 decimals (`units_digits` 2 for T2M/UV via manager metadata) |
| `header.title` | string | — | no | e.g. `"NASA/POWER Source Native Resolution Daily Data"` |
| `header.api.version` / `header.api.name` | string | — | no | `"v2.10.0"` / `"POWER Daily API"`; hourly `"v2.10.2"` |
| `header.sources` | string[] | — | no | e.g. `["GEOSIT","POWER"]`, `["FLASHFLUX","GEOSIT"]`, `["SYN1DEG","GEOSIT","POWER"]`, climatology `["SYN1DEG","MERRA2","POWER"]` |
| `header.fill_value` | number | — | no | `-999.0` |
| `header.time_standard` | string | `"LST"` or `"UTC"` | no | echoes request |
| `header.start`, `header.end` | string | `YYYYMMDD` | no (absent on climatology) | Monthly returns `"20250101"`/`"20251231"` for `start=2025&end=2025`; future `end` is clamped (`"20261005"`) |
| `header.range` | string | — | climatology only | `"20-year Meteorological and Solar Monthly & Annual Climatologies (January 2001 - December 2020)"` |
| `messages` | string[] | — | no (may be empty `[]`) | Climatology: `"The requested parameters are retrieved from a pre-computed climatological period (January 2001 - December 2020)"` |
| `parameters.<CODE>.units` | string | — | no | e.g. `C`, `%`, `kPa`, `m/s`, `mm/day`, `mm/hour`, `kW-hr/m^2/day`, `Wh/m^2`, `W m-2 x 40`; imperial: `F`, `mph` |
| `parameters.<CODE>.longname` | string | — | no | e.g. `"Temperature at 2 Meters"` |
| `times.data`, `times.process` | number | seconds | no | server-side timings, e.g. `0.286` / `0.01` |

### Regional response (`daily/regional`) — GeoJSON FeatureCollection

| Field | Type | Notes |
|---|---|---|
| `type` | string | `"FeatureCollection"` (appears as the last key) |
| `features[]` | Feature[] | One Feature per grid cell; `geometry.coordinates` are cell centres on the 0.5° lat × 0.625° lon meteorology grid (observed lon −96.25, −95.625, −95.0; lat 28.5, 29.0, 29.5, 30.0, 30.5) with a third value per cell (3.5, 1.61, 0.2 …) |
| `features[].properties.parameter.<CODE>.<YYYYMMDD>` | number | same key format as point |
| `header`, `messages`, `parameters`, `times` | as point | `header.sources` `["GEOSIT"]` for 2026-10-01/02 |

### Manager `parameters` response

| Field | Type | Notes |
|---|---|---|
| `<CODE>` (top-level key per parameter) | object | e.g. `T2M`, `RH2M` |
| `<CODE>.type` | string | `"METEOROLOGY"` or `"RADIATION"` |
| `<CODE>.temporal` | string | `"DAILY"`, `"HOURLY"`, … (echo of query) |
| `<CODE>.source` | string | `"SOURCE"` or `"POWER"` (POWER-derived) |
| `<CODE>.community` | string | echo of query |
| `<CODE>.calculated` | boolean | `false` for all nine target parameters |
| `<CODE>.inputs` | null or array | `null` for all nine |
| `<CODE>.units`, `<CODE>.name`, `<CODE>.definition` | string | catalog metadata |
| with `metadata=true`: `units_name`, `units_html`, `units_min`, `units_max`, `units_digits`, `data_type`, `time_start`, `time_end`, `time_standard`, `display_tag`, `display_messages`, `search_aliases`, `display_icon` | mixed | several are `null`/`""` in the live sample |

`/api/system/manager/parameters/{parameter}` returns `{ "<CODE>": { "temporal": { "HOURLY"|"DAILY"|"MONTHLY"|"CLIMATOLOGY": { name, definition, communities[], calculated } }, "type" } }` (live sample `power-manager-parameter-T2M.json`).

### Error responses (HTTP 422, `Content-Type: application/json`) — two shapes observed

| Shape | When | Example |
|---|---|---|
| POWER validation | wrong parameter code, too many parameters, bad community, regional span | `{"header":"The POWER Daily API failed to complete your request; please review the errors below and the POWER Docs (https://power.larc.nasa.gov/docs/).","messages":["One of your parameters is incorrect: NOT_A_PARAM."]}` |
| Framework validation | enum/missing field | `{"detail":[{"type":"missing","loc":["query","community"],"msg":"Field required","input":null}]}` |

## Sample requests

All run on 2026-10-05 from Bash with curl; responses saved verbatim (pretty-printed with 2-space indent, values untouched) in `C:/Users/Eesha/AppData/Local/Temp/claude/C--Users-Eesha/057441e4-62ce-45c9-9629-2b1d6914ac67/scratchpad/research/samples/`. Raw bodies, header captures and the five OpenAPI specs are kept in `samples/power-raw/`.

| # | curl | Result | Sample file |
|---|---|---|---|
| 1 | `curl -s -D - -o out.json -w '%{http_code} %{time_total}' "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2M_MAX,T2M_MIN,RH2M,WS10M,PRECTOTCORR&community=RE&longitude=-95.0970&latitude=29.5502&start=20260921&end=20261004&format=JSON"` | 200, 0.597 s | `power-daily-point.json` (complete, 14 days × 6 params) |
| 2 | `curl -s "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PS,ALLSKY_SFC_SW_DWN,ALLSKY_SFC_UV_INDEX&community=RE&longitude=-95.0970&latitude=29.5502&start=20260921&end=20261004&format=JSON"` | 200, 0.494 s | `power-daily-point-solar.json` (complete) |
| 3 | `curl -s "https://power.larc.nasa.gov/api/temporal/hourly/point?parameters=T2M,RH2M,WS10M,PS,ALLSKY_SFC_SW_DWN,PRECTOTCORR&community=RE&longitude=-95.0970&latitude=29.5502&start=20261003&end=20261004&format=JSON&time-standard=UTC"` | 200, 0.873 s | `power-hourly-point.json` (each parameter map truncated to its first 5 hour keys of 48; header/parameters/times complete) |
| 4 | `curl -s -H "Origin: http://localhost:5173" "https://power.larc.nasa.gov/api/temporal/daily/regional?parameters=T2M&community=RE&latitude-min=28.5&latitude-max=30.5&longitude-min=-96.5&longitude-max=-94.5&start=20261001&end=20261002&format=JSON"` | 200, 0.388 s, `access-control-allow-origin: *` | `power-daily-regional.json` (`features` truncated to first 3 of 15; rest complete) |
| 5 | `curl -s "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,RH2M,ALLSKY_SFC_SW_DWN,ALLSKY_SFC_UV_INDEX,PRECTOTCORR&community=RE&longitude=-95.0970&latitude=29.5502&format=JSON"` | 200, 0.469 s | `power-climatology-point.json` (complete) |
| 6 | `curl -s "https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,PRECTOTCORR&community=RE&longitude=-95.0970&latitude=29.5502&start=2025&end=2025&format=JSON"` | 200, 0.386 s | `power-monthly-point.json` (complete) |
| 7 | `curl -s "https://power.larc.nasa.gov/api/system/manager/parameters?community=RE&temporal=daily&parameters=T2M,T2M_MAX,T2M_MIN,RH2M,PS,WS10M,ALLSKY_SFC_SW_DWN,ALLSKY_SFC_UV_INDEX,PRECTOTCORR"` | 200, 0.293 s | `power-manager-parameters.json` (complete) |
| 8 | `curl -s "https://power.larc.nasa.gov/api/system/manager/parameters/T2M"` | 200, 0.304 s | `power-manager-parameter-T2M.json` (complete) |
| 9 | `curl -s "https://power.larc.nasa.gov/api/temporal/daily/configuration"` | 200, 0.311 s | `power-daily-configuration.json` (complete) |
| 10 | `curl -s "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=NOT_A_PARAM&community=RE&longitude=-95.0970&latitude=29.5502&start=20261001&end=20261002&format=JSON"` | 422, 0.338 s | `power-error-422-invalid-parameter.json` |
| 11 | `curl -s "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M&community=RE&longitude=-95.0970&latitude=29.5502&start=20261001&end=20261002&format=GEOJSON"` | 422, 0.261 s | `power-error-422-format-enum.json` |
| 12 | `curl -s "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_UV_INDEX,ALLSKY_SFC_SW_DWN&community=RE&longitude=-95.0970&latitude=29.5502&start=20260301&end=20261004&format=JSON"` (latency probe) | 200, 0.446 s | raw only: `power-raw/uv_latency_raw.json` |
| 13 | `curl -s -X OPTIONS -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET" "https://power.larc.nasa.gov/api/temporal/daily/point?…"` | **404** `text/html` from S3/CloudFront (no CORS headers) | — |

## Availability and caveats

| Topic | Finding | Source |
|---|---|---|
| Status today | Every endpoint called returned 200 within 0.17–0.87 s; `x-app-version` daily v2.10.0, hourly v2.10.2, manager v2.9.1. The public status page is a JavaScript app ("Monitor the availability and performance of NASA POWER data, application programming interface (API), and model context protocol (MCP) services") with no static status text, so its content is UNVERIFIED. | live calls 2026-10-05; https://power.larc.nasa.gov/status/ (accessed 2026-10-05) |
| Archive window | Daily: 1981-01-01 → `settings.end` 2026-10-05 (configuration endpoint). Hourly: 2001-01-01 → 2026-10-05. Docs: daily "from 1981/01/01 to Near Real Time (NRT)"; hourly from 2001/01/01 (EPW from 2000/01/01). | `GET /api/temporal/daily/configuration`, `GET /api/temporal/hourly/configuration` (2026-10-05); https://power.larc.nasa.gov/docs/services/api/temporal/daily/ and https://power.larc.nasa.gov/docs/services/api/temporal/hourly/ (accessed 2026-10-05) |
| Documented latency | "the POWER Data Archive has a latency of 2–3 days for meteorological parameters and 5–7 days for solar parameters." Source table: GEOS-IT "2 Days"; MERRA-2 "Month Behind Near Real Time"; CERES FLASHFlux "5–7 Days"; CERES SYN1deg "NRT minus ~3–4 months"; IMERG Late Run "14 hours"; IMERG Final "3.5 Months". | https://power.larc.nasa.gov/docs/faqs/data/ ; https://power.larc.nasa.gov/docs/methodology/data/sources/ (accessed 2026-10-05) |
| Observed latency (Houston, 2026-10-05) | Daily meteorology (T2M…, PS, PRECTOTCORR; source GEOSIT): last real value **2026-10-02** (3 days behind); 10-03 and 10-04 are `-999`. Daily `ALLSKY_SFC_SW_DWN` (FLASHFLUX): last value **2026-09-30** (5 days). Daily `ALLSKY_SFC_UV_INDEX`: last value **2026-06-29** (≈ 98 days behind; `-999` for all of Jul–Oct even though the request's `header.sources` lists FLASHFLUX and SYN1DEG). Hourly meteorology (UTC): last hour **2026-10-03 23:00** (2 days). Hourly `ALLSKY_SFC_SW_DWN`: all 48 hours `-999` for 10-03/10-04. | samples 1, 2, 3, 12 (2026-10-05) |
| Revision of recent data | "Within two to three (2–3) months after real-time, improved climate quality data products replace the meteorological data products." CERES SYN1deg replaces FLASHFlux "to within approximately 3–4 months of current time"; FLASHFlux fills "to near real time (about 1 week)". | https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/ ; https://power.larc.nasa.gov/docs/methodology/energy-fluxes/ (accessed 2026-10-05) |
| Empty-result behaviour | Never an empty object: every requested key is present and missing days/hours are `-999.0`. A date range beyond the archive is silently clamped (`end=20261231` → `header.end="20261005"`), not rejected. Climatology ignores `start`/`end` unless a custom period is wanted. | live calls 2026-10-05 |
| CORS | `access-control-allow-origin: *` is returned on GET when an `Origin` header is sent (observed on 200 point, 200 regional, 200 manager and 422 error responses); it was absent on a GET without `Origin`. **Preflight (`OPTIONS`) returns 404 `text/html` from the static S3/CloudFront site**, so browser fetches must stay "simple" (plain GET, no custom headers) or go through the Node backend. | live calls 2026-10-05 |
| Time standard | Default LST; `time-standard=UTC` accepted (upper or lower case). Hourly LST "is created on-the-fly within the API". For aligning with wearable timestamps request UTC. | spec + https://power.larc.nasa.gov/docs/services/api/temporal/hourly/ (accessed 2026-10-05) |
| Resolution caveat | Point values are grid-cell values (0.5° × 0.625° meteorology, 1° × 1° solar); the point response echoes the requested coordinates, not the cell centre. "Avoid requesting resolutions finer than available data" (tutorial). | https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/ (accessed 2026-10-05); live regional sample |
| Formats | One format per request; no GeoJSON format value (JSON already is GeoJSON); CSV/ASCII honour `header=false`, JSON does not. NETCDF "recommended for large regions" (spec). | https://power.larc.nasa.gov/docs/services/api/temporal/ ; spec (accessed 2026-10-05) |
| Deprecations / changes | Docs note the API "have been seamlessly migrated to use the POWER Data v10" with changed direct datastore paths; no deprecation of the endpoints above was found. `hy` appears in the OpenAPI `community` enum but is rejected live. | https://power.larc.nasa.gov/docs/ (accessed 2026-10-05); live 422 |
| Bulk alternative | AWS Open Data buckets (free): `https://nasa-power.s3.us-west-2.amazonaws.com/index.html` (ARD), `https://power-datastore.s3.us-west-2.amazonaws.com/index.html`, `https://power-services-datastore.s3.us-west-2.amazonaws.com/index.html`. | https://power.larc.nasa.gov/docs/services/aws/ (accessed 2026-10-05) |
| Units caveat | `ALLSKY_SFC_UV_INDEX` units are "W m-2 x 40" (range 0–30 via metadata); it is an index, not W/m². Hourly PRECTOTCORR is `mm/hour` in the data response but `mm/day` in the manager catalog — use the response's `parameters` block. | manager + live samples (2026-10-05) |

## Dashboard relevance

Concrete widgets the POWER data enables (all per wearer location, keyless, cacheable daily):

| Widget | Endpoint / params | Notes |
|---|---|---|
| 14-day ambient temperature band vs resting HR / HRV | `daily/point` `T2M_MIN,T2M,T2M_MAX` | Ends 3 days before today; show "data through 2026-10-02" badge from last non-`-999` key |
| Heat-stress / humidity panel | `daily/point` `T2M_MAX,RH2M` (or hourly `T2M,RH2M`) | Compute heat-index client-side; flag days with `T2M_MAX` above a threshold as events |
| Barometric pressure trend vs headache/sleep logs | `daily/point` or `hourly/point` `PS` (kPa) | Hourly UTC series aligns with watch timestamps |
| Wind and rain context | `WS10M` (m/s), `PRECTOTCORR` (mm/day; mm/hour hourly) | |
| Solar exposure (GHI) | `ALLSKY_SFC_SW_DWN` daily kW-hr/m²/day; hourly Wh/m² | 5-day lag; hourly solar lagged > 2 days |
| UV index | `climatology/point` `ALLSKY_SFC_UV_INDEX` (monthly normals, e.g. Houston OCT 1.28) | Daily UV is ~3 months behind, so use the climatological monthly value as "typical UV this month" and label it as such |
| 24-hour profile overlay | `hourly/point` `time-standard=UTC`, keys `YYYYMMDDHH` | Overlay hourly HR on hourly T2M/RH2M for the last available day |
| Regional heat map (optional) | `daily/regional` one parameter, 2°–10° box | 15 cells for a 2°×2° box; use for a "your region today" tile |
| Parameter catalog / tooltips | `system/manager/parameters?community=RE&temporal=daily&metadata=true` | Supplies `name`, `definition`, `units`, `units_min/max` for UI labels |

Mapping into `NASAEvent {id, source, eventType, timestamp, latitude?, longitude?, metadata}` (one event per time key, or per threshold crossing):

| NASAEvent field | POWER mapping |
|---|---|
| `id` | `power:${temporal}:${lat}:${lon}:${timeKey}` (e.g. `power:daily:29.5502:-95.097:20261002`); regional: include cell centre coordinates |
| `source` | `"NASA POWER"` plus `header.api.name`/`header.api.version` and `header.sources` in metadata (needed for the citation requirement) |
| `eventType` | `"environment.daily"` / `"environment.hourly"` / `"environment.climatology"`; derived alerts such as `"environment.heat"` when `T2M_MAX` crosses a configured threshold |
| `timestamp` | daily key `YYYYMMDD` → ISO date (LST or UTC per `header.time_standard`); hourly key `YYYYMMDDHH` → `YYYY-MM-DDTHH:00:00Z` when requested with `time-standard=UTC`; monthly `YYYYMM` (`13` = annual); climatology `JAN…DEC/ANN` |
| `latitude`, `longitude` | `geometry.coordinates[1]`, `geometry.coordinates[0]` |
| `metadata` | `{ values: { T2M: 28.81, … }, units: parameters.<CODE>.units, longnames, fill_value: -999, time_standard, sources, api_version, elevation: geometry.coordinates[2] }` — convert every `-999` to `null` before storing |

Backend pattern: one Node fetch per (location, day) with `format=JSON`, `community=RE`, ≤ 20 parameters (≤ 15 hourly), cache ≥ 6 h, ≤ 5 concurrent upstream calls, forward only plain GETs (no custom headers) if the browser ever calls POWER directly.

## Open questions

1. UNVERIFIED: numeric rate limit (requests/min) and the body/headers of a 429 response — no number is documented and no 429 or rate-limit header was observed.
2. UNVERIFIED: the sentence "If an application persists in requesting the same relative location, it will potentially be blocked." — attributed by site search to the Daily API page, not seen in fetched page text.
3. UNVERIFIED: meaning of community `hy` (present in the OpenAPI enum, rejected live with "Please provide a correct user community value.").
4. UNVERIFIED: that `geometry.coordinates[2]` is elevation in metres (8.9 for the Houston request).
5. UNVERIFIED: documented maximum date span per request (a 7-month daily request succeeded; longer spans untested).
6. UNVERIFIED: whether monthly key `YYYY13` (annual) is documented; observed only.
7. UNVERIFIED: hourly solar (`ALLSKY_SFC_SW_DWN`) exact lag — all `-999` for the last two full days; documented 5–7 days for solar generally.
8. UNVERIFIED: the full list of valid `wind-surface` aliases beyond the `vegtype_*` keys returned by `/api/system/manager/surface`, and whether `SeaIce` (named in the daily docs) is one of them.
9. UNVERIFIED: current status-page content (JavaScript-rendered); availability was verified only by live calls.
10. UNVERIFIED: whether the UV index (`ALLSKY_SFC_UV_INDEX`) is only produced from CERES SYN1deg (would explain the ~3-month lag); inferred from the observed last valid date 2026-06-29, not from a documented statement.
