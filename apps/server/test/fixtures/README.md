# Test fixtures — provenance

| Folder | Content | Provenance |
|---|---|---|
| `nasa/donki-*.json` | DONKI FLR/CME/SEP (Sept–Oct 2026), GST (May 2024 storm) | **Real** responses from `https://ccmc.gsfc.nasa.gov/DONKI-API/get/...`, captured 2026-10-05; arrays truncated to the first 4 items, values unedited. |
| `nasa/eonet-*.json` | EONET v3 events (points + one polygon event) | **Real** responses captured 2026-10-05; `_meta` capture notes removed; the polygon ring truncated to 13 vertices. |
| `nasa/apod-*.json` | APOD new WordPress API (single + list) and legacy api.nasa.gov | **Real** responses captured 2026-10-05; `basic_html` dropped for size. The legacy one (`apod-legacy.json`) is the placeholder NASA's legacy proxy served that day (title "NASA Science", NASA logo as the image) and still served on 2026-10-11; the app rejects it. The well-formed legacy body in `nasa.test.ts` is synthetic. |
| `nasa/swpc-*.json` | NOAA SWPC GOES integral protons (24 h) and NOAA scales | **Real** responses captured 2026-10-12 from `services.swpc.noaa.gov`; protons trimmed to the ≥10 and ≥100 MeV rows, values unedited. The S1 case in `nasa.test.ts` is a labelled synthetic edit. |
| `nasa/power-daily-point.json` | POWER daily point, Houston | **Real** response captured 2026-10-05 (note the `-999` fill values for the latest days). |
| `google-health/*.json` | Google Health API v4 `list` / `rollUp` / `dailyRollUp` responses | **Synthetic, schema-derived.** Built field-by-field from the official discovery document (`https://health.googleapis.com/$discovery/rest?version=v4`, fetched 2026-10-05). No real person's data; Google is not onboarding new API projects, so no live capture was possible. |
| `apple-health/export-sample.xml` | Minimal Apple Health `export.xml` | **Synthetic.** Mirrors the structure of the Health app's "Export All Health Data" file (DTD-defined `<Record>`, `<Workout>`, `<WorkoutStatistics>` elements). Values are invented and do not describe a real person. |
