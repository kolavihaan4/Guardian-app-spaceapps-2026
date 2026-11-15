# NASA data sources — verified integration notes

All facts below were checked against official documentation **and live calls on 2026-10-05**
unless marked *UNVERIFIED*. Raw research notes (with every citation) are in [`docs/research/`](research/).

| API | What we use it for | Endpoint we call | Auth | Rate limit | Live check 2026-10-05 |
|---|---|---|---|---|---|
| **DONKI** (space weather) | Flares, CMEs, geomagnetic storms (Kp), SEP events | `GET https://ccmc.gsfc.nasa.gov/DONKI-API/get/{FLR\|GST\|CME\|SEP}?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | none | none documented (header `X-Rate-Limit-Remaining: 9999` observed) | 200, ~0.2 s; 11 FLR / 1 GST / 97 CME / 8 SEP in the last 30 days |
| **EONET v3** (Earth events) | Wildfires, storms, floods, volcanoes… on a map | `GET https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=N&limit=N[&category=id]` | none | `X-RateLimit-Limit: 60` (rolling window, observed; not documented) | 200, 0.2–1 s |
| **APOD** | Daily astronomy image (engagement/context) | `GET https://science.nasa.gov/wp-json/wp/v2/apod-basic?per_page=1` (or `/{YYMMDD}`) — fallback `GET https://api.nasa.gov/planetary/apod?api_key=KEY` | none (new) / API key (legacy) | none documented (new) / api.nasa.gov key limits (legacy) | 200, ~0.7 s |
| **POWER** (surface environment) | Daily temperature, humidity, pressure, wind, irradiance, UV at a site | `GET https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2M_MAX,T2M_MIN,RH2M,PS,WS10M,ALLSKY_SFC_SW_DWN,ALLSKY_SFC_UV_INDEX&community=RE&latitude=..&longitude=..&start=YYYYMMDD&end=YYYYMMDD&format=JSON` | none | no number published; "Please do not go more than five concurrent requests" | 200, ~0.8 s |

## Things that changed recently (and would break a naive build)

1. **DONKI moved (Sept 2026).** Both the documented `https://api.nasa.gov/DONKI/...` and the old
   `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/...` now return **301 → an HTML news page**.
   CCMC's notice (<https://ccmc.gsfc.nasa.gov/news/major-updates/>) says: *"Public Data API Base:
   https://ccmc.gsfc.nasa.gov/DONKI-API/get/... replaces https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/…
   Input parameters and data response formats have not been modified."* We use the new base
   (configurable as `NASA_DONKI_BASE`) and treat an HTML body as an upstream error.
2. **APOD moved (Sept 10 2026).** api.nasa.gov: *"The APOD API has been updated. It now returns
   information from https://science.nasa.gov/wp-json/wp/v2/apod-basic. The legacy APOD API will be
   archived on December 1, 2026."* The new API is keyless; `explanation`/`credit` contain HTML (we
   strip it server-side). On 2026-10-05 the legacy endpoint returned a 500 and then a degraded payload.
   On 2026-10-11 it still answered 200 with a placeholder for every date (title "NASA Science", the NASA
   logo as the image). The fallback rejects that payload as an outage, so the app serves a stale cached
   copy or a 502 rather than showing the logo as the picture of the day.
3. **api.nasa.gov `DEMO_KEY`** is documented as 30 requests/hour and 50/day per IP, but responses
   carried `X-RateLimit-Limit: 10`. Get a free key at <https://api.nasa.gov/> (1,000 requests/hour,
   per key). In this app only the legacy APOD fallback uses a key.
4. **Earth API and Mars Rover Photos API are archived** (api.nasa.gov banner); not used.

## Authentication & key handling

- Every NASA request is made **by the Node backend**. The browser only calls `/api/nasa/*` on our own
  origin. The only secret (`NASA_API_KEY`) lives in `.env`, is never bundled, never logged (we log
  paths without query strings) and never returned.
- Responses are cached in SQLite (`nasa_cache`): DONKI 30 min, EONET 15 min, APOD 6 h, POWER 6 h. If
  an upstream fails, the last cached copy is served with `stale: true` and a note, and the UI says so.
- Only fixed, configured hosts are called; user input is limited to validated dates, a category
  slug (`^[a-zA-Z]{2,40}$`) and numeric lat/lon, so there is no SSRF surface.

## Field mapping into `NASAEvent`

`NASAEvent { id, source, eventType, timestamp, endTimestamp?, latitude?, longitude?, title, link?, severity?, metadata }`

