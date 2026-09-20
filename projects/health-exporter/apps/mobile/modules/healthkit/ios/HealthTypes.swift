import HealthKit
import Foundation

// Catalog from the iOS 26.5 SDK. Runtime availability prevents requesting newer types on older phones.
enum HealthTypes {
  static let characteristicIDs: [HKCharacteristicTypeIdentifier] = [.biologicalSex, .bloodType, .dateOfBirth, .fitzpatrickSkinType, .wheelchairUse, .activityMoveMode]

  static func readPermissions(_ store: HKHealthStore) -> Set<HKObjectType> {
    var read = Set<HKObjectType>(samples(store).filter { !($0 is HKCorrelationType) })
    read.insert(HKObjectType.activitySummaryType())
    for id in characteristicIDs { if let type = HKObjectType.characteristicType(forIdentifier: id) { read.insert(type) } }
    // Dose events inherit access from individually selected medications. Requesting
    // the dose-event type itself raises NSInvalidArgumentException (even though
    // requiresPerObjectAuthorization() returns false for that type).
    if #available(iOS 26.0, *) { read.remove(HKObjectType.medicationDoseEventType()) }
    if #available(iOS 16.0, *) { read = read.filter { !$0.requiresPerObjectAuthorization() } }
    return read
  }

  static func objectPermission(for type: HKObjectType) -> HKObjectType? {
    if #available(iOS 26.0, *), type == HKObjectType.medicationDoseEventType() {
      return HKObjectType.userAnnotatedMedicationType()
    }
    if #available(iOS 16.0, *), type.requiresPerObjectAuthorization() { return type }
    return nil
  }

  static func observedSamples(_ store: HKHealthStore) -> [HKSampleType] {
    samples(store).filter { type in
      // Vision prescriptions support reading, but HKObserverQuery rejects them.
      // Keep them in samples() so foreground and periodic exports still read them.
      if #available(iOS 16.0, *), type == HKObjectType.visionPrescriptionType() { return false }
      return true
    }
  }

  static let quantities: [(String, String, Int, Int)] = [
    ("HKQuantityTypeIdentifierAppleSleepingWristTemperature", "degC", 16, 0),
    ("HKQuantityTypeIdentifierBodyFatPercentage", "%", 8, 0),
    ("HKQuantityTypeIdentifierBodyMass", "kg", 8, 0),
    ("HKQuantityTypeIdentifierBodyMassIndex", "count", 8, 0),
    ("HKQuantityTypeIdentifierElectrodermalActivity", "S", 8, 0),
    ("HKQuantityTypeIdentifierHeight", "m", 8, 0),
    ("HKQuantityTypeIdentifierLeanBodyMass", "kg", 8, 0),
    ("HKQuantityTypeIdentifierWaistCircumference", "m", 11, 0),
    ("HKQuantityTypeIdentifierActiveEnergyBurned", "kcal", 8, 0),
    ("HKQuantityTypeIdentifierAppleExerciseTime", "min", 9, 3),
    ("HKQuantityTypeIdentifierAppleMoveTime", "min", 14, 5),
    ("HKQuantityTypeIdentifierAppleStandTime", "min", 13, 0),
    ("HKQuantityTypeIdentifierBasalEnergyBurned", "kcal", 8, 0),
    ("HKQuantityTypeIdentifierCrossCountrySkiingSpeed", "m/s", 18, 0),
    ("HKQuantityTypeIdentifierCyclingCadence", "count/min", 17, 0),
    ("HKQuantityTypeIdentifierCyclingFunctionalThresholdPower", "W", 17, 0),
    ("HKQuantityTypeIdentifierCyclingPower", "W", 17, 0),
    ("HKQuantityTypeIdentifierCyclingSpeed", "m/s", 17, 0),
    ("HKQuantityTypeIdentifierDistanceCrossCountrySkiing", "m", 18, 0),
    ("HKQuantityTypeIdentifierDistanceCycling", "m", 8, 0),
    ("HKQuantityTypeIdentifierDistanceDownhillSnowSports", "m", 11, 2),
    ("HKQuantityTypeIdentifierDistancePaddleSports", "m", 18, 0),
    ("HKQuantityTypeIdentifierDistanceRowing", "m", 18, 0),
    ("HKQuantityTypeIdentifierDistanceSkatingSports", "m", 18, 0),
    ("HKQuantityTypeIdentifierDistanceSwimming", "m", 10, 0),
    ("HKQuantityTypeIdentifierDistanceWalkingRunning", "m", 8, 0),
    ("HKQuantityTypeIdentifierDistanceWheelchair", "m", 10, 0),
    ("HKQuantityTypeIdentifierEstimatedWorkoutEffortScore", "appleEffortScore", 18, 0),
    ("HKQuantityTypeIdentifierFlightsClimbed", "count", 8, 0),
    ("HKQuantityTypeIdentifierNikeFuel", "count", 8, 0),
    ("HKQuantityTypeIdentifierPaddleSportsSpeed", "m/s", 18, 0),
    ("HKQuantityTypeIdentifierPhysicalEffort", "kcal/(kg*hr)", 17, 0),
    ("HKQuantityTypeIdentifierPushCount", "count", 10, 0),
    ("HKQuantityTypeIdentifierRowingSpeed", "m/s", 18, 0),
    ("HKQuantityTypeIdentifierRunningPower", "W", 16, 0),
    ("HKQuantityTypeIdentifierRunningSpeed", "m/s", 16, 0),
    ("HKQuantityTypeIdentifierStepCount", "count", 8, 0),
    ("HKQuantityTypeIdentifierSwimmingStrokeCount", "count", 10, 0),
    ("HKQuantityTypeIdentifierUnderwaterDepth", "m", 16, 0),
    ("HKQuantityTypeIdentifierWorkoutEffortScore", "appleEffortScore", 18, 0),
    ("HKQuantityTypeIdentifierEnvironmentalAudioExposure", "dBASPL", 13, 0),
    ("HKQuantityTypeIdentifierEnvironmentalSoundReduction", "dBASPL", 16, 0),
    ("HKQuantityTypeIdentifierHeadphoneAudioExposure", "dBASPL", 13, 0),
    ("HKQuantityTypeIdentifierAtrialFibrillationBurden", "%", 16, 0),
    ("HKQuantityTypeIdentifierHeartRate", "count/s", 8, 0),
    ("HKQuantityTypeIdentifierHeartRateRecoveryOneMinute", "count/min", 16, 0),
    ("HKQuantityTypeIdentifierHeartRateVariabilitySDNN", "ms", 11, 0),
    ("HKQuantityTypeIdentifierPeripheralPerfusionIndex", "%", 8, 0),
    ("HKQuantityTypeIdentifierRestingHeartRate", "count/min", 11, 0),
    ("HKQuantityTypeIdentifierVO2Max", "ml/(kg*min)", 11, 0),
    ("HKQuantityTypeIdentifierWalkingHeartRateAverage", "count/min", 11, 0),
    ("HKQuantityTypeIdentifierAppleWalkingSteadiness", "%", 15, 0),
    ("HKQuantityTypeIdentifierRunningGroundContactTime", "ms", 16, 0),
    ("HKQuantityTypeIdentifierRunningStrideLength", "m", 16, 0),
    ("HKQuantityTypeIdentifierRunningVerticalOscillation", "cm", 16, 0),
    ("HKQuantityTypeIdentifierSixMinuteWalkTestDistance", "m", 14, 0),
    ("HKQuantityTypeIdentifierStairAscentSpeed", "m/s", 14, 0),
    ("HKQuantityTypeIdentifierStairDescentSpeed", "m/s", 14, 0),
    ("HKQuantityTypeIdentifierWalkingAsymmetryPercentage", "%", 14, 0),
    ("HKQuantityTypeIdentifierWalkingDoubleSupportPercentage", "%", 14, 0),
    ("HKQuantityTypeIdentifierWalkingSpeed", "m/s", 14, 0),
    ("HKQuantityTypeIdentifierWalkingStepLength", "m", 14, 0),
    ("HKQuantityTypeIdentifierDietaryBiotin", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryCaffeine", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryCalcium", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryCarbohydrates", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryChloride", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryCholesterol", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryChromium", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryCopper", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryEnergyConsumed", "kcal", 8, 0),
    ("HKQuantityTypeIdentifierDietaryFatMonounsaturated", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryFatPolyunsaturated", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryFatSaturated", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryFatTotal", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryFiber", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryFolate", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryIodine", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryIron", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryMagnesium", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryManganese", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryMolybdenum", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryNiacin", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryPantothenicAcid", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryPhosphorus", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryPotassium", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryProtein", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryRiboflavin", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietarySelenium", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietarySodium", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietarySugar", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryThiamin", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryVitaminA", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryVitaminB12", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryVitaminB6", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryVitaminC", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryVitaminD", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryVitaminE", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryVitaminK", "g", 8, 0),
    ("HKQuantityTypeIdentifierDietaryWater", "mL", 9, 0),
    ("HKQuantityTypeIdentifierDietaryZinc", "g", 8, 0),
    ("HKQuantityTypeIdentifierBloodAlcoholContent", "%", 8, 0),
    ("HKQuantityTypeIdentifierBloodPressureDiastolic", "mmHg", 8, 0),
    ("HKQuantityTypeIdentifierBloodPressureSystolic", "mmHg", 8, 0),
    ("HKQuantityTypeIdentifierInsulinDelivery", "IU", 11, 0),
    ("HKQuantityTypeIdentifierNumberOfAlcoholicBeverages", "count", 15, 0),
    ("HKQuantityTypeIdentifierNumberOfTimesFallen", "count", 8, 0),
    ("HKQuantityTypeIdentifierTimeInDaylight", "min", 17, 0),
    ("HKQuantityTypeIdentifierUVExposure", "count", 9, 0),
    ("HKQuantityTypeIdentifierWaterTemperature", "degC", 16, 0),
    ("HKQuantityTypeIdentifierBasalBodyTemperature", "degC", 9, 0),
    ("HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances", "count", 18, 0),
    ("HKQuantityTypeIdentifierForcedExpiratoryVolume1", "L", 8, 0),
    ("HKQuantityTypeIdentifierForcedVitalCapacity", "L", 8, 0),
    ("HKQuantityTypeIdentifierInhalerUsage", "count", 8, 0),
    ("HKQuantityTypeIdentifierOxygenSaturation", "%", 8, 0),
    ("HKQuantityTypeIdentifierPeakExpiratoryFlowRate", "L/min", 8, 0),
    ("HKQuantityTypeIdentifierRespiratoryRate", "count/s", 8, 0),
    ("HKQuantityTypeIdentifierBloodGlucose", "mg/dL", 8, 0),
    ("HKQuantityTypeIdentifierBodyTemperature", "degC", 8, 0),
  ]
  static let categories: [(String, Int, Int)] = [
    ("HKCategoryTypeIdentifierAppleStandHour", 9, 0),
    ("HKCategoryTypeIdentifierEnvironmentalAudioExposureEvent", 14, 0),
    ("HKCategoryTypeIdentifierHeadphoneAudioExposureEvent", 14, 2),
    ("HKCategoryTypeIdentifierHighHeartRateEvent", 12, 2),
    ("HKCategoryTypeIdentifierHypertensionEvent", 26, 2),
    ("HKCategoryTypeIdentifierIrregularHeartRhythmEvent", 12, 2),
    ("HKCategoryTypeIdentifierLowCardioFitnessEvent", 14, 3),
    ("HKCategoryTypeIdentifierLowHeartRateEvent", 12, 2),
    ("HKCategoryTypeIdentifierMindfulSession", 10, 0),
    ("HKCategoryTypeIdentifierAppleWalkingSteadinessEvent", 15, 0),
    ("HKCategoryTypeIdentifierHandwashingEvent", 14, 0),
    ("HKCategoryTypeIdentifierToothbrushingEvent", 13, 0),
    ("HKCategoryTypeIdentifierBleedingAfterPregnancy", 18, 0),
    ("HKCategoryTypeIdentifierBleedingDuringPregnancy", 18, 0),
    ("HKCategoryTypeIdentifierCervicalMucusQuality", 9, 0),
    ("HKCategoryTypeIdentifierContraceptive", 14, 3),
    ("HKCategoryTypeIdentifierInfrequentMenstrualCycles", 16, 0),
    ("HKCategoryTypeIdentifierIntermenstrualBleeding", 9, 0),
    ("HKCategoryTypeIdentifierIrregularMenstrualCycles", 16, 0),
    ("HKCategoryTypeIdentifierLactation", 14, 3),
    ("HKCategoryTypeIdentifierMenstrualFlow", 9, 0),
    ("HKCategoryTypeIdentifierOvulationTestResult", 9, 0),
    ("HKCategoryTypeIdentifierPersistentIntermenstrualBleeding", 16, 0),
    ("HKCategoryTypeIdentifierPregnancy", 14, 3),
    ("HKCategoryTypeIdentifierPregnancyTestResult", 15, 0),
    ("HKCategoryTypeIdentifierProgesteroneTestResult", 15, 0),
    ("HKCategoryTypeIdentifierProlongedMenstrualPeriods", 16, 0),
    ("HKCategoryTypeIdentifierSexualActivity", 9, 0),
    ("HKCategoryTypeIdentifierSleepApneaEvent", 18, 0),
    ("HKCategoryTypeIdentifierSleepAnalysis", 8, 0),
    ("HKCategoryTypeIdentifierAbdominalCramps", 13, 6),
    ("HKCategoryTypeIdentifierAcne", 13, 6),
    ("HKCategoryTypeIdentifierAppetiteChanges", 13, 6),
    ("HKCategoryTypeIdentifierBladderIncontinence", 14, 0),
    ("HKCategoryTypeIdentifierBloating", 13, 6),
    ("HKCategoryTypeIdentifierBreastPain", 13, 6),
    ("HKCategoryTypeIdentifierChestTightnessOrPain", 13, 6),
    ("HKCategoryTypeIdentifierChills", 13, 6),
    ("HKCategoryTypeIdentifierConstipation", 13, 6),
    ("HKCategoryTypeIdentifierCoughing", 13, 6),
    ("HKCategoryTypeIdentifierDiarrhea", 13, 6),
    ("HKCategoryTypeIdentifierDizziness", 13, 6),
    ("HKCategoryTypeIdentifierDrySkin", 14, 0),
    ("HKCategoryTypeIdentifierFainting", 13, 6),
    ("HKCategoryTypeIdentifierFatigue", 13, 6),
    ("HKCategoryTypeIdentifierFever", 13, 6),
    ("HKCategoryTypeIdentifierGeneralizedBodyAche", 13, 6),
    ("HKCategoryTypeIdentifierHairLoss", 14, 0),
    ("HKCategoryTypeIdentifierHeadache", 13, 6),
    ("HKCategoryTypeIdentifierHeartburn", 13, 6),
    ("HKCategoryTypeIdentifierHotFlashes", 13, 6),
    ("HKCategoryTypeIdentifierLossOfSmell", 13, 6),
    ("HKCategoryTypeIdentifierLossOfTaste", 13, 6),
    ("HKCategoryTypeIdentifierLowerBackPain", 13, 6),
    ("HKCategoryTypeIdentifierMemoryLapse", 14, 0),
    ("HKCategoryTypeIdentifierMoodChanges", 13, 6),
    ("HKCategoryTypeIdentifierNausea", 13, 6),
    ("HKCategoryTypeIdentifierNightSweats", 14, 0),
    ("HKCategoryTypeIdentifierPelvicPain", 13, 6),
    ("HKCategoryTypeIdentifierRapidPoundingOrFlutteringHeartbeat", 13, 6),
    ("HKCategoryTypeIdentifierRunnyNose", 13, 6),
    ("HKCategoryTypeIdentifierShortnessOfBreath", 13, 6),
    ("HKCategoryTypeIdentifierSinusCongestion", 13, 6),
    ("HKCategoryTypeIdentifierSkippedHeartbeat", 13, 6),
    ("HKCategoryTypeIdentifierSleepChanges", 13, 6),
    ("HKCategoryTypeIdentifierSoreThroat", 13, 6),
    ("HKCategoryTypeIdentifierVaginalDryness", 14, 0),
    ("HKCategoryTypeIdentifierVomiting", 13, 6),
    ("HKCategoryTypeIdentifierWheezing", 13, 6),
  ]
  static let clinical: [(String, Int, Int)] = [
    ("HKClinicalTypeIdentifierAllergyRecord", 12, 0),
    ("HKClinicalTypeIdentifierClinicalNoteRecord", 16, 4),
    ("HKClinicalTypeIdentifierConditionRecord", 12, 0),
    ("HKClinicalTypeIdentifierImmunizationRecord", 12, 0),
    ("HKClinicalTypeIdentifierLabResultRecord", 12, 0),
    ("HKClinicalTypeIdentifierMedicationRecord", 12, 0),
    ("HKClinicalTypeIdentifierProcedureRecord", 12, 0),
    ("HKClinicalTypeIdentifierVitalSignRecord", 12, 0),
    ("HKClinicalTypeIdentifierCoverageRecord", 14, 0),
  ]
  static func available(_ major: Int, _ minor: Int) -> Bool {
    ProcessInfo.processInfo.isOperatingSystemAtLeast(OperatingSystemVersion(majorVersion: major, minorVersion: minor, patchVersion: 0))
  }
  static func unit(_ type: HKQuantityType) -> HKUnit {
    HKUnit(from: quantities.first { $0.0 == type.identifier }!.1)
  }
  static func samples(_ store: HKHealthStore) -> [HKSampleType] {
    var types: [HKSampleType] = quantities.filter { available($0.2, $0.3) }.compactMap { HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: $0.0)) }
    types += categories.filter { available($0.1, $0.2) }.compactMap { HKObjectType.categoryType(forIdentifier: HKCategoryTypeIdentifier(rawValue: $0.0)) }
    types += [HKObjectType.workoutType(), HKObjectType.audiogramSampleType(), HKObjectType.electrocardiogramType(), HKSeriesType.workoutRoute(), HKSeriesType.heartbeat()]
    types += [HKObjectType.correlationType(forIdentifier: .bloodPressure)!, HKObjectType.correlationType(forIdentifier: .food)!, HKObjectType.documentType(forIdentifier: .CDA)!]
    if #available(iOS 16.0, *) { types.append(HKObjectType.visionPrescriptionType()) }
    if #available(iOS 18.0, *) {
      types += [HKObjectType.stateOfMindType(), HKScoredAssessmentType(.GAD7), HKScoredAssessmentType(.PHQ9)]
    }
    if #available(iOS 26.0, *) { types.append(HKObjectType.medicationDoseEventType()) }
    if store.supportsHealthRecords() {
      types += clinical.filter { available($0.1, $0.2) }.compactMap { HKObjectType.clinicalType(forIdentifier: HKClinicalTypeIdentifier(rawValue: $0.0)) }
    }
    return types.sorted { $0.identifier < $1.identifier }
  }
}
