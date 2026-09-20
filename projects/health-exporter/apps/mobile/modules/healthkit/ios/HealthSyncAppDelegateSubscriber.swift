import ExpoModulesCore
import UIKit

public final class HealthSyncAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    HealthAutoSync.shared.bootstrap()
    return true
  }

  public func applicationDidBecomeActive(_ application: UIApplication) {
    HealthAutoSync.shared.becameActive()
  }
}
