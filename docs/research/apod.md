# NASA APOD (Astronomy Picture of the Day) — API research report

Research date: 2026-10-05 (all live calls made 23:42–23:52 UTC from one IP). Citation codes [S1]–[S9] are defined in "Official documentation"; [LIVE] = observed in my own HTTP calls today (headers/bodies saved under `research/` and `research/samples/`). Anything not confirmed is prefixed **UNVERIFIED:**.

## Overview

| Item | Fact | Source |
|---|---|---|
| What it is | One curated astronomy image/video per day since 1995-06-16, with a title, an astronomer-written explanation and a credit/copyright line; written and edited by Robert Nemiroff and Jerry Bonnell. | [S5], [S4] README (accessed 2026-10-05) |
| Official status change | api.nasa.gov states: "As of September 10, 2026 this API has been migrated to use the new WordPress API" and "The legacy APOD API will be taken offline December 1, 2026. You will need to migrate by then." The documented HTTP request is now `GET https://science.nasa.gov/wp-json/wp/v2/apod-basic`. | [S1] apis.json APOD `html_template` (accessed 2026-10-05) |
| Two access paths today | (a) Legacy keyed proxy `https://api.nasa.gov/planetary/apod?api_key=…` (DEMO_KEY budget, slow, returned a 500 then a degraded 200 today); (b) keyless WordPress REST backend on science.nasa.gov (fast, correct, CORS-enabled, paginated, 11,427 posts). | [LIVE]; [S1]; [S3] |
| Why it matters for a space-health dashboard | APOD carries no vitals-relevant measurement; its value is engagement/context: a daily hero image beside the vitals, "tomorrow's picture", "on this day" lookups, and credit-correct imagery. It has **no geolocation**, so it maps to `NASAEvent` without latitude/longitude. | [S3] field list; [LIVE] |

## Official documentation

| Code | URL (all accessed 2026-10-05) | What it provided |
|---|---|---|
| [S1] | https://api.nasa.gov/ — rendered from https://api.nasa.gov/assets/json/apis.json (APOD entry, `id` "1") and https://api.nasa.gov/assets/html/authentication.html | Migration notice, parameter table, example query/response, "concept_tags, hd, and thumbs are now disabled", legacy swagger stub, rate limits, signup embed |
| [S2] | https://api.nasa.gov/assets/html/authentication.html, https://api.nasa.gov/assets/html/recoverKey.html (loaded by index.html via `w3-include-html`) | "Web Service Rate Limits", DEMO_KEY limits, X-RateLimit headers, key recovery |
| [S3] | https://api.nasa.gov/assets/files/apod/APOD-APIs-and-RSS-info.pdf ("APOD Feed And API User Guide", 8 pp., linked from [S1] as "APOD WordPress") | New endpoint family, filters (`page`, `per_page` "Capped at 25", `date_from`, `date_to`, `/{YYMMDD}`), field meanings, RSS, future-apods |
| [S4] | https://github.com/nasa/apod-api (README.md and application.py on `master`, raw via https://raw.githubusercontent.com/nasa/apod-api/master/…; repo `pushed_at` 2026-09-18, license Apache-2.0, not archived) | Legacy parameter semantics, "Final update 9-10-2026" note, December 1, 2026 archive date, error JSON shape and validation logic |
| [S5] | https://science.nasa.gov/apod/apod-about (301 target of https://apod.nasa.gov/apod/lib/about_apod.html) | Copyright/credit rules, authorship |
| [S6] | https://www.nasa.gov/nasa-brand-center/images-and-media/ | NASA media usage guidelines |
| [S7] | https://api.data.gov/docs/developer-manual/ (api.data.gov/api-umbrella fronts api.nasa.gov: observed `Via: https/1.1 api-umbrella`; signup form is `https://api.data.gov/static/javascripts/signup_embed.js`) | Key passing methods, error codes incl. OVER_RATE_LIMIT 429 |
| [S8] | https://science.nasa.gov/apod/ (301 target of https://apod.nasa.gov/apod/astropix.html) | Today's APOD page: 2026-10-05, "M104: The Sombrero Galaxy's Tidal Streams", "Credit & Copyright: Engelbert Vollmer", image |
| [S9] | https://science.nasa.gov/feed/apod-basic/ | RSS feed (observed 30 items) |

