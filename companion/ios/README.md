# HealthKit companion app (reference)

Why it exists: **Apple provides no web or cloud API for HealthKit.** Apple Watch data can only be
read on the iPhone by a native app the user authorizes. This companion reads new samples with
anchored queries, wakes in the background when HealthKit has new data, and POSTs them to the
AstroVitals backend with a per-device token.

> **Status:** reference code (`HealthKitSync.swift`), written against the HealthKit API but **not
> compiled** where this project was generated (Windows). If you only need your Apple Watch data in the
> dashboard, use the **Apple Health export** on the Connections page — it needs no Mac and no
> developer account.

## What you need
- A Mac with Xcode, an Apple developer account (a paid membership is needed for distribution),
  an iPhone paired with your Apple Watch. The Simulator has no sensors and no background delivery.
- The AstroVitals server reachable from the phone over **HTTPS** (App Transport Security blocks
  plain HTTP; use a tunnel such as `cloudflared` or a deployed instance for testing).

## Setup
1. Xcode → new iOS App (SwiftUI), iOS 16+. Add `HealthKitSync.swift`.
2. Signing & Capabilities → **+ HealthKit**, tick **Background Delivery**
   (entitlement `com.apple.developer.healthkit.background-delivery`, required on iOS 15+).
3. Info.plist → `NSHealthShareUsageDescription` = "AstroVitals reads heart rate, HRV, blood oxygen,
   respiratory rate, wrist temperature, sleep, steps, energy and workouts to show them on your
   personal dashboard." (no write access is requested, so no `NSHealthUpdateUsageDescription`).
4. In the dashboard: Connections → *HealthKit companion app* → **Create device token**. Copy it.
5. In the app's settings screen (yours to build): save the server URL to
   `UserDefaults.standard.set(url, forKey: "astrovitals.endpoint")` and the token with
   `Keychain.save(token, for: "astrovitals.deviceToken")`.
6. On launch (`application(_:didFinishLaunchingWithOptions:)` or the SwiftUI `App` init):
   `try await HealthKitSync.shared.requestAuthorization()` (first run), then
   `HealthKitSync.shared.startObserving()` on **every** launch.
7. Add a "Sync now" button calling `try await HealthKitSync.shared.syncNewSamples()`.

## Behaviour & limits
- Background delivery wakes the app at most once per chosen frequency (hourly here; some types are
  capped at hourly by iOS) — data is near-real-time, not live.
- HealthKit data is encrypted while the phone is locked; background reads can fail until first unlock.
- HealthKit does not reveal whether read access was denied — denied types simply return nothing.
- Anchors advance only after the server accepted a batch, so failed uploads are retried.
- Apple HRV is **SDNN** (`hrv_sdnn` in AstroVitals), not RMSSD.
- Distribution through the App Store must comply with App Review Guideline 5.1.3 (health data may not
  be used for advertising or data mining, privacy policy required, no personal health data in iCloud).

## Payload
See `docs/API.md` → *Companion ingest*. Revoke a lost phone's token on the Connections page.
