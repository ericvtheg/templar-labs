import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { stringify } from "yaml";
import { sourceFingerprint } from "../src/fingerprint.ts";
import { type Build, decideBuild, planRelease } from "../src/history.ts";

const env = {
  IOS_BUNDLE_ID: "com.example.fixture",
  APPLE_TEAM_ID: "TESTTEAM01",
  EAS_PROJECT_ID: "00000000-0000-4000-8000-000000000000",
  EXPO_OWNER: "fixture-owner",
  ASC_APP_ID: "1234567890",
  APPLE_ID: "fixture@example.com",
  EXPO_TOKEN: "test-only-token",
};
const app = "projects/example/apps/mobile";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "mobile-source-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  function write(path: string, contents: string) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  const lock = {
    importers: {
      [app]: {
        dependencies: {
          react: { version: "1.0.0" },
          shared: { version: "link:../../../../packages/shared" },
        },
      },
      "packages/shared": { dependencies: { leaf: { version: "2.0.0" } } },
      "projects/unrelated": { dependencies: { unrelated: { version: "1.0.0" } } },
    },
    snapshots: {
      "react@1.0.0": {},
      "leaf@2.0.0": { dependencies: { transitive: "3.0.0" } },
      "transitive@3.0.0": {},
      "unrelated@1.0.0": {},
    },
    packages: {
      "react@1.0.0": {},
      "leaf@2.0.0": {},
      "transitive@3.0.0": { resolution: { integrity: "fixture" } },
      "unrelated@1.0.0": { resolution: { integrity: "unrelated" } },
    },
  };
  function writeLock() {
    write("pnpm-lock.yaml", `---\n${stringify({ importers: { ".": {} } })}---\n${stringify(lock)}`);
  }
  function commit() {
    git("add", ".");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture",
    );
    return git("rev-parse", "HEAD").trim();
  }
  git("init", "-q");
  write(
    "package.json",
    JSON.stringify({ packageManager: "pnpm@11.0.0", devDependencies: { unrelated: "1" } }),
  );
  writeLock();
  write(`${app}/src/App.tsx`, "export default 1;");
  write(`${app}/eas.json`, "{}");
  write("packages/shared/src/index.ts", "export default 1;");
  const sha = commit();
  return {
    root,
    write,
    lock,
    writeLock,
    commit,
    sha,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("fingerprint ignores unrelated projects, docs, tests, and unrelated lock resolutions", () => {
  const f = fixture();
  try {
    const baseline = sourceFingerprint(f.root, "example", env);
    f.write("projects/example/apps/web/server.ts", "backend change");
    f.write(`${app}/test/config.test.ts`, "test change");
    f.write(`${app}/README.md`, "docs change");
    f.write("tools/mobile-ci/src/new.ts", "workflow tool change");
    f.lock.packages["unrelated@1.0.0"].resolution.integrity = "changed";
    f.writeLock();
    f.write(
      "package.json",
      JSON.stringify({ packageManager: "pnpm@11.0.0", devDependencies: { unrelated: "2" } }),
    );
    f.commit();
    assert.equal(sourceFingerprint(f.root, "example", env), baseline);
    assert.equal(sourceFingerprint(f.root, "example", env, f.sha), baseline);
  } finally {
    f.cleanup();
  }
});

test("app source, linked workspace, transitive resolution, identity, and deletions change fingerprint", () => {
  const f = fixture();
  try {
    let previous = sourceFingerprint(f.root, "example", env);
    const assertChanged = () => {
      f.commit();
      const next = sourceFingerprint(f.root, "example", env);
      assert.notEqual(next, previous);
      previous = next;
    };
    f.write(`${app}/src/App.tsx`, "export default 2;");
    assertChanged();
    f.write("packages/shared/src/index.ts", "export default 2;");
    assertChanged();
    f.lock.packages["transitive@3.0.0"].resolution.integrity = "new-leaf-resolution";
    f.writeLock();
    assertChanged();
    f.write(`${app}/eas.json`, '{"build":{"profile":"changed"}}');
    assertChanged();
    rmSync(join(f.root, app, "src/App.tsx"));
    assertChanged();
    assert.notEqual(
      sourceFingerprint(f.root, "example", { ...env, APPLE_TEAM_ID: "NEWTEAM001" }),
      previous,
    );
  } finally {
    f.cleanup();
  }
});

const build: Build = {
  id: "00000000-0000-4000-8000-000000000001",
  status: "FINISHED",
  platform: "IOS",
  buildProfile: "internal-testflight",
  appIdentifier: env.IOS_BUNDLE_ID,
  gitCommitHash: null,
  message: null,
  submissions: [],
};

test("reuses unsubmitted builds, skips submitted ones, and blocks duplicate active or failed builds", () => {
  assert.equal(decideBuild(build, "hash", env.ASC_APP_ID).action, "submit");
  const submitted = {
    ...build,
    submissions: [{ status: "FINISHED", iosConfig: { ascAppIdentifier: env.ASC_APP_ID } }],
  };
  assert.equal(decideBuild(submitted, "hash", env.ASC_APP_ID).action, "skip");
  assert.equal(decideBuild(submitted, "hash", "999").action, "submit");
  for (const status of ["NEW", "IN_QUEUE", "IN_PROGRESS", "ERRORED", "CANCELED"]) {
    assert.throws(() => decideBuild({ ...build, status }, "hash", env.ASC_APP_ID), /No new build/);
  }
  assert.throws(
    () =>
      decideBuild(
        {
          ...build,
          submissions: [{ status: "IN_PROGRESS", iosConfig: { ascAppIdentifier: env.ASC_APP_ID } }],
        },
        "hash",
        env.ASC_APP_ID,
      ),
    /No duplicate/,
  );
});

// biome-ignore lint/style/noDoneCallback: Node test provides a context, not a completion callback.
test("adopts the initial untagged build and refuses a new build when history is unavailable", async (t) => {
  const f = fixture();
  try {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({
        data: {
          app: {
            byId: {
              builds: [
                {
                  ...build,
                  gitCommitHash: f.sha,
                  submissions: [
                    { status: "FINISHED", iosConfig: { ascAppIdentifier: env.ASC_APP_ID } },
                  ],
                },
              ],
            },
          },
        },
      }),
    );
    assert.equal((await planRelease(f.root, "example", env)).action, "skip");
    t.mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 503 }));
    await assert.rejects(() => planRelease(f.root, "example", env), /refusing to spend a build/);
  } finally {
    f.cleanup();
  }
});