Non-official link seen but NOT used as evidence: the README links "Full documentation" to a notion.site page; it is not a NASA domain, so it is ignored here.

## Base URL and endpoints

| Method | Path | Purpose | Key required? | Verified live today (HTTP status, latency) |
|---|---|---|---|---|
| GET | `https://api.nasa.gov/planetary/apod` (legacy; swagger: host api.nasa.gov, basePath /planetary, path /apod [S1]) | Legacy proxy; "This API will pass your call to the new endpoint and return the result" [S4] README | Yes: `api_key` query param (DEMO_KEY allowed) [S1][S7] | Call 1: **500**, 3.39 s, body `{"code":500,"msg":"Internal Service Error","service_version":"v1"}`. Call 2 (4 min later): **200**, **21.14 s** (`Age: 19`), 1,275 bytes, degraded payload (see Response fields) [LIVE] |
| GET | `https://science.nasa.gov/wp-json/wp/v2/apod-basic` | List of APOD posts, newest first, 25 per page [S3] | None [S3] (no auth mentioned); [LIVE] worked without key | **200**, 1.33 s, 289,625 bytes, 25 items; `X-WP-Total: 11427`, `X-WP-TotalPages: 458`, `cache-control: max-age=60` [LIVE] |
| GET | `…/apod-basic?page=N&per_page=M` | Paginated list [S3] | None | page 1/2/3 with per_page=100: **200**, 1.19 s / 2.17 s / 1.95 s, each 25 items (cap) [LIVE] |
| GET | `…/apod-basic?date_from=YYMMDD&date_to=YYMMDD` | Date range [S3] | None | `date_from=141001&date_to=141003`: **200**, 0.89 s, 3 items (2014-10-03, 10-02, 10-01 order) [LIVE] |
| GET | `…/apod-basic/{YYMMDD}` | One APOD by legacy date code [S3] | None | `/261005` **200** 0.61 s; `/141001` **200** 0.76 s; `/950616` **200** 0.69 s (first APOD, "Neutron Star Earth") [LIVE] |
| GET | `…/apod-basic/{YYMMDD}/html` | "returns the HTML document directly as plain text (not JSON)" [S3] | None | `/261005/html` **200**, `Content-Type: text/plain; charset=UTF-8` [LIVE] |
| GET | `https://science.nasa.gov/feed/apod-basic/` (`?year=YYYY`, `?year=YYYY&month=M`) | APOD Basic RSS [S3] | None | **200**, `application/rss+xml`, 30 `<item>`s [LIVE] |
| GET | `https://science.nasa.gov/wp-json/wp/v2/future-apods/` | Scheduled (not yet published) APODs; "still changing" [S3] | None | **200**, 0.69 s, array of 3 posts with `status: "future"` [LIVE] |
| GET | `https://science.nasa.gov/feed/apod-rss/` | Broader WordPress image-article feed [S3] | None | Not called |

## Parameters

### Legacy `GET https://api.nasa.gov/planetary/apod` (documented table [S1]; semantics [S4] README; validation [S4] application.py)

