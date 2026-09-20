import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { Miniflare } from "miniflare";

test("production TanStack route through D1", async () => {
  // Reuse Vite's bundler to exercise the actual production TanStack route in workerd.
  const require = createRequire(import.meta.url);
  const { build } = createRequire(require.resolve("vite"))("esbuild");
  const result = await build({
    entryPoints: ["dist/server/server.js"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    conditions: ["workerd", "browser"],
    mainFields: ["module", "main"],
    define: { "process.env.NODE_ENV": '"production"' },
    target: "es2022",
    external: ["cloudflare:workers", "node:*"],
  });
  const secret = "local-test-only-not-a-deployment-secret";
  const mf = new Miniflare({
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    modules: true,
    script: result.outputFiles[0].text,
    d1Databases: ["DB"],
    bindings: { HEALTH_EXPORTER_SECRET: secret },
  });
  try {
    const db = await mf.getD1Database("DB");
    const migration = await readFile(
      new URL("../../../db/migrations/0000_health_exporter.sql", import.meta.url),
      "utf8",
    );
    await db.batch(
      migration
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
    );
    const url = "https://local.test/api/v1/sample-ingestion";
    assert.equal((await mf.dispatchFetch(url)).status, 401);
    const headers = { authorization: `Bearer ${secret}`, "content-type": "application/json" };
    // Explicit test fixture, never HealthKit/device output.
    const body = JSON.stringify({
      requestId: "00000000-0000-4000-8000-000000000001",
      deviceId: "00000000-0000-4000-8000-000000000002",
      samples: [
        {
          sampleId: "00000000-0000-4000-8000-000000000003",
          type: "stepCount",
          value: 1,
          unit: "count",
          startAt: "2026-09-18T08:00:00.000Z",
          endAt: "2026-09-18T08:01:00.000Z",
          source: { bundleIdentifier: "test.fixture", name: "Test fixture" },
        },
      ],
    });
    const accepted = await mf.dispatchFetch(url, { method: "POST", headers, body });
    assert.equal(accepted.status, 200, await accepted.clone().text());
    assert.equal((await accepted.json()).status, "accepted");
    const replay = await mf.dispatchFetch(url, { method: "POST", headers, body });
    assert.equal((await replay.json()).status, "replayed");
    const status = await mf.dispatchFetch(url, { headers });
    assert.equal(status.status, 200);
    assert.equal((await status.json()).lastSync.requestId, "00000000-0000-4000-8000-000000000001");
    console.log(
      "Production TanStack route smoke passed: unauthorized, ingest, replay, persisted status.",
    );
  } finally {
    await mf.dispose();
  }
});
