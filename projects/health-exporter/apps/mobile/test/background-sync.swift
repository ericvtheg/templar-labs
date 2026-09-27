import Foundation
import HealthKit

actor FixtureServer {
  var anchor: String?
  var stored = Set<String>()
  var batches = 0
  var checkpoints = 0
  var failBatch: Int?
  var wrongAcknowledgment = false
  var bodies: [[String: Any]] = []

  func configure(failBatch: Int? = nil, wrong: Bool = false) {
    self.failBatch = failBatch; self.wrongAcknowledgment = wrong
  }

  func send(_ request: URLRequest) throws -> (Data, Int) {
    precondition(request.url!.path == "/api/v2/health-archive")
    if request.httpMethod == "GET" {
      return (try JSONSerialization.data(withJSONObject: ["protocol": 2, "checkpoints": anchor.map { ["steps": $0] } ?? [:]]), 200)
    }
    let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
    bodies.append(body)
    let records = body["records"] as! [[String: Any]]
    precondition(records.count <= 100 && (body["deleted"] as! [String]).count <= 100)
    precondition(request.httpBody!.count < 2 * 1024 * 1024)
    if !records.isEmpty {
      batches += 1
      if batches == failBatch { return (Data("{}".utf8), 503) }
      if wrongAcknowledgment { return (Data("{\"accepted\":0}".utf8), 200) }
      for record in records { stored.insert(record["id"] as! String) }
    }
    if let next = body["checkpoint"] as? String { anchor = next; checkpoints += 1 }
    return (try JSONSerialization.data(withJSONObject: ["accepted": records.count, "deleted": (body["deleted"] as! [String]).count]), 200)
  }

  func state() -> (String?, Int, Int) { (anchor, stored.count, checkpoints) }
  func postedCount() -> Int { bodies.count }
  func checkpointPositions() -> [Int] { bodies.enumerated().compactMap { $0.element["checkpoint"] == nil ? nil : $0.offset } }
}