| Name | Type | Required | Allowed values / format | Default | Notes |
|---|---|---|---|---|---|
| `api_key` | string | Yes (api-umbrella) | Registered key or `DEMO_KEY` | `DEMO_KEY` in docs | "api.nasa.gov key for expanded usage" [S1]. Platform also accepts `X-Api-Key` header or HTTP basic-auth username [S7] — **UNVERIFIED** live for this endpoint. |
| `date` | string | No | `YYYY-MM-DD`; "Must be after 1995-06-16, the first day an APOD picture was posted. There are no images for tomorrow available through this API." [S4] | today [S1][S4] | Code strips dashes and takes `[2:]` → `YYMMDD` before calling the backend [S4] application.py. Stale swagger text says "Date must be between Jun 16, 1995 and Mar 28, 2019." [S1] (ignore). |
| `start_date` | string | No | `YYYY-MM-DD` | none | "Cannot be used with `date`" [S1][S4]. Parsed with `strptime("%Y-%m-%d")`; `start_date > end_date` → 400 "start_date cannot be after end_date" [S4] application.py. |
| `end_date` | string | No | `YYYY-MM-DD` | today per docs [S1][S4] | **Discrepancy:** application.py on master defaults a missing `end_date` to `start_date + 25 days`, not today [S4]. UNVERIFIED which the deployment does. |
| `count` | int | No | 1–25; "Cannot exceed 25" [S1]; "A positive integer, no greater than 25" [S4] | none | "Cannot be used with `date` or `start_date` and `end_date`" [S1][S4]. Returns a JSON **array** of random posts [S4]. Out of range → 400 "Count must be positive and cannot exceed 25" [S4] application.py. |
| `thumbs`, `hd`, `concept_tags` | bool | No | — | — | "concept_tags, hd, and thumbs are now disabled in this service." [S1]. Still listed in `ALLOWED_APOD_FIELDS` so they do not trigger 400, but nothing reads them [S4] application.py. `thumbnail_url` is no longer a documented field [S1][S3][S4]. |
| any other field | — | — | — | — | 400 "Bad Request: incorrect field passed." + usage string; disallowed combinations → 400 "Bad Request: invalid field combination passed." [S4] application.py. UNVERIFIED live (call budget). |

### New `GET https://science.nasa.gov/wp-json/wp/v2/apod-basic` ([S3] "Supported filters"; [LIVE])

| Name | Type | Required | Allowed values / format | Default | Notes |
|---|---|---|---|---|---|
| `page` | int | No | ≥1; "Page number for list results." [S3] | 1 | Beyond last page (`page=459`) → `200 []` [LIVE] |
| `per_page` | int | No | "Number of results per page. Capped at 25." [S3] | 25 (observed: 11427/458 pages) [LIVE] | `per_page=2` → 2 items; 26, 50, 100 → 25 items; 101 → 200 (no error) [LIVE] |
| `date_from` | string | No | "Start date using legacy YYMMDD format." [S3] | — | Example `date_from=140901&date_to=140930` [S3] |
| `date_to` | string | No | "End date using legacy YYMMDD format." [S3] | — | Range result is newest-first [LIVE] |
| path `/{YYMMDD}` | string | — | "Gets one APOD by legacy date code." [S3]; earliest `950616` → 200, `950615` → 404 [LIVE] | — | Non-numeric id → 404 `rest_no_route`; future date → 404 `apod_basic_not_found` [LIVE] |
| `date` (YYYY-MM-DD) | — | — | Not a supported filter; `?date=2014-10-01` was ignored and the default list came back [LIVE] | — | Use `/{YYMMDD}` instead |
| `api_key` | — | No | api.nasa.gov's example appends `?api_key=DEMO_KEY` [S1] but [S3] documents no auth and [LIVE] calls without it succeeded | — | Harmless extra query param |

### RSS `GET https://science.nasa.gov/feed/apod-basic/` [S3]

| Name | Type | Required | Allowed values | Default | Notes |
|---|---|---|---|---|---|
| (none) | — | — | — | "Most recent APOD feed items. Currently 30." [S3]; 30 observed [LIVE] | |
| `year` | int | No | `YYYY` → "All APOD posts in that year." [S3] | — | |
| `month` | int | No | `M` → "All APOD posts in that month." [S3] | — | "month is ignored unless year is also present." [S3] |

## Authentication

