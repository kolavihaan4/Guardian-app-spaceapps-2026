# NASA EONET v3 (Earth Observatory Natural Event Tracker) — research report

Key: `eonet` · Researched 2026-10-05 (all live calls made 2026-10-05 between 23:42 and 23:58 UTC from one client IP) · Prototype context: React+TS frontend, Node+TS backend, NASA data next to smartwatch vitals.

Citation shorthand used below (all accessed 2026-10-05):

| Tag | URL |
|---|---|
| DOCS | https://eonet.gsfc.nasa.gov/docs/v3 |
| ABOUT | https://eonet.gsfc.nasa.gov/what-is-eonet (disclaimer anchor: https://eonet.gsfc.nasa.gov/what-is-eonet#disclaimer) |
| CHANGELOG | https://eonet.gsfc.nasa.gov/docs/changelog |
| HOWTO | https://eonet.gsfc.nasa.gov/how-to-guide |
| CATALOG | https://api.nasa.gov/assets/json/apis.json (the data file behind the https://api.nasa.gov/ catalog page; EONET entry id "1") |
| RFC7946 | https://www.rfc-editor.org/rfc/rfc7946 (GeoJSON; coordinate order, section 3.1.1) |
| LIVE | my own live HTTP calls on 2026-10-05; raw bodies/headers kept in `.../scratchpad/research/raw/`, truncated verbatim samples in `.../scratchpad/research/samples/eonet-*.json` |

Anything not covered by one of these is prefixed **UNVERIFIED:**.

## Overview

| Item | Fact | Source |
|---|---|---|
| What it is | "The Earth Observatory Natural Event Tracker (EONET) is a prototype web service with the goal of: providing a curated source of continuously updated natural event metadata; providing a service that links those natural events to thematically-related web service-enabled image sources (e.g., via WMS, WMTS, etc.)." | CATALOG (EONET entry `html_template`) |
| Who/since | "Development of EONET began in 2015 and has been supported by" NASA's Earth Observatory and the Earth Science Data Systems / ESDIS project; hosted at eonet.gsfc.nasa.gov (NASA GSFC); page footer "Responsible NASA Official: Robert Levy", "Page Last Updated: October 5, 2026" | ABOUT, DOCS footer |
| Current version | "Version 3 is the latest version of the API. Version 2.1 is deprecated and tagged for removal but is still currently available." | DOCS |
| Data model | Event = id, title, description, link, closed, categories[], sources[], geometry[] (each geometry = date + Point/Polygon + magnitudeValue/Unit). 13 categories, 33 sources, 11 magnitude types, 201 GIBS imagery layers. | DOCS; LIVE (`eonet-categories.json`, `eonet-sources.json`, `eonet-magnitudes.json`, `eonet-layers.json`) |
| Disclaimer (terms) | "All EONET metadata and services are intended to be used for visualization and general information purposes only and should not be construed as "official" with regards to spatial or temporal extent. Spatial and temporal extents of natural events represented in EONET are based on multiple sources, and often these representations are approximations at best." | ABOUT#disclaimer; DOCS ("all metadata contained within EONET is subject to our disclaimer") |
| Why it matters for a space-health dashboard | Keyless, CORS-open (`Access-Control-Allow-Origin: *` observed) feed of geolocated, time-stamped natural events (wildfires with acreage, tropical storms with 6-hourly wind-speed fixes, floods, volcanoes, dust/haze, temperature extremes, …). It is the environmental-exposure context layer to put beside wearable vitals: e.g. "wildfire/dust-haze events within N km of the wearer" next to resting HR / SpO2, "temperature-extreme event active in region" next to HR/skin-temp, "storm passage" next to sleep/activity. Each category also links to NASA GIBS WMTS imagery layers that can be drawn under the vitals map. | LIVE headers; DOCS (Layers section); CATALOG (NRT imagery motivation) |

## Official documentation

| URL | What it provided | Accessed |
|---|---|---|
| https://eonet.gsfc.nasa.gov/docs/v3 | Field definitions (Events, Events GeoJSON, Categories, Sources, Layers), parameter tables for `/events`, `/events/geojson`, `/categories/{id}`, `/layers/{id}`, example URLs, versioning statement, links to `/events/rss`, `/events/atom`, `/magnitudes`, `/sources` in the navigation | 2026-10-05 |
| https://eonet.gsfc.nasa.gov/what-is-eonet | Program background, staff, full disclaimer text | 2026-10-05 |
| https://eonet.gsfc.nasa.gov/docs/changelog | Version history: v3.0 stable 2020-03-01; v3 beta entries Dec 2019–Jan 2020 (magnitudes, bbox, geometryDates, human-readable category ids); v2.0 "Officially decommissioned" 2021-01-19 | 2026-10-05 |
| https://eonet.gsfc.nasa.gov/how-to-guide | Official jQuery/OpenLayers examples: `GET /api/v3/events?status=open&limit=20`, `GET /api/v3/events/{eventId}`, `GET /api/v3/layers/{categoryId}`; polygon centroid code reading `coordinates[0][i][0]` as longitude and `[1]` as latitude; "NASA GIBS WMTS … is currently the only WMTS server represented in EONET" | 2026-10-05 |
| https://api.nasa.gov/assets/json/apis.json | api.nasa.gov catalog data: EONET entry (id "1", summary "The Earth Observatory Natural Event Tracker"), description text, no `api_key` mention, links to eonet.gsfc.nasa.gov docs (the link still points at `/docs/v2.1`) | 2026-10-05 (1 request; static asset, no rate-limit headers returned) |
| https://www.rfc-editor.org/rfc/rfc7946 | GeoJSON position order (longitude, latitude) used to judge the coordinate-order observations | 2026-10-05 |

Not documented anywhere in the above (searched DOCS, ABOUT, CHANGELOG, HOWTO text): authentication/API keys, rate limits, update cadence, maximum `limit`, CORS policy, error formats.

## Base URL and endpoints

Base URL: `https://eonet.gsfc.nasa.gov/api/v3` (DOCS examples). No key for any endpoint (DOCS/HOWTO show none; LIVE: all calls keyless). All responses are JSON unless noted.

