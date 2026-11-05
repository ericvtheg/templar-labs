import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { CloudflareD1, runOnce } from "../../../scripts/ingest-production.ts";
import { testDatabase } from "./support/d1.ts";

async function mockApi(
  handler: (url: string, body: unknown) => { status?: number; body: unknown },
) {
  const requests: { url: string; body: unknown }[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
    }
    const body: unknown = raw ? JSON.parse(raw) : undefined;
    const url = req.url ?? "";
    requests.push({ url, body });
    const reply = handler(url, body);
    res.writeHead(reply.status ?? 200, { "content-type": "application/json" });
    res.end(JSON.stringify(reply.body));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock server did not bind TCP.");
  }
  return {
    requests,
    api: new CloudflareD1({
      accountId: "account",
      apiToken: "test-only",
      apiBase: `http://127.0.0.1:${address.port}`,
      retryDelayMs: 1,
    }),
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

const result = { success: true, results: [{ value: 42 }], meta: { changes: 1 } };

test("REST adapter discovers exact name across pages and implements binding/query/batch", async () => {
  const mock = await mockApi((url, body) => {
    if (!url.endsWith("/query")) {
      return {
        body: {
          success: true,
          result: url.includes("page=2&")
            ? [{ name: "la-property-watch-db", uuid: "database" }]
            : [{ name: "la-property-watch-db-preview", uuid: "wrong" }],
          result_info: { total_pages: 2 },
        },
      };
    }
    return {
      body: { success: true, result: Array.isArray(body) ? body.map(() => result) : [result] },
    };
  });
  try {
    await mock.api.discover();
    const statement = mock.api.prepare("SELECT ? AS value").bind(42);
    assert.equal((await statement.run()).meta.changes, 1);
    assert.equal(await statement.first("value"), 42);
    assert.deepEqual((await statement.all()).results, [{ value: 42 }]);
    assert.equal((await mock.api.batch([statement, statement])).length, 2);
    assert.ok(mock.requests.at(-1)?.url.endsWith("/database/query"));
    assert.deepEqual(mock.requests.at(-1)?.body, [
      { sql: "SELECT ? AS value", params: [42] },
      { sql: "SELECT ? AS value", params: [42] },
    ]);
  } finally {
    await mock.close();
  }
});

test("retries transient reads, rejects query failures, and does not replay ambiguous writes", async () => {
  let attempts = 0;
  let mode = "read";
  const mock = await mockApi((url) => {
    if (!url.endsWith("/query")) {
      return {
        body: {
          success: true,
          result: [{ name: "la-property-watch-db", uuid: "database" }],
          result_info: { total_pages: 1 },
        },
      };
    }
    attempts++;
    if (mode === "failure") {
      return { body: { success: true, result: [{ success: false, error: "SQL error" }] } };
    }
    return attempts < 3 || mode === "write"
      ? { status: 503, body: { success: false } }
      : { body: { success: true, result: [result] } };
  });
  try {
    await mock.api.discover();
    assert.equal(await mock.api.prepare("SELECT 42 AS value").first("value"), 42);
    assert.equal(attempts, 3);
    mode = "failure";
    await assert.rejects(mock.api.prepare("SELECT bad").all(), /query failed/i);
    attempts = 0;
    mode = "write";
    await assert.rejects(
      mock.api.prepare("UPDATE refresh_jobs SET status = 'running'").run(),
      /503/,
    );
    assert.equal(attempts, 1);
  } finally {
    await mock.close();
  }
});

test("API retry budget is bounded and authentication errors are not retried", async () => {
  let attempts = 0;
  let status = 503;
  const mock = await mockApi(() => {
    attempts++;
    return { status, body: { success: false } };
  });
  try {
    await assert.rejects(mock.api.discover(), /503/);
    assert.equal(attempts, 3);
    attempts = 0;
    status = 401;
    await assert.rejects(mock.api.discover(), /401/);
    assert.equal(attempts, 1);
  } finally {
    await mock.close();
  }
});

test("recovery waits out cooldown then creates and runs a scheduled job", async () => {
  const db = testDatabase();
  try {
    db.sqlite.exec(
      "INSERT INTO refresh_jobs (id, trigger, status, requested_at, started_at, active_lease) VALUES ('terminated', 'manual', 'running', '2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z', 'foreclosure-source-refresh')",
    );
    const summary = await runOnce(db.binding, { sources: [] });
    assert.equal(summary.skipped, null);
    assert.equal(summary.job?.trigger, "scheduled");
    assert.equal(summary.job?.status, "success");
    assert.equal(summary.recovered[0]?.id, "terminated");
  } finally {
    db.close();
  }
});

test("reconciles stale jobs and runs, preserves recent active jobs, and queued-only does not create", async () => {
  const db = testDatabase();
  const now = new Date("2026-11-05T12:00:00.000Z");
  try {
    db.sqlite.exec(`INSERT INTO refresh_jobs (id, trigger, status, requested_at, started_at, active_lease) VALUES ('stale', 'manual', 'running', '2026-11-05T11:00:00.000Z', '2026-11-05T11:00:00.000Z', 'foreclosure-source-refresh');
      INSERT INTO ingestion_runs (id, refresh_job_id, source_id, source_name, source_url, trigger, status, started_at, records_found, records_upserted) VALUES ('run', 'stale', 'test', 'test', 'https://example.test', 'manual', 'running', '2026-11-05T11:00:00.000Z', 0, 0)`);
    const summary = await runOnce(db.binding, { queuedOnly: true, now });
    assert.equal(summary.skipped, "no queued job");
    const stale = db.sqlite
      .prepare("SELECT status, error, active_lease FROM refresh_jobs WHERE id = 'stale'")
      .get();
    assert.equal(stale?.["status"], "failed");
    assert.match(String(stale?.["error"]), /runtime terminated/i);
    assert.equal(stale?.["active_lease"], null);
    assert.equal(
      db.sqlite.prepare("SELECT status FROM ingestion_runs").get()?.["status"],
      "failed",
    );
    db.sqlite.exec(
      "INSERT INTO refresh_jobs (id, trigger, status, requested_at, started_at, active_lease) VALUES ('active', 'manual', 'running', '2026-11-05T11:59:00.000Z', '2026-11-05T11:59:00.000Z', 'foreclosure-source-refresh')",
    );
    assert.equal((await runOnce(db.binding, { now })).skipped, "active job");
  } finally {
    db.close();
  }
});

test("runs oldest queued job through repository, reports persisted counts, and honors cooldown", async () => {
  const db = testDatabase();
  try {
    db.sqlite.exec(
      "INSERT INTO refresh_jobs (id, trigger, status, requested_at, active_lease) VALUES ('queued', 'manual', 'queued', '2026-11-05T11:59:00.000Z', 'foreclosure-source-refresh')",
    );
    const summary = await runOnce(db.binding, {
      sources: [
        {
          id: "fixture",
          name: "fixture",
          url: "https://example.test",
          load: async () => ({
            sourceId: "fixture",
            sourceName: "fixture",
            sourceUrl: "https://example.test",
            records: [],
            warnings: [],
          }),
        },
      ],
    });
    assert.equal(summary.job?.id, "queued");
    assert.equal(summary.job?.status, "partial");
    assert.equal(summary.runs[0]?.records_found, 0);
    assert.equal(summary.counts.total, 0);
    assert.equal((await runOnce(db.binding)).skipped, "cooldown");
  } finally {
    db.close();
  }
});
