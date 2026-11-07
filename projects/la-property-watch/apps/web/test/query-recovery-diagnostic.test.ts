// biome-ignore-all lint/complexity/useLiteralKeys: Required by noPropertyAccessFromIndexSignature.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStatementCatalog,
  DiagnosticRestClient,
  type QuerySpec,
  sanitizeFailure,
  summarizePlan,
  validateSchema,
  validateStatement,
} from "../../../scripts/diagnose-production-queries.ts";

const apiBase = "https://unit.invalid";
const profile = { enabled: 1, minimum_samples: 5, maximum_adjustment: 10 };
const spec: QuerySpec = {
  id: "schema.aggregates",
  sql: "SELECT REPLACE('a','a','b') AS value",
  params: [],
  provenance: "fixed-introspection",
};
const discovery = (rows = [{ name: "la-property-watch-db", uuid: "db-fixed" }], pages = 1) =>
  new Response(
    JSON.stringify({ success: true, result: rows, result_info: { total_pages: pages } }),
  );
const queryResponse = (results: Record<string, unknown>[] = []) =>
  new Response(
    JSON.stringify({
      success: true,
      result: [{ success: true, results, meta: { rows_read: 2, rows_written: 0, duration: 1.25 } }],
    }),
  );

test("generated catalog uses only EXPLAIN for originals and fixed corrected executions", async () => {
  const { catalog } = await buildStatementCatalog(profile);
  const originals = catalog.filter((entry) => entry.provenance === "generated-original");
  assert.equal(originals.length, 3);
  assert.ok(originals.every((entry) => entry.sql.startsWith("EXPLAIN QUERY PLAN ")));
  assert.equal(catalog.filter((entry) => entry.id.endsWith(".select")).length, 5);
  assert.ok(catalog.every((entry) => validateStatement(entry) === undefined));
  assert.equal(
    catalog.find((entry) => entry.id === "corrected.qualification.count.plan")?.params.at(-1),
    "qualified",
  );
});

test("REST transport sends exact envelope, paginates, and requires one exact database", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), ...(init ? { init } : {}) });
    if (calls.length === 1) {
      return discovery([{ name: "preview", uuid: "wrong" }], 2);
    }
    if (calls.length === 2) {
      return discovery([{ name: "la-property-watch-db", uuid: "db-fixed" }], 2);
    }
    return queryResponse([{ value: "b" }]);
  };
  const client = new DiagnosticRestClient("account", "token", fetcher, [spec], Date.now, apiBase);
  await client.discover();
  const result = await client.run(spec);
  assert.equal(result.results[0]?.["value"], "b");
  assert.equal(calls[2]?.init?.method, "POST");
  assert.ok(calls[2]?.init?.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { sql: spec.sql, params: [] });
  assert.match(calls[0]?.url ?? "", /page=1&per_page=100$/);
  assert.match(calls[1]?.url ?? "", /page=2&per_page=100$/);

  const duplicate = new DiagnosticRestClient(
    "a",
    "t",
    async () =>
      discovery([
        { name: "la-property-watch-db", uuid: "one" },
        { name: "la-property-watch-db", uuid: "two" },
      ]),
    [spec],
    Date.now,
    apiBase,
  );
  await assert.rejects(duplicate.discover(), /discovery:discovery/);
});

// biome-ignore lint/style/noDoneCallback: Node TestContext is not a done callback.
test("REST transport never retries network, HTTP, or invalid-body failures", async (context) => {
  for (const [name, response] of [
    ["network", () => Promise.reject(new Error("token-in-error"))],
    [
      "http",
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: false,
              errors: [{ code: 7500, message: "rows read quota secret" }],
            }),
            { status: 429 },
          ),
        ),
    ],
    ["body", () => Promise.resolve(new Response("not-json"))],
  ] as const) {
    await context.test(name, async () => {
      let calls = 0;
      const client = new DiagnosticRestClient(
        "a",
        "t",
        async () => {
          calls++;
          if (calls === 1) {
            return discovery();
          }
          return response();
        },
        [spec],
        Date.now,
        apiBase,
      );
      await client.discover();
      let failure: unknown;
      try {
        await client.run(spec);
      } catch (error) {
        failure = error;
      }
      assert.ok(failure);
      const sanitized = JSON.stringify(sanitizeFailure(failure));
      assert.doesNotMatch(sanitized, /secret|message/);
      if (name === "http") {
        assert.match(sanitized, /"httpStatus":429/);
        assert.match(sanitized, /"providerCode":7500/);
        assert.match(sanitized, /"providerCategory":"read_quota"/);
      }
      assert.equal(calls, 2);
    });
  }
});