| Item | Fact | Source |
|---|---|---|
| Legacy endpoint | API key passed as `api_key` query parameter (swagger `securityDefinitions.api_key: in: query`) [S1]; platform alternatives `X-Api-Key` header or HTTP basic auth username with empty password [S7] | [S1][S7] |
| Exploring without a key | "You do not need to authenticate in order to explore the NASA data. However, if you will be intensively using the APIs … you should sign up for a NASA developer key." — in practice the examples use the shared `DEMO_KEY` | [S2] |
| Obtaining a key | api.nasa.gov embeds the api.data.gov signup form (`registrationSource: 'web-admin'`, `siteName: 'https://api.nasa.gov'`, support `hq-open-innovation@mail.nasa.gov`); the key is e-mailed ("Your {{siteName}} API key") and the post-signup example URL is `https://api.nasa.gov/planetary/apod?api_key={{api_key}}` | [S1] index.html inline script |
| Key recovery | "Please contact us for help recovering an old API key. You may apply for multiple keys as needed." | [S2] recoverKey.html |
| Missing/invalid key | Platform errors API_KEY_MISSING / API_KEY_INVALID / API_KEY_DISABLED / API_KEY_UNAUTHORIZED / API_KEY_UNVERIFIED → HTTP 403; HTTPS_REQUIRED → 400 | [S7] |
| New WordPress endpoint | No authentication documented [S3]; keyless calls succeeded [LIVE] | [S3][LIVE] |

## Rate limits

| Item | Documented | Observed today | Source |
|---|---|---|---|
| Registered key | "Hourly Limit: 1,000 requests per hour … applied across all api.nasa.gov API requests. Exceeding these limits will lead to your API key being temporarily blocked … The block will automatically be lifted by waiting an hour." Counters "reset on a rolling basis." | not tested | [S2] |
| DEMO_KEY | "Hourly Limit: 30 requests per IP address per hour", "Daily Limit: 50 requests per IP address per day" | Headers on both calls: `X-Ratelimit-Limit: 10`, `X-Ratelimit-Remaining: 8` (call 1) then `6` (call 2). The budget is per-IP and was being consumed concurrently by sibling research tasks. **UNVERIFIED:** which window the header value 10 refers to (it does not equal the documented 30/50). | [S2][LIVE] |
| Headers | "inspecting the X-RateLimit-Limit and X-RateLimit-Remaining HTTP headers that are returned on every API response" | Present, with `Access-Control-Expose-Headers: X-RateLimit-Limit, X-RateLimit-Remaining` so browsers can read them | [S2][LIVE] |
| On exceeding | `OVER_RATE_LIMIT` → HTTP 429 | not triggered (stopped at Remaining 6) | [S7] |
| Higher limits | "If you need higher rate limits, contact us." | — | [S2] |
| science.nasa.gov backend | No rate limit documented [S3]; no rate-limit headers observed; `cache-control: max-age=60` on list | 15+ calls, all 200/404 as expected | [S3][LIVE] |

## Response fields

### Legacy `api.nasa.gov/planetary/apod` — as actually returned today (sample `apod-planetary-apod.json`) [LIVE]

| Field | Type | Nullable | Value observed 2026-10-05 | Note |
|---|---|---|---|---|
| `date` | string `YYYY-MM-DD` | no | `"2026-10-05"` | correct |
| `title` | string | no | `"NASA Science"` | **wrong** — the real title is "M104: The Sombrero Galaxy's Tidal Streams" [S8] |
| `explanation` | string (plain text, HTML stripped) | no | correct text, but with trailing page chrome: `"…Your Sky Surprise: What picture did APOD feature on your birthday? (post 1995)Tomorrow's picture: a smile\t\t\t\t\t\t"` | needs trimming |
| `url` / `hdurl` | string URL | no | both `https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png` | **wrong** — the NASA site logo, not the APOD image |
| `media_type` | string | no | `"image"` | |
| `service_version` | string | no | `"v1"` | |
| `copyright`, `thumbnail_url`, `post_id`, `permalink`, `basic_html` | — | — | **absent** | docs' example response [S1] lists `post_id`, `permalink`, `credit`, `copyright`, `alt`, `basic_html`, `basic_html_url` — not returned by the deployment today |
| Error body | object `{code:int, msg:string, service_version:"v1"}` | — | `{"code":500,"msg":"Internal Service Error","service_version":"v1"}` | matches `_abort()` in [S4] application.py (400s add the usage string "Allowed request fields for apod method are 'concept_tags', 'date', 'hd', 'count', 'start_date', 'end_date', 'thumbs'") |