| Method | Path | Purpose | Key required? | Verified live 2026-10-05 (HTTP status, latency via curl `%{time_total}`) | Source |
|---|---|---|---|---|---|
| GET | `/api/v3/events` | List events (JSON), filterable | No | 200 / 0.261 s (`?status=open&limit=5&days=30`); 200 / 0.281 s (`?category=severeStorms&limit=3&days=60`); 200 / 0.562 s (`?status=closed&limit=3&days=30`, 225 KB body); 200 / 0.334 s (magnitude filter); 200 / 0.387 s (`start/end`); 200 / 1.944 s (`bbox` CONUS); 200 / 0.311 s (unknown category); 200 / 0.274 s (numeric `category=8`); 200 / 0.381 s (empty 1990 range); 200 / 1.222 s (`status=all&limit=3`) | DOCS; LIVE |
| GET | `/api/v3/events/geojson` | Same filters, output as GeoJSON FeatureCollection | No | 200 / 0.284 s (`?limit=3&days=30`); 200 / 0.302 s (`?category=severeStorms&limit=2&days=60`); 200 / 0.256 s (empty 1990 range) | DOCS; LIVE |
| GET | `/api/v3/events/{id}` | One event object | No | 200 / 0.211 s (`EONET_25043`); unknown id `EONET_0` → **500** / 0.231 s with an HTML "Server Error" page | HOWTO (`$.getJSON("https://eonet.gsfc.nasa.gov/api/v3/events/" + eventId)`); DOCS (`link` field = "The full link to the API endpoint for this specific event"); LIVE |
| GET | `/api/v3/events/{id}/geojson` | One event as a FeatureCollection | No | 200 / 0.214 s (`EONET_24962`, 22 features) | Not in DOCS; URL is the value of `properties.link` in every GeoJSON feature (LIVE `eonet-events-geojson-severeStorms.json`) |
| GET | `/api/v3/events/rss` | RSS 2.0 feed of events (XML, georss/gml namespaces) | No | 200 / 0.221 s, `Content-Type: application/rss+xml` | DOCS navigation link; LIVE |
| GET | `/api/v3/events/atom` | Atom feed of events (XML, georss/gml/source/magnitude namespaces) | No | 200 / 0.206 s, `Content-Type: application/atom+xml` | DOCS navigation link; LIVE |
| GET | `/api/v3/categories` | List the 13 categories | No | 200 / 0.281 s | DOCS; LIVE |
| GET | `/api/v3/categories/{categoryId}` | Events of one category (events envelope) | No | 200 / 0.284 s (`wildfires?limit=3&days=30`); 200 / 0.313 s (`wildfires?status=all&limit=1&days=30`) | DOCS; LIVE |
| GET | `/api/v3/sources` | List the 33 sources | No | 200 / **3.316 s** (slow outlier; other calls 0.2–0.6 s) | DOCS (Fields: "The acceptable sources can be accessed via the sources JSON"); LIVE |
| GET | `/api/v3/layers` | All imagery layers (201) | No | 200 / 0.389 s (57 KB) | DOCS; LIVE |
| GET | `/api/v3/layers/{categoryId}` | Layers mapped to one category | No | 200 / 0.240 s (`wildfires`: 27 layers) | DOCS; HOWTO; LIVE |
| GET | `/api/v3/magnitudes` | List the 11 magnitude ids/units | No | 200 / 0.214 s | DOCS navigation link ("Magnitudes"); LIVE |
| OPTIONS | `/api/v3/events` | CORS preflight | No | 204 / 0.200 s (headers in "Availability and caveats") | LIVE |

Deprecated/legacy: `https://eonet.gsfc.nasa.gov/docs/v2.1` still linked ("deprecated and tagged for removal", DOCS); v2.0 "Officially decommissioned" 2021-01-19 (CHANGELOG). Not tested live.

## Parameters

### `/api/v3/events` and `/api/v3/events/geojson` (identical parameter tables in DOCS)

| Name | Type | Required | Allowed values / format | Default | Notes | Source |
|---|---|---|---|---|---|---|
| `source` | string (Source ID) | No | Any `id` from `/sources` (e.g. `InciWeb`, `EO`); multiple comma-separated | none (all sources) | "Filter the returned events by the Source. Multiple sources can be included in the parameter: comma separated, operates as a boolean OR." Example `?source=InciWeb,EO` | DOCS |
| `category` | string (Category ID) | No | Any `id` from `/categories` (e.g. `severeStorms`, `wildfires`); comma-separated OR | none (all) | "Filter the returned events by the category. Multiple sources [sic] can be included in the parameter: comma separated, operates as a boolean OR." Numeric legacy ids still accepted ("Swapped the ID from numeric to human readable ID. Numeric is still valid for queries", CHANGELOG 2020-01-15) — LIVE: `category=8` returned wildfires. LIVE: an unknown value (`notARealCategory`) is silently ignored → 200 with the unfiltered list (no error). | DOCS; CHANGELOG; LIVE |
| `status` | enum | No | `open` \| `closed` \| `all` | `open` | "Omitting the status parameter will return only the currently open events (default). Using "all" will list open and closed values." `closed` events carry a non-null `closed` date. | DOCS |
| `limit` | integer (`#`) | No | positive integer; **UNVERIFIED:** maximum/upper bound not documented | none documented (**UNVERIFIED:** default page size) | "Limits the number of events returned". LIVE: on `/events/geojson` the limit counts *events*, not features — `limit=2` returned 31 Point features (22 + 9 track fixes). | DOCS; LIVE |
| `days` | integer (`#`) | No | positive integer | none | "Limit the number of prior days (including today) from which events will be returned." | DOCS |
| `start` | date `YYYY-MM-DD` | No | ISO calendar date | none | "Select a range of dates for the events to fall between (inclusive) in a YYYY-MM-DD format." LIVE: `start=2000-01-01&end=2000-01-02&status=all` returned two archived 2000 cyclone tracks (filter matches geometry dates; whole event incl. all geometries is returned). | DOCS; LIVE |
| `end` | date `YYYY-MM-DD` | No | ISO calendar date | none | As above (inclusive). | DOCS |
| `magID` | string (Magnitude ID) | No | one `id` from `/magnitudes`: `ac`, `ha`, `mag_kts`, `mb`, `mi`, `ml`, `mms`, `mwb`, `mwc`, `mwr`, `sq_NM` | none | "Select a ceiling, floor, or range of magnitude values for the events to fall between (inclusive)." Example `?magID=mag_kts&magMin=1.50&magMax=20` | DOCS; LIVE (`eonet-magnitudes.json`) |
| `magMin` | decimal (`#.##`) | No | number | none | floor, inclusive; used with `magID` | DOCS |
| `magMax` | decimal (`#.##`) | No | number | none | ceiling, inclusive; used with `magID` | DOCS |
| `bbox` | 4 comma-separated numbers | No | `min lon, max lat, max lon, min lat` — "two pairs of coordinates: the upper left hand corner (lon,lat) followed by the lower right hand corner (lon,lat)". Example `?bbox=-129.02,50.73,-58.71,12.89` (CONUS) | none | "Query using a bounding box for all events with datapoints that fall within." LIVE: docs example returned only US events. Note the order is NOT the usual GeoJSON/WMS `minLon,minLat,maxLon,maxLat`. | DOCS; LIVE |

