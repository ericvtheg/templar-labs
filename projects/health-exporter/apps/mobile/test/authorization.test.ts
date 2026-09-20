import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

test("HealthKit accepts the permission catalog and native exceptions become errors", {
  skip: process.platform !== "darwin" ? "Requires Apple's HealthKit framework on macOS." : false,
}, () => {
  const directory = mkdtempSync(join(tmpdir(), "health-authorization-tests-"));
  try {
    const bridge = join(directory, "bridge.o");
    const harness = join(directory, "harness.o");
    for (const [source, output] of [
      [path("../modules/healthkit/ios/HealthAuthorization.m"), bridge],
      [path("./authorization.m"), harness],
    ] as const) {
      execFileSync("xcrun", ["clang", "-fobjc-arc", "-c", source, "-o", output], { stdio: "pipe" });
    }
    const binary = join(directory, "authorization-tests");
    execFileSync(
      "xcrun",
      [
        "swiftc",
        "-swift-version",
        "5",
        "-import-objc-header",
        path("./authorization.h"),
        path("../modules/healthkit/ios/HealthTypes.swift"),
        path("./authorization.swift"),
        bridge,
        harness,
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
