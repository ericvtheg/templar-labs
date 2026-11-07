// biome-ignore-all lint/complexity/useLiteralKeys: Required by noPropertyAccessFromIndexSignature.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import {
  DiagnosticRestClient,
  type QuerySpec,
  runDiagnostic,
} from "../../../scripts/diagnose-production-queries.ts";
import { testDatabase } from "./support/d1.ts";

const credentials = {
  CLOUDFLARE_ACCOUNT_ID: "private-account-marker",
  CLOUDFLARE_API_TOKEN: "private-token-marker",
};
type RequestQuery = { sql: string; params: (string | number | null)[] };
type Hook = (
  query: RequestQuery,
  rows: Record<string, unknown>[],
) => Record<string, unknown>[] | Response;
const isExecution = (sql: string) =>
  /^(WITH qualified|SELECT COUNT\(\*\) AS total FROM watchlist_properties)/.test(sql);

// Transport is explicitly mocked; SQL and plans execute on the actual migrated
// owning SQLite test database. These are not production measurements.
function providerHarness(hook?: Hook) {
  const database = testDatabase();
  database.sqlite.exec(
    "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
  );
  const names = readdirSync(new URL("../../../db/migrations/", import.meta.url)).filter((name) =>
    name.endsWith(".sql"),
  );
  for (const name of names) {
    database.sqlite
      .prepare("INSERT INTO d1_migrations(name,applied_at) VALUES (?,?)")
      .run(name, "local-test");
  }
  const queries: RequestQuery[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await Promise.resolve();
      if (init?.method === "GET") {
        return new Response(
          JSON.stringify({
            success: true,
            result: [{ name: "la-property-watch-db", uuid: "private-database-marker" }],
            result_info: { total_pages: 1 },
          }),
        );
      }
      const body = JSON.parse(String(init?.body)) as RequestQuery;
      if (Object.keys(body).toSorted().join(",") !== "params,sql") {
        throw new Error("Unexpected query envelope in test harness");
      }
      if (/pragma_(?:table|index)_info/i.test(body.sql)) {
        throw new Error("D1 rejects table-valued pragma functions");
      }
      queries.push(body);
      const rows = database.sqlite.prepare(body.sql).all(...body.params) as Record<
        string,
        unknown
      >[];
      const response = hook?.(body, rows) ?? rows;
      if (response instanceof Response) {
        return response;
      }
      return new Response(
        JSON.stringify({
          success: true,
          result: [
            {
              success: true,
              results: response,
              meta: { rows_read: 1, rows_written: 0, duration: 0.25 },
            },
          ],
        }),
      );
    } finally {
      inFlight--;
    }
  };
  return { database, queries, fetcher, maxInFlight: () => maxInFlight };
}

function reportArray(report: Record<string, unknown>, key: string) {
  return report[key] as Record<string, unknown>[];
}

test("plans-only orchestration uses real generated SQL and never executes dashboard SELECTs", async () => {
  const harness = providerHarness();
  try {
    const report = await runDiagnostic([], credentials, harness.fetcher);
    assert.equal(report["status"], "ok", JSON.stringify(report["failure"]));
    assert.equal(harness.queries.length, 24);
    assert.equal(
      harness.queries.filter((query) => query.sql.startsWith("EXPLAIN QUERY PLAN ")).length,
      9,
    );
    assert.equal(harness.queries.filter((query) => isExecution(query.sql)).length, 0);
    assert.equal(reportArray(report, "plans").length, 9);
    assert.equal(reportArray(report, "executions").length, 0);
    assert.equal(harness.maxInFlight(), 1);
    assert.equal(
      harness.database.sqlite.prepare("SELECT COUNT(*) AS total FROM buy_boxes").get()?.["total"],
      0,
    );
  } finally {
    harness.database.close();
  }
});

test("explicit execution follows every plan, once each, and never emits property or provider text", async () => {
  const harness = providerHarness((query, rows) => {
    if (query.sql.startsWith("EXPLAIN QUERY PLAN ")) {
      return rows.map((row) => ({ ...row, private: "private-plan-marker" }));
    }
    if (isExecution(query.sql) && /SELECT \* FROM qualified/.test(query.sql)) {
      return [{ address: "private-property-marker", cookie: "private-cookie-marker" }];
    }
    return rows;
  });
  try {
    const report = await runDiagnostic(["--execute-corrected"], credentials, harness.fetcher);
    assert.equal(report["status"], "ok", JSON.stringify(report["failure"]));
    assert.equal(harness.queries.length, 29);
    const executions = reportArray(report, "executions");
    assert.deepEqual(
      executions.map((row) => row["id"]),
      [
        "corrected.default.page.select",
        "corrected.qualification.count.select",
        "corrected.qualification.page.select",
        "corrected.buybox.count.select",
        "corrected.buybox.page.select",
      ],
    );
    assert.ok(harness.queries.slice(24).every((query) => isExecution(query.sql)));
    assert.ok(
      harness.queries
        .filter((query) => isExecution(query.sql) && query.sql.includes("qualification_status"))
        .every((query) => query.sql.includes("INDEXED BY foreclosure_property_key_idx")),
    );
    assert.equal(harness.maxInFlight(), 1);
    assert.doesNotMatch(JSON.stringify(report), /private-|norfolk-va|sfh|filed_foreclosure/);
    assert.ok(executions.every((row) => row["rowsWritten"] === 0));
  } finally {
    harness.database.close();
  }
});