### `/api/v3/categories/{categoryId}`

| Name | Type | Required | Allowed values / format | Default | Notes | Source |
|---|---|---|---|---|---|---|
| `{categoryId}` | path, string | Yes | a category `id` (e.g. `wildfires`, `landslides`) | — | "Filter the events by the Category." | DOCS |
| `source` | string | No | Source IDs, comma-separated OR | none | "Filter the topically-constrained events by the Source." | DOCS |
| `status` | enum | No | documented `open` \| `closed`; LIVE: `all` also accepted (returned a closed event) | `open` ("Omitting the status parameter will return only the currently open events.") | | DOCS; LIVE |
| `limit` | integer | No | positive integer | none | "Limits the number of events returned" | DOCS |
| `days` | integer | No | positive integer | none | prior days including today | DOCS |
| `start`, `end` | `YYYY-MM-DD` | No | inclusive range | none | | DOCS |
| `bbox`, `magID/magMin/magMax` | — | — | **UNVERIFIED:** not documented for this endpoint and not tested | | | DOCS |

### `/api/v3/layers/{categoryId}`

| Name | Type | Required | Allowed values | Notes | Source |
|---|---|---|---|---|---|
| `{categoryId}` | path, string | Yes | category `id` (`wildfires`, `landslides`, …) | "Filter the layers by the Category." No query parameters documented. | DOCS |

### `/api/v3/events/{id}`, `/api/v3/events/{id}/geojson`

| Name | Type | Required | Format | Notes | Source |
|---|---|---|---|---|---|
| `{id}` | path, string | Yes | `EONET_<integer>` (e.g. `EONET_25043`) | No query parameters documented. Unknown id → HTTP 500 HTML page (LIVE). | HOWTO; LIVE |

### `/api/v3/categories`, `/api/v3/sources`, `/api/v3/magnitudes`, `/api/v3/layers`

No parameters documented (DOCS). LIVE calls were made without parameters.

## Authentication

