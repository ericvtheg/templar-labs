import Foundation

struct HealthSyncTarget: Codable, Equatable {
  let url: String
  let secret: String
  let deviceId: String

  func endpoint() throws -> URL {
    guard let base = URLComponents(string: url), base.scheme == "https", base.host != nil,
          base.user == nil, base.password == nil, base.query == nil, base.fragment == nil,
          UUID(uuidString: deviceId) != nil,
          secret.range(of: "^[\\w.~-]{32,512}$", options: .regularExpression) != nil else {
      throw HealthSyncFailure.invalidDestination
    }
    var result = URLComponents(url: URL(string: url)!.appendingPathComponent("api/v2/health-archive"), resolvingAgainstBaseURL: false)!
    result.queryItems = [URLQueryItem(name: "deviceId", value: deviceId)]
    return result.url!
  }
}

enum HealthSyncFailure: Error {
  case invalidDestination, invalidResponse, unauthorized, requestFailed(Int), oversizedRecord, needsForeground
}

struct HealthSyncPass {
  var completed: [String] = []
  var retry: [String] = []
  var failed: [String] = []
  var sent = 0
}

// Foundation-only engine: test real pagination/acknowledgment ordering without HealthKit or iOS scheduling.
struct HealthSyncEngine {
  typealias Transport = (URLRequest) async throws -> (Data, Int)
  typealias ReadPage = (String, String?) async throws -> [String: Any]
  let transport: Transport
  let readPage: ReadPage

  func run(target: HealthSyncTarget, types: [String], deadline: Date) async throws -> HealthSyncPass {
    let endpoint = try target.endpoint()
    let status = try await request(target, endpoint, nil)
    guard status["protocol"] as? Int == 2, let anchors = status["checkpoints"] as? [String: String] else {
      throw HealthSyncFailure.invalidResponse
    }
    var result = HealthSyncPass()
    for (index, type) in types.enumerated() {
      var anchor = anchors[type].flatMap { $0.isEmpty ? nil : $0 }
      while true {
        try Task.checkCancellation()
        guard Date() < deadline else {
          result.retry += Array(types.dropFirst(index + 1)) + [type]
          return result
        }
        let page: [String: Any]
        do { page = try await readPage(type, anchor) }
        catch is CancellationError { throw CancellationError() }
        catch { result.failed.append(type); result.retry.append(type); break }
        try Task.checkCancellation()
        guard let records = page["records"] as? [[String: Any]], let deleted = page["deleted"] as? [String],
              let next = page["anchor"] as? String, let more = page["hasMore"] as? Bool,
              !(more && next == anchor) else { throw HealthSyncFailure.invalidResponse }
        let chunks = try batches(records)
        for batch in chunks {
          try Task.checkCancellation()
          guard Date() < deadline else {
            result.retry += Array(types.dropFirst(index + 1)) + [type]
            return result
          }
          let body: [String: Any] = ["deviceId": target.deviceId, "type": type, "records": batch, "deleted": [String]()]
          let ack = try await request(target, endpoint, body)
          guard ack["accepted"] as? Int == batch.count else { throw HealthSyncFailure.invalidResponse }
          result.sent += batch.count
        }
        try Task.checkCancellation()
        let ack = try await request(target, endpoint, ["deviceId": target.deviceId, "type": type, "records": [[String: Any]](), "deleted": deleted, "checkpoint": next])
        guard ack["accepted"] as? Int == 0, ack["deleted"] as? Int == deleted.count else { throw HealthSyncFailure.invalidResponse }
        anchor = next
        if !more { result.completed.append(type); break }
      }
    }
    return result
  }

  func batches(_ records: [[String: Any]]) throws -> [[[String: Any]]] {
    var result: [[[String: Any]]] = []
    var current: [[String: Any]] = []
    var size = 0
    for record in records {
      let bytes = try JSONSerialization.data(withJSONObject: record).count + 1
      guard bytes < 1_500_000 else { throw HealthSyncFailure.oversizedRecord }
      if current.count == 100 || size + bytes > 1_500_000 { result.append(current); current = []; size = 0 }
      current.append(record); size += bytes
    }
    if !current.isEmpty { result.append(current) }
    return result
  }

  private func request(_ target: HealthSyncTarget, _ endpoint: URL, _ body: [String: Any]?) async throws -> [String: Any] {
    try Task.checkCancellation()
    var request = URLRequest(url: endpoint)
    request.httpMethod = body == nil ? "GET" : "POST"
    request.timeoutInterval = 15
    request.setValue("Bearer \(target.secret)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try body.map { try JSONSerialization.data(withJSONObject: $0) }
    let (data, code) = try await transport(request)
    try Task.checkCancellation()
    if code == 401 { throw HealthSyncFailure.unauthorized }
    guard code == 200 else { throw HealthSyncFailure.requestFailed(code) }
    guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw HealthSyncFailure.invalidResponse }
    return object
  }
}

// Persistent generation counters prevent a notification arriving mid-upload from being lost.
struct HealthSyncQueue: Codable {
  var order: [String] = []
  var generations: [String: Int] = [:]

  mutating func enqueue(_ types: [String], prioritize: Bool = false) {
    for type in types {
      if generations[type] == nil { order.append(type) }
      generations[type, default: 0] += 1
      if prioritize { order.removeAll { $0 == type }; order.insert(type, at: 0) }
    }
  }

  mutating func finish(_ pass: HealthSyncPass, started: [String: Int]) {
    for type in pass.completed where generations[type] == started[type] {
      generations.removeValue(forKey: type)
      order.removeAll { $0 == type }
    }
    // Give other types a turn when a large history or read error exhausts a wake.
    for type in pass.retry where generations[type] != nil {
      order.removeAll { $0 == type }; order.append(type)
    }
  }
}
