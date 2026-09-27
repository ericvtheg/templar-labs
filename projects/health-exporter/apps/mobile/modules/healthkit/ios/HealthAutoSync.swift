import Foundation
import HealthKit
import BackgroundTasks
import UIKit

@MainActor
final class HealthAutoSync {
  static let shared = HealthAutoSync()
  static var taskIdentifier: String { "\(Bundle.main.bundleIdentifier!).health-sync" }
  private let reader = HealthReader()
  private let defaults = UserDefaults.standard
  private let enabledKey = "health-exporter.automatic.enabled"
  private let queueKey = "health-exporter.automatic.queue"
  private var bootstrapped = false
  private var observers: [HKObserverQuery] = []
  private var unlockObserver: NSObjectProtocol?
  private var worker: Task<Void, Never>?
  private var runId: UUID?
  private var foreground = false
  private var callbacks: [(Bool) -> Void] = []
  private var watchdog: Task<Void, Never>?
  private var backgroundToken: UIBackgroundTaskIdentifier = .invalid
  private var foregroundToken: UIBackgroundTaskIdentifier = .invalid
  private var processing = false
  private var scheduling = false
  private var queue: HealthSyncQueue

  private init() {
    queue = (defaults.data(forKey: queueKey).flatMap { try? JSONDecoder().decode(HealthSyncQueue.self, from: $0) }) ?? HealthSyncQueue()
  }

  var enabled: Bool { defaults.bool(forKey: enabledKey) }

