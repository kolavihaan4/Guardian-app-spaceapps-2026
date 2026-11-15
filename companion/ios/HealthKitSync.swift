// AstroVitals companion — HealthKit → AstroVitals backend.
//
// REFERENCE IMPLEMENTATION. Written against Apple's HealthKit API but NOT compiled in the
// environment where this project was generated (Windows, no Xcode). Build it in Xcode on a Mac,
// run on a physical iPhone paired with an Apple Watch (the Simulator has no sensors and does not
// support background delivery).
//
// Requirements (see README.md):
//  - Capability: HealthKit, with "Background Delivery" checked
//    (entitlement com.apple.developer.healthkit.background-delivery, required on iOS 15+)
//  - Info.plist: NSHealthShareUsageDescription
//  - iOS 16+ (HKAnchoredObjectQueryDescriptor async API: iOS 15.4+)

import Foundation
import HealthKit
import Security

/// What we read. Read-only: the app never writes to HealthKit.
enum Vitals {
    static let quantityTypes: [(HKQuantityTypeIdentifier, HKUnit)] = [
        (.heartRate, HKUnit.count().unitDivided(by: .minute())),                  // "count/min"
        (.restingHeartRate, HKUnit.count().unitDivided(by: .minute())),
        (.heartRateVariabilitySDNN, HKUnit.secondUnit(with: .milli)),              // "ms"
        (.oxygenSaturation, HKUnit.percent()),                                     // "%" (0–1 fraction)
        (.respiratoryRate, HKUnit.count().unitDivided(by: .minute())),
        (.appleSleepingWristTemperature, HKUnit.degreeCelsius()),                  // "degC"
        (.stepCount, HKUnit.count()),                                              // "count"
        (.activeEnergyBurned, HKUnit.kilocalorie()),                               // "kcal"
    ]

    static var readTypes: Set<HKObjectType> {
        var s = Set<HKObjectType>(quantityTypes.map { HKQuantityType($0.0) })
        s.insert(HKCategoryType(.sleepAnalysis))
        s.insert(HKObjectType.workoutType())
        return s
    }
}

/// Payload accepted by POST /api/ingest/healthkit (see docs/API.md). Units are sent as HealthKit
/// unit strings; the server converts (e.g. SpO2 fraction → %) and keeps the original values.
struct IngestPayload: Encodable {
    struct Sample: Encodable { let type, unit: String; let value: Double; let start, end: String; let sourceName: String?; let device: String? }
    struct Sleep: Encodable { let value, start, end: String; let sourceName: String? }
    struct WorkoutDTO: Encodable { let activityType, start, end: String; let energyKcal, distanceMeters, averageHeartRate: Double?; let sourceName: String? }
    var samples: [Sample] = []
    var sleep: [Sleep] = []
    var workouts: [WorkoutDTO] = []
}

