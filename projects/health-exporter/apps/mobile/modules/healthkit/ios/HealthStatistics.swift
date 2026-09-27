import Foundation
import HealthKit

extension HealthReader {
  static let statisticIdentifiers: [HKQuantityTypeIdentifier] = [
    .stepCount, .distanceWalkingRunning, .distanceCycling, .activeEnergyBurned,
    .basalEnergyBurned, .appleExerciseTime, .restingHeartRate, .heartRateVariabilitySDNN
  ]

  static func affectsWorkoutDetails(_ type: String) -> Bool {
    [HKWorkoutTypeIdentifier, "HKQuantityTypeIdentifierHeartRate", "HKQuantityTypeIdentifierActiveEnergyBurned",
     "HKQuantityTypeIdentifierDistanceWalkingRunning", "HKQuantityTypeIdentifierDistanceCycling",
     "HKQuantityTypeIdentifierRunningSpeed", "HKQuantityTypeIdentifierCyclingPower",
     "HKQuantityTypeIdentifierCyclingCadence"].contains(type)
  }

  // Invalidation is durable before raw-page acknowledgment. A receiver-confirmed
  // completed cursor is the only evidence that a generation was exported.
  func invalidateStatistics(_ type: String, samples: [HKSample], deleted: [HKDeletedObject]) {
    guard !samples.isEmpty || !deleted.isEmpty else { return }
    if Self.affectsWorkoutDetails(type) { invalidateSummary("workoutDetails", samples: samples, deleted: deleted) }
    if Self.statisticIdentifiers.contains(where: { $0.rawValue == type }) { invalidateSummary(type, samples: samples, deleted: deleted) }
  }

  private func invalidateSummary(_ type: String, samples: [HKSample], deleted: [HKDeletedObject]) {
    let defaults = UserDefaults.standard
    let prefix = "health.statistics.\(type)."
    defaults.set(defaults.integer(forKey: prefix + "generation") + 1, forKey: prefix + "generation")
    if !deleted.isEmpty { defaults.set(true, forKey: prefix + "all") }
    if let earliest = samples.map({ $0.startDate }).min() {
      let previous = defaults.object(forKey: prefix + "dirty") as? Date
      defaults.set(min(previous ?? earliest, earliest), forKey: prefix + "dirty")
    }
  }