| Item | Fact | Source |
|---|---|---|
| Mechanism | **None.** No `api_key` query parameter, header or token appears anywhere in DOCS, HOWTO, CHANGELOG or ABOUT; the official how-to examples call the API with plain `$.getJSON(url, {status, limit})`. | DOCS; HOWTO |
| Live confirmation | Every call in this report succeeded with no credentials (HTTP 200/204). | LIVE |
| Relationship to api.nasa.gov | EONET is listed in the api.nasa.gov catalog (entry id "1", name "EONET"), but its entry contains no `api_key` text and points to the eonet.gsfc.nasa.gov documentation; the service itself is served from `eonet.gsfc.nasa.gov`, not `api.nasa.gov`, so the shared `DEMO_KEY` per-IP budget does not apply to EONET traffic. | CATALOG; LIVE |
| How to obtain a key | Not applicable. | DOCS |
| Terms | Only the disclaimer quoted in Overview (visualization/general-information use; extents are approximations). **UNVERIFIED:** no separate terms-of-use or attribution requirement page was found/opened (footer links NASA's general web privacy policy, not opened). | ABOUT#disclaimer |

## Rate limits

| Item | Observation / statement | Source |
|---|---|---|
| Documented limits | None. The words "rate", "limit" (other than the `limit` parameter) and "key" do not appear in DOCS, HOWTO or CHANGELOG. | DOCS; HOWTO; CHANGELOG |
| Headers observed | `X-RateLimit-Limit: 60` and `X-RateLimit-Remaining: <n>` are returned by `/events`, `/events/geojson`, `/events/rss`, `/events/atom`. They are **absent** on `/categories`, `/categories/{id}`, `/sources`, `/layers`, `/layers/{id}`, `/magnitudes`, `/events/{id}`, `/events/{id}/geojson` and on the OPTIONS preflight. | LIVE (raw `.hdr` files) |
| Decrement behaviour | Remaining fell 59 → 58 → 57 → 56 → 55 → 54 → 53 → 52 across eight events-family calls made 23:42:58–23:43:07 UTC (one unit per request regardless of `limit`/payload size). Two minutes later (~23:45 UTC) a call reported `Remaining: 59` again, and at ~23:58 UTC `56–58`. → a rolling/resetting window of 60 requests; **UNVERIFIED:** window length (observations are consistent with 60 per minute) and whether it is keyed per IP. | LIVE |
| Behaviour on 429 | **UNVERIFIED:** not provoked (would require >60 requests/min against a shared NASA service). No `Retry-After` header was seen on any response. | LIVE |
| Caching hints | `Cache-Control: no-cache, private` on every response → the server does not help you cache; do it in the Node backend (e.g. 5–15 min TTL per query string) so the whole user base shares one 60/min budget. | LIVE |

## Response fields

Types, units and nullability below come from the live samples listed in "Sample requests" (LIVE) and the field definitions in DOCS. "Observed" = seen in at least one sample; "n/o" = documented but not observed in any sample today.

### `/events`, `/categories/{categoryId}` (events envelope)

| Field | Type | Nullable | Units/format | Notes | Source |
|---|---|---|---|---|---|
| `title` | string | no | — | `"EONET Events"`; on `/categories/wildfires`: `"EONET Events: Wildfires"` | LIVE |
| `description` | string | no | — | `"Natural events from EONET."`; on `/categories/{id}` = the category description | LIVE |
| `link` | string (URL) | no | — | the endpoint URL | LIVE |
| `events` | `Event[]` | no (empty array when nothing matches) | — | LIVE: empty 1990 range → `"events": []` with HTTP 200 | LIVE |

`Event` object:

| Field | Type | Nullable | Units/format | Notes | Source |
|---|---|---|---|---|---|
| `id` | string | no | `EONET_<n>` e.g. `EONET_25043` | "Unique id for this event." Ids are strings, not numbers. | DOCS; LIVE |
| `title` | string | no | — | e.g. `"Super Typhoon Choi-wan"`, `"Wildfire Bull, Washoe, Nevada"` | LIVE |
| `description` | string | **yes** | — | "Optional longer description … Most likely only a sentence or two." Observed `null` in most samples, `"15 Miles W from Reno, NV"` in one | DOCS; LIVE |
| `link` | string (URL) | no | `https://eonet.gsfc.nasa.gov/api/v3/events/{id}` | "The full link to the API endpoint for this specific event." | DOCS; LIVE |
| `closed` | string | **yes** | ISO 8601 UTC `YYYY-MM-DDTHH:mm:ssZ` | `null` while open; "The closed field will include a date/time when the event has ended … may or may not accurately represent the absolute ending". LIVE: GDACS floods showed `closed: "2026-10-06T00:00:00Z"` at 23:43 UTC on 2026-10-05, i.e. a close date slightly in the future. | DOCS; LIVE |
| `categories` | `{id: string, title: string}[]` | no | — | "One or more categories"; 1 element in all samples | DOCS; LIVE |
| `sources` | `{id: string, url: string}[]` | no | — | "One or more sources"; 1–2 elements observed (e.g. `JTWC` + `NOAA_NHC`); `url` is the source's page for that event | DOCS; LIVE |
| `geometry` | `Geometry[]` | no | — | "One or more event geometries are the pairing of a specific date/time with a location." 1 (fires, floods) to 33 (hurricane track) elements observed; 41 on an archived 2000 cyclone | DOCS; LIVE |

`Geometry` object:

| Field | Type | Nullable | Units/format | Notes | Source |
|---|---|---|---|---|---|
| `magnitudeValue` | number | **yes** | unit given by `magnitudeUnit` | Observed `5072` (acres), `35`…`135` (kts), `5130` (hectare); `null` for GDACS floods | DOCS ("if available"); LIVE |
| `magnitudeUnit` | string | **yes** | one of the `unit` strings from `/magnitudes` (`acres`, `hectare`, `kts`, `Mb`, `Mi/Mwp`, `Ml`, `Mw/Mww`, `Mwb`, `Mwc`, `Mwr`, `NM^2`) | `null` when no magnitude | LIVE |
| `magnitudeDescription` | string | — | — | **n/o**: documented ("magnitudeValue/Unit/Description") and in CHANGELOG 2019-12-10, but absent from every geometry in every live sample today | DOCS; CHANGELOG; LIVE |
| `date` | string | no | ISO 8601 UTC | "most likely be 00:00Z unless the source provided a particular time"; storms carry 6-hourly fixes (`T00/06/12/18:00:00Z`), IRWIN fires exact minutes | DOCS; LIVE |
| `type` | `"Point"` \| `"Polygon"` | no | GeoJSON geometry type | both observed | DOCS; LIVE |
| `coordinates` | `number[]` for Point; `number[][][]` for Polygon | no | degrees | Point = `[longitude, latitude]` in all samples (e.g. Arizona fire `[-109.401883, 33.447133]`, typhoon `[150.8, 16]`). Polygon = array of linear rings, first ring closed (first = last vertex), 51–8,644 vertices observed. **Caveat:** polygon vertex order was inconsistent — see "Availability and caveats". | DOCS; LIVE; RFC7946 |

### `/events/{id}`

Returns a single `Event` object exactly as above, with no envelope (LIVE `eonet-events-byid.json`: top-level keys `id,title,description,link,closed,categories,sources,geometry`).

### `/events/geojson`

| Field | Type | Notes | Source |
|---|---|---|---|
| `type` | `"FeatureCollection"` | | LIVE |
| `features` | `Feature[]` | **One Feature per geometry entry, not per event**: Super Typhoon Choi-wan (22 geometries) appears as 22 Point Features sharing `properties.id`. Empty result → `"features": []`. | LIVE |
| `features[].type` | `"Feature"` | | LIVE |
| `features[].properties.id` | string | event id (repeats across the event's features) | DOCS; LIVE |
| `features[].properties.title` | string | | DOCS; LIVE |
| `features[].properties.description` | string \| null | | DOCS; LIVE |
| `features[].properties.link` | string (URL) | `https://eonet.gsfc.nasa.gov/api/v3/events/{id}/geojson` | LIVE |
| `features[].properties.closed` | string \| null | ISO 8601 UTC | DOCS; LIVE |
| `features[].properties.date` | string | ISO 8601 UTC date of *this* geometry | DOCS; LIVE |
| `features[].properties.magnitudeValue` | number \| null | | DOCS; LIVE |
| `features[].properties.magnitudeUnit` | string \| null | | DOCS; LIVE |
| `features[].properties.magnitudeDescription` | — | **n/o** (documented, absent) | DOCS; LIVE |
| `features[].properties.categories` | `{id,title}[]` | | DOCS; LIVE |
| `features[].properties.sources` | `{id,url}[]` | | DOCS; LIVE |
| `features[].geometry` | `{type:"Point", coordinates:[lon,lat]}` | only Points observed today; DOCS: "either type Point or Polygon" | DOCS; LIVE |
| `features[].geometryDates` | `string[]` | **n/o**: "In the event that the Feature is a line string, this will be an array of the dates that correspond with the array of coordinates" (DOCS; added 2020-01-14 per CHANGELOG). No LineString feature was returned in any sample. | DOCS; CHANGELOG; LIVE |

### `/events/{id}/geojson`

`{ type: "FeatureCollection", id, title, description, link, closed, categories, sources, features: Feature[] }` — a FeatureCollection with the event-level fields as extra (foreign) members; each feature's `properties` has only `id, title, description, link, closed, date, magnitudeValue, magnitudeUnit` (no `categories`/`sources`). 22 Point features for `EONET_24962`. (LIVE `eonet-events-byid-geojson.json`; not described in DOCS.)

### `/categories`

| Field | Type | Notes | Source |
|---|---|---|---|
| `title`, `description`, `link` | string | `"EONET Event Categories"`, `"List of all the available event categories in the EONET system"`, endpoint URL | LIVE |
| `categories[].id` | **string** (e.g. `"wildfires"`) | DOCS still says "Unique id for this category (integer)" — stale since CHANGELOG 2020-01-15 ("Swapped the ID from numeric to human readable ID"). | DOCS; CHANGELOG; LIVE |
| `categories[].title` | string | | DOCS; LIVE |
| `categories[].description` | string | "Longer description of the category, addressing the scope." | DOCS; LIVE |
| `categories[].link` | string (URL) | `…/api/v3/categories/{id}` — "the same as the Categories API endpoint filtered to return only events from this category" | DOCS; LIVE |
| `categories[].layers` | string (URL) | `…/api/v3/layers/{id}` — "A service endpoint that points to the Layers API endpoint filtered to return only layers from this category." | DOCS; LIVE |

All 13 categories returned live today (`eonet-categories.json`):

| id | title | description (verbatim) |
|---|---|---|
| `drought` | Drought | Long lasting absence of precipitation affecting agriculture and livestock, and the overall availability of food and water. |
| `dustHaze` | Dust and Haze | Related to dust storms, air pollution and other non-volcanic aerosols. Volcano-related plumes shall be included with the originating eruption event. |
| `earthquakes` | Earthquakes | Related to all manner of shaking and displacement. Certain aftermath of earthquakes may also be found under landslides and floods. |
| `floods` | Floods | Related to aspects of actual flooding--e.g., inundation, water extending beyond river and lake extents. |
| `landslides` | Landslides | Related to landslides and variations thereof: mudslides, avalanche. |
| `manmade` | Manmade | Events that have been human-induced and are extreme in their extent. |
| `seaLakeIce` | Sea and Lake Ice | Related to all ice that resides on oceans and lakes, including sea and lake ice (permanent and seasonal) and icebergs. |
| `severeStorms` | Severe Storms | Related to the atmospheric aspect of storms (hurricanes, cyclones, tornadoes, etc.). Results of storms may be included under floods, landslides, etc. |
| `snow` | Snow | Related to snow events, particularly extreme/anomalous snowfall in either timing or extent/depth. |
| `tempExtremes` | Temperature Extremes | Related to anomalous land temperatures, either heat or cold. |
| `volcanoes` | Volcanoes | Related to both the physical effects of an eruption (rock, ash, lava) and the atmospheric (ash and gas plumes). |
| `waterColor` | Water Color | Related to events that alter the appearance of water: phytoplankton, red tide, algae, sediment, whiting, etc. |
| `wildfires` | Wildfires | Wildland fires includes all nature of fire, in forest and plains, as well as those that spread to become urban and industrial fire events. Fires may be naturally caused or manmade. |

### `/sources`

| Field | Type | Notes | Source |
|---|---|---|---|
| `title`, `description`, `link` | string | `"EONET Event Sources"`, `"List of all the available event sources in the EONET system"` | LIVE |
| `sources[].id` | string | the value to use in `?source=` | DOCS; LIVE |
| `sources[].title` | string | | DOCS; LIVE |
| `sources[].source` | string (URL) | "The homepage URL for the source." | DOCS; LIVE |
| `sources[].link` | string (URL) | `…/api/v3/events?source={id}` | DOCS; LIVE |

33 source ids live today: `AVO, ABFIRE, AU_BOM, BYU_ICE, BCWILDFIRE, CALFIRE, CEMS, EO, Earthdata, FEMA, FloodList, GDACS, GLIDE, InciWeb, IRWIN, IDC, JTWC, MRR, MBFIRE, NASA_ESRS, NASA_DISP, NASA_HURR, NOAA_NHC, NOAA_CPC, PDC, ReliefWeb, SIVolcano, NATICE, UNISYS, USGS_EHP, USGS_CMT, HDDS, DFES_WA` (titles/URLs in `eonet-sources.json`). Sources actually seen on current events today: `IRWIN` (US wildfires), `JTWC` and `NOAA_NHC` (storms), `GDACS` (floods, non-US wildfires).

### `/layers` and `/layers/{categoryId}`

| Field | Type | Notes | Source |
|---|---|---|---|
| `title`, `description`, `link` | string | `"EONET Web Service Layers"`, `"List of web service layers in the EONET system"` | LIVE |
| `categories` | array | `/layers` (all): **one** anonymous object `{ layers: Layer[201] }` with no `id`/`title` (LIVE). `/layers/wildfires`: `[{ id: 8, title: "Wildfires", layers: Layer[27] }]` — note the **numeric** category id here vs. the string id in `/categories`. | LIVE |
| `Layer.name` | string | "The name of the layer as specified by the source web service" e.g. `AIRS_CO_Total_Column_Day` | DOCS; LIVE |
| `Layer.serviceUrl` | string (URL) | "The base URL of the web service" — `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi` in samples | DOCS; LIVE |
| `Layer.serviceTypeId` | string | type+version, e.g. `WMTS_1_0_0`; HOWTO: GIBS WMTS "is currently the only WMTS server represented in EONET" | DOCS; HOWTO; LIVE |
| `Layer.parameters` | `Record<string,string>[]` | "Zero or more URL parameters" e.g. `[{"TILEMATRIXSET":"2km","FORMAT":"image/png"}]` | DOCS; LIVE |

### `/magnitudes`

`{ title: "EONET Event Magnitudes", description, link, magnitudes: [{ id, name, unit, description, link }] }` — 11 entries live today (`eonet-magnitudes.json`):

| id (`magID`) | name | unit | used for |
|---|---|---|---|
| `ac` | Acres | `acres` | wildfire area (IRWIN) |
| `ha` | Hectares | `hectare` | wildfire area (GDACS) |
| `mag_kts` | Avg Max Windspeed (kts) | `kts` | "Average Max Sustained Winds reported for severe storms." |
| `mb` | Body Wave Magnitude | `Mb` | earthquakes |
| `mi` | Mi Integrated P-wave | `Mi/Mwp` | earthquakes |
| `ml` | Richter Local Magnitude | `Ml` | earthquakes |
| `mms` | Moment Magnitude Scale | `Mw/Mww` | earthquakes |
| `mwb` | Mwb Body Wave | `Mwb` | earthquakes |
| `mwc` | Mwc Centroid Moment Tensor | `Mwc` | earthquakes |
| `mwr` | Mwr Moment Tensor Inversion | `Mwr` | earthquakes |
| `sq_NM` | Area (Nautical Miles) | `NM^2` | "approximate the area of icebergs" |

### Error responses (LIVE)

| Case | Status | Body | Note |
|---|---|---|---|
| Unknown `category` value | 200 | normal events envelope, filter ignored | no error signalling |
| Date range with no events | 200 | `{"…","events": []}` / `{"type":"FeatureCollection","features": []}` | |
| Unknown event id (`/events/EONET_0`) | **500** | HTML page titled "Server Error", `Content-Type: text/html` | not JSON; handle with `try/catch` around `res.json()` |

## Sample requests

All samples live in `C:/Users/Eesha/AppData/Local/Temp/claude/C--Users-Eesha/057441e4-62ce-45c9-9629-2b1d6914ac67/scratchpad/research/samples/`. Each file is the verbatim live body with arrays longer than N elements truncated to their first N (N stated in the file's `_meta.arraysTruncatedTo`; `/categories`, `/sources`, `/magnitudes` are complete). The `_meta` key (request, status, latency, headers) was added by me and is not part of the API response. Header used on most calls: `-H 'Origin: http://localhost:5173'` to observe CORS behaviour.

| curl command (base `B=https://eonet.gsfc.nasa.gov/api/v3`) | Status / latency | Sample file |
|---|---|---|
| `curl -s -D - -o out.json -w '%{http_code} %{time_total}' "$B/events?status=open&limit=5&days=30"` | 200 / 0.261 s | `eonet-events-open.json` |
| `… "$B/events?category=severeStorms&limit=3&days=60"` | 200 / 0.281 s | `eonet-events-severeStorms.json` |
| `… "$B/events/geojson?limit=3&days=30"` | 200 / 0.284 s | `eonet-events-geojson.json` |
| `… "$B/events/geojson?category=severeStorms&limit=2&days=60"` | 200 / 0.302 s | `eonet-events-geojson-severeStorms.json` |
| `… "$B/events/EONET_25043"` | 200 / 0.211 s | `eonet-events-byid.json` |
| `… "$B/events/EONET_24962/geojson"` | 200 / 0.214 s | `eonet-events-byid-geojson.json` |
| `… "$B/events?status=closed&limit=3&days=30"` | 200 / 0.562 s (225 KB raw) | `eonet-events-closed.json` (polygon rings truncated to 5 vertices) |
| `… "$B/events?status=all&category=severeStorms&magID=mag_kts&magMin=1.50&magMax=200&limit=2&days=90"` | 200 / 0.334 s | `eonet-events-magnitude-filter.json` |
| `… "$B/events?status=all&start=2026-09-01&end=2026-09-30&limit=3"` | 200 / 0.387 s | `eonet-events-start-end.json` |
| `… "$B/events?bbox=-129.02,50.73,-58.71,12.89&limit=3&days=30"` | 200 / 1.944 s | `eonet-events-bbox.json` |
| `… "$B/events?category=notARealCategory&limit=2"` | 200 / 0.311 s | `eonet-events-unknown-category.json` |
| `… "$B/events?status=all&start=1990-01-01&end=1990-01-02"` | 200 / 0.381 s | `eonet-events-empty.json` |
| `… "$B/categories"` | 200 / 0.281 s | `eonet-categories.json` (complete) |
| `… "$B/categories/wildfires?limit=3&days=30"` | 200 / 0.284 s | `eonet-categories-wildfires.json` |
| `… "$B/categories/wildfires?status=all&limit=1&days=30"` | 200 / 0.313 s | `eonet-categories-wildfires-status-all.json` |
| `… "$B/sources"` | 200 / 3.316 s | `eonet-sources.json` (complete) |
| `… "$B/layers"` | 200 / 0.389 s | `eonet-layers.json` (layers truncated to 3) |
| `… "$B/layers/wildfires"` | 200 / 0.240 s | `eonet-layers-wildfires.json` (layers truncated to 5) |
| `… "$B/magnitudes"` | 200 / 0.214 s | `eonet-magnitudes.json` (complete) |
| `curl -s -X OPTIONS -D - -o /dev/null -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: content-type' "$B/events?limit=1"` | 204 / 0.200 s | (headers only; see caveats) |
| `… "$B/events/rss?limit=2"` / `"$B/events/atom?limit=2"` | 200 / 0.221 s; 200 / 0.206 s | raw XML kept in `raw/events_rss.xml`, `raw/events_atom.xml` (not JSON, no sample) |
| `… "$B/events/EONET_0"` | 500 / 0.231 s | raw HTML in `raw/err_evt.json` (not JSON, no sample) |

## Availability and caveats

| Topic | Finding | Source |
|---|---|---|
| Status today | All 13 endpoint variants returned 200 (preflight 204) between 23:42 and 23:58 UTC; typical latency 0.20–0.40 s, outliers `/sources` 3.3 s, `bbox` 1.9 s, `status=all&limit=3` 1.2 s. | LIVE |
| Deprecations | v3 current; "Version 2.1 is deprecated and tagged for removal but is still currently available"; v2.0 decommissioned 2021-01-19. api.nasa.gov's catalog entry still links to `/docs/v2.1`. | DOCS; CHANGELOG; CATALOG |
| Date-range limits | None documented. Archive reaches back at least to 2000-01-01 (archived UNISYS cyclone tracks `EONET_2312`, `EONET_2351` returned for `start=2000-01-01&end=2000-01-02&status=all`). `days` "including today". **UNVERIFIED:** maximum span / maximum `limit`. | DOCS; LIVE |
| Empty results | HTTP 200 with `events: []` or `features: []` — never 404/204. | LIVE |
| Unknown filter values | Unknown `category` is ignored (unfiltered 200). Unknown event id → HTTP 500 HTML (not 404). | LIVE |
| CORS (GET) | `Access-Control-Allow-Origin: *` on every response, with or without an `Origin` request header, including the 500 error page. No `Access-Control-Expose-Headers` → browsers cannot read `X-RateLimit-*` via `fetch`; read them in the Node backend instead. | LIVE |
| CORS (preflight) | `OPTIONS` → 204 with `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET`, `Access-Control-Allow-Headers: content-type` (echo of the requested header), `Access-Control-Max-Age: 0`, `Vary: Access-Control-Request-Method,Access-Control-Request-Headers`. `Max-Age: 0` means every non-simple request preflights again → from the browser use plain `GET` with no custom headers (no `Authorization`, no `Content-Type`). | LIVE |
| Other headers | `Server: Apache`, `Cache-Control: no-cache, private`, `Strict-Transport-Security: max-age=31557600`, chunked transfer. | LIVE |
| Content-Type mislabelling | JSON bodies were served as `application/rss+xml; charset=utf-8` by `/categories`, `/sources`, `/layers`, `/layers/{id}`, `/magnitudes`, `/events/geojson`, `/events/{id}`, `/events/{id}/geojson`; `/events` and `/categories/{id}` returned `application/json`. Do not branch on `Content-Type`; parse the text as JSON. (`fetch().json()` and `axios` with `responseType:'json'` ignore the header and work.) | LIVE |
| GeoJSON shape | `/events/geojson` yields one Feature per geometry (track fix), so a storm becomes N Point features with the same `properties.id`; `limit` applies to events, and the documented `geometryDates`/LineString form was not observed. Re-group by `properties.id` client-side to draw tracks. | LIVE; DOCS |
| Coordinate order | Points: `[longitude, latitude]` everywhere (consistent with RFC 7946 section 3.1.1 "longitude and latitude … precisely in that order", with DOCS' bbox "lon,lat" wording and with HOWTO's centroid code `coordinates[0][i][0]` = longitude). **Polygons are inconsistent:** `EONET_24511` "Flood in Thailand" ring starts `[17.7858722, 97.742169]` and `EONET_24832` "Flood in Mexico" starts `[17.6732155, -101.6593836]` — both `[lat, lon]` (97.74 cannot be a latitude); `EONET_25001` "Flood in Malaysia" starts `[116.0823267, 5.898…]` — `[lon, lat]`. All three come from `GDACS`. Guard: if any ring vertex has `|v[1]| > 90` (or `|v[0]| <= 90 && |v[1]| > 90`) treat the ring as `[lat, lon]` and swap; or restrict the dashboard to Point geometries and polygon centroids after the swap check. | LIVE; RFC7946; DOCS; HOWTO |
| Category id types | `/categories` ids are strings (`"wildfires"`); `/layers/{categoryId}` reports the category as `{ id: 8, title: "Wildfires" }` (number); DOCS text still says "(integer)". Numeric ids remain valid in queries (`category=8` → wildfires). | LIVE; DOCS; CHANGELOG |
| `/layers` structure | The all-layers response puts all 201 layers in a single anonymous `categories[0].layers` with no `id`/`title`; use `/layers/{categoryId}` for per-category lists (27 for wildfires). | LIVE |
| Missing documented fields | `magnitudeDescription` (both outputs) and `geometryDates` (GeoJSON) are documented but were absent from every sample today — type them as optional. | DOCS; LIVE |
| Data latency / cadence | Not documented (**UNVERIFIED:** curation/update frequency). Observed: storm fixes every 6 h, newest `2026-10-05T18:00:00Z` at 23:43 UTC (about 5.7 h behind); newest open wildfire geometries dated `2026-10-02` (IRWIN, 3 days earlier); GDACS flood/fire records dated `2026-10-03/04` with `closed` set to `2026-10-06T00:00:00Z`/`2026-10-03T00:00:00Z` (an end date can lie in the near future; treat `closed !== null` as "closed/ending" rather than "ended in the past"). DOCS: geometry times "will most likely be 00:00Z unless the source provided a particular time." | LIVE; DOCS |
| Ordering | Observed newest-first by the date of the event's first geometry; not documented (**UNVERIFIED** as a contract — sort client-side). | LIVE |
| Payload size | 3 closed GDACS floods = 225 KB because one polygon ring has 8,644 vertices; `/layers` = 57 KB. Keep `limit` small, strip or simplify polygons in the backend before sending to the React client. | LIVE |
| Terms | Disclaimer: visualization/general-information only; extents are approximations — show this on the dashboard. | ABOUT#disclaimer |

## Dashboard relevance

Concrete widgets this data enables (fields cited from the samples above):

| Widget / chart | EONET call | Fields used | Pairing with smartwatch vitals |
|---|---|---|---|
| Live "Earth events" map (points + storm tracks) with GIBS imagery underlay | `/events?status=open&days=7&limit=…`; `/layers/{categoryId}` for WMTS layer names | `geometry[].coordinates`, `geometry[].date`, `categories[0].id` (icon/colour), `title`; `Layer.serviceUrl`/`name`/`parameters` | Plot the wearer's location (phone/watch GPS) on the same map |
| "Events near me" list and alert badge | `/events?bbox=<lon-Δ>,<lat+Δ>,<lon+Δ>,<lat-Δ>&days=3&status=open` (remember: min lon, max lat, max lon, min lat) | all Event fields; distance computed from Point coordinates / polygon centroid | Drives context chips on HR/SpO2 cards ("wildfire 42 km away, 5,072 acres") |
| Storm intensity timeline (kts vs. time) | `/events?category=severeStorms&days=30` | `geometry[].magnitudeValue` (`kts`), `geometry[].date`, `sources[].id` (JTWC/NOAA_NHC) | Overlay sleep/resting-HR series for the same hours |
| Wildfire acreage leaderboard / growth sparkline | `/events?category=wildfires&status=open&days=14` or `/events?magID=ac&magMin=1000` | `magnitudeValue` + `magnitudeUnit` (`acres`/`hectare` — normalise: 1 ha = 2.471 acres per `/magnitudes` text) | Smoke-exposure proxy vs. SpO2 / respiratory rate trends |
| Category breakdown donut and 30-day events-per-day bars | `/events?status=all&days=30&limit=…` | `categories[0].id`, first `geometry[].date`, `closed` | Day-level correlation with daily HRV / resting HR |
| Heat/cold context banner | `/events?category=tempExtremes,dustHaze&status=open` | `title`, `description`, geometry | Shown with skin temperature / HR elevation |
| Event detail drawer with source links and imagery | `/events/{id}`, `/layers/{categoryId}` | `sources[].url`, `link`, `description`, layers | — |

Mapping into the prototype's `NASAEvent {id, source, eventType, timestamp, latitude?, longitude?, metadata}` (one `NASAEvent` per EONET event; or one per geometry if you want track points as separate rows):

| NASAEvent field | From EONET | Rule |
|---|---|---|
| `id` | `event.id` | e.g. `"EONET_24962"`; for per-geometry rows use `${event.id}:${geometry.date}` |
| `source` | constant `"EONET"` | keep the upstream provider in `metadata.sources` (`sources[].id`, e.g. `JTWC`, `IRWIN`, `GDACS`) |
| `eventType` | `event.categories[0].id` | one of the 13 string ids above (`severeStorms`, `wildfires`, …); keep full `categories` array in metadata |
| `timestamp` | `event.geometry[geometry.length-1].date` (latest fix) — or `geometry[0].date` for the event start | ISO 8601 UTC strings as delivered; GeoJSON variant: `properties.date` |
| `latitude` | Point: `geometry[i].coordinates[1]`; Polygon: centroid of `coordinates[0]` after the `[lat,lon]` swap check | optional: omit if geometry missing/unparseable |
| `longitude` | Point: `geometry[i].coordinates[0]`; Polygon: as above | optional |
| `metadata` | `{ title, description, link, closed, categories, sources, magnitudeValue, magnitudeUnit, geometryType, geometryCount, bboxOrPolygon? }` | `closed === null` → "open"; `magnitudeUnit` tells the unit (`kts`, `acres`, `hectare`, …) |

Minimal TypeScript sketch (types derived from the live samples):

```ts
type EonetGeometry = { magnitudeValue: number | null; magnitudeUnit: string | null; date: string;
  type: 'Point' | 'Polygon'; coordinates: number[] | number[][][] };
type EonetEvent = { id: string; title: string; description: string | null; link: string; closed: string | null;
  categories: { id: string; title: string }[]; sources: { id: string; url: string }[]; geometry: EonetGeometry[] };
type EonetEventsResponse = { title: string; description: string; link: string; events: EonetEvent[] };

function lonLat(g: EonetGeometry): [number, number] | undefined {
  if (g.type === 'Point') return [g.coordinates[0] as number, g.coordinates[1] as number];
  const ring = (g.coordinates as number[][][])[0]; if (!ring?.length) return undefined;
  const swapped = ring.some(v => Math.abs(v[1]) > 90);          // observed [lat,lon] rings (GDACS)
  const pts = swapped ? ring.map(v => [v[1], v[0]]) : ring;
  return [pts.reduce((s, v) => s + v[0], 0) / pts.length, pts.reduce((s, v) => s + v[1], 0) / pts.length];
}
```

Backend notes: proxy EONET through the Node service (cache 5–15 min per query string; EONET sends `Cache-Control: no-cache`), read `X-RateLimit-Remaining` there (not exposed to browsers), parse bodies with `JSON.parse(await res.text())` regardless of `Content-Type`, and wrap `/events/{id}` in a try/catch for the HTML 500.

## Open questions

1. **UNVERIFIED:** rate-limit window length and scope — headers show `X-RateLimit-Limit: 60` and a counter that reset within ~2 minutes; whether it is 60/minute, per IP, and what a 429 body / `Retry-After` look like was not provoked or documented.
2. **UNVERIFIED:** maximum accepted `limit`, default page size when `limit` is omitted, and maximum `start`/`end` span.
3. **UNVERIFIED:** curation/update cadence of EONET (how quickly new IRWIN/JTWC/GDACS records appear); only indirect latency observations above.
4. **UNVERIFIED:** whether `bbox` and `magID/magMin/magMax` are honoured on `/categories/{categoryId}` (not documented there, not tested).
5. **UNVERIFIED:** when (if ever) `/events/geojson` emits LineString features with `geometryDates`, and when `magnitudeDescription` is populated — both documented, neither observed today.
6. **UNVERIFIED:** whether the `[lat, lon]` polygon rings (GDACS floods `EONET_24511`, `EONET_24832`) are a systematic ingestion bug or occasional; only three polygons were inspected.
7. **UNVERIFIED:** `/events/{id}/geojson` is reachable (200) but undocumented — stability of this URL form is unknown.
8. **UNVERIFIED:** the `/layers` all-layers response's single anonymous group (no category ids) — whether intentional.
9. **UNVERIFIED:** attribution/terms beyond the disclaimer (NASA general web policy page in the footer was not opened).
10. **UNVERIFIED:** v2.1 removal date ("tagged for removal", no date given).
