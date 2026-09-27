import Foundation

struct HealthStatisticsCursor: Codable {
  var next: Date
  var end: Date
  var timeZone: String
  var generation: Int
  var complete: Bool
  var fullSweepAt: Date
  var historyStart: Date
}

struct HealthWorkoutCursor: Codable {
  var plan: HealthStatisticsCursor
  var excludedIds: [String]

  mutating func advance(start: Date, id: String) throws {
    if start != plan.next { excludedIds = [] }
    guard !excludedIds.contains(id), excludedIds.count < 128 else {
      throw NSError(domain: "HealthExporter", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Workout pagination could not advance safely."])
    }
    plan.next = start
    excludedIds.append(id)
  }
}

enum HealthStatisticsPlan {
  static func acknowledged(_ previous: HealthStatisticsCursor?, generation: Int) -> Bool {
    previous?.complete == true && previous?.generation == generation
  }

  static func requiresFullSweep(_ previous: HealthStatisticsCursor?, generation: Int,
                               all: Bool, now: Date, calendar: Calendar) -> Bool {
    guard let previous else { return true }
    return previous.timeZone != calendar.timeZone.identifier || previous.generation > generation ||
      all || now.timeIntervalSince(previous.fullSweepAt) > 30 * 86400
  }

  static func makeCursor(previous: HealthStatisticsCursor?, generation: Int, dirty: Date?,
                         full: Bool, earliest: Date?, now: Date, calendar: Calendar) -> HealthStatisticsCursor {
    if let previous, !previous.complete, previous.timeZone == calendar.timeZone.identifier { return previous }
    let today = calendar.startOfDay(for: now)
    let recent = calendar.date(byAdding: .day, value: -7, to: today)!
    // Keep the previously exported range when its oldest samples are deleted;
    // those days must be replaced by explicit empty statistics, not left stale.
    let first = full ? min(earliest ?? today, previous?.historyStart ?? today) : min(recent, dirty ?? recent)
    return HealthStatisticsCursor(next: calendar.startOfDay(for: first),
      end: calendar.date(byAdding: .day, value: 1, to: today)!, timeZone: calendar.timeZone.identifier,
      generation: generation, complete: false, fullSweepAt: full ? now : previous!.fullSweepAt,
      historyStart: min(previous?.historyStart ?? first, first))
  }
}
