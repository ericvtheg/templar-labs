import ExpoModulesCore
import HealthKit

public final class TemplarHealthKitModule: Module {
  private let store = HKHealthStore()

  public func definition() -> ModuleDefinition {
    Name("TemplarHealthKit")

    AsyncFunction("requestPermissions") { () async throws in
      guard HKHealthStore.isHealthDataAvailable(),
            let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
        throw HealthKitUnavailable()
      }
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        self.store.requestAuthorization(toShare: [], read: [stepType]) { allowed, error in
          if let error {
            continuation.resume(throwing: error)
          } else if !allowed {
            continuation.resume(throwing: HealthKitAuthorizationFailed())
          } else {
            continuation.resume()
          }
        }
      }
    }

    AsyncFunction("readRecentSteps") { (days: Int) async throws -> [[String: Any]] in
      guard (1...30).contains(days),
            let stepType = HKObjectType.quantityType(forIdentifier: .stepCount),
            let start = Calendar.current.date(byAdding: .day, value: -days, to: Date()) else {
        throw InvalidReadWindow()
      }
      let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
      let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
      return try await withCheckedThrowingContinuation { continuation in
        let query = HKSampleQuery(sampleType: stepType, predicate: predicate, limit: 100, sortDescriptors: [sort]) {
          _, samples, error in
          if let error {
            continuation.resume(throwing: error)
            return
          }
          let mapped = (samples as? [HKQuantitySample] ?? []).map { sample in
            [
              "sampleId": sample.uuid.uuidString.lowercased(),
              "type": "stepCount",
              "value": Int(sample.quantity.doubleValue(for: .count())),
              "unit": "count",
              "startAt": ISO8601DateFormatter.healthExporter.string(from: sample.startDate),
              "endAt": ISO8601DateFormatter.healthExporter.string(from: sample.endDate),
              "source": [
                "bundleIdentifier": sample.sourceRevision.source.bundleIdentifier,
                "name": sample.sourceRevision.source.name,
              ],
            ]
          }
          continuation.resume(returning: mapped)
        }
        self.store.execute(query)
      }
    }
  }
}

private extension ISO8601DateFormatter {
  static let healthExporter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()
}

private final class HealthKitUnavailable: Exception {
  override var reason: String { "HealthKit is unavailable on this device." }
}
private final class HealthKitAuthorizationFailed: Exception {
  override var reason: String { "HealthKit authorization was not completed." }
}
private final class InvalidReadWindow: Exception {
  override var reason: String { "Read window must be between 1 and 30 days." }
}
