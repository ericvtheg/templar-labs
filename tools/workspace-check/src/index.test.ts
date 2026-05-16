import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { checkWorkspace } from "./index.ts";

const validScripts = {
  build: "echo build",
  check: "echo check",
  lint: "echo lint",
  test: "echo test",
  typecheck: "echo typecheck",
};

async function createTempWorkspace(): Promise<string> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "workspace-check-"));
  await writeFile(
    path.join(rootDir, "pnpm-workspace.yaml"),
    "packages:\n  - 'packages/*'\n",
  );
  await mkdir(path.join(rootDir, "packages/example"), { recursive: true });

  return rootDir;
}

test("passes when root and workspace packages include required scripts", async () => {
  const rootDir = await createTempWorkspace();

  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "root", scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "packages/example/package.json"),
    JSON.stringify({ name: "example", scripts: validScripts }),
  );

  assert.deepEqual(await checkWorkspace(rootDir), []);
});

test("reports missing scripts", async () => {
  const rootDir = await createTempWorkspace();

  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "root", scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "packages/example/package.json"),
    JSON.stringify({ name: "example", scripts: { build: "echo build" } }),
  );

  assert.deepEqual(await checkWorkspace(rootDir), [
    "example is missing scripts.check",
    "example is missing scripts.lint",
    "example is missing scripts.test",
    "example is missing scripts.typecheck",
  ]);
});

test("reports default npm placeholder scripts", async () => {
  const rootDir = await createTempWorkspace();

  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "root", scripts: validScripts }),
  );
  await writeFile(
    path.join(rootDir, "packages/example/package.json"),
    JSON.stringify({
      name: "example",
      scripts: {
        ...validScripts,
        test: "echo \"Error: no test specified\" && exit 1",
      },
    }),
  );

  assert.deepEqual(await checkWorkspace(rootDir), [
    "example has the default npm placeholder for scripts.test",
  ]);
});
