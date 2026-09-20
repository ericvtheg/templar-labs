import ExpoModulesCore
import UIKit

public final class TemplarHealthKitModule: Module {
  private let reader = HealthReader()

  public func definition() -> ModuleDefinition {
    Name("TemplarHealthKit")
    AsyncFunction("requestPermissions") { () async throws in
      try await self.reader.requestPermissions()
    }
    AsyncFunction("getTypes") { () -> [[String: String]] in self.reader.types() }
    AsyncFunction("readPage") { (type: String, anchor: String?) async throws -> [String: Any] in
      try await self.reader.readPage(type, anchor)
    }
    AsyncFunction("keepAwake") { (enabled: Bool) async in
      await MainActor.run { UIApplication.shared.isIdleTimerDisabled = enabled }
    }
  }
}
