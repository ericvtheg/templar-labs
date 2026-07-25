import Foundation

public enum HealthExporterValidationError: Error, Equatable {
    case empty(String)
    case tooLong(String, maximum: Int)
    case invalidValue(String)
    case tooMany(String, maximum: Int)
    case duplicateSampleId
}

public enum HealthExporterContractV1 {
    public static let maxAnchorLength = 16_384
    public static let maxBatchItems = 500
    public static let maxIdentifierLength = 255
    public static let maxMetadataEntries = 32
    public static let maxMetadataKeyLength = 64
    public static let maxMetadataValueLength = 1_024
    public static let maxRequestBodyBytes = 1_048_576
}

public struct DeviceIdentityV1: Codable, Equatable, Sendable {
    public let deviceId: UUID
    public let installationId: UUID
    public let platform: String
    public let appVersion: String

    public init(deviceId: UUID, installationId: UUID, appVersion: String) throws {
        try validateNonempty(
            appVersion,
            field: "appVersion",
            maximum: HealthExporterContractV1.maxIdentifierLength
        )
        self.deviceId = deviceId
        self.installationId = installationId
        self.platform = "ios"
        self.appVersion = appVersion
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case deviceId, installationId, platform, appVersion
    }

    public init(from decoder: Decoder) throws {
        try validateKnownKeys(decoder, allowed: CodingKeys.self)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let platform = try container.decode(String.self, forKey: .platform)
        guard platform == "ios" else {
            throw HealthExporterValidationError.invalidValue("platform")
        }
        try self.init(
            deviceId: container.decode(UUID.self, forKey: .deviceId),
            installationId: container.decode(UUID.self, forKey: .installationId),
            appVersion: container.decode(String.self, forKey: .appVersion)
        )
    }
}

public struct SourceProvenanceV1: Codable, Equatable, Sendable {
    public let bundleIdentifier: String
    public let name: String
    public let version: String?
    public let productType: String?
    public let metadata: [String: String]

    public init(
        bundleIdentifier: String,
        name: String,
        version: String? = nil,
        productType: String? = nil,
        metadata: [String: String] = [:]
    ) throws {
        try validateNonempty(
            bundleIdentifier,
            field: "bundleIdentifier",
            maximum: HealthExporterContractV1.maxIdentifierLength
        )
        try validateNonempty(
            name,
            field: "name",
            maximum: HealthExporterContractV1.maxIdentifierLength
        )
        try validateOptionalIdentifier(version, field: "version")
        try validateOptionalIdentifier(productType, field: "productType")
        guard metadata.count <= HealthExporterContractV1.maxMetadataEntries else {
            throw HealthExporterValidationError.tooMany(
                "metadata",
                maximum: HealthExporterContractV1.maxMetadataEntries
            )
        }
        for (key, value) in metadata {
            try validateNonempty(
                key,
                field: "metadata key",
                maximum: HealthExporterContractV1.maxMetadataKeyLength
            )
            try validateLength(
                value,
                field: "metadata value",
                maximum: HealthExporterContractV1.maxMetadataValueLength
            )
        }
        self.bundleIdentifier = bundleIdentifier
        self.name = name
        self.version = version
        self.productType = productType
        self.metadata = metadata
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case bundleIdentifier, name, version, productType, metadata
    }

    public init(from decoder: Decoder) throws {
        try validateKnownKeys(decoder, allowed: CodingKeys.self)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            bundleIdentifier: container.decode(String.self, forKey: .bundleIdentifier),
            name: container.decode(String.self, forKey: .name),
            version: container.decodeIfPresent(String.self, forKey: .version),
            productType: container.decodeIfPresent(String.self, forKey: .productType),
            metadata: container.decodeIfPresent([String: String].self, forKey: .metadata) ?? [:]
        )
    }
}

public struct HealthSampleV1: Codable, Equatable, Sendable {
    public let sampleId: UUID
    public let type: String
    public let value: Int
    public let unit: String
    public let startAt: Date
    public let endAt: Date
    public let source: SourceProvenanceV1

    public init(
        sampleId: UUID,
        valueInGrams: Int,
        startAt: Date,
        endAt: Date,
        source: SourceProvenanceV1
    ) throws {
        guard valueInGrams > 0 else {
            throw HealthExporterValidationError.invalidValue("valueInGrams")
        }
        guard endAt >= startAt else {
            throw HealthExporterValidationError.invalidValue("endAt")
        }
        self.sampleId = sampleId
        self.type = "bodyMass"
        self.value = valueInGrams
        self.unit = "g"
        self.startAt = startAt
        self.endAt = endAt
        self.source = source
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case sampleId, type, value, unit, startAt, endAt, source
    }

    public init(from decoder: Decoder) throws {
        try validateKnownKeys(decoder, allowed: CodingKeys.self)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard try container.decode(String.self, forKey: .type) == "bodyMass" else {
            throw HealthExporterValidationError.invalidValue("type")
        }
        guard try container.decode(String.self, forKey: .unit) == "g" else {
            throw HealthExporterValidationError.invalidValue("unit")
        }
        try self.init(
            sampleId: container.decode(UUID.self, forKey: .sampleId),
            valueInGrams: container.decode(Int.self, forKey: .value),
            startAt: container.decode(Date.self, forKey: .startAt),
            endAt: container.decode(Date.self, forKey: .endAt),
            source: container.decode(SourceProvenanceV1.self, forKey: .source)
        )
    }
}