UNVERIFIED (inference): the degraded 200 looks like the pre-migration HTML scraper following the 301 from apod.nasa.gov to the WordPress page; the master-branch code [S4] would instead pass through the backend JSON (and set `url = hdurl`). Documented field meanings for the migrated API ([S1] example response, [S4] README, [S3]) are the table below.

### New `apod-basic` object (list items, range items and `/{YYMMDD}` share the same 13 keys; samples `apod-wp-apod-basic-261005.json`, `-list.json`, `-range.json`, `-video-260913.json`) [S3][S4][LIVE]

| Field | Type | Nullable | Meaning / observed | Source |
|---|---|---|---|---|
| `date` | string `YYYY-MM-DD` | no | "APOD date in YYYY-MM-DD format." | [S3] |
| `post_id` | integer | no | "WordPress post ID." e.g. `1455641` | [S3][LIVE] |
| `title` | string | no | "APOD post title." | [S3] |
| `permalink` | string URL | no | "URL of the APOD post on the site." (`https://science.nasa.gov/image-article/apod-2026-october-5-…/`) | [S3][LIVE] |
| `media_type` | string enum | no | "Normalized APOD media type, such as image, video, or iframe." Observed in last 75 posts: `image` 67, `video` 8, `iframe` 0 | [S3][LIVE] |
| `explanation` | string **containing HTML** (`<strong>Explanation:</strong>`, `<a href>`) | no (none empty in 75) | "APOD explanation text." | [S3][LIVE] |
| `credit` | string containing HTML | no (none empty in 75) | e.g. `<a href="https://app.astrobin.com/u/Fox368">Engelbert Vollmer</a>`; sometimes prefixed `<strong>Video Credit &amp; Copyright:</strong>` | [LIVE]; listed in [S1] example |
| `copyright` | string containing HTML | no | identical to `credit` in every observed post | [LIVE]; [S1] |
| `alt` | string | no | accessibility text, e.g. "A starfield has an bright blobby mess in middle…" | [LIVE]; [S1] |
| `url` | string URL | no | "APOD post URL. This matches the permalink." (**not** the image) | [S3][S4] |
| `hdurl` | string URL | may be empty: "If hdurl is empty, check that the post has a featured image" | "Full-size featured image URL when available." e.g. `https://assets.science.nasa.gov/dynamicimage/…/M104_Vollmer_4222.jpg?w=4222&h=2817&fit=clip&crop=faces%2Cfocalpoint`; for `video` posts it is a still-frame PNG/JPG | [S3][LIVE] |
| `basic_html` | string (full HTML document, ~8–11 KB) | no | "APOD Basic HTML document as a JSON string." For videos it contains `<video controls><source src="…mp4" type="video/mp4">` and/or `https://www.youtube.com/embed/…` — the only place the video URL appears | [S3][LIVE] |
| `basic_html_url` | string URL | no | "Plain-text HTML source URL for easier copy/paste workflows." = `…/apod-basic/{YYMMDD}/html` | [S3][LIVE] |

Error object (404): `{"code":"apod_basic_not_found","message":"APOD not found.","data":{"status":404}}` for a future date (`/261006`) and for `950615`; `{"code":"rest_no_route","message":"No route was found matching the URL and request method.","data":{"status":404}}` for `/abc` (sample `apod-wp-apod-basic-error404.json`) [LIVE].

### `future-apods` object (sample `apod-wp-future-apods.json`) [LIVE]; [S3] says it "is still changing"

