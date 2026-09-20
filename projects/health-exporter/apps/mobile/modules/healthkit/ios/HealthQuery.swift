import Foundation
import HealthKit

// A background expiration must stop the HealthKit query as well as the network task.
// Resume exactly once even if cancellation races a HealthKit callback or query startup.
final class HealthQueryContinuation<Value>: @unchecked Sendable {
  private let lock = NSLock()
  private let store: HKHealthStore
  private var continuation: CheckedContinuation<Value, Error>?
  private var activeQuery: HKQuery?
  private var finished = false

  init(store: HKHealthStore) { self.store = store }

  func start(_ continuation: CheckedContinuation<Value, Error>, body: (HealthQueryContinuation<Value>) -> Void) {
    lock.lock()
    if finished { lock.unlock(); continuation.resume(throwing: CancellationError()); return }
    self.continuation = continuation
    lock.unlock()
    body(self)
  }

  func execute(_ query: HKQuery) {
    lock.lock()
    defer { lock.unlock() }
    guard !finished else { return }
    activeQuery = query
    // HealthKit delivers results asynchronously. Keep registration atomic with cancellation.
    store.execute(query)
  }

  func resume(returning value: Value) { finish(.success(value), cancel: false) }
  func resume(throwing error: Error) { finish(.failure(error), cancel: false) }
  func cancel() { finish(.failure(CancellationError()), cancel: true) }

  private func finish(_ result: Result<Value, Error>, cancel: Bool) {
    lock.lock()
    guard !finished else { lock.unlock(); return }
    finished = true
    let continuation = self.continuation
    let query = activeQuery
    self.continuation = nil
    activeQuery = nil
    lock.unlock()
    if cancel, let query { store.stop(query) }
    continuation?.resume(with: result)
  }
}

func withHealthQuery<Value>(store: HKHealthStore, _ body: (HealthQueryContinuation<Value>) -> Void) async throws -> Value {
  let query = HealthQueryContinuation<Value>(store: store)
  return try await withTaskCancellationHandler(operation: {
    try await withCheckedThrowingContinuation { continuation in query.start(continuation, body: body) }
  }, onCancel: { query.cancel() })
}
