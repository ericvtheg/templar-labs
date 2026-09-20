import Foundation
import HealthKit

@main struct AuthorizationTests {
  static func main() {
    HETestAuthorizationExceptions()
    HETestObservationExceptions()
    let store = HKHealthStore()
    let permissions = HealthTypes.readPermissions(store)
    let samples = HealthTypes.samples(store)
    let observed = HealthTypes.observedSamples(store)
    let vision = HKObjectType.visionPrescriptionType()
    precondition(samples.contains(vision), "Vision prescriptions must remain exportable")
    precondition(!observed.contains(vision), "Vision prescriptions do not support live observers")
    for type in samples {
      precondition(HEValidateAnchoredQuery(type) == nil, "Every export type must support anchored queries: \(type.identifier)")
    }
    for type in observed {
      var error: NSError?
      let query = HECreateObserver(type, { _, _, _ in }, &error)
      precondition(query != nil && error == nil, "Every observed type must pass Apple's query validation: \(type.identifier)")
    }
    var observerError: NSError?
    let unsupported = HECreateObserver(vision, { _, _, _ in }, &observerError)
    precondition(unsupported == nil && observerError?.localizedDescription.contains(vision.identifier) == true,
                 "Reproduce build 7's vision observer exception and recover without crashing")
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
    print("HealthKit permission and query catalogs validated; authorization and observation exceptions recover safely")
  }
}
