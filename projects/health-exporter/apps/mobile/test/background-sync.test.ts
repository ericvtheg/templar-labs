import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("native background upload engine preserves progress across failures", {
  skip:
    process.platform !== "darwin"
      ? "Swift SDK is exercised on macOS; EAS compiles the iOS integration."
      : false,
}, () => {
  const directory = mkdtempSync(join(tmpdir(), "health-background-tests-"));
  try {
    const binary = join(directory, "background-tests");
    execFileSync(
      "xcrun",
      [
        "swiftc",
        "-swift-version",
        "5",
        fileURLToPath(new URL("../modules/healthkit/ios/HealthSyncCore.swift", import.meta.url)),
        fileURLToPath(new URL("../modules/healthkit/ios/HealthQuery.swift", import.meta.url)),
        fileURLToPath(new URL("./background-sync.swift", import.meta.url)),
        "-o",
        binary,
      ],
      { stdio: "pipe" },
    );
    execFileSync(binary, [], { stdio: "inherit" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