  func bootstrap() {
    guard !bootstrapped else { return }
    bootstrapped = true
    let registered = BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.taskIdentifier, using: .main) { task in
      Task { @MainActor in self.handle(task) }
    }
    if !registered { setMessage("iOS did not register background scheduling. Open the app to retry.") }
    unlockObserver = NotificationCenter.default.addObserver(forName: UIApplication.protectedDataDidBecomeAvailableNotification, object: nil, queue: .main) { _ in
      Task { @MainActor in self.kick() }
    }
    if enabled { installObservers(); schedule() }
  }

  func configure(_ target: HealthSyncTarget, enabled: Bool) async throws {
    bootstrap()
    let heldForeground = foreground
    foreground = true
    defer { foreground = heldForeground; if !heldForeground { kick() } }
    await stopAndWait()
    let old = try HealthSyncSettings.load()
    let wasEnabled = self.enabled
    try HealthSyncSettings.save(target)
    if old != target { queue = HealthSyncQueue(); defaults.removeObject(forKey: "health-exporter.automatic.lastSuccess") }
    defaults.set(enabled, forKey: enabledKey)
    if enabled {
      installObservers()
      enqueue(reader.types().compactMap { $0["id"] })
      let catalog = HealthTypes.observedSamples(reader.store)
      let catalogKey = catalog.map { $0.identifier }.joined(separator: ",")
      if !wasEnabled || defaults.string(forKey: "health-exporter.automatic.catalog") != catalogKey {
        for type in catalog {
          // Some types do not support background delivery; periodic reconciliation covers the others.
          await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            HEEnableBackgroundDelivery(reader.store, type) { _, _ in continuation.resume() }
          }
        }
        defaults.set(catalogKey, forKey: "health-exporter.automatic.catalog")
      }
      schedule(); kick()
    } else { await disable() }
  }

  func disable() async {
    defaults.set(false, forKey: enabledKey)
    await stopAndWait()
    observers.forEach { reader.store.stop($0) }
    observers = []
    try? await reader.store.disableAllBackgroundDelivery()
    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.taskIdentifier)
    setMessage("Automatic updates are off.")
  }

  func beginForeground() async {
    foreground = true
    await stopAndWait()
    // Give the JS exporter time to finish its current request and hand off its
    // lease when AppState pauses it on backgrounding.
    if foregroundToken == .invalid {
      foregroundToken = UIApplication.shared.beginBackgroundTask(withName: "Finish health export page") {
        Task { @MainActor in self.endForegroundAssertion() }
      }
    }
  }

  func endForeground() {
    foreground = false
    if enabled { schedule(); kick() }
    endForegroundAssertion()
  }

  private func endForegroundAssertion() {
    if foregroundToken != .invalid {
      UIApplication.shared.endBackgroundTask(foregroundToken)
      foregroundToken = .invalid
    }
  }

  func becameActive() {
    guard enabled else { return }
    enqueue(reader.types().compactMap { $0["id"] })
    kick()
  }

  func status() -> [String: Any] {
    ["enabled": enabled, "configured": defaults.object(forKey: enabledKey) != nil,
     "running": worker != nil, "pendingTypes": queue.order.count,
     "lastSuccess": defaults.string(forKey: "health-exporter.automatic.lastSuccess") ?? "",
     "message": defaults.string(forKey: "health-exporter.automatic.message") ?? "Ready after your first export."]
  }

  private func installObservers() {
    guard observers.isEmpty else { return }
    // Called synchronously from the Expo app-delegate subscriber at launch, before JS starts.
    for type in HealthTypes.observedSamples(reader.store) {
      var error: NSError?
      let query = HECreateObserver(type, { _, completion, _ in
        Task { @MainActor in
          guard self.enabled else { completion(); return }
          self.queue.enqueue([type.identifier], prioritize: true)
          self.persist()
          self.schedule()
          // Foreground owns the upload lease. The durable queue retains this notification.
          if self.foreground || self.worker?.isCancelled == true { completion(); return }
          self.callbacks.append { _ in completion() }
          self.kick()
        }
      }, &error)
      guard let query, HEStartObserver(reader.store, query, &error) else {
        // SDK/platform restrictions must not abort setup or remove data from exports.
        // The full catalog remains in the durable queue for scheduled reconciliation.
        setMessage("Some health types will update through periodic checks instead of live notifications.")
        continue
      }
      observers.append(query)
    }
  }

  private func enqueue(_ types: [String]) { queue.enqueue(types); persist() }
  private func persist() { if let data = try? JSONEncoder().encode(queue) { defaults.set(data, forKey: queueKey) } }
  private func setMessage(_ message: String) { defaults.set(message, forKey: "health-exporter.automatic.message") }

  private func schedule() {
    guard enabled, !scheduling else { return }
    scheduling = true
    BGTaskScheduler.shared.getPendingTaskRequests { requests in
      Task { @MainActor in
        defer { self.scheduling = false }
        guard self.enabled, !requests.contains(where: { $0.identifier == Self.taskIdentifier }) else { return }
        // Re-submitting the same identifier replaces its request and postpones it.
        let request = BGProcessingTaskRequest(identifier: Self.taskIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        do { try BGTaskScheduler.shared.submit(request) }
        catch { self.setMessage("iOS background scheduling is unavailable. Updates will also retry when you open the app.") }
      }
    }
  }

  private func handle(_ task: BGTask) {
    guard enabled, !foreground, worker?.isCancelled != true else { task.setTaskCompleted(success: true); schedule(); return }
    enqueue(reader.types().compactMap { $0["id"] })
    processing = true
    callbacks.append { success in task.setTaskCompleted(success: success) }
    task.expirationHandler = { Task { @MainActor in self.expire() } }
    schedule()
    kick()
  }

  private func kick() {
    guard enabled, !foreground, worker == nil else { return }
    guard !queue.order.isEmpty else { finishCallbacks(true); return }
    let id = UUID()
    runId = id
    backgroundToken = UIApplication.shared.beginBackgroundTask(withName: "Health export") {
      Task { @MainActor in
        // BGProcessingTask owns a separate, longer grant of execution time.
        guard self.runId == id else { return }
        if self.processing { self.endBackgroundAssertion() } else { self.expire() }
      }
    }
    watchdog = Task { @MainActor in
      while self.runId == id {
        do { try await Task.sleep(nanoseconds: 1_000_000_000) } catch { return }
        if !self.canContinueSync() { self.expire(); return }
      }
    }
    worker = Task { @MainActor in
      var success = false
      do {
        guard let target = try HealthSyncSettings.load() else { throw HealthSyncFailure.invalidDestination }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 18
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let engine = HealthSyncEngine(transport: { request in
          let (data, response) = try await session.data(for: request)
          return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
        }, readPage: { type, anchor in
          try await self.reader.readPage(type, anchor, allowAuthorization: false)
        })
        var failed = Set<String>()
        var sent = 0
        while self.canContinueSync() {
          try Task.checkCancellation()
          let types = self.queue.order.filter { !failed.contains($0) }
          guard !types.isEmpty else { break }
          let generations = self.queue.generations
          let pass = try await engine.run(target: target, types: types, maxPagesPerType: 4,
                                           canContinue: { self.canContinueSync() })
          self.queue.finish(pass, started: generations)
          self.persist()
          failed.formUnion(pass.failed)
          sent += pass.sent
          if !pass.completed.isEmpty || pass.sent > 0 {
            self.defaults.set(ISO8601DateFormatter().string(from: Date()), forKey: "health-exporter.automatic.lastSuccess")
          }
          self.setMessage("Automatic export: \(sent) records sent; \(self.queue.order.count) types pending.")
        }
        success = failed.isEmpty
        self.setMessage(failed.isEmpty ? "Automatic export sent \(sent) records. \(self.queue.order.count) types pending; saved progress resumes when iOS allows." : "Some types need a foreground export. Other types were processed; saved progress is preserved.")
      } catch is CancellationError {
        self.setMessage("Automatic export paused; saved progress will resume on the next opportunity.")
      } catch HealthSyncFailure.unauthorized {
        self.setMessage("The destination rejected the access key. Update it in the app.")
      } catch {
        // Do not persist URLs, secrets, response bodies, or raw HealthKit errors in diagnostics.
        self.setMessage("Waiting to retry. Unlock your phone and check the destination connection.")
      }
      if self.runId == id {
        self.watchdog?.cancel(); self.watchdog = nil
        self.worker = nil; self.runId = nil
        self.finishCallbacks(success)
        self.schedule()
      }
    }
  }

  private func expire() {
    worker?.cancel()
    // Completion is always delivered before iOS's deadline; unacknowledged pages stay queued.
    finishCallbacks(false)
    schedule()
  }

  private func finishCallbacks(_ success: Bool) {
    let pending = callbacks; callbacks = []
    pending.forEach { $0(success) }
    processing = false
    endBackgroundAssertion()
  }

  private func canContinueSync() -> Bool {
    HealthSyncBudget.canContinue(active: UIApplication.shared.applicationState == .active,
      processing: processing, protectedDataAvailable: UIApplication.shared.isProtectedDataAvailable,
      hasAssertion: backgroundToken != .invalid, remaining: UIApplication.shared.backgroundTimeRemaining)
  }

  private func endBackgroundAssertion() {
    if backgroundToken != .invalid { UIApplication.shared.endBackgroundTask(backgroundToken); backgroundToken = .invalid }
  }

  private func stopAndWait() async {
    let active = worker
    active?.cancel()
    await active?.value
  }
}