  func statisticsPage(_ identifier: String, _ encoded: String?) async throws -> [String: Any] {
    let raw = String(identifier.dropFirst("statistics:".count))
    guard Self.statisticIdentifiers.contains(where: { $0.rawValue == raw }),
          let type = HKQuantityType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: raw)) else {
      throw failure("Unsupported statistics type.")
    }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    let now = Date()
    let defaults = UserDefaults.standard, prefix = "health.statistics.\(raw)."
    let generation = defaults.integer(forKey: prefix + "generation")
    var previous: HealthStatisticsCursor?
    if let encoded, !encoded.isEmpty {
      guard let data = Data(base64Encoded: encoded), let decoded = try? JSONDecoder().decode(HealthStatisticsCursor.self, from: data) else {
        throw failure("Invalid statistics checkpoint. Export from beginning to rebuild summaries.")
      }
      previous = decoded
    }
    if HealthStatisticsPlan.acknowledged(previous, generation: generation) {
      defaults.removeObject(forKey: prefix + "dirty")
      defaults.removeObject(forKey: prefix + "all")
    }
    var cursor: HealthStatisticsCursor
    if let previous, !previous.complete, previous.timeZone == calendar.timeZone.identifier {
      cursor = previous
    } else {
      let full = HealthStatisticsPlan.requiresFullSweep(previous, generation: generation,
        all: defaults.bool(forKey: prefix + "all"), now: now, calendar: calendar)
      let first = full ? try await earliestSample(type) : nil
      cursor = HealthStatisticsPlan.makeCursor(previous: previous, generation: generation,
        dirty: defaults.object(forKey: prefix + "dirty") as? Date, full: full, earliest: first,
        now: now, calendar: calendar)
    }
    let end = min(calendar.date(byAdding: .day, value: 31, to: cursor.next)!, cursor.end)
    let values = try await statisticValues(type, start: cursor.next, end: end, interval: DateComponents(day: 1), calendar: calendar)
    let formatter = DateFormatter()
    formatter.calendar = calendar; formatter.timeZone = calendar.timeZone; formatter.dateFormat = "yyyy-MM-dd"
    let records = values.map { item -> [String: Any] in
      var data = item
      let date = formatter.string(from: item["dateObject"] as! Date)
      data.removeValue(forKey: "dateObject")
      data["kind"] = "healthkitStatistic"; data["date"] = date
      data["resolution"] = "day"; data["timeZone"] = calendar.timeZone.identifier
      data["calculatedAt"] = iso(now); data["quantityType"] = raw
      data["source"] = ["name": "HealthKit reconciled statistics", "bundleIdentifier": "healthkit.statistics"]
      let id = "\(calendar.timeZone.identifier)/\(date)"
      return ["id": id, "parentId": id, "data": data]
    }
    cursor.next = end; cursor.complete = end >= cursor.end
    return ["records": records, "deleted": [String](),
      "anchor": try JSONEncoder().encode(cursor).base64EncodedString(), "hasMore": !cursor.complete]
  }

  private func earliestSample(_ type: HKSampleType) async throws -> Date? {
    try await withHealthQuery(store: store) { continuation in
      let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1,
        sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, error in
          if let error { continuation.resume(throwing: error) }
          else { continuation.resume(returning: samples?.first?.startDate) }
        }
      continuation.execute(query)
    }
  }

  // Derived workout timelines have their own resumable sweep. Raw workout anchors
  // alone miss quantities associated with a workout after that workout was saved.
  func workoutDetailPage(_ encoded: String?) async throws -> [String: Any] {
    var calendar = Calendar(identifier: .gregorian); calendar.timeZone = .current
    let now = Date(), defaults = UserDefaults.standard, prefix = "health.statistics.workoutDetails."
    let generation = defaults.integer(forKey: prefix + "generation")
    var previous: HealthWorkoutCursor?
    if let encoded, !encoded.isEmpty {
      guard let data = Data(base64Encoded: encoded), let decoded = try? JSONDecoder().decode(HealthWorkoutCursor.self, from: data) else {
        throw failure("Invalid workout detail checkpoint. Export from beginning to rebuild timelines.")
      }
      previous = decoded
    }
    if HealthStatisticsPlan.acknowledged(previous?.plan, generation: generation) {
      defaults.removeObject(forKey: prefix + "dirty"); defaults.removeObject(forKey: prefix + "all")
    }
    var cursor: HealthWorkoutCursor
    if let previous, !previous.plan.complete, previous.plan.timeZone == calendar.timeZone.identifier {
      cursor = previous
    } else {
      let full = HealthStatisticsPlan.requiresFullSweep(previous?.plan, generation: generation,
        all: defaults.bool(forKey: prefix + "all"), now: now, calendar: calendar)
      let first = full ? try await earliestSample(HKObjectType.workoutType()) : nil
      cursor = HealthWorkoutCursor(plan: HealthStatisticsPlan.makeCursor(previous: previous?.plan,
        generation: generation, dirty: (defaults.object(forKey: prefix + "dirty") as? Date)?.addingTimeInterval(-2 * 86400),
        full: full, earliest: first, now: now, calendar: calendar), excludedIds: [])
    }
    var predicates = [HKQuery.predicateForSamples(withStart: cursor.plan.next, end: cursor.plan.end, options: .strictStartDate)]
    if !cursor.excludedIds.isEmpty {
      predicates.append(NSCompoundPredicate(notPredicateWithSubpredicate:
        HKQuery.predicateForObjects(with: Set(cursor.excludedIds.compactMap(UUID.init(uuidString:))))))
    }
    let workout: HKWorkout? = try await withHealthQuery(store: store) { continuation in
      continuation.execute(HKSampleQuery(sampleType: HKObjectType.workoutType(),
        predicate: NSCompoundPredicate(andPredicateWithSubpredicates: predicates), limit: 1,
        sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, error in
          if let error { continuation.resume(throwing: error) }
          else { continuation.resume(returning: samples?.first as? HKWorkout) }
        })
    }
    var records: [[String: Any]] = []
    if let workout {
      let id = workout.uuid.uuidString.lowercased()
      records = try await exportSample(workout, allowAuthorization: false)
      var base = records[0]["data"] as! [String: Any]
      base["kind"] = "workoutContext"; base["calculatedAt"] = iso(now)
      records[0]["data"] = base
      records += chunks(id, "workoutStatistics", try await workoutStatistics(workout))
      try cursor.advance(start: workout.startDate, id: id)
    } else { cursor.plan.next = cursor.plan.end; cursor.plan.complete = true }
    return ["records": records, "deleted": [String](),
      "anchor": try JSONEncoder().encode(cursor).base64EncodedString(), "hasMore": !cursor.plan.complete]
  }

  func workoutStatistics(_ workout: HKWorkout) async throws -> [[String: Any]] {
    var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    var result: [[String: Any]] = []
    var identifiers: [HKQuantityTypeIdentifier] = [.heartRate, .activeEnergyBurned, .distanceWalkingRunning, .distanceCycling]
    if #available(iOS 16.0, *) { identifiers.append(.runningSpeed) }
    if #available(iOS 17.0, *) { identifiers += [.cyclingPower, .cyclingCadence] }
    for id in identifiers {
      try Task.checkCancellation()
      guard let type = HKQuantityType.quantityType(forIdentifier: id) else { continue }
      let values = try await statisticValues(type, start: workout.startDate, end: workout.endDate,
        interval: DateComponents(minute: 1), calendar: calendar, workout: workout)
      result += values.map { item in
        var data = item; data.removeValue(forKey: "dateObject")
        data["metric"] = id.rawValue
        data["association"] = "healthkit_workout_predicate"
        data["method"] = "healthkit_statistics"
        data["samplingCoverage"] = "unknown"
        return data
      }
    }
    return result
  }

  private func statisticValues(_ type: HKQuantityType, start: Date, end: Date,
                               interval: DateComponents, calendar: Calendar,
                               workout: HKWorkout? = nil) async throws -> [[String: Any]] {
    guard end > start else { return [] }
    let unit = HealthTypes.unit(type)
    let cumulative = type.aggregationStyle == .cumulative
    let options: HKStatisticsOptions = cumulative ? .cumulativeSum : [.discreteAverage, .discreteMin, .discreteMax]
    let datePredicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
    let predicate = workout.map { NSCompoundPredicate(andPredicateWithSubpredicates: [datePredicate, HKQuery.predicateForObjects(from: $0)]) } ?? datePredicate
    return try await withHealthQuery(store: store) { continuation in
      let query = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: predicate,
        options: options, anchorDate: start, intervalComponents: interval)
      query.initialResultsHandler = { query, collection, error in
        defer { self.store.stop(query) }
        if let error { continuation.resume(throwing: error); return }
        guard let collection else { continuation.resume(throwing: self.failure("Statistics unavailable.")); return }
        var values: [[String: Any]] = []
        collection.enumerateStatistics(from: start, to: end.addingTimeInterval(-0.001)) { statistic, _ in
          let quantity = cumulative ? statistic.sumQuantity() : statistic.averageQuantity()
          var data: [String: Any] = ["dateObject": statistic.startDate, "startAt": self.iso(statistic.startDate),
            "endAt": self.iso(min(statistic.endDate, end)), "unit": unit.unitString,
            "value": quantity.map { $0.doubleValue(for: unit) } as Any? ?? NSNull(),
            "function": cumulative ? "sum" : "average",
            "contributors": (statistic.sources ?? []).map { ["name": $0.name, "bundleIdentifier": $0.bundleIdentifier] }
              .sorted { $0["bundleIdentifier"]! < $1["bundleIdentifier"]! }]
          if !cumulative {
            data["min"] = statistic.minimumQuantity().map { $0.doubleValue(for: unit) } as Any? ?? NSNull()
            data["max"] = statistic.maximumQuantity().map { $0.doubleValue(for: unit) } as Any? ?? NSNull()
          }
          values.append(data)
        }
        continuation.resume(returning: values)
      }
      continuation.execute(query)
    }
  }
}