| Field | Type | Observed |
|---|---|---|
| `id` | integer | `1456747` |
| `title`, `slug` | string | "A Complete Auroral Oval from SMILE" |
| `status` | string | `"future"` |
| `post_date`, `post_date_gmt` | string `YYYY-MM-DD HH:MM:SS` | `2026-10-06 00:05:00` / `2026-10-06 04:05:00` |
| `link` | string URL | preview-style `?post_type=image-article&p=…` |
| `featured_image`, `primary_image`, `secondary_image`, `video_url` | string (may be `""`) | `featured_image` set, others empty |
| `content_html`, `basic_html` | string HTML | ~10 KB / ~8 KB |
| `media_type`, `credit`, `copyright`, `alt` | string | as in apod-basic |
| `next_apod`, `previous_apod` | object `{title, url}` (may be empty strings) | "now includes next_apod and previous_apod data with title and URL values" [S3] |

### RSS item fields [S3][LIVE]
`title`, `link`, `guid`, `pubDate` (e.g. `Mon, 05 Oct 2026 04:05:00 +0000`), `description`, `content:encoded` (CDATA full HTML), plus namespace fields observed: `apod:explanation`, `apod:url`, `apod:hdurl`, `apod:alt`, `apod:credit`, `apod:copyright`, `apod:discussion` (the last four are present in the feed but only the first three are listed in [S3]).

## Sample requests

| # | curl (exactly as run) | Result | Saved sample |
|---|---|---|---|
| 1 | `curl -s -D apod-headers.txt -o apod-raw.json -w '%{http_code} %{time_total}' "https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY"` | 500, 3.39 s, Remaining 8 | `samples/apod-planetary-apod-error500.json` |
| 2 | same URL, 23:46:34Z | 200, 21.14 s, Remaining 6 | `samples/apod-planetary-apod.json` |
| 3 | `curl -s -D - -o apodbasic-noparam.json -w '%{http_code} %{time_total}' "https://science.nasa.gov/wp-json/wp/v2/apod-basic"` | 200, 1.33 s, 25 items | `samples/apod-wp-apod-basic-list.json` (first 3 of 25, values untouched) |
| 4 | `curl -s "https://science.nasa.gov/wp-json/wp/v2/apod-basic/261005"` | 200, 0.61 s | `samples/apod-wp-apod-basic-261005.json` |
| 5 | `curl -s "https://science.nasa.gov/wp-json/wp/v2/apod-basic?date_from=141001&date_to=141003"` | 200, 0.89 s, 3 items | `samples/apod-wp-apod-basic-range.json` |
| 6 | `curl -s "https://science.nasa.gov/wp-json/wp/v2/apod-basic/261006"` | 404 | `samples/apod-wp-apod-basic-error404.json` |
| 7 | `curl -s "https://science.nasa.gov/wp-json/wp/v2/apod-basic/260913"` | 200, `media_type: video` | `samples/apod-wp-apod-basic-video-260913.json` |
| 8 | `curl -s "https://science.nasa.gov/wp-json/wp/v2/future-apods/"` | 200, 0.69 s, 3 scheduled posts | `samples/apod-wp-future-apods.json` (full array; it had 3 elements) |
| 9 | `curl -s -o /dev/null -D - -H "Origin: http://localhost:5173" "https://science.nasa.gov/wp-json/wp/v2/apod-basic/141001"` | CORS headers echo the origin | (headers only, see caveats) |

All samples are byte-for-byte real responses re-serialised with 2-space indentation; no values were edited. Scratch copies of every raw body/header: `research/apod-raw*.json`, `research/apod-headers*.txt`, `research/wp-*.json`, `research/apodbasic-*.json`, `research/apod-basic-feed.xml`.

## Availability and caveats