test("bad corrected plan or missing 0006 column blocks every dashboard execution", async () => {
  for (const fault of ["plan", "schema"] as const) {
    const harness = providerHarness((query, rows) => {
      if (
        fault === "plan" &&
        query.sql.startsWith("EXPLAIN QUERY PLAN ") &&
        query.sql.includes("INDEXED BY foreclosure_property_key_idx")
      ) {
        return [
          {
            detail:
              "SEARCH r USING INDEX foreclosure_snapshot_source_idx (source_id=? AND snapshot_presence=?) private-plan-marker",
          },
        ];
      }
      if (fault === "schema" && query.sql.startsWith("PRAGMA table_info")) {
        return rows.filter((row) => row["name"] !== "findings_json");
      }
      return rows;
    });
    try {
      const report = await runDiagnostic(["--execute-corrected"], credentials, harness.fetcher);
      assert.equal(report["status"], "failed");
      assert.equal(harness.queries.filter((query) => isExecution(query.sql)).length, 0);
      assert.equal(reportArray(report, "executions").length, 0);
      assert.doesNotMatch(JSON.stringify(report), /private-/);
    } finally {
      harness.database.close();
    }
  }
});

test("provider failure keeps prior execution evidence, safe quota code, and never retries", async () => {
  let attempted = 0;
  const harness = providerHarness((query, rows) => {
    if (isExecution(query.sql) && ++attempted === 2) {
      return new Response(
        JSON.stringify({
          success: false,
          errors: [
            {
              code: 7500,
              message: "rows read quota exceeded private-token-marker private-property-marker",
            },
          ],
        }),
        { status: 429 },
      );
    }
    return rows;
  });
  try {
    const report = await runDiagnostic(["--execute-corrected"], credentials, harness.fetcher);
    assert.equal(report["status"], "failed");
    assert.equal(attempted, 2);
    const executions = reportArray(report, "executions");
    assert.equal(executions[0]?.["status"], "ok");
    assert.equal(executions[1]?.["status"], "failed");
    assert.equal((report["failure"] as Record<string, unknown>)["providerCode"], 7500);
    assert.equal((report["failure"] as Record<string, unknown>)["providerCategory"], "read_quota");
    assert.doesNotMatch(JSON.stringify(report), /private-/);
  } finally {
    harness.database.close();
  }
});

test("aggregate corrected execution deadline stops further queries at sixty seconds", async () => {
  let clock = 0;
  const harness = providerHarness((query, rows) => {
    if (isExecution(query.sql)) {
      clock += 30_000;
    }
    return rows;
  });
  try {
    const report = await runDiagnostic(
      ["--execute-corrected"],
      credentials,
      harness.fetcher,
      () => clock,
    );
    assert.equal(report["status"], "failed");
    assert.equal(harness.queries.filter((query) => isExecution(query.sql)).length, 2);
    assert.equal((report["failure"] as Record<string, unknown>)["category"], "execution_deadline");
    assert.equal((report["budget"] as Record<string, unknown>)["sqlRequests"], 26);
  } finally {
    harness.database.close();
  }
});

// biome-ignore lint/style/noDoneCallback: Node TestContext provides scoped mock timers.
test("request timeout covers stalled response bodies and clips to remaining execution budget", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const spec: QuerySpec = {
    id: "schema.aggregates",
    sql: "SELECT 1",
    params: [],
    provenance: "fixed-introspection",
  };
  for (const timeout of [30_000, 5_000]) {
    let signal: AbortSignal | undefined;
    let calls = 0;
    const client = new DiagnosticRestClient(
      "a",
      "t",
      async (_url, init) => {
        if (++calls === 1) {
          return new Response(
            JSON.stringify({
              success: true,
              result: [{ name: "la-property-watch-db", uuid: "d" }],
              result_info: { total_pages: 1 },
            }),
          );
        }
        signal = init?.signal ?? undefined;
        return new Response(
          new ReadableStream({
            start(controller) {
              signal?.addEventListener(
                "abort",
                () => controller.error(new Error("private-timeout-marker")),
                { once: true },
              );
            },
          }),
        );
      },
      [spec],
      () => 0,
    );
    await client.discover();
    const request = client.run(spec, timeout);
    context.mock.timers.tick(timeout - 1);
    assert.equal(signal?.aborted, false);
    context.mock.timers.tick(1);
    await assert.rejects(request);
    assert.equal(signal?.aborted, true);
    assert.equal(calls, 2);
  }
});