| Source | id | eventType | timestamp | lat/lon | severity | metadata |
|---|---|---|---|---|---|---|
| DONKI FLR | `flrID` | `FLR` | `beginTime` (→ `endTime`) | **none** | `classType` (GOES class) + peak flux W/m² | `peakTime`, `sourceLocation`, `activeRegionNum`, instruments, linked events |
| DONKI GST | `gstID` | `GST` | `startTime` | none | max `allKpIndex[].kpIndex` (+ NOAA G-scale) | all Kp observations |
| DONKI CME | `activityID` | `CME` | `startTime` | none | most-accurate `cmeAnalyses[].speed` km/s | half-angle, type, heliographic lat/lon, `time21_5` |
| DONKI SEP | `sepID` | `SEP` | `eventTime` | none | — | instruments, linked events |
| EONET | `id` | `categories[0].id` | first `geometry[].date` (→ `closed`) | latest Point `[lon, lat]`, or polygon centroid | `magnitudeValue magnitudeUnit` | category, sources, track of points |

DONKI latitude/longitude values are **heliographic (on the Sun)**, so they are never put in
`latitude/longitude` (which mean Earth coordinates). EONET polygons occasionally list rings as
`[lat, lon]` (e.g. `EONET_24511`); the parser swaps a centroid whose "latitude" is impossible and
records that in `metadata.coordinateNote`.

## Caveats shown in the UI

- **POWER latency:** meteorology 2–3 days, solar 5–7 days; missing days are the fill value `-999`
  (mapped to `null`, never plotted). On 2026-10-05 `ALLSKY_SFC_UV_INDEX` had no value after
  2026-06-29 (≈98 days behind). `ALLSKY_SFC_UV_INDEX` units are "W m-2 x 40" (an index).
- **POWER resolution:** values are for the grid cell (≈0.5° × 0.625° meteorology, 1° solar); we round
  coordinates to 0.5° before calling (shared cache, less precise location sent upstream).
- **EONET terms:** "intended to be used for visualization and general information purposes only";
  extents are approximations.
- **DONKI GST** lists storms, not quiet days: days without a storm have *no* Kp value in the overlay
  (we do not invent zeros).
- **APOD credits** are rendered verbatim next to the image; many APOD images are copyrighted by
  third parties ("Neither NASA nor APOD can grant permission to use copyrighted images").

## Attribution

- POWER (wording from power.larc.nasa.gov, captured 2026-10-05): "The data was obtained from National
  Aeronautics and Space Administration (NASA) Langley Research Center's Prediction Of Worldwide Energy
  Resources (POWER) project funded through the NASA Earth Science Division."
- DONKI: NASA Community Coordinated Modeling Center (CCMC), <https://ccmc.gsfc.nasa.gov/tools/DONKI/>.
- EONET: NASA Earth Observatory / ESDIS, <https://eonet.gsfc.nasa.gov/>.
- APOD: <https://apod.nasa.gov/>, image credits per item.

## Not used (yet), but verified to exist

NASA EPIC (DSCOVR Earth imagery), NASA Image and Video Library (`images-api.nasa.gov`), NASA GIBS
WMTS tiles, and NASA OSDR biodata API — samples were captured during research (see
`docs/research/`). NOAA SWPC real-time JSON (Kp, solar wind, GOES X-rays) is **not NASA**; if added,
label it as a non-NASA supplement.

## NOAA SWPC (radiation environment) — added 2026-10-11

Not a NASA API, but the operational source for near-Earth radiation. Both endpoints are keyless,
CORS-open and served with `cache-control: max-age=60`; the app caches them for 5 minutes.

| Endpoint | What it gives | Notes |
|---|---|---|
| `GET https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json` | 5-minute GOES integral proton flux for the last 24 h, one row per energy (≥1 … ≥500 MeV), in pfu | ~2,300 rows / 240 KB; the app keeps ≥10 and ≥100 MeV. GOES-18 was primary on 2026-10-12 |
| `GET https://services.swpc.noaa.gov/products/noaa-scales.json` | NOAA R/S/G scales: `"0"` current, `"1"` today's forecast, `"2"`/`"3"` next days, `"-1"` yesterday | S-scale (solar radiation storm) starts at S1 = ≥10 MeV flux ≥ 10 pfu. The app reports NOAA's scale and never recomputes it from one sample |

Fixtures `apps/server/test/fixtures/nasa/swpc-*.json` are real responses captured 2026-10-12 (protons
trimmed to the ≥10 and ≥100 MeV rows).