| Topic | Finding | Source |
|---|---|---|
| Status of legacy endpoint today | Flaky: 500 then 200 (21 s). Payload degraded (wrong `title`, `url`/`hdurl` = NASA logo PNG, no `copyright`). Treat `api.nasa.gov/planetary/apod` as unreliable for image URLs on 2026-10-05. | [LIVE] |
| Deprecation | "The legacy APOD API will be taken offline December 1, 2026." [S1]; "This repo will be archived and will be pointed to the new end point on December 1, 2026." [S4] | [S1][S4] |
| Reliability disclaimer | "A very large number of people use the instance of this API that NASA has set up. If you need a extremely reliable version of this API, you likely want to stand up your own version" | [S4] README |
| Earliest date | 1995-06-16 ("Neutron Star Earth"): `/950616` → 200, `/950615` → 404 | [S4][LIVE] |
| Future dates | Backend: 404 `apod_basic_not_found` (`/261006`). Legacy proxy: README says "There are no images for tomorrow available"; master code would turn the backend 404 into a 500 (KeyError on `hdurl` → generic handler) — **UNVERIFIED live**. | [S3 n/a][S4][LIVE] |
| Bad date format | Backend: non-numeric id → 404 `rest_no_route`; `?date=YYYY-MM-DD` silently ignored. Legacy proxy: `start_date`/`end_date` go through `strptime` → 400 with Python's message; single `date` is not validated (dashes stripped, `[2:]`) — **UNVERIFIED live**. | [S4][LIVE] |
| Empty results | Backend list page past the end → `200 []`; range with no posts → **UNVERIFIED** (not tested). Legacy `count` skips backend failures (`if not data: continue`) so arrays can be shorter than `count` [S4]. | [LIVE][S4] |
| Pagination | 25 per page hard cap; 11,427 posts / 458 pages today; newest first | [S3][LIVE] |
| Data latency | New APOD is scheduled at 00:05 America/New_York = 04:05 UTC (RSS `pubDate` for 2026-10-05 and `post_date_gmt` for 2026-10-06 both 04:05 UTC). **UNVERIFIED:** whether this shifts to 05:05 UTC under standard time. Today's post was already live at 23:42 UTC. | [LIVE] |
| Caching | Backend list: `cache-control: max-age=60`; `x-cache: EXPIRED/HIT` headers. Legacy: `X-Cache: MISS`, `Age` up to 19 s. | [LIVE] |
| CORS — legacy | `Access-Control-Allow-Origin: *`; `Access-Control-Expose-Headers: X-RateLimit-Limit, X-RateLimit-Remaining` (flask-cors config in [S4] application.py) | [LIVE][S4] |
| CORS — backend | Without an `Origin` header no ACAO is sent; with `Origin: http://localhost:5173` the response carries `Access-Control-Allow-Origin: http://localhost:5173`, `Access-Control-Allow-Credentials: true`, `Access-Control-Allow-Methods: OPTIONS, GET, POST, PUT, PATCH, DELETE`, `Vary: Origin`, `Access-Control-Expose-Headers: X-WP-Total, X-WP-TotalPages, Link` → direct browser fetch works | [LIVE] |
| HTML in fields | `explanation`, `credit`, `copyright` and `basic_html` contain HTML (links, `<strong>`); sanitise (e.g. DOMPurify) or strip before rendering in React. JSON escaping such as `<` is normal ("This is normal JSON behavior, not broken HTML.") | [S3][LIVE] |
| Videos | No top-level video URL; `hdurl` is a poster frame; the `<video><source type="video/mp4">` or YouTube `/embed/` URL must be extracted from `basic_html` | [LIVE] |
| Date code format | Backend uses 2-digit-year `YYMMDD` ("legacy APOD date code") — build it as `date.slice(2).replace(/-/g,'')` | [S3][S4] |
| Image URL parameters | `hdurl` on `assets.science.nasa.gov/dynamicimage/...?w=&h=&fit=clip&crop=faces%2Cfocalpoint` — **UNVERIFIED** whether `w`/`h` can be changed for thumbnails (not documented) | [LIVE] |
| Attribution / copyright | "All the images on the APOD page are credited to the owner or institution where they originated." "Some of the images are copyrighted and to use these pictures publicly or commercially one must write to the owners for permission." "Neither NASA nor APOD can grant permission to use copyrighted images." "NASA images are in the public domain" (with link to NASA guidelines). | [S5] |
| NASA media guidelines | NASA content "generally are not subject to copyright in the United States" and may be used "for educational or informational purposes, including … Internet Web pages"; "NASA should be acknowledged as the source of the material"; third-party items "will be marked identified as copyright protected with the name of the copyright holder … Those wishing to use copyright protected material of third parties must contact the copyright holder directly."; content "must not explicitly or implicitly convey NASA's endorsement of commercial goods or services."; "The NASA Insignia, Logotype, identifiers, and imagery are not in the public domain." | [S6] |
| Practical rule for the prototype | Always render the `credit`/`copyright` line verbatim next to the image and link to `permalink`; for non-NASA credits (e.g. "Engelbert Vollmer" today) display-with-credit on the dashboard is the APOD site's own practice, but any redistribution beyond that needs the owner's permission; never use the NASA insignia as a decorative asset. | [S5][S6] |