final class HealthKitSync {
    static let shared = HealthKitSync()
    private let store = HKHealthStore()
    private let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        f.timeZone = .current // keeps the wearer's local offset, e.g. 2026-10-04T08:00:00-05:00
        return f
    }()

    /// Server URL + device token come from the AstroVitals Connections page.
    var endpoint: URL? { UserDefaults.standard.url(forKey: "astrovitals.endpoint") }
    var deviceToken: String? { Keychain.read("astrovitals.deviceToken") }

    // MARK: Authorization

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw SyncError.healthDataUnavailable }
        // HealthKit never tells the app whether READ access was denied; denied types simply return no data.
        try await store.requestAuthorization(toShare: [], read: Vitals.readTypes)
    }

    // MARK: Background delivery — call from application(_:didFinishLaunchingWithOptions:)

    func startObserving() {
        for type in Vitals.readTypes.compactMap({ $0 as? HKSampleType }) {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completion, error in
                guard error == nil, let self else { completion(); return }
                Task {
                    defer { completion() } // must always be called, or HealthKit backs off and eventually stops waking the app
                    try? await self.syncNewSamples()
                }
            }
            store.execute(query)
            // The system wakes the app at most once per period; some types are capped at .hourly.
            store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
        }
    }

    // MARK: Incremental sync with persisted anchors

    func syncNewSamples() async throws {
        var payload = IngestPayload()
        var newAnchors: [String: HKQueryAnchor] = [:]

        for (identifier, unit) in Vitals.quantityTypes {
            let type = HKQuantityType(identifier)
            let descriptor = HKAnchoredObjectQueryDescriptor(predicates: [.quantitySample(type: type)], anchor: anchor(for: identifier.rawValue), limit: 2000)
            let result = try await descriptor.result(for: store)
            for s in result.addedSamples {
                payload.samples.append(.init(
                    type: identifier.rawValue,
                    unit: unit.unitString,
                    value: s.quantity.doubleValue(for: unit),
                    start: iso.string(from: s.startDate),
                    end: iso.string(from: s.endDate),
                    sourceName: s.sourceRevision.source.name,
                    device: s.device.map { [$0.name, $0.hardwareVersion].compactMap { $0 }.joined(separator: " ") }
                ))
            }
            newAnchors[identifier.rawValue] = result.newAnchor
        }

        let sleepType = HKCategoryType(.sleepAnalysis)
        let sleepResult = try await HKAnchoredObjectQueryDescriptor(predicates: [.categorySample(type: sleepType)], anchor: anchor(for: "sleep"), limit: 2000).result(for: store)
        for s in sleepResult.addedSamples {
            guard let value = HKCategoryValueSleepAnalysis(rawValue: s.value) else { continue }
            payload.sleep.append(.init(value: Self.sleepValueName(value), start: iso.string(from: s.startDate), end: iso.string(from: s.endDate), sourceName: s.sourceRevision.source.name))
        }
        newAnchors["sleep"] = sleepResult.newAnchor

        let workoutResult = try await HKAnchoredObjectQueryDescriptor(predicates: [.workout()], anchor: anchor(for: "workouts"), limit: 200).result(for: store)
        for w in workoutResult.addedSamples {
            let energy = w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie())
            let hr = w.statistics(for: HKQuantityType(.heartRate))?.averageQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            let distance = w.statistics(for: HKQuantityType(.distanceWalkingRunning))?.sumQuantity()?.doubleValue(for: .meter())
            payload.workouts.append(.init(activityType: Self.workoutName(w.workoutActivityType), start: iso.string(from: w.startDate), end: iso.string(from: w.endDate),
                                          energyKcal: energy, distanceMeters: distance, averageHeartRate: hr, sourceName: w.sourceRevision.source.name))
        }
        newAnchors["workouts"] = workoutResult.newAnchor

        if !payload.samples.isEmpty || !payload.sleep.isEmpty || !payload.workouts.isEmpty {
            try await upload(payload) // anchors only advance after the server accepted the batch
        }
        for (key, a) in newAnchors { save(anchor: a, for: key) }
    }

    private func upload(_ payload: IngestPayload) async throws {
        guard let base = endpoint, let token = deviceToken else { throw SyncError.notConfigured }
        var req = URLRequest(url: base.appendingPathComponent("api/ingest/healthkit"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONEncoder().encode(payload)
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw SyncError.uploadFailed }
    }

    // MARK: Helpers

    /// Readable names in the same style as the Health export ('Running', 'Cycling', …).
    static func workoutName(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .running: return "Running"
        case .walking: return "Walking"
        case .cycling: return "Cycling"
        case .swimming: return "Swimming"
        case .rowing: return "Rowing"
        case .elliptical: return "Elliptical"
        case .yoga: return "Yoga"
        case .hiking: return "Hiking"
        case .traditionalStrengthTraining: return "TraditionalStrengthTraining"
        case .functionalStrengthTraining: return "FunctionalStrengthTraining"
        case .highIntensityIntervalTraining: return "HighIntensityIntervalTraining"
        default: return "Other"
        }
    }

    static func sleepValueName(_ v: HKCategoryValueSleepAnalysis) -> String {
        switch v {
        case .inBed: return "HKCategoryValueSleepAnalysisInBed"
        case .asleepUnspecified: return "HKCategoryValueSleepAnalysisAsleepUnspecified"
        case .asleepCore: return "HKCategoryValueSleepAnalysisAsleepCore"
        case .asleepDeep: return "HKCategoryValueSleepAnalysisAsleepDeep"
        case .asleepREM: return "HKCategoryValueSleepAnalysisAsleepREM"
        case .awake: return "HKCategoryValueSleepAnalysisAwake"
        @unknown default: return "unknown"
        }
    }

    private func anchor(for key: String) -> HKQueryAnchor? {
        guard let data = UserDefaults.standard.data(forKey: "anchor.\(key)") else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    private func save(anchor: HKQueryAnchor, for key: String) {
        if let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) {
            UserDefaults.standard.set(data, forKey: "anchor.\(key)")
        }
    }

    enum SyncError: Error { case healthDataUnavailable, notConfigured, uploadFailed }
}

/// Minimal Keychain wrapper: the device token is a credential, so it never goes in UserDefaults.
enum Keychain {
    static func save(_ value: String, for key: String) {
        let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key]
        SecItemDelete(base as CFDictionary)
        var add = base
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    static func read(_ key: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key,
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
