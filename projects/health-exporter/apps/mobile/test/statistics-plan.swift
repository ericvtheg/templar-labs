import Foundation

@main struct TestStatisticsPlan {
  static func main() throws {
    let iso = ISO8601DateFormatter()
    let now = iso.date(from: "2026-03-08T18:00:00Z")!
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
    let first = iso.date(from: "2016-12-01T12:00:00Z")!
    let initial = HealthStatisticsPlan.makeCursor(previous: nil, generation: 1, dirty: nil,
      full: true, earliest: first, now: now, calendar: calendar)
    precondition(initial.next == calendar.startOfDay(for: first))
    precondition(initial.end.timeIntervalSince(calendar.startOfDay(for: now)) == 23 * 3600)
    var partial = initial
    partial.next = iso.date(from: "2020-01-01T08:00:00Z")!
    let resumed = HealthStatisticsPlan.makeCursor(previous: partial, generation: 2, dirty: first,
      full: true, earliest: first, now: now, calendar: calendar)
    precondition(resumed.next == partial.next && resumed.generation == 1)
    precondition(!HealthStatisticsPlan.acknowledged(partial, generation: 1))
    var complete = partial; complete.complete = true
    precondition(HealthStatisticsPlan.acknowledged(complete, generation: 1))
    precondition(!HealthStatisticsPlan.acknowledged(complete, generation: 2))
    let correction = iso.date(from: "2025-11-01T08:00:00Z")!
    let rebuilt = HealthStatisticsPlan.makeCursor(previous: complete, generation: 2, dirty: correction,
      full: false, earliest: nil, now: now, calendar: calendar)
    precondition(rebuilt.next == calendar.startOfDay(for: correction))
    let allDeleted = HealthStatisticsPlan.makeCursor(previous: complete, generation: 2, dirty: nil,
      full: true, earliest: nil, now: now, calendar: calendar)
    precondition(allDeleted.next == initial.next)
    precondition(HealthStatisticsPlan.requiresFullSweep(complete, generation: 2, all: true, now: now, calendar: calendar))
    precondition(HealthStatisticsPlan.requiresFullSweep(complete, generation: 0, all: false, now: now, calendar: calendar))
    precondition(HealthStatisticsPlan.requiresFullSweep(complete, generation: 2, all: false, now: now.addingTimeInterval(31*86400), calendar: calendar))
    var different = calendar; different.timeZone = TimeZone(identifier: "Europe/London")!
    precondition(HealthStatisticsPlan.requiresFullSweep(complete, generation: 2, all: false, now: now, calendar: different))
    let encoded = try JSONEncoder().encode(partial)
    let decoded = try JSONDecoder().decode(HealthStatisticsCursor.self, from: encoded)
    precondition(decoded.next == partial.next)
    var workouts = HealthWorkoutCursor(plan: initial, excludedIds: [])
    try workouts.advance(start: first, id: "one")
    try workouts.advance(start: first, id: "two")
    precondition(workouts.excludedIds == ["one", "two"])
    let restored = try JSONDecoder().decode(HealthWorkoutCursor.self, from: JSONEncoder().encode(workouts))
    precondition(restored.excludedIds == workouts.excludedIds)
    do { try workouts.advance(start: first, id: "one"); preconditionFailure("Repeated workout must fail") } catch {}
    try workouts.advance(start: first.addingTimeInterval(1), id: "three")
    precondition(workouts.excludedIds == ["three"])
    print("Statistics checkpoints preserve corrections, generations, restart cursors and DST boundaries.")
  }
}
