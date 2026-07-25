import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct DeviceBearerToken: Sendable {
    public let value: String

    public init(value: String) {
        self.value = value
    }
}

public protocol HTTPSession: Sendable {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}

extension URLSession: HTTPSession {}

public enum HealthExporterAPIError: Error, Equatable {
    case invalidBaseURL
    case payloadTooLarge
    case invalidResponse
    case rejected(statusCode: Int)
}

public struct HealthExporterAPIClient: Sendable {
    private let baseURL: URL
    private let token: DeviceBearerToken
    private let session: any HTTPSession

    public init(
        baseURL: URL,
        token: DeviceBearerToken,
        allowInsecureLocalDevelopment: Bool = false,
        session: any HTTPSession = URLSession.shared
    ) throws {
        guard Self.isAllowed(baseURL, allowInsecureLocalDevelopment: allowInsecureLocalDevelopment)
        else {
            throw HealthExporterAPIError.invalidBaseURL
        }
        self.baseURL = baseURL
        self.token = token
        self.session = session
    }

    public func makeIngestionRequest(_ payload: SampleIngestionRequestV1) throws -> URLRequest {
        guard let url = URL(string: "api/v1/sample-ingestion", relativeTo: baseURL)?.absoluteURL else {
            throw HealthExporterAPIError.invalidBaseURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token.value)", forHTTPHeaderField: "Authorization")
        let body = try TemplarJSON.encoder().encode(payload)
        guard body.count <= HealthExporterContractV1.maxRequestBodyBytes else {
            throw HealthExporterAPIError.payloadTooLarge
        }
        request.httpBody = body
        return request
    }

    public func upload(_ payload: SampleIngestionRequestV1) async throws -> SampleIngestionResponseV1 {
        let (data, response) = try await session.data(for: makeIngestionRequest(payload))
        guard let http = response as? HTTPURLResponse else {
            throw HealthExporterAPIError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            throw HealthExporterAPIError.rejected(statusCode: http.statusCode)
        }
        let decoded = try TemplarJSON.decoder().decode(SampleIngestionResponseV1.self, from: data)
        guard decoded.requestId == payload.requestId else {
            throw HealthExporterAPIError.invalidResponse
        }
        return decoded
    }

    private static func isAllowed(
        _ url: URL,
        allowInsecureLocalDevelopment: Bool
    ) -> Bool {
        guard url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/",
              let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased()
        else {
            return false
        }
        if scheme == "https" {
            return true
        }
        let localHosts = ["localhost", "127.0.0.1", "::1"]
        return allowInsecureLocalDevelopment && scheme == "http" && localHosts.contains(host)
    }
}