## Dashboard relevance

| Widget | Data path | Fields used |
|---|---|---|
| "Picture of the Day" hero beside vitals | Backend `GET /apod-basic?per_page=1` (or `/{todayYYMMDD}`) via the Node proxy (keyless, cacheable 60 s) | `title`, `hdurl` (image) / `basic_html` video source, `alt`, `credit`, `permalink`, `date` |
| "Tomorrow's picture" teaser | `GET /future-apods/` | `title`, `featured_image`, `post_date_gmt`, `next_apod` |
| "On this day" / birthday APOD (e.g. the user's wearable-device anniversary) | `GET /apod-basic/{YYMMDD}` | whole object |
| 7-day strip / timeline rail aligned with the vitals timeline | `GET /apod-basic?date_from=YYMMDD&date_to=YYMMDD` (max 25 days per call) | `date`, `hdurl`, `title` |
| Attribution footer | — | `credit` (HTML-stripped), `permalink`, "Image Credit & Copyright" wording from [S5] |
| Accessibility | — | `alt` as `<img alt>` |

Mapping into `NASAEvent {id, source, eventType, timestamp, latitude?, longitude?, metadata}`:

| NASAEvent field | Value | Note |
|---|---|---|
| `id` | `apod-${date}` (or `String(post_id)`) | `date` is unique per post |
| `source` | `"APOD"` | |
| `eventType` | `apod.${media_type}` → `apod.image` / `apod.video` / `apod.iframe` | enum from [S3] |
| `timestamp` | `${date}T04:05:00Z` (observed publish time) or simply `${date}T00:00:00-04:00` | **UNVERIFIED** generality of 04:05 UTC |
| `latitude`, `longitude` | `undefined` | APOD has no geolocation fields |
| `metadata` | `{ title, explanationHtml, explanationText, imageUrl: hdurl, permalink, credit, copyright, alt, mediaType, postId, basicHtmlUrl, videoSrc? }` | `videoSrc` parsed from `basic_html` |

Suggested backend strategy: proxy the keyless science.nasa.gov endpoints from Node (cache 60 s), keep `api.nasa.gov/planetary/apod` only as a labelled fallback until 2026-12-01, and never let the frontend spend the shared DEMO_KEY budget.

## Open questions

1. **UNVERIFIED:** Whether the deployed `api.nasa.gov/planetary/apod` runs the master-branch code in [S4]; today's 200 payload (legacy 7-field shape, wrong title/image) does not match either the api.nasa.gov example response [S1] or application.py's pass-through. Needs a check on another day or with a registered key (not possible within the 2-call budget).
2. **UNVERIFIED:** Live legacy-endpoint behaviour for `date` in the future, malformed dates, `count`, `start_date` without `end_date` (code says +25 days; docs say today), and `thumbs` (docs: disabled). Only documentation/code evidence is given above.
3. **UNVERIFIED:** Meaning of `X-Ratelimit-Limit: 10` versus the documented DEMO_KEY 30/hour and 50/day; and the exact 429 body for this endpoint.
4. **UNVERIFIED:** Whether the backend's publish time stays 04:05 UTC year-round, and whether `dynamicimage` `w`/`h` query parameters may be altered for thumbnails.
5. **UNVERIFIED:** Backend behaviour for an empty `date_from`/`date_to` range and the maximum span accepted (25-item cap implies ≤25 days per page; pagination of ranges not tested).
6. The README's "Full documentation" link points to a non-NASA notion.site page; its content was deliberately not used.
