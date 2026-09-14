// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "TemplarHealthExporter",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "TemplarHealthExporter", targets: ["TemplarHealthExporter"])
    ],
    targets: [
        .target(name: "TemplarHealthExporter"),
        .testTarget(
            name: "TemplarHealthExporterTests",
            dependencies: ["TemplarHealthExporter"]
        ),
    ]
)
