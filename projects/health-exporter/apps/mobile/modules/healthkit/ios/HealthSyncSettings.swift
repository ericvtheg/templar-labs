import Foundation
import Security

enum HealthSyncSettings {
  private static var query: [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
     kSecAttrService as String: "\(Bundle.main.bundleIdentifier ?? "HealthExporter").automatic-sync",
     kSecAttrAccount as String: "destination"]
  }

  static func save(_ target: HealthSyncTarget) throws {
    _ = try target.endpoint()
    let attributes: [String: Any] = [kSecValueData as String: try JSONEncoder().encode(target),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
    var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound { status = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) }
    guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
  }

  static func load() throws -> HealthSyncTarget? {
    var search = query
    search[kSecReturnData as String] = true
    search[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(search as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    return try JSONDecoder().decode(HealthSyncTarget.self, from: data)
  }
}
