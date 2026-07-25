import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkMonorepo } from "../src/index.ts";

const validScripts = {
  build: "echo build",
  check: "echo check",
  lint: "echo lint",
  test: "echo test",
  typecheck: "echo typecheck",
};

const validAppScripts = {
  ...validScripts,
  deploy: "echo deploy",
};

async function createTempMonorepo(): Promise<string> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "monorepo-check-"));
  await writeFile(path.join(rootDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
  await mkdir(path.join(rootDir, "packages/example"), { recursive: true });

  return rootDir;
}

test("passes when root and monorepo packages include required scripts", async () => {
  const rootDir = await createTempMonorepo();

  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "root", private: true, scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "packages/example/package.json"),
    JSON.stringify({ name: "@templar/example", private: true, scripts: validScripts }),
  );

  assert.deepEqual(await checkMonorepo(rootDir), []);
});

test("reports missing scripts", async () => {
  const rootDir = await createTempMonorepo();

  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "root", private: true, scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "packages/example/package.json"),
    JSON.stringify({ name: "@templar/example", private: true, scripts: { build: "echo build" } }),
  );

  assert.deepEqual(await checkMonorepo(rootDir), [
    "@templar/example is missing scripts.check",
    "@templar/example is missing scripts.lint",
    "@templar/example is missing scripts.test",
    "@templar/example is missing scripts.typecheck",
  ]);
});

test("reports default npm placeholder scripts", async () => {
  const rootDir = await createTempMonorepo();

  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "root", private: true, scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "packages/example/package.json"),
    JSON.stringify({
      name: "example",
      private: true,
      scripts: {
        ...validScripts,
        test: 'echo "Error: no test specified" && exit 1',
      },
    }),
  );

  assert.deepEqual(await checkMonorepo(rootDir), [
    "example has the default npm placeholder for scripts.test",
    "packages/example/package.json name must be @templar/example",
  ]);
});

test("reports package names that do not match their workspace path", async () => {
  const rootDir = await createTempMonorepo();
  await mkdir(path.join(rootDir, "tools/example-tool"), { recursive: true });

  await writeFile(
    path.join(rootDir, "pnpm-workspace.yaml"),
    "packages:\n  - 'packages/*'\n  - 'tools/*'\n",
  );
  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "root", private: true, scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "packages/example/package.json"),
    JSON.stringify({ name: "example", private: true, scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "tools/example-tool/package.json"),
    JSON.stringify({ name: "@templar/tool", private: true, scripts: validScripts }),
  );

  assert.deepEqual(await checkMonorepo(rootDir), [
    "packages/example/package.json name must be @templar/example",
    "tools/example-tool/package.json name must be @templar/example-tool",
  ]);
});

test("reports packages that are not private", async () => {
  const rootDir = await createTempMonorepo();
  await mkdir(path.join(rootDir, "tools/example-tool"), { recursive: true });

  await writeFile(
    path.join(rootDir, "pnpm-workspace.yaml"),
    "packages:\n  - 'packages/*'\n  - 'tools/*'\n",
  );
  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "root", scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "packages/example/package.json"),
    JSON.stringify({ name: "@templar/example", scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "tools/example-tool/package.json"),
    JSON.stringify({ name: "@templar/example-tool", scripts: validScripts }),
  );

  assert.deepEqual(await checkMonorepo(rootDir), [
    "package.json must set private: true",
    "packages/example/package.json must set private: true",
    "tools/example-tool/package.json must set private: true",
  ]);
});

test("requires deploy scripts for project apps", async () => {
  const rootDir = await createTempMonorepo();
  await mkdir(path.join(rootDir, "projects/example/apps/web"), { recursive: true });

  await writeFile(
    path.join(rootDir, "pnpm-workspace.yaml"),
    "packages:\n  - 'packages/*'\n  - 'projects/*/apps/*'\n",
  );
  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "root", private: true, scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "packages/example/package.json"),
    JSON.stringify({ name: "@templar/example", private: true, scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "projects/example/apps/web/package.json"),
    JSON.stringify({ name: "example-web", private: true, scripts: validScripts }),
  );

  assert.deepEqual(await checkMonorepo(rootDir), ["example-web is missing scripts.deploy"]);
});

test("does not require deploy scripts for project packages", async () => {
  const rootDir = await createTempMonorepo();
  await mkdir(path.join(rootDir, "projects/example/apps/web"), { recursive: true });
  await mkdir(path.join(rootDir, "projects/example/packages/domain"), { recursive: true });

  await writeFile(
    path.join(rootDir, "pnpm-workspace.yaml"),
    "packages:\n  - 'packages/*'\n  - 'projects/*/apps/*'\n  - 'projects/*/packages/*'\n",
  );
  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "root", private: true, scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "packages/example/package.json"),
    JSON.stringify({ name: "@templar/example", private: true, scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "projects/example/apps/web/package.json"),
    JSON.stringify({ name: "example-web", private: true, scripts: validAppScripts }),
  );
  await writeFile(
    path.join(rootDir, "projects/example/packages/domain/package.json"),
    JSON.stringify({ name: "example-domain", private: true, scripts: validScripts }),
  );

  assert.deepEqual(await checkMonorepo(rootDir), []);
});

test("requires tests to live in the owning workspace test directory", async () => {
  const rootDir = await createTempMonorepo();
  await mkdir(path.join(rootDir, "packages/example/src"), { recursive: true });
  await mkdir(path.join(rootDir, "packages/example/e2e"), { recursive: true });

  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "root", private: true, scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "packages/example/package.json"),
    JSON.stringify({ name: "@templar/example", private: true, scripts: validScripts }),
  );
  await writeFile(path.join(rootDir, "packages/example/src/example.test.ts"), "");
  await writeFile(path.join(rootDir, "packages/example/e2e/example.spec.ts"), "");

  assert.deepEqual(await checkMonorepo(rootDir), [
    "packages/example/e2e/example.spec.ts must be under packages/example/test/",
    "packages/example/src/example.test.ts must be under packages/example/test/",
  ]);
});

test("allows unit and end-to-end tests under the owning workspace test directory", async () => {
  const rootDir = await createTempMonorepo();
  await mkdir(path.join(rootDir, "packages/example/test/e2e"), { recursive: true });

  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "root", private: true, scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "packages/example/package.json"),
    JSON.stringify({ name: "@templar/example", private: true, scripts: validScripts }),
  );
  await writeFile(path.join(rootDir, "packages/example/test/example.test.ts"), "");
  await writeFile(path.join(rootDir, "packages/example/test/e2e/example.spec.ts"), "");

  assert.deepEqual(await checkMonorepo(rootDir), []);
});
