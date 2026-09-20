// biome-ignore-all lint/style/noProcessEnv: exercise environment-based release configuration.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import configure from "../app.config.ts";

// Identity fixtures only. These values are never used for builds or uploads.
test("release config fails closed without identity and declares read-only HealthKit", () => {
  const previous = { ...process.env };
  try {
    delete process.env.IOS_BUNDLE_ID;
    assert.throws(
      () =>
        configure({
          projectRoot: ".",
          staticConfigPath: null,
          packageJsonPath: "./package.json",
          config: { name: "test", slug: "test" },
        }),
      /IOS_BUNDLE_ID/,
    );
    process.env.IOS_BUNDLE_ID = "test.fixture.health";
    process.env.APPLE_TEAM_ID = "TESTTEAM01";
    process.env.EXPO_OWNER = "fixture-owner";
    process.env.EAS_PROJECT_ID = "00000000-0000-4000-8000-000000000000";
    const config = configure({
      projectRoot: ".",
      staticConfigPath: null,
      packageJsonPath: "./package.json",
      config: { name: "test", slug: "test" },
    });
    assert.equal(config.name, "Health Exporter");
    assert.equal(config.slug, "health-exporter");
    assert.equal(config.owner, "fixture-owner");
    assert.equal(config.ios?.bundleIdentifier, "test.fixture.health");
    assert.equal(config.ios?.entitlements?.["com.apple.developer.healthkit"], true);
    assert.ok(config.ios?.infoPlist?.NSHealthShareUsageDescription);
    const eas = JSON.parse(readFileSync(new URL("../eas.json", import.meta.url), "utf8"));
    assert.equal(eas.build["internal-testflight"].distribution, "store");
  } finally {
    process.env = previous;
  }
});

test("bounded native query selects newest samples and UI states its limit", () => {
  const swift = readFileSync(
    new URL("../modules/healthkit/ios/TemplarHealthKitModule.swift", import.meta.url),
    "utf8",
  );
  assert.match(swift, /ascending: false/);
  assert.match(swift, /limit: 100/);
  const ui = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(ui, /latest 100/);
});

// Autolinking discovery alone is insufficient: resolution must produce a CocoaPod.
test("HealthKit resolves to a native pod and Swift module", () => {
  const bin = fileURLToPath(
    new URL("../node_modules/.bin/expo-modules-autolinking", import.meta.url),
  );
  const resolved = JSON.parse(
    execFileSync(bin, ["resolve", "--platform", "apple", "--json"], { encoding: "utf8" }),
  );
  const module = resolved.modules.find(
    (item: { packageName: string }) => item.packageName === "templar-healthkit",
  );
  assert.ok(module);
  assert.equal(module.pods[0].podName, "TemplarHealthKit");
  assert.equal(module.modules[0].class, "TemplarHealthKitModule");
});
