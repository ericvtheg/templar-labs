import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  completedBuildId,
  mobileDirectory,
  prepareRelease,
  releaseIdentity,
} from "../src/config.ts";

const identity = {
  IOS_BUNDLE_ID: "com.example.fixture",
  APPLE_TEAM_ID: "TESTTEAM01",
  EAS_PROJECT_ID: "00000000-0000-4000-8000-000000000000",
  EXPO_OWNER: "fixture-owner",
  ASC_APP_ID: "1234567890",
  APPLE_ID: "fixture@example.com",
};

test("requires valid identity and submission variables before configuring a build", () => {
  for (const name of Object.keys(identity)) {
    assert.throws(() => releaseIdentity({ ...identity, [name]: "" }), new RegExp(name));
  }
  assert.throws(() => releaseIdentity({ ...identity, APPLE_TEAM_ID: "bad" }), /APPLE_TEAM_ID/);
  assert.throws(() => releaseIdentity({ ...identity, EAS_PROJECT_ID: "bad" }), /EAS_PROJECT_ID/);
});

// biome-ignore lint/style/noDoneCallback: Node test passes a TestContext, not a completion callback.
test("prepares any project, passes identity to EAS, and excludes GitHub secrets", (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "mobile-ci-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const project of ["health-exporter", "another-app"]) {
    const directory = join(root, "projects", project, "apps", "mobile");
    mkdirSync(directory, { recursive: true });
    const file = join(directory, "eas.json");
    writeFileSync(
      file,
      JSON.stringify({
        build: {
          "internal-testflight": {
            distribution: "store",
            credentialsSource: "remote",
            env: { FEATURE_FLAG: "enabled", IOS_BUNDLE_ID: "stale" },
            ios: { autoIncrement: "buildNumber" },
          },
        },
        submit: { unrelated: { ios: { ascAppId: "42" } } },
      }),
    );
    assert.equal(
      prepareRelease(root, project, {
        ...identity,
        EXPO_TOKEN: "fixture-expo-secret",
        EXPO_APPLE_APP_SPECIFIC_PASSWORD: "fixture-apple-secret",
        HEALTH_EXPORTER_SECRET: "fixture-ingestion-secret",
      }),
      directory,
    );
    const output = readFileSync(file, "utf8");
    const config = JSON.parse(output);
    assert.equal(config.build["internal-testflight"].env.IOS_BUNDLE_ID, identity.IOS_BUNDLE_ID);
    assert.equal(config.build["internal-testflight"].env.EAS_PROJECT_ID, identity.EAS_PROJECT_ID);
    assert.equal(config.build["internal-testflight"].env.FEATURE_FLAG, "enabled");
    assert.equal(config.build["internal-testflight"].ios.autoIncrement, "buildNumber");
    assert.equal(config.submit["internal-testflight"].ios.ascAppId, identity.ASC_APP_ID);
    assert.equal(config.submit.unrelated.ios.ascAppId, "42");
    assert.doesNotMatch(output, /fixture-(expo|apple|ingestion)-secret/);
  }
  assert.throws(() => mobileDirectory(root, "../../outside"), /directory name/);
  const linkParent = join(root, "projects", "linked-app", "apps");
  mkdirSync(linkParent, { recursive: true });
  symlinkSync(join(root, "projects", "another-app", "apps", "mobile"), join(linkParent, "mobile"));
  assert.throws(() => mobileDirectory(root, "linked-app"), /symlinks/);
});

test("submits only the single successful iOS build returned by the current invocation", () => {
  const build = { id: identity.EAS_PROJECT_ID, platform: "IOS", status: "FINISHED" };
  assert.equal(completedBuildId(JSON.stringify([build])), build.id);
  for (const result of [
    [],
    [build, build],
    [{ ...build, status: "ERRORED" }],
    [{ ...build, status: "CANCELED" }],
    [{ ...build, status: "IN_PROGRESS" }],
    [{ ...build, platform: "ANDROID" }],
    [{ ...build, id: "bad" }],
    {},
  ]) {
    assert.throws(() => completedBuildId(JSON.stringify(result)), /finished iOS build/);
  }
});
