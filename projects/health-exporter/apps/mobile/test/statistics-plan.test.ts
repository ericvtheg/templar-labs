import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("statistics rebuilds survive corrections, interrupted backfills and calendar changes", {
  skip: process.platform !== "darwin" ? "Requires Swift." : false,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "health-statistics-tests-"));
  try {
    const binary = join(dir, "statistics-tests");
    execFileSync(
      "xcrun",
      [
        "swiftc",
        "-swift-version",
        "5",
        fileURLToPath(
          new URL("../modules/healthkit/ios/HealthStatisticsPlan.swift", import.meta.url),
        ),
        fileURLToPath(new URL("./statistics-plan.swift", import.meta.url)),
        "-o",
        binary,
      ],
      { stdio: "pipe" },
    );
    execFileSync(binary, [], { stdio: "inherit" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