@main struct BackgroundSyncTests {
  static func main() async throws {
    precondition(HealthSyncBudget.canContinue(active: true, processing: false, protectedDataAvailable: true, hasAssertion: false, remaining: 0))
    precondition(HealthSyncBudget.canContinue(active: false, processing: true, protectedDataAvailable: true, hasAssertion: false, remaining: 0), "BGProcessingTask must not inherit a short UIKit timer")
    precondition(HealthSyncBudget.canContinue(active: false, processing: false, protectedDataAvailable: true, hasAssertion: true, remaining: 120))
    precondition(!HealthSyncBudget.canContinue(active: false, processing: false, protectedDataAvailable: true, hasAssertion: true, remaining: 2), "Leave time to finish before suspension")
    precondition(!HealthSyncBudget.canContinue(active: false, processing: true, protectedDataAvailable: false, hasAssertion: true, remaining: 120), "Defer locked HealthKit reads")
    let store = HKHealthStore() // No queries or permissions are requested by these lifecycle tests.
    let once: Int = try await withHealthQuery(store: store) { completion in
      completion.resume(returning: 7)
      completion.cancel()
      completion.resume(returning: 99)
    }
    precondition(once == 7, "A late callback or cancellation must not resume twice")
    let earlyCancel = HealthQueryContinuation<Int>(store: store)
    earlyCancel.cancel()
    do {
      let _: Int = try await withCheckedThrowingContinuation { continuation in
        earlyCancel.start(continuation) { _ in preconditionFailure("Canceled queries must not start") }
      }
      preconditionFailure("Early cancellation must throw")
    } catch is CancellationError { }
    let target = HealthSyncTarget(url: "https://test.invalid", secret: "synthetic-secret-for-tests-1234567890", deviceId: "00000000-0000-4000-8000-000000000000")
    let bulkServer = FixtureServer()
    let bulk = HealthSyncEngine(transport: { try await bulkServer.send($0) }, readPage: { _, _ in
      ["records": (0..<500).map { ["id": "\($0)", "parentId": "\($0)", "data": ["value": $0]] },
       "deleted": (0..<250).map { "old-\($0)" }, "anchor": "bulk", "hasMore": false]
    })
    let bulkPass = try await bulk.run(target: target, types: ["steps"])
    let bulkCount = await bulkServer.postedCount()
    let bulkCheckpoints = await bulkServer.checkpointPositions()
    precondition(bulkPass.sent == 500 && bulkCount == 5 && bulkCheckpoints == [4], "Combine records, bounded deletions and final checkpoint into five requests")
    let rotatingServer = FixtureServer()
    let rotating = HealthSyncEngine(transport: { try await rotatingServer.send($0) }, readPage: { type, anchor in
      ["records": [["id": type, "parentId": type, "data": [:]]], "deleted": [String](),
       "anchor": "\((Int(anchor ?? "0") ?? 0) + 1)", "hasMore": type == "steps"]
    })
    let rotated = try await rotating.run(target: target, types: ["steps", "sleep"], maxPagesPerType: 4)
    precondition(rotated.retry == ["steps"] && rotated.completed == ["sleep"], "A large history must yield to the other types")
    let interruptedServer = FixtureServer()
    let interrupted = HealthSyncEngine(transport: { try await interruptedServer.send($0) }, readPage: bulk.readPage)
    let interruptedPass = try await interrupted.run(target: target, types: ["steps"], canContinue: { await interruptedServer.postedCount() < 1 })
    let interruptedState = await interruptedServer.state()
    precondition(interruptedPass.retry == ["steps"] && interruptedState.0 == nil && interruptedState.1 == 100, "Expiration between chunks must leave the previous anchor intact")
    let read: HealthSyncEngine.ReadPage = { _, anchor in
      let page = Int(anchor ?? "0")!
      return ["records": (0..<125).map { ["id": "\(page * 125 + $0)", "parentId": "fixture", "data": ["value": $0]] },
        "deleted": [String](), "anchor": "\(page + 1)", "hasMore": page < 1]
    }
    let server = FixtureServer()
    let engine = HealthSyncEngine(transport: { try await server.send($0) }, readPage: read)
    await server.configure(failBatch: 2)
    do {
      _ = try await engine.run(target: target, types: ["steps"], deadline: Date(timeIntervalSinceNow: 10))
      preconditionFailure("Failed upload must throw")
    } catch HealthSyncFailure.requestFailed(503) { }
    let partial = await server.state()
    precondition(partial.0 == nil && partial.1 == 100 && partial.2 == 0, "Never checkpoint a partially uploaded page")
    await server.configure()
    let pass = try await engine.run(target: target, types: ["steps"], deadline: Date(timeIntervalSinceNow: 10))
    let complete = await server.state()
    precondition(complete.0 == "2" && complete.1 == 250 && complete.2 == 2)
    precondition(pass.completed == ["steps"] && pass.sent == 250)

    let expired = try await engine.run(target: target, types: ["steps", "sleep"], deadline: .distantPast)
    precondition(expired.completed.isEmpty && expired.retry == ["sleep", "steps"])
    let afterExpiry = await server.state()
    precondition(afterExpiry.2 == 2, "Expiration must not advance checkpoints")

    let badServer = FixtureServer()
    await badServer.configure(wrong: true)
    let badEngine = HealthSyncEngine(transport: { try await badServer.send($0) }, readPage: read)
    do {
      _ = try await badEngine.run(target: target, types: ["steps"], deadline: Date(timeIntervalSinceNow: 10))
      preconditionFailure("A mismatched acknowledgment must fail")
    } catch HealthSyncFailure.invalidResponse { }
    let badState = await badServer.state()
    precondition(badState.2 == 0)

    let canceled = Task {
      try await Task.sleep(nanoseconds: 1_000_000_000)
      return try await engine.run(target: target, types: ["steps"], deadline: Date(timeIntervalSinceNow: 10))
    }
    canceled.cancel()
    do { _ = try await canceled.value; preconditionFailure("Cancellation must throw") }
    catch is CancellationError { }

    let mixedEngine = HealthSyncEngine(transport: { try await server.send($0) }, readPage: { type, anchor in
      if type == "locked" { throw HealthSyncFailure.needsForeground }
      return try await read(type, anchor)
    })
    let mixed = try await mixedEngine.run(target: target, types: ["locked", "steps"], deadline: Date(timeIntervalSinceNow: 10))
    precondition(mixed.failed == ["locked"] && mixed.completed == ["steps"])

    var queue = HealthSyncQueue()
    queue.enqueue(["steps", "sleep"])
    let started = queue.generations
    queue.enqueue(["steps"])
    queue.finish(HealthSyncPass(completed: ["steps", "sleep"]), started: started)
    precondition(queue.order == ["steps"], "A change arriving during upload must survive completion")
    let recovered = try JSONDecoder().decode(HealthSyncQueue.self, from: JSONEncoder().encode(queue))
    precondition(recovered.order == queue.order && recovered.generations == queue.generations)
    queue.finish(HealthSyncPass(completed: ["steps"]), started: queue.generations)
    precondition(queue.order.isEmpty)
    queue.enqueue(["old-history", "sleep"])
    queue.enqueue(["steps"], prioritize: true)
    precondition(queue.order.first == "steps", "Fresh changes must be prioritized over reconciliation")
    do {
      _ = try HealthSyncTarget(url: "http://test.invalid", secret: target.secret, deviceId: target.deviceId).endpoint()
      preconditionFailure("Plain HTTP must be rejected")
    } catch HealthSyncFailure.invalidDestination { }
    print("Background sync tests passed: retries, checkpoint ordering, expiry, cancellation, per-type failures, durable notifications, and destination validation.")
  }
}