public struct DeletedHealthSampleV1: Codable, Equatable, Sendable {
    public let sampleId: UUID
    public let deletedAt: Date

    public init(sampleId: UUID, deletedAt: Date) {
        self.sampleId = sampleId
        self.deletedAt = deletedAt
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case sampleId, deletedAt
    }

    public init(from decoder: Decoder) throws {
        try validateKnownKeys(decoder, allowed: CodingKeys.self)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            sampleId: try container.decode(UUID.self, forKey: .sampleId),
            deletedAt: try container.decode(Date.self, forKey: .deletedAt)
        )
    }
}

public struct SampleIngestionRequestV1: Codable, Equatable, Sendable {
    public let requestId: UUID
    public let device: DeviceIdentityV1
    public let anchor: String?
    public let samples: [HealthSampleV1]
    public let deletions: [DeletedHealthSampleV1]

    public init(
        requestId: UUID,
        device: DeviceIdentityV1,
        anchor: String?,
        samples: [HealthSampleV1],
        deletions: [DeletedHealthSampleV1]
    ) throws {
        let count = samples.count + deletions.count
        guard count > 0 else {
            throw HealthExporterValidationError.invalidValue("changes")
        }
        guard count <= HealthExporterContractV1.maxBatchItems else {
            throw HealthExporterValidationError.tooMany(
                "changes",
                maximum: HealthExporterContractV1.maxBatchItems
            )
        }
        if let anchor {
            try validateNonempty(
                anchor,
                field: "anchor",
                maximum: HealthExporterContractV1.maxAnchorLength
            )
        }
        var sampleIds = Set<UUID>()
        for sampleId in samples.map(\.sampleId) + deletions.map(\.sampleId) {
            guard sampleIds.insert(sampleId).inserted else {
                throw HealthExporterValidationError.duplicateSampleId
            }
        }
        self.requestId = requestId
        self.device = device
        self.anchor = anchor
        self.samples = samples
        self.deletions = deletions
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case requestId, device, anchor, samples, deletions
    }

    public init(from decoder: Decoder) throws {
        try validateKnownKeys(decoder, allowed: CodingKeys.self)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            requestId: container.decode(UUID.self, forKey: .requestId),
            device: container.decode(DeviceIdentityV1.self, forKey: .device),
            anchor: container.decodeIfPresent(String.self, forKey: .anchor),
            samples: container.decode([HealthSampleV1].self, forKey: .samples),
            deletions: container.decode([DeletedHealthSampleV1].self, forKey: .deletions)
        )
    }
}

private func validateOptionalIdentifier(_ value: String?, field: String) throws {
    if let value {
        try validateLength(
            value,
            field: field,
            maximum: HealthExporterContractV1.maxIdentifierLength
        )
    }
}

private func validateNonempty(_ value: String, field: String, maximum: Int) throws {
    guard !value.isEmpty else {
        throw HealthExporterValidationError.empty(field)
    }
    try validateLength(value, field: field, maximum: maximum)
}

private func validateLength(_ value: String, field: String, maximum: Int) throws {
    guard value.utf16.count <= maximum else {
        throw HealthExporterValidationError.tooLong(field, maximum: maximum)
    }
}

private struct AnyCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int? = nil

    init?(stringValue: String) {
        self.stringValue = stringValue
    }

    init?(intValue: Int) {
        return nil
    }
}

private func validateKnownKeys<Key>(
    _ decoder: Decoder,
    allowed: Key.Type
) throws where Key: CodingKey & CaseIterable, Key.AllCases: Sequence {
    let allowedNames = Set(Key.allCases.map(\.stringValue))
    let keys = try decoder.container(keyedBy: AnyCodingKey.self).allKeys
    guard keys.allSatisfy({ allowedNames.contains($0.stringValue) }) else {
        throw HealthExporterValidationError.invalidValue("unknown field")
    }
}

public struct SampleIngestionResponseV1: Codable, Equatable, Sendable {
    public let requestId: UUID
    public let status: String
    public let inserted: Int
    public let unchanged: Int
    public let deleted: Int

    public init(
        requestId: UUID,
        status: String,
        inserted: Int,
        unchanged: Int,
        deleted: Int
    ) throws {
        guard status == "accepted" || status == "replayed" else {
            throw HealthExporterValidationError.invalidValue("status")
        }
        guard inserted >= 0 else {
            throw HealthExporterValidationError.invalidValue("inserted")
        }
        guard unchanged >= 0 else {
            throw HealthExporterValidationError.invalidValue("unchanged")
        }
        guard deleted >= 0 else {
            throw HealthExporterValidationError.invalidValue("deleted")
        }
        self.requestId = requestId
        self.status = status
        self.inserted = inserted
        self.unchanged = unchanged
        self.deleted = deleted
    }

    private enum CodingKeys: String, CodingKey {
        case requestId, status, inserted, unchanged, deleted
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            requestId: container.decode(UUID.self, forKey: .requestId),
            status: container.decode(String.self, forKey: .status),
            inserted: container.decode(Int.self, forKey: .inserted),
            unchanged: container.decode(Int.self, forKey: .unchanged),
            deleted: container.decode(Int.self, forKey: .deleted)
        )
    }
}

public enum TemplarJSON {
    public static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    public static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: value) {
                return date
            }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: value) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Expected an ISO-8601 timestamp"
            )
        }
        return decoder
    }
}
