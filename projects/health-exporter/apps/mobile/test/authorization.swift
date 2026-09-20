import Foundation
import HealthKit

@main struct AuthorizationTests {
  static func main() {
    HETestAuthorizationExceptions()
    let store = HKHealthStore()
    let permissions = HealthTypes.readPermissions(store)
    precondition(permissions.contains(HKObjectType.workoutType()))
    precondition(permissions.contains(HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!))
    precondition(!permissions.contains { $0 is HKCorrelationType || $0.requiresPerObjectAuthorization() })
    // This invokes Apple's actual argument validation. It doesn't request access,
    // read any health records, or infer whether the user granted read permission.
    precondition(HEValidateReadTypes(permissions) == nil, "Full permission set must pass HealthKit validation")
    if #available(macOS 26.0, *) {
      let dose = HKObjectType.medicationDoseEventType()
      precondition(HealthTypes.samples(store).contains(dose), "Keep medication dose data in exports")
      precondition(!permissions.contains(dose), "Dose events cannot be requested as a general permission")
      precondition(HealthTypes.objectPermission(for: dose) == HKObjectType.userAnnotatedMedicationType())
      var regression = permissions
      regression.insert(dose)
      precondition(HEValidateReadTypes(regression)?.contains(dose.identifier) == true,
                   "Reproduce the fatal authorization rejection from build 6")
    }
    print("HealthKit authorization validation and native exception recovery passed")
  }
}
