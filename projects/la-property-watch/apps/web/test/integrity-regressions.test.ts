import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, it } from "node:test";
import { parseNorfolkTaxCsv } from "../src/lib/current-parsers.ts";
import type { ResearchRecord } from "../src/lib/model.ts";
import {
  currentEvidenceCsv,
  loadDashboard,
  loadPropertyDetail,
  rebuildWatchlist,
  refreshSources,
  requestRefreshJob,
  upsertRecords,
} from "../src/lib/repository.ts";
import { testDatabase } from "./support/d1.ts";

const observedAt = "2026-11-07T12:00:00.000Z";
const sourceUpdatedAt = "2026-11-06T12:27:31.000Z";

async function baseRecord(): Promise<ResearchRecord> {
  const csv = await readFile(
    new URL("./fixtures/norfolk-current-tax.csv", import.meta.url),
    "utf8",
  );
  const record = parseNorfolkTaxCsv(csv, { observedAt, sourceUpdatedAt })[0];
  if (!record) {
    throw new Error("Norfolk fixture did not contain a base record.");
  }
  return record;
}

function cloneRecord(
  base: ResearchRecord,
  index: number,
  overrides: Partial<ResearchRecord> = {},
): ResearchRecord {
  const parcel = String(10_000_000 + index);
  return {
    ...base,
    id: `integrity-${index}`,
    sourceRecordId: `integrity-${index}`,
    sourceKey: `integrity-${index}`,
    apn: parcel,
    propertyKey: `norfolk-va:${parcel}`,
    address: `${index} INTEGRITY AV`,
    ...overrides,
  };
}

function source(records: readonly ResearchRecord[]) {
  return {
    id: "norfolk-delinquent-property-tax",
    name: "Norfolk tax",
    url: "https://data.norfolk.gov/",
    load: async () => ({
      sourceId: "norfolk-delinquent-property-tax",
      sourceName: "Norfolk tax",
      sourceUrl: "https://data.norfolk.gov/",
      records,
      warnings: [],
      sourceUpdatedAt,
      snapshotComplete: true,
    }),
  };
}

function exportRow(index: number, overrides: Record<string, unknown> = {}) {
  const id = `id-${String(index).padStart(6, "0")}`;
  return {
    property_key: "norfolk-va:12345678",
    jurisdiction_id: "norfolk-va",
    jurisdiction_name: "Norfolk, VA",
    parcel_id: "12345678",
    address: "1 SAFE ST",
    city: "Norfolk",
    state: "VA",
    zip: null,
    owner_name: null,
    property_type: "Real estate",
    score: 25,
    signal_types: "tax_delinquency",
    independent_signal_count: 1,
    evidence_count: 1,
    tax_installment_count: 1,
    code_violation_count: 0,
    recorded_lien_count: 0,
    total_delinquent_cents: 100,
    earliest_tax_year: null,
    freshest_source_updated_at: sourceUpdatedAt,
    first_seen_at: observedAt,
    last_seen_at: observedAt,
    source_names: "Official source",
    ranked_at: observedAt,
    r_id: id,
    r_signal_type: "tax_delinquency",
    r_evidence_status: "Current",
    r_evidence_detail: null,
    r_snapshot_presence: "present",
    r_source_record_id: id,
    r_tax_year: null,
    r_tax_installment: null,
    r_tax_due_cents: 100,
    r_penalty_due_cents: 0,
    r_interest_due_cents: 0,
    r_delinquent_amount_cents: 100,
    r_principal_balance_cents: null,
    r_principal_as_of_date: null,
    r_event_date: null,
    r_evidence_updated_at: sourceUpdatedAt,
    r_source_updated_at: sourceUpdatedAt,
    r_source_good_through: null,
    r_first_seen_at: observedAt,
    r_last_seen_at: observedAt,
    r_source_name: "Official source",
    r_source_url: "https://example.test/source",
    ...overrides,
  };
}

