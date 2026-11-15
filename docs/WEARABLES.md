# Wearable platforms — what is really possible (October 2026)

**A generic website cannot read smartwatch sensors.** Watches sync to a platform health store
(on the phone or in the vendor's cloud); third-party software reads from there, only with the
user's permission, and only through the platform's official path:

```
 Smartwatch ──► platform health store / API ──► authorized mobile or backend layer ──► AstroVitals backend ──► dashboard
```

| Platform | Platform store / API | Who can read it | How AstroVitals gets the data | Status in this prototype |
|---|---|---|---|---|
| **Fitbit / Pixel Watch** | Google Health API (cloud) — replaces the Fitbit Web API | A backend with the user's Google OAuth consent | `google-health` provider: OAuth 2.0 + PKCE on the server, pull via REST | **Implemented, disabled by default** (Google not onboarding new projects) |
| **Apple Watch** | HealthKit (on the iPhone only) | Native iOS/watchOS apps with the user's permission | (a) `apple-health-export`: user uploads the Health app export; (b) `healthkit-companion`: companion iOS app pushes samples | **(a) works today; (b) backend done, iOS app is reference code** |
| **Wear OS / Android** | Health Connect (on the phone only) | Native Android apps with the user's permission | Companion Android app → same ingest pattern as (b) | Documented, not implemented |
| **Garmin** | Garmin Health API (cloud, push) | Approved business partners | Garmin pushes summaries to a partner webhook | Adapter slot only (approval required) |
| **Demo** | none | — | Server-side generator, never stored | **Implemented** |

Verification: Google Health, Fitbit deprecation, Health Connect permissions and HealthKit background
delivery were checked against official pages on **2026-10-05** (sources below). Items marked
*UNVERIFIED* could not be confirmed that day.

---

## 1. Fitbit / Pixel Watch → Google Health API

### The Fitbit Web API is being turned off
Official banner on every Fitbit developer page (dev.fitbit.com, 2026-10-05):
> "Support for the legacy Fitbit Web API ends on September 30, 2026. After this date the API will
> continue to operate, but Google will no longer fix bugs or provide API support. On October 30, 2026,
> the Fitbit Web API will be turned off … migrate to the Google Health API."

So this project does **not** build on the Fitbit Web API (it would stop working before the
hackathon on Nov 14–15). It implements the replacement.

### Google Health API — facts used by `apps/server/src/wearables/providers/googleHealth.ts`
| Topic | Detail | Source |
|---|---|---|
| Service | `https://health.googleapis.com`, REST v4 (also v4beta) | discovery doc `https://health.googleapis.com/$discovery/rest?version=v4` |
| Read raw points | `GET /v4/users/me/dataTypes/{type}/dataPoints?filter=&pageSize=&pageToken=` | discovery doc |
| Aggregates | `POST …/dataPoints:rollUp` (physical windows, heart-rate range ≤ 14 days), `POST …/dataPoints:dailyRollUp` (civil days) | discovery doc |
| Filter syntax | AIP-160, e.g. `daily_resting_heart_rate.date >= "2026-09-28"`; samples `heart_rate.sample_time.physical_time`; sleep `sleep.interval.end_time`; exercise `exercise.interval.civil_start_time` | discovery doc (`filter` description) |
| Page size | default ≤ 1440, max 10000; sleep & exercise max 25 | discovery doc |
| OAuth | Google OAuth 2.0, authorization endpoint `https://accounts.google.com/o/oauth2/v2/auth`; refresh tokens required for long-term access (`access_type=offline`) | developers.google.com/health/setup |
| Scopes we request (read-only, least privilege) | `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`, `…googlehealth.activity_and_fitness.readonly`, `…googlehealth.sleep.readonly` | discovery doc `auth.oauth2.scopes` |
| Rate limits | per user 300 requests/minute; per project 120,000/min and 86.4M/day; 429 → back off | developers.google.com/health/rate-limits |
| **Access (blocking)** | "While we are **not onboarding new projects at this time**, we are actively working to open access to more developers" (setup page, updated 2026-10-02) | developers.google.com/health/setup |
| Verification | "Most scopes for the Google Health API are restricted"; unverified apps limited to 100 users; restricted scopes need OAuth verification **and** a third-party security assessment (CASA, 2–6 weeks, USD 500–4,500) | developers.google.com/health/app-verification |
| Testing mode | Refresh tokens issued while the consent screen is in "Testing" expire after 7 days; test users must be added by email | developers.google.com/health/setup |
| Migration | Existing Fitbit OAuth tokens do not carry over; users must re-consent with Google | developers.google.com/health/migration (via Google's newsletter; *UNVERIFIED verbatim*) |

### Metrics (data type → AstroVitals metric)
| Metric | Google Health data type | Granularity | AstroVitals mapping |
|---|---|---|---|
| Heart rate | `heart-rate` (1 s storage) | sample → we request 5-min `rollUp` averages | `heart_rate` (interval) |
| Resting HR | `daily-resting-heart-rate` | daily | `resting_heart_rate` |
| HRV | `daily-heart-rate-variability` (`averageHeartRateVariabilityMilliseconds`, RMSSD) | daily | `hrv_rmssd` |
| SpO₂ | `daily-oxygen-saturation` (`averagePercentage`) | daily (during sleep) | `spo2` |
| Respiratory rate | `daily-respiratory-rate` (`breathsPerMinute`) | daily (main sleep) | `respiratory_rate` |
| Skin temperature | `daily-sleep-temperature-derivations` (`nightlyTemperatureCelsius`, `baselineTemperatureCelsius`) | daily | `skin_temperature` (+ derived `skin_temperature_deviation`, labelled derived) |
| Sleep + stages | `sleep` (stages AWAKE/LIGHT/DEEP/REM/ASLEEP/RESTLESS) | session | `SleepData` |
| Steps | `steps` → `dailyRollUp` | daily | `steps` |
| Calories | `active-energy-burned` → `dailyRollUp` | daily | `active_energy` |
| Workouts | `exercise` | session | `Workout` |

Historical vs live: cloud data appears after the watch syncs to the phone app; there is no
real-time stream. Webhooks exist (`projects.subscribers.subscriptions`) but are not used here.

**Needs a physical device?** Yes for real data (Fitbit/Pixel Watch synced to the user's Google
account). The code path is tested against schema-derived fixtures.

---

## 2. Apple Watch → HealthKit

- **No web or cloud API exists.** HealthKit data lives on the iPhone (and Watch) and can be read only
  by a native app the user authorizes on-device. iCloud Health sync is not an API.
- Two honest paths are implemented:

### 2a. Health app export (works today, no Mac, no developer account)
Apple Support: *"You can export all of your health and fitness data from Health in XML format …
tap your picture or initials at the top right, then tap Export All Health Data"*
(<https://support.apple.com/guide/iphone/share-your-health-data-iph5ede58c3d/ios>).
The user unzips `export.zip` and uploads `export.xml` on the Connections page. The parser streams the
file, reads `<Record>`, `<Workout>` and `<WorkoutStatistics>` elements, keeps original values/units
in `raw`, and imports only the selected window. The XML layout is defined by the DTD inside the file,
not by a published API contract, so unknown types are reported, never guessed. Manual and not live.

### 2b. Companion iOS app (reference code in `companion/ios/`)
| Topic | Detail |
|---|---|
| Identifiers read | `HKQuantityTypeIdentifier` `.heartRate`, `.restingHeartRate`, `.heartRateVariabilitySDNN`, `.oxygenSaturation`, `.respiratoryRate`, `.appleSleepingWristTemperature`, `.stepCount`, `.activeEnergyBurned`; `HKCategoryTypeIdentifier.sleepAnalysis`; workouts |
| Units sent | `count/min`, `ms`, `%` (fraction 0–1, converted server-side), `degC`, `count`, `kcal` |
| Permissions | HealthKit capability/entitlement; Info.plist `NSHealthShareUsageDescription`; per-type read authorization requested in-app (HealthKit does not reveal whether read access was denied) |
| Background | `enableBackgroundDelivery(for:frequency:)` requires the HealthKit Background Delivery entitlement on iOS 15+/watchOS 8+; the system wakes the app at most once per frequency period; observer queries must be registered at launch and their completion handler called; "Background server queries aren't supported on the Simulator" (Apple docs, verified 2026-10-05) |
| Transport | HTTPS `POST /api/ingest/healthkit` with `Authorization: Bearer <device token>` generated on the Connections page (stored only as an HMAC; revocable) |
| Developer requirements | Mac + Xcode, an Apple developer account, a physical iPhone paired with the Apple Watch. App Store distribution must follow App Review Guideline 5.1.3 (health data: no advertising/data-mining use, privacy policy, no iCloud storage of personal health information) — *re-check the current guideline text before submission* |
| Device notes | HRV from Apple is **SDNN**, not RMSSD: AstroVitals keeps them as separate metrics. Wrist temperature needs a recent Watch model and overnight wear; SpO₂ availability depends on model and region (*UNVERIFIED for 2026 per region*) |
| Live data | Apple Watch heart rate reaches HealthKit every few minutes (more often during workouts); a truly live stream needs a watchOS workout session app — out of scope |

---

## 3. Wear OS / Android → Health Connect (documented for future work)

| Topic | Detail (developer.android.com, verified 2026-10-05) |
|---|---|
| Location | On-device only (built into Android 14+; an app on Android 9–13). No cloud/REST API. |
| Library | Jetpack `androidx.health.connect:connect-client` (Maven metadata on 2026-10-05: latest `1.2.0-alpha06`) |
| Records → read permissions | `HeartRateRecord` → `android.permission.health.READ_HEART_RATE`; `RestingHeartRateRecord` → `READ_RESTING_HEART_RATE`; `HeartRateVariabilityRmssdRecord` → `READ_HEART_RATE_VARIABILITY`; `OxygenSaturationRecord` → `READ_OXYGEN_SATURATION`; `RespiratoryRateRecord` → `READ_RESPIRATORY_RATE`; `SkinTemperatureRecord` → `READ_SKIN_TEMPERATURE`; `BodyTemperatureRecord` → `READ_BODY_TEMPERATURE`; `SleepSessionRecord` → `READ_SLEEP`; `StepsRecord` → `READ_STEPS`; `ActiveCaloriesBurnedRecord` → `READ_ACTIVE_CALORIES_BURNED`; `TotalCaloriesBurnedRecord` → `READ_TOTAL_CALORIES_BURNED`; `ExerciseSessionRecord` → `READ_EXERCISE` (+ `READ_EXERCISE_ROUTE`) — all prefixed `android.permission.health.` |
| Background & history | `android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND`; `android.permission.health.READ_HEALTH_DATA_HISTORY` to read data older than the default 30 days |
| Watch side | Wear OS watches record through Health Services / the OEM app (e.g. Fitbit app for Pixel Watch, Samsung Health), which write into Health Connect on the phone |
| Store policy | Production apps using health permissions go through Google Play's Health Connect declaration/review (*details UNVERIFIED on 2026-10-05*) |
| Fit for this project | Companion Android app (Kotlin + WorkManager) → `POST /api/ingest/...` with a device token — same pattern as HealthKit. Not implemented (no Android watch available to the team). |

---

## 4. Garmin

| Topic | Detail (developer.garmin.com / Garmin OAuth2 PKCE PDF, checked 2026-10-05) |
|---|---|
| Access | Garmin Connect Developer Program — approval-only, business-focused. The application form was **offline** when checked. |
| Auth | OAuth 2.0 with PKCE (token host `diauth.garmin.com`); user-permission and deregistration endpoints exist |
| Delivery | Garmin pushes (or pings) summaries — dailies, epochs, sleep, stress, HRV, pulse-ox, respiration, … — to a partner webhook; backfill endpoints for history |
| Schemas | Only in the portal-gated "Health REST API Specification", so no parser was written (it would be guesswork) |
| Fit | `GarminProvider` adapter slot reports "approval required"; implement `OAuthWearableProvider` + a verified webhook once approved |

---

## 5. Other platforms (for the provider abstraction)

Oura (API v2, OAuth 2.0), Withings, Polar AccessLink and WHOOP offer self-serve web OAuth APIs and
would each be a new `OAuthWearableProvider`. Samsung Health requires a partner program. Google Fit
REST is deprecated in favour of Health Connect / Google Health API. *These were not re-verified on
2026-10-05 — check each portal before building.*

---

## What requires a physical smartwatch, and what requires approval

| Need | Physical watch? | Developer approval / special access? |
|---|---|---|
| Demo mode | No | No |
| NASA panels | No | No (optional free api.nasa.gov key) |
| Apple Health export import | Yes (any Apple Watch + iPhone for real data) | No |
| HealthKit companion app | Yes (iPhone + Apple Watch; Simulator has no sensors or background delivery) | Apple developer account + HealthKit entitlement; App Review 5.1.3 for distribution |
| Google Health API (Fitbit / Pixel Watch) | Yes | **Yes — Google is not onboarding new projects (2026-10-02)**; restricted scopes → verification + CASA to exceed 100 users |
| Fitbit Web API | — | Shuts down 2026-10-30; not used |
| Health Connect app | Yes (Android phone + Wear OS watch) | Google Play health-permission declaration for production |
| Garmin Health API | Yes | **Yes — partner approval** (form offline 2026-10-05) |
