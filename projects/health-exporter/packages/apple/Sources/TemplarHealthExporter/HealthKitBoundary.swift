import Foundation

public struct AnchoredHealthChanges: Sendable {
    public let samples: [HealthSampleV1]
    public let deletions: [DeletedHealthSampleV1]
    public let encodedAnchor: String

    public init(
        samples: [HealthSampleV1],
        deletions: [DeletedHealthSampleV1],
        encodedAnchor: String
    ) {
        self.samples = samples
        self.deletions = deletions
        self.encodedAnchor = encodedAnchor
    }
}

/// An app-owned boundary around HKAnchoredObjectQuery. Implementations must persist the returned
/// anchor only after the server acknowledges the corresponding request.
public protocol AnchoredBodyMassReading: Sendable {
    func changes(after encodedAnchor: String?) async throws -> AnchoredHealthChanges
}

#if canImport(HealthKit)
import HealthKit

@available(iOS 17.0, macOS 14.0, *)
public enum HealthKitBodyMassMapper {
    public static func map(_ sample: HKQuantitySample) throws -> HealthSampleV1 {
        let source = sample.sourceRevision
        var metadata: [String: String] = [:]
        if let syncIdentifier = sample.metadata?[HKMetadataKeySyncIdentifier] as? String {
            metadata["syncIdentifier"] = syncIdentifier
        }
        return try HealthSampleV1(
            sampleId: sample.uuid,
            valueInGrams: Int(sample.quantity.doubleValue(for: .gram()).rounded()),
            startAt: sample.startDate,
            endAt: sample.endDate,
            source: try SourceProvenanceV1(
                bundleIdentifier: source.source.bundleIdentifier,
                name: source.source.name,
                version: source.version,
                productType: source.productType,
                metadata: metadata
            )
        )
    }

    public static func encode(anchor: HKQueryAnchor) throws -> String {
        try NSKeyedArchiver.archivedData(
            withRootObject: anchor,
            requiringSecureCoding: true
        ).base64EncodedString()
    }

    public static func decode(anchor: String?) throws -> HKQueryAnchor? {
        guard let anchor, let data = Data(base64Encoded: anchor) else { return nil }
        return try NSKeyedUnarchiver.unarchivedObject(
            ofClass: HKQueryAnchor.self,
            from: data
        )
    }
}
#endif
