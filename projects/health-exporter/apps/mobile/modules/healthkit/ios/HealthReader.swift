import Foundation
import HealthKit
import CoreLocation
import CryptoKit

// No history window: an empty anchor begins at the oldest accessible HealthKit record.
final class HealthReader: @unchecked Sendable {
  let store = HKHealthStore()
  let pageSize = 25

  func requestPermissions() async throws {
    guard HKHealthStore.isHealthDataAvailable() else { throw failure("HealthKit is unavailable.") }
    var read = Set<HKObjectType>(HealthTypes.samples(store).filter { !($0 is HKCorrelationType) })
    read.insert(HKObjectType.activitySummaryType())
    for id in characteristicIDs { if let type = HKObjectType.characteristicType(forIdentifier: id) { read.insert(type) } }
    if #available(iOS 26.0, *) { read.insert(HKObjectType.userAnnotatedMedicationType()) }
    if #available(iOS 16.0, *) { read = read.filter { !$0.requiresPerObjectAuthorization() } }
    try await store.requestAuthorization(toShare: [], read: read)
  }

  func types() -> [[String: String]] {
    var result = HealthTypes.samples(store).map { ["id": $0.identifier, "name": $0.identifier] }
    result += [["id": "characteristics", "name": "Personal health characteristics"], ["id": "activitySummaries", "name": "Activity rings"]]
    if #available(iOS 26.0, *) { result.append(["id": "medications", "name": "Medications"]) }
    return result
  }

