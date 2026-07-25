import Foundation
import Testing
@testable import TemplarHealthExporter

@Test func requestUsesVersionedRouteAndBearerToken() throws {
    let payload = try SampleIngestionRequestV1(
        requestId: UUID(),
        device: try DeviceIdentityV1(
            deviceId: UUID(),
            installationId: UUID(),
            appVersion: "0.1.0"
        ),
        anchor: "anchor",
        samples: [],
        deletions: [DeletedHealthSampleV1(sampleId: UUID(), deletedAt: Date(timeIntervalSince1970: 0))]
    )
    let client = try HealthExporterAPIClient(
        baseURL: #require(URL(string: "https://health.example/")),
        token: DeviceBearerToken(value: "secret")
    )

    let request = try client.makeIngestionRequest(payload)

    #expect(request.url?.absoluteString == "https://health.example/api/v1/sample-ingestion")
    #expect(request.httpMethod == "POST")
    #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer secret")
    #expect(request.httpBody != nil)
}

@Test func payloadRoundTripsThroughCanonicalJSON() throws {
    let payload = try SampleIngestionRequestV1(
        requestId: UUID(),
        device: try DeviceIdentityV1(deviceId: UUID(), installationId: UUID(), appVersion: "1"),
        anchor: nil,
        samples: [
            try HealthSampleV1(
                sampleId: UUID(),
                valueInGrams: 82_350,
                startAt: Date(timeIntervalSince1970: 100),
                endAt: Date(timeIntervalSince1970: 100),
                source: try SourceProvenanceV1(
                    bundleIdentifier: "com.weightgurus.app",
                    name: "Weight Gurus"
                )
            )
        ],
        deletions: []
    )

    let data = try TemplarJSON.encoder().encode(payload)
    let decoded = try TemplarJSON.decoder().decode(SampleIngestionRequestV1.self, from: data)

    #expect(decoded == payload)
}

@Test func decoderAcceptsISO8601DatesWithAndWithoutFractionalSeconds() throws {
    for timestamp in ["2026-07-24T08:00:00Z", "2026-07-24T08:00:00.123Z"] {
        let payload = requestJSON(startAt: timestamp, endAt: timestamp)

        let decoded = try TemplarJSON.decoder().decode(
            SampleIngestionRequestV1.self,
            from: Data(payload.utf8)
        )

        #expect(decoded.samples.first?.startAt == decoded.samples.first?.endAt)
    }
}

@Test func uploadRejectsResponseForDifferentRequest() async throws {
    let payload = try SampleIngestionRequestV1(
        requestId: UUID(),
        device: try DeviceIdentityV1(
            deviceId: UUID(),
            installationId: UUID(),
            appVersion: "0.1.0"
        ),
        anchor: nil,
        samples: [],
        deletions: [DeletedHealthSampleV1(sampleId: UUID(), deletedAt: Date())]
    )
    let response = try SampleIngestionResponseV1(
        requestId: UUID(),
        status: "accepted",
        inserted: 0,
        unchanged: 0,
        deleted: 1
    )
    let url = try #require(URL(string: "https://health.example/api/v1/sample-ingestion"))
    let httpResponse = try #require(
        HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)
    )
    let client = try HealthExporterAPIClient(
        baseURL: #require(URL(string: "https://health.example/")),
        token: DeviceBearerToken(value: "secret"),
        session: StubHTTPSession(
            data: try TemplarJSON.encoder().encode(response),
            response: httpResponse
        )
    )

    await #expect(throws: HealthExporterAPIError.invalidResponse) {
        _ = try await client.upload(payload)
    }
}

@Test func clientRejectsInsecureRemoteURLsAndRequiresExplicitLocalOptIn() throws {
    let token = DeviceBearerToken(value: "secret")

    #expect(throws: HealthExporterAPIError.invalidBaseURL) {
        _ = try HealthExporterAPIClient(
            baseURL: #require(URL(string: "http://health.example/")),
            token: token
        )
    }
    #expect(throws: HealthExporterAPIError.invalidBaseURL) {
        _ = try HealthExporterAPIClient(
            baseURL: #require(URL(string: "http://localhost:8787/")),
            token: token
        )
    }
    _ = try HealthExporterAPIClient(
        baseURL: #require(URL(string: "http://127.0.0.1:8787/")),
        token: token,
        allowInsecureLocalDevelopment: true
    )
}

@Test func clientRejectsBaseURLsWithPaths() throws {
    #expect(throws: HealthExporterAPIError.invalidBaseURL) {
        _ = try HealthExporterAPIClient(
            baseURL: #require(URL(string: "https://health.example/exporter")),
            token: DeviceBearerToken(value: "secret")
        )
    }
}

@Test func buildersRejectPayloadsOutsideTheTypeScriptContract() throws {
    #expect(throws: HealthExporterValidationError.invalidValue("valueInGrams")) {
        _ = try HealthSampleV1(
            sampleId: UUID(),
            valueInGrams: 0,
            startAt: Date(),
            endAt: Date(),
            source: try SourceProvenanceV1(bundleIdentifier: "com.example", name: "Example")
        )
    }
    #expect(throws: HealthExporterValidationError.tooMany("metadata", maximum: 32)) {
        _ = try SourceProvenanceV1(
            bundleIdentifier: "com.example",
            name: "Example",
            metadata: Dictionary(uniqueKeysWithValues: (0...32).map { ("key\($0)", "value") })
        )
    }
}