test("transport enforces read-only, metadata, budgets, deadlines, and once-only SELECTs", async () => {
  assert.doesNotThrow(() => validateStatement(spec));
  assert.throws(() => validateStatement({ ...spec, sql: "WITH x AS (SELECT 1) DELETE FROM x" }));
  let calls = 0;
  const fetcher = async () => (++calls === 1 ? discovery() : queryResponse());
  const client = new DiagnosticRestClient("a", "t", fetcher, [spec], () => 100, apiBase);
  await client.discover();
  for (let index = 0; index < 29; index++) {
    await client.run(spec);
  }
  await assert.rejects(client.run(spec), /request:request_budget/);
  assert.equal(client.requestCount, 29);
  assert.equal(client.totalRequestCount, 30);

  let badMetaCalls = 0;
  const badMeta = new DiagnosticRestClient(
    "a",
    "t",
    async () => {
      if (++badMetaCalls === 1) {
        return discovery();
      }
      return new Response(
        JSON.stringify({
          success: true,
          result: [
            { success: true, results: [], meta: { rows_read: 1, rows_written: 1, duration: 1 } },
          ],
        }),
      );
    },
    [spec],
    () => 100,
    apiBase,
  );
  await badMeta.discover();
  await assert.rejects(badMeta.run(spec), /request:metadata/);

  const select: QuerySpec = {
    id: "corrected.default.page.select",
    sql: "SELECT 1",
    params: [],
    provenance: "generated-corrected",
  };
  let selectCalls = 0;
  const once = new DiagnosticRestClient(
    "a",
    "t",
    async () => (++selectCalls === 1 ? discovery() : queryResponse()),
    [select],
    () => 100,
    apiBase,
  );
  await once.discover();
  await once.run(select, 200);
  await assert.rejects(once.run(select, 200), /statement_contract/);
  assert.equal(selectCalls, 2);
  const expired = new DiagnosticRestClient(
    "a",
    "t",
    async () => discovery(),
    [select],
    () => 100,
    apiBase,
  );
  await expired.discover();
  await assert.rejects(expired.run(select, 100), /execution_deadline/);
});

const result = (results: Record<string, unknown>[]) => ({
  results,
  meta: { rows_read: 0, rows_written: 0, duration: 0 },
});

test("schema and plan guards fail closed and sanitized failures never echo malicious text", () => {
  const schema = new Map<string, ReturnType<typeof result>>([
    ["schema.migrations", result([{ migration_count: 7, required_migration_count: 1 }])],
    [
      "schema.objects",
      result([
        { type: "table", name: "foreclosure_records" },
        { type: "index", name: "foreclosure_property_key_idx" },
        { type: "table", name: "watchlist_properties" },
        ...[
          "property_rechecks",
          "property_sales",
          "user_alert_preferences",
          "property_qualification_overrides",
          "property_qualification_override_audit",
          "property_feedback",
          "property_feedback_audit",
          "ranking_adjustment_profile",
          "ranking_adjustment_audit",
        ].map((name) => ({ type: "table", name })),
      ]),
    ],
    [
      "schema.columns",
      result([
        ...["id", "property_key", "findings_json"].map((name) => ({
          table_name: "property_rechecks",
          name,
        })),
        ...["candidate_property_key", "identity_status"].map((name) => ({
          table_name: "property_sales",
          name,
        })),
        { table_name: "user_alert_preferences", name: "version" },
        { table_name: "property_qualification_overrides", name: "operation_token" },
        { table_name: "property_qualification_override_audit", name: "operation_token" },
        ...["reviewer_email", "data_source", "operation_token"].map((name) => ({
          table_name: "property_feedback",
          name,
        })),
        { table_name: "property_feedback_audit", name: "operation_token" },
        ...["id", "enabled", "minimum_samples", "maximum_adjustment", "operation_token"].map(
          (name) => ({ table_name: "ranking_adjustment_profile", name }),
        ),
        { table_name: "ranking_adjustment_audit", name: "operation_token" },
      ]),
    ],
    ["schema.indexes", result([{ name: "property_key", seqno: 0 }])],
    ["schema.aggregates", result([{ watchlist_count: 1, evidence_count: 2, source_count: 1 }])],
  ]);
  for (const column of schema.get("schema.columns")?.results ?? []) {
    const key = `schema.columns.${String(column["table_name"])}`;
    const group = schema.get(key) ?? result([]);
    group.results.push({ name: column["name"] });
    schema.set(key, group);
  }
  schema.delete("schema.columns");
  assert.equal(validateSchema(schema).propertyIndex, "valid");
  schema.set(
    "schema.aggregates",
    result([{ watchlist_count: "1", evidence_count: 2, source_count: 1 }]),
  );
  assert.throws(() => validateSchema(schema), /schema:schema/);
  assert.throws(() => summarizePlan([{ detail: "SCAN r secret-token" }], true), /plans:plan_guard/);
  const safe = JSON.stringify(sanitizeFailure(new Error("secret-token")));
  assert.doesNotMatch(safe, /secret|token/);
});