  func readPage(_ identifier: String, _ encodedAnchor: String?, allowAuthorization: Bool = true) async throws -> [String: Any] {
    if identifier == "characteristics" { return page(try characteristics()) }
    if identifier == "activitySummaries" { return page(try await activitySummaries()) }
    if identifier == "medications" {
      if #available(iOS 26.0, *) { return page(try await medications(allowAuthorization)) }
      throw failure("Medications require iOS 26.")
    }
    guard let type = HealthTypes.samples(store).first(where: { $0.identifier == identifier }) else { throw failure("Unknown HealthKit type.") }
    if #available(iOS 16.0, *), allowAuthorization && type.requiresPerObjectAuthorization() {
      try await store.requestPerObjectReadAuthorization(for: type, predicate: nil)
    }
    var anchor: HKQueryAnchor?
    if let encodedAnchor, !encodedAnchor.isEmpty {
      guard let bytes = Data(base64Encoded: encodedAnchor),
            let decoded = try NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: bytes) else {
        throw failure("Saved progress is invalid. Use Export from beginning.")
      }
      anchor = decoded
    }
    let (samples, deleted, next): ([HKSample], [HKDeletedObject], HKQueryAnchor) = try await withHealthQuery(store: store) { continuation in
      let query = HKAnchoredObjectQuery(type: type, predicate: nil, anchor: anchor, limit: pageSize) { _, samples, deleted, next, error in
        if let error { continuation.resume(throwing: error); return }
        guard let next else { continuation.resume(throwing: self.failure("HealthKit did not return a checkpoint.")); return }
        continuation.resume(returning: (samples ?? [], deleted ?? [], next))
      }
      continuation.execute(query)
    }
    var records: [[String: Any]] = []
    for sample in samples {
      try Task.checkCancellation()
      records += try await exportSample(sample, allowAuthorization: allowAuthorization)
    }
    let nextEncoded = try NSKeyedArchiver.archivedData(withRootObject: next, requiringSecureCoding: true).base64EncodedString()
    return ["records": records, "deleted": deleted.map { $0.uuid.uuidString.lowercased() }, "anchor": nextEncoded,
            "hasMore": samples.count + deleted.count >= pageSize]
  }

  private func exportSample(_ sample: HKSample, allowAuthorization: Bool) async throws -> [[String: Any]] {
    let id = sample.uuid.uuidString.lowercased()
    var value: [String: Any] = ["sampleId": id, "type": sample.sampleType.identifier,
      "startAt": iso(sample.startDate), "endAt": iso(sample.endDate),
      "source": ["name": sample.sourceRevision.source.name, "bundleIdentifier": sample.sourceRevision.source.bundleIdentifier,
                 "version": sample.sourceRevision.version ?? "", "productType": sample.sourceRevision.productType ?? ""],
      "metadata": jsonValue(sample.metadata ?? [:])]
    if let device = sample.device { value["device"] = device.description }
    var records: [[String: Any]] = []
    if let quantity = sample as? HKQuantitySample {
      let unit = HealthTypes.unit(quantity.quantityType)
      value["value"] = quantity.quantity.doubleValue(for: unit)
      value["unit"] = unit.unitString
      value["count"] = quantity.count
      if quantity.count > 1 { records += chunks(id, "quantitySeries", try await quantitySeries(quantity, unit)) }
    }
    if let category = sample as? HKCategorySample { value["value"] = category.value }
    if let correlation = sample as? HKCorrelation {
      value["memberIds"] = correlation.objects.map { $0.uuid.uuidString.lowercased() }.sorted()
    }
    if let workout = sample as? HKWorkout {
      value["activityType"] = workout.workoutActivityType.rawValue
      value["durationSeconds"] = workout.duration
      value["energyKilocalories"] = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie())
      value["distanceMeters"] = workout.totalDistance?.doubleValue(for: .meter())
      value["events"] = workout.workoutEvents?.map { ["type": $0.type.rawValue, "startAt": iso($0.dateInterval.start), "endAt": iso($0.dateInterval.end), "metadata": jsonValue($0.metadata ?? [:])] }
    }
    if let route = sample as? HKWorkoutRoute { records += chunks(id, "route", try await routeLocations(route)) }
    if let beats = sample as? HKHeartbeatSeriesSample { records += chunks(id, "heartbeats", try await heartbeats(beats)) }
    if let ecg = sample as? HKElectrocardiogram {
      value["classification"] = ecg.classification.rawValue
      value["averageHeartRate"] = ecg.averageHeartRate?.doubleValue(for: HKUnit(from: "count/min"))
      value["samplingFrequencyHz"] = ecg.samplingFrequency?.doubleValue(for: .hertz())
      records += chunks(id, "ecg", try await voltages(ecg))
    }
    if let clinical = sample as? HKClinicalRecord {
      value["displayName"] = clinical.displayName
      if let fhir = clinical.fhirResource {
        records += textChunks(id, "fhir", fhir.data.base64EncodedString())
      }
    }
    if let document = sample as? HKDocumentSample {
      guard allowAuthorization else { throw HealthSyncFailure.needsForeground }
      let documents = try await documentData(document)
      guard let full = documents.first else { throw failure("Document access was not granted; its checkpoint has not advanced.") }
      records += try archive(id, full)
    } else {
      // Preserve all SDK-encoded fields, including specialized samples (hearing, vision,
      // assessments, mood, medication doses), alongside readable JSON and separate series.
      records += try archive(id, sample)
    }
    records.insert(["id": id, "parentId": id, "data": value], at: 0)
    return records
  }

  private func quantitySeries(_ sample: HKQuantitySample, _ unit: HKUnit) async throws -> [[String: Any]] {
    try await withHealthQuery(store: store) { continuation in
      var values: [[String: Any]] = []
      let query = HKQuantitySeriesSampleQuery(quantityType: sample.quantityType, predicate: HKQuery.predicateForObject(with: sample.uuid)) { _, quantity, interval, _, done, error in
        if let error { continuation.resume(throwing: error); return }
        if let quantity, let interval { values.append(["startAt": self.iso(interval.start), "endAt": self.iso(interval.end), "value": quantity.doubleValue(for: unit), "unit": unit.unitString]) }
        if done { continuation.resume(returning: values) }
      }
      continuation.execute(query)
    }
  }

  private func routeLocations(_ route: HKWorkoutRoute) async throws -> [[String: Any]] {
    try await withHealthQuery(store: store) { continuation in
      var values: [[String: Any]] = []
      let query = HKWorkoutRouteQuery(route: route) { _, locations, done, error in
        if let error { continuation.resume(throwing: error); return }
        values += (locations ?? []).map { ["at": self.iso($0.timestamp), "latitude": $0.coordinate.latitude, "longitude": $0.coordinate.longitude,
          "altitude": $0.altitude, "horizontalAccuracy": $0.horizontalAccuracy, "verticalAccuracy": $0.verticalAccuracy,
          "speed": $0.speed, "speedAccuracy": $0.speedAccuracy, "course": $0.course, "courseAccuracy": $0.courseAccuracy] }
        if done { continuation.resume(returning: values) }
      }
      continuation.execute(query)
    }
  }

  private func heartbeats(_ series: HKHeartbeatSeriesSample) async throws -> [[String: Any]] {
    try await withHealthQuery(store: store) { continuation in
      var values: [[String: Any]] = []
      let query = HKHeartbeatSeriesQuery(heartbeatSeries: series) { _, time, gap, done, error in
        if let error { continuation.resume(throwing: error); return }
        values.append(["timeSinceStart": time, "precededByGap": gap])
        if done { continuation.resume(returning: values) }
      }
      continuation.execute(query)
    }
  }

  private func voltages(_ ecg: HKElectrocardiogram) async throws -> [[String: Any]] {
    try await withHealthQuery(store: store) { continuation in
      var values: [[String: Any]] = []
      let query = HKElectrocardiogramQuery(ecg) { _, result in
        switch result {
        case .measurement(let measurement):
          if let voltage = measurement.quantity(for: .appleWatchSimilarToLeadI) {
            values.append(["timeSinceStart": measurement.timeSinceSampleStart, "volts": voltage.doubleValue(for: .volt())])
          }
        case .done: continuation.resume(returning: values)
        case .error(let error): continuation.resume(throwing: error)
        @unknown default: continuation.resume(throwing: self.failure("Unknown ECG result."))
        }
      }
      continuation.execute(query)
    }
  }

  private func documentData(_ sample: HKDocumentSample) async throws -> [HKDocumentSample] {
    try await withHealthQuery(store: store) { continuation in
      var documents: [HKDocumentSample] = []
      let query = HKDocumentQuery(documentType: sample.documentType, predicate: HKQuery.predicateForObject(with: sample.uuid), limit: HKObjectQueryNoLimit, sortDescriptors: nil, includeDocumentData: true) { _, samples, done, error in
        if let error { continuation.resume(throwing: error); return }
        documents += samples ?? []
        if done { continuation.resume(returning: documents) }
      }
      continuation.execute(query)
    }
  }

  private let characteristicIDs: [HKCharacteristicTypeIdentifier] = [.biologicalSex, .bloodType, .dateOfBirth, .fitzpatrickSkinType, .wheelchairUse, .activityMoveMode]
  private func characteristics() throws -> [[String: Any]] {
    var values: [String: Any] = [:]
    // Missing/denied characteristics are absent; Apple does not disclose read-denial status.
    if let v = try? store.biologicalSex() { values["biologicalSex"] = v.biologicalSex.rawValue }
    if let v = try? store.bloodType() { values["bloodType"] = v.bloodType.rawValue }
    if let v = try? store.dateOfBirthComponents() { values["dateOfBirth"] = ["year": v.year, "month": v.month, "day": v.day].compactMapValues { $0 } }
    if let v = try? store.fitzpatrickSkinType() { values["fitzpatrickSkinType"] = v.skinType.rawValue }
    if let v = try? store.wheelchairUse() { values["wheelchairUse"] = v.wheelchairUse.rawValue }
    if let v = try? store.activityMoveMode() { values["activityMoveMode"] = v.activityMoveMode.rawValue }
    return [["id": "characteristics", "parentId": "characteristics", "data": values]]
  }

  private func activitySummaries() async throws -> [[String: Any]] {
    let summaries: [HKActivitySummary] = try await withHealthQuery(store: store) { continuation in
      continuation.execute(HKActivitySummaryQuery(predicate: nil) { _, summaries, error in
        if let error { continuation.resume(throwing: error) } else { continuation.resume(returning: summaries ?? []) }
      })
    }
    return try summaries.flatMap { summary in
      let date = summary.dateComponents(for: Calendar(identifier: .gregorian))
      let id = String(format: "%04d-%02d-%02d", date.year ?? 0, date.month ?? 0, date.day ?? 0)
      return [["id": id, "parentId": id, "data": ["date": id,
        "activeEnergyKilocalories": summary.activeEnergyBurned.doubleValue(for: .kilocalorie()),
        "exerciseMinutes": summary.appleExerciseTime.doubleValue(for: .minute()),
        "standHours": summary.appleStandHours.doubleValue(for: .count())]]] + (try archive(id, summary))
    }
  }

  @available(iOS 26.0, *)
  private func medications(_ allowAuthorization: Bool) async throws -> [[String: Any]] {
    let type = HKObjectType.userAnnotatedMedicationType()
    if allowAuthorization && type.requiresPerObjectAuthorization() { try await store.requestPerObjectReadAuthorization(for: type, predicate: nil) }
    let items: [HKUserAnnotatedMedication] = try await withHealthQuery(store: store) { continuation in
      var items: [HKUserAnnotatedMedication] = []
      continuation.execute(HKUserAnnotatedMedicationQuery(predicate: nil, limit: HKObjectQueryNoLimit) { _, item, done, error in
        if let error { continuation.resume(throwing: error); return }
        if let item { items.append(item) }
        if done { continuation.resume(returning: items) }
      })
    }
    return try items.flatMap { item in
      let identifierData = try NSKeyedArchiver.archivedData(withRootObject: item.medication.identifier, requiringSecureCoding: true)
      let id = SHA256.hash(data: identifierData).map { String(format: "%02x", $0) }.joined()
      return [["id": id, "parentId": id, "data": ["displayName": item.medication.displayText, "nickname": item.nickname ?? "", "isArchived": item.isArchived, "hasSchedule": item.hasSchedule, "conceptIdentifierArchive": identifierData.base64EncodedString()]]] + (try archive(id, item))
    }
  }

  private func page(_ records: [[String: Any]]) -> [String: Any] { ["records": records, "deleted": [String](), "anchor": "", "hasMore": false] }
  private func archive(_ id: String, _ object: Any) throws -> [[String: Any]] {
    textChunks(id, "appleArchive", try NSKeyedArchiver.archivedData(withRootObject: object, requiringSecureCoding: true).base64EncodedString())
  }
  private func textChunks(_ id: String, _ kind: String, _ text: String) -> [[String: Any]] {
    let bytes = Array(text.utf8)
    return stride(from: 0, to: bytes.count, by: 131072).map { offset -> [String: Any] in
      let content = String(decoding: bytes[offset..<min(offset + 131072, bytes.count)], as: UTF8.self)
      let data: [String: Any] = ["kind": kind, "encoding": "base64", "part": offset / 131072,
        "parts": (bytes.count + 131071) / 131072, "content": content]
      return ["id": "\(id)/\(kind)/\(offset / 131072)", "parentId": id, "data": data]
    }
  }
  private func chunks(_ id: String, _ kind: String, _ items: [[String: Any]]) -> [[String: Any]] {
    stride(from: 0, to: items.count, by: 500).map { offset -> [String: Any] in
      let values = Array(items[offset..<min(offset + 500, items.count)])
      let data: [String: Any] = ["kind": kind, "part": offset / 500, "parts": (items.count + 499) / 500,
        "values": values]
      return ["id": "\(id)/\(kind)/\(offset / 500)", "parentId": id, "data": data]
    }
  }
  private func jsonValue(_ value: Any) -> Any {
    if let date = value as? Date { return iso(date) }
    if let data = value as? Data { return ["base64": data.base64EncodedString()] }
    if let dictionary = value as? [String: Any] { return dictionary.mapValues { jsonValue($0) } }
    if let array = value as? [Any] { return array.map { jsonValue($0) } }
    if value is String || value is NSNumber || value is NSNull { return value }
    return String(describing: value)
  }
  private func iso(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }
  private func failure(_ message: String) -> NSError { NSError(domain: "HealthExporter", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