@Test func decodesSharedTypeScriptContractFixture() throws {
    let testFile = URL(fileURLWithPath: #filePath)
    let fixture = testFile
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("contracts/v1-valid-request.json")
    let payload = try TemplarJSON.decoder().decode(
        SampleIngestionRequestV1.self,
        from: Data(contentsOf: fixture)
    )

    #expect(payload.samples.first?.value == 82_350)
    #expect(payload.samples.first?.source.bundleIdentifier == "com.weightgurus.app")
}

@Test func decodingRejectsInvalidNestedContractValues() throws {
    let longIdentifier = String(repeating: "x", count: 256)
    let longMetadataValue = String(repeating: "x", count: 1_025)
    let excessiveMetadata = (0 ... 32)
        .map { #""key\#($0)":"value""# }
        .joined(separator: ",")
    let invalidPayloads = [
        requestJSON(device: #""platform":"android","appVersion":"1""#),
        requestJSON(device: #""platform":"ios","appVersion":"1","unexpected":true"#),
        requestJSON(device: #""platform":"ios","appVersion":""#),
        requestJSON(device: #""platform":"ios","appVersion":"\#(longIdentifier)""#),
        requestJSON(sample: #""type":"height","value":82350,"unit":"g""#),
        requestJSON(sample: #""type":"bodyMass","value":0,"unit":"g""#),
        requestJSON(sample: #""type":"bodyMass","value":82350,"unit":"lb""#),
        requestJSON(
            sample: #""type":"bodyMass","value":82350,"unit":"g""#,
            startAt: "2026-07-25T08:00:00Z",
            endAt: "2026-07-24T08:00:00Z"
        ),
        requestJSON(source: #""bundleIdentifier":"","name":"Example","metadata":{}"#),
        requestJSON(
            source:
                #""bundleIdentifier":"com.example","name":"Example","version":"\#(longIdentifier)","metadata":{}"#
        ),
        requestJSON(
            source:
                #""bundleIdentifier":"com.example","name":"Example","metadata":{"key":"\#(longMetadataValue)"}"#
        ),
        requestJSON(
            source:
                #""bundleIdentifier":"com.example","name":"Example","metadata":{\#(excessiveMetadata)}"#
        ),
        requestJSON(
            source: #""bundleIdentifier":"com.example","name":"Example","metadata":{"":"value"}"#
        ),
    ]

    for payload in invalidPayloads {
        #expect(throws: HealthExporterValidationError.self) {
            _ = try TemplarJSON.decoder().decode(
                SampleIngestionRequestV1.self,
                from: Data(payload.utf8)
            )
        }
    }
}

@Test func decodingRejectsInvalidRequestLevelContractValues() throws {
    let duplicateId = "df9dd8e9-470a-477c-b22a-f13fd853ce89"
    let duplicate = requestJSON(
        sampleId: duplicateId,
        deletions: #"[{"sampleId":"\#(duplicateId)","deletedAt":"2026-07-25T08:00:00Z"}]"#
    )
    let empty = requestJSON(samples: "[]")
    let emptyAnchor = requestJSON(anchor: #","anchor":"""#)
    let longAnchor = requestJSON(
        anchor: #","anchor":"\#(String(repeating: "x", count: 16_385))""#
    )
    let sampleObject = """
    {"sampleId":"df9dd8e9-470a-477c-b22a-f13fd853ce89","type":"bodyMass","value":82350,\
    "unit":"g","startAt":"2026-07-24T08:00:00Z","endAt":"2026-07-24T08:00:00Z",\
    "source":{"bundleIdentifier":"com.example","name":"Example","metadata":{}}}
    """
    let excessiveItems = requestJSON(
        samples: "[" + Array(repeating: sampleObject, count: 501)
            .joined(separator: ",") + "]"
    )

    for payload in [duplicate, empty, emptyAnchor, longAnchor, excessiveItems] {
        #expect(throws: HealthExporterValidationError.self) {
            _ = try TemplarJSON.decoder().decode(
                SampleIngestionRequestV1.self,
                from: Data(payload.utf8)
            )
        }
    }
}

@Test func decodingRejectsInvalidResponseValues() throws {
    let requestId = "68da8ab4-4488-42e9-bb80-49d8b84edbd1"
    let invalidResponses = [
        #"{"requestId":"\#(requestId)","status":"pending","inserted":0,"unchanged":0,"deleted":0}"#,
        #"{"requestId":"\#(requestId)","status":"accepted","inserted":-1,"unchanged":0,"deleted":0}"#,
    ]

    for payload in invalidResponses {
        #expect(throws: HealthExporterValidationError.self) {
            _ = try TemplarJSON.decoder().decode(
                SampleIngestionResponseV1.self,
                from: Data(payload.utf8)
            )
        }
    }
}

private func requestJSON(
    device: String = #""platform":"ios","appVersion":"1""#,
    sample: String = #""type":"bodyMass","value":82350,"unit":"g""#,
    source: String = #""bundleIdentifier":"com.example","name":"Example","metadata":{}"#,
    sampleId: String = "df9dd8e9-470a-477c-b22a-f13fd853ce89",
    startAt: String = "2026-07-24T08:00:00Z",
    endAt: String = "2026-07-24T08:00:00Z",
    samples: String? = nil,
    deletions: String = "[]",
    anchor: String = ""
) -> String {
    let defaultSamples = """
    [{"sampleId":"\(sampleId)",\(sample),"startAt":"\(startAt)","endAt":"\(endAt)","source":{\(source)}}]
    """
    return """
    {"requestId":"68da8ab4-4488-42e9-bb80-49d8b84edbd1",\
    "device":{"deviceId":"1d259a9a-e621-4dd8-8c8a-700b236244d0",\
    "installationId":"42eaa184-e6cd-42af-aae8-160ecd461157",\(device)},\
    "samples":\(samples ?? defaultSamples),"deletions":\(deletions)\(anchor)}
    """
}

private struct StubHTTPSession: HTTPSession {
    let data: Data
    let response: URLResponse

    func data(for _: URLRequest) async throws -> (Data, URLResponse) {
        (data, response)
    }
}
