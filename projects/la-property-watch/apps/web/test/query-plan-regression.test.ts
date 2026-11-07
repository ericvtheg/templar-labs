import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captureDashboardQueries,
  type RankingProfile,
  statementMetrics,
  summarizePlan,
} from "../../../scripts/diagnose-production-queries.ts";
import { loadDashboard } from "../src/lib/repository.ts";
import { testDatabase } from "./support/d1.ts";

const profile: RankingProfile = { enabled: 1, minimum_samples: 5, maximum_adjustment: 10 };
const normalizeGeneratedAt = (sql: string | undefined) =>
  sql?.replace(/<'\d{4}-\d\d-\d\dT[^']+Z'/g, "<'<generated-cutoff>'");

test("generated dashboard plans keep every correlated foreclosure access on property_key", async () => {
  const database = testDatabase();
  try {
    database.sqlite
      .prepare(
        "INSERT INTO ranking_adjustment_profile (id,enabled,minimum_samples,maximum_adjustment,reason,version,updated_at,updated_by) VALUES ('shared',?,?,?,?,1,'2026-01-01','test')",
      )
      .run(profile.enabled, profile.minimum_samples, profile.maximum_adjustment, "test");

    const generated = await captureDashboardQueries(profile);
    for (const [id, query] of generated.queries) {
      const metrics = statementMetrics(query);
      assert.ok(metrics.bytes <= 100_000, `${id} exceeded D1 SQL bytes`);
      assert.ok(metrics.binds <= 100, `${id} exceeded D1 bind count`);
      const qualification = query.sql.includes("qualification_status");
      const rows = database.sqlite
        .prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
        .all(...query.params) as Record<string, unknown>[];
      const summary = summarizePlan(rows, qualification);
      assert.equal(summary.rejectedPaths, 0, id);
      assert.equal(
        query.sql.split(" INDEXED BY foreclosure_property_key_idx").length - 1,
        qualification ? 3 : 0,
        `${id} must retain exactly the supported-boundary hints`,
      );
    }

    const observed: Array<{ sql: string; params: unknown[]; method: string }> = [];
    const binding = {
      prepare(sql: string) {
        let params: unknown[] = [];
        const statement = database.binding.prepare(sql);
        return {
          bind(...values: unknown[]) {
            params = values;
            statement.bind(...values);
            return this;
          },
          first() {
            observed.push({ sql, params, method: "first" });
            return statement.first();
          },
          all() {
            observed.push({ sql, params, method: "all" });
            return statement.all();
          },
        };
      },
    } as unknown as D1Database;
    await loadDashboard(binding, { qualification: "qualified" });
    const realCount = observed.find((row) =>
      row.sql.includes("SELECT COUNT(*) AS total FROM qualified"),
    );
    const realPage = observed.find(
      (row) => row.sql.startsWith("WITH qualified AS MATERIALIZED") && row.method === "all",
    );

    assert.equal(
      normalizeGeneratedAt(realCount?.sql),
      normalizeGeneratedAt(generated.queries.get("qualification.count")?.sql),
    );
    assert.deepEqual(
      Array.from(realCount?.params ?? []),
      generated.queries.get("qualification.count")?.params,
    );
    assert.equal(
      normalizeGeneratedAt(realPage?.sql),
      normalizeGeneratedAt(generated.queries.get("qualification.page")?.sql),
    );
    assert.deepEqual(
      Array.from(realPage?.params ?? []),
      generated.queries.get("qualification.page")?.params,
    );
  } finally {
    database.close();
  }
});