function exportDatabase(
  total: number,
  finalGeneration = observedAt,
  rowOverrides: Record<string, unknown> = {},
): D1Database {
  let stateReads = 0;
  return {
    prepare(sql: string) {
      let parameters: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          parameters = values;
          return this;
        },
        first() {
          stateReads += 1;
          return Promise.resolve({
            generation: stateReads === 1 ? observedAt : finalGeneration,
            total,
          });
        },
        all() {
          if (!/ORDER BY r\.id LIMIT 1000/.test(sql)) {
            throw new Error("Unexpected export query.");
          }
          const lastId = String(parameters[1] ?? "");
          const start = lastId ? Number(lastId.slice(3)) + 1 : 1;
          const end = Math.min(total, start + 999);
          const results =
            start > total
              ? []
              : Array.from({ length: end - start + 1 }, (_, offset) =>
                  exportRow(start + offset, rowOverrides),
                );
          return Promise.resolve({ results, success: true, meta: {} });
        },
      } as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

describe("repository integrity regressions", () => {
  let database: ReturnType<typeof testDatabase>;
  beforeEach(() => {
    database = testDatabase();
  });
  afterEach(() => database.close());

  it("does not publish any evidence, membership, or rank changes when staging batch two fails", async () => {
    const base = await baseRecord();
    const initial = Array.from({ length: 101 }, (_, index) => cloneRecord(base, index + 1));
    const job = await requestRefreshJob(database.binding, "bootstrap", new Date(observedAt));
    const first = await refreshSources(database.binding, "bootstrap", job.job.id, [
      source(initial),
    ]);
    assert.equal(first.ok, true);
    const beforeRecords = database.sqlite
      .prepare(
        "SELECT id,property_key,delinquent_amount_cents,snapshot_presence FROM foreclosure_records ORDER BY id",
      )
      .all();
    const beforeWatchlist = database.sqlite
      .prepare(
        "SELECT property_key,score,total_delinquent_cents,ranked_at FROM watchlist_properties ORDER BY property_key",
      )
      .all();

    const changed = Array.from({ length: 102 }, (_, index) =>
      cloneRecord(base, index + 1, {
        delinquentAmountCents: 999_999,
        taxDueCents: 999_999,
        penaltyDueCents: 0,
        interestDueCents: 0,
      }),
    );
    let batchCalls = 0;
    const faultDb = {
      prepare: database.binding.prepare.bind(database.binding),
      batch(statements: D1PreparedStatement[]) {
        batchCalls += 1;
        if (batchCalls === 2) {
          return Promise.reject(new Error("injected staging batch failure"));
        }
        return database.binding.batch(statements);
      },
    } as unknown as D1Database;
    const failed = await refreshSources(faultDb, "manual", job.job.id, [source(changed)]);
    assert.equal(failed.ok, false);
    assert.deepEqual(
      database.sqlite
        .prepare(
          "SELECT id,property_key,delinquent_amount_cents,snapshot_presence FROM foreclosure_records ORDER BY id",
        )
        .all(),
      beforeRecords,
    );
    assert.deepEqual(
      database.sqlite
        .prepare(
          "SELECT property_key,score,total_delinquent_cents,ranked_at FROM watchlist_properties ORDER BY property_key",
        )
        .all(),
      beforeWatchlist,
    );
    assert.equal(
      database.sqlite.prepare("SELECT COUNT(*) total FROM foreclosure_record_staging").get()?.[
        "total"
      ],
      0,
    );
  });

  it("exports 100001 unique evidence rows without truncation", async () => {
    const csv = await currentEvidenceCsv(exportDatabase(100_001));
    const lines = csv.split("\n");
    assert.equal(lines.length, 100_002);
    assert.match(lines[1] ?? "", /id-000001/);
    assert.match(lines.at(-1) ?? "", /id-100001/);
    assert.equal(new Set(lines.slice(1).map((line) => line.match(/id-\d{6}/)?.[0])).size, 100_001);
  });

  it("rejects an export if the published ranking generation changes between pages", async () => {
    await assert.rejects(
      currentEvidenceCsv(exportDatabase(1_001, "2026-11-07T12:01:00.000Z")),
      /Evidence changed during export/,
    );
  });

  it("neutralizes spreadsheet formulas after leading controls and preserves CSV quotes and newlines", async () => {
    for (const value of ["=1+1", "\t+2+2", ' \n@SUM("A1")', "-10+20"]) {
      const csv = await currentEvidenceCsv(
        exportDatabase(1, observedAt, {
          address: value,
          r_evidence_detail: value,
        }),
      );
      assert.ok(csv.includes(`"${String.fromCharCode(39)}${value.replaceAll('"', '""')}"`));
      assert.ok(!csv.includes(`"${value.replaceAll('"', '""')}"`));
    }
  });

  it("returns present evidence first with deterministic continuation and retains fully removed history", async () => {
    const base = await baseRecord();
    const propertyKey = "norfolk-va:87654321";
    const records = Array.from({ length: 502 }, (_, index) =>
      cloneRecord(base, index + 1, {
        propertyKey,
        apn: "87654321",
      }),
    );
    await upsertRecords(database.binding, records);
    database.sqlite
      .prepare("UPDATE foreclosure_records SET snapshot_presence=? WHERE id<>?")
      .run("no_longer_present", "integrity-502");
    await rebuildWatchlist(database.binding, observedAt);

    const first = await loadPropertyDetail(database.binding, propertyKey, 1, 500);
    assert.ok(first);
    assert.equal(first.evidenceTotal, 502);
    assert.equal(first.evidence[0]?.snapshotPresence, "present");
    assert.equal(first.evidencePage.totalPages, 2);
    assert.equal(first.truncated, true);
    const second = await loadPropertyDetail(database.binding, propertyKey, 2, 500);
    assert.ok(second);
    assert.equal(second.evidence.length, 2);

    database.sqlite
      .prepare("UPDATE foreclosure_records SET snapshot_presence=? WHERE property_key=?")
      .run("no_longer_present", propertyKey);
    await rebuildWatchlist(database.binding, "2026-11-07T13:00:00.000Z");
    const history = await loadPropertyDetail(database.binding, propertyKey, 1, 500);
    assert.ok(history);
    assert.equal(history.property.score, 0);
    assert.match(history.property.scoreReasons.join(" "), /retained evidence history only/);
  });

  it("does not let publication freshness change distress strength", async () => {
    const base = await baseRecord();
    const rankedAt = "2026-11-07T12:00:00.000Z";
    const cases = [
      ["2026-11-05T12:00:00.000Z", 40],
      ["2026-11-05T11:59:59.999Z", 40],
      ["2026-10-31T12:00:00.000Z", 40],
      ["2026-10-31T11:59:59.999Z", 40],
      ["2026-10-08T12:00:00.000Z", 40],
      ["2026-10-08T11:59:59.999Z", 40],
    ] as const;
    for (const [updatedAt, score] of cases) {
      await upsertRecords(database.binding, [
        cloneRecord(base, 1, {
          sourceUpdatedAt: updatedAt,
          taxYear: null,
          delinquentAmountCents: 100,
          taxDueCents: 100,
        }),
      ]);
      await rebuildWatchlist(database.binding, rankedAt);
      const property = (await loadDashboard(database.binding)).properties[0];
      assert.ok(property);
      assert.equal(property.score, score);
      assert.doesNotMatch(property.scoreReasons.join(" "), /supporting source updated within/);
      const laterRead = (await loadDashboard(database.binding)).properties[0];
      assert.deepEqual(laterRead?.scoreReasons, property.scoreReasons);
    }
  });

  it("treats percent and underscore as literal search characters", async () => {
    const base = await baseRecord();
    await upsertRecords(database.binding, [
      cloneRecord(base, 1, { address: "100% REAL ST" }),
      cloneRecord(base, 2, { address: "100X REAL ST" }),
      cloneRecord(base, 3, { address: "A_B AV" }),
      cloneRecord(base, 4, { address: "AXB AV" }),
    ]);
    await rebuildWatchlist(database.binding, observedAt);
    const percent = await loadDashboard(database.binding, { query: "%" });
    assert.deepEqual(
      percent.properties.map((property) => property.address),
      ["100% REAL ST"],
    );
    const underscore = await loadDashboard(database.binding, { query: "_" });
    assert.deepEqual(
      underscore.properties.map((property) => property.address),
      ["A_B AV"],
    );
  });
});
