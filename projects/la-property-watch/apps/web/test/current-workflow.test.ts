import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  type NorfolkViolationRow,
  parseNorfolkTaxCsv,
  parseNorfolkViolations,
} from "../src/lib/current-parsers.ts";
import {
  loadDashboard,
  loadPropertyDetail,
  rebuildWatchlist,
  refreshSources,
  requestRefreshJob,
  runRefreshJob,
} from "../src/lib/repository.ts";
import { testDatabase } from "./support/d1.ts";

const context = {
  observedAt: "2026-11-07T12:00:00.000Z",
  sourceUpdatedAt: "2026-11-06T12:27:31.000Z",
};
describe("current ranked property workflow", () => {
  let database: ReturnType<typeof testDatabase>;
  beforeEach(() => {
    database = testDatabase();
  });
  afterEach(() => database.close());
  it("groups exact evidence, explains ranking, filters, and returns detail", async () => {
    const tax = parseNorfolkTaxCsv(
      await readFile(new URL("./fixtures/norfolk-current-tax.csv", import.meta.url), "utf8"),
      context,
    );
    const raw = JSON.parse(
      await readFile(new URL("./fixtures/norfolk-current-violation.json", import.meta.url), "utf8"),
    ) as NorfolkViolationRow[];
    const violations = parseNorfolkViolations(raw, context);
    const job = await requestRefreshJob(
      database.binding,
      "bootstrap",
      new Date(context.observedAt),
    );
    const make = (id: string, records: typeof tax) => ({
      id,
      name: id,
      url: "https://data.norfolk.gov/",
      load: async () => ({
        sourceId: id,
        sourceName: id,
        sourceUrl: "https://data.norfolk.gov/",
        records,
        warnings: [],
        sourceUpdatedAt: context.sourceUpdatedAt,
        snapshotComplete: true,
      }),
    });
    await runRefreshJob(database.binding, job.job.id, "bootstrap", [
      make("norfolk-delinquent-property-tax", tax),
      make("norfolk-code-violations", violations),
    ]);
    const dashboard = await loadDashboard(database.binding);
    assert.equal(dashboard.page.total, 2);
    const property = dashboard.properties.find((entry) => entry.parcelId === "15834200");
    assert.ok(property);
    assert.deepEqual(
      [property.taxInstallmentCount, property.codeViolationCount, property.evidenceCount],
      [2, 1, 3],
    );
    assert.equal(property.totalDelinquentCents, 120_071);
    assert.equal(property.score, 75);
    assert.match(property.scoreReasons.join(" "), /two independent signal types/);
    assert.doesNotMatch(property.scoreReasons.join(" "), /probability/i);
    const filtered = await loadDashboard(database.binding, {
      query: "Vimy Ridge",
      jurisdiction: "norfolk-va",
      signalType: "code_violation",
    });
    assert.equal(filtered.page.total, 1);
    const detail = await loadPropertyDetail(database.binding, property.propertyKey);
    assert.ok(detail);
    assert.equal(detail.evidenceTotal, 3);
    assert.deepEqual(detail.evidence.map((entry) => entry.signalType).toSorted(), [
      "code_violation",
      "tax_delinquency",
      "tax_delinquency",
    ]);
  });
  it("reconciles only complete success and preserves evidence on failure", async () => {
    const tax = parseNorfolkTaxCsv(
      await readFile(new URL("./fixtures/norfolk-current-tax.csv", import.meta.url), "utf8"),
      context,
    ).filter((record) => record.apn === "15834200");
    const job = await requestRefreshJob(
      database.binding,
      "bootstrap",
      new Date(context.observedAt),
    );
    const source = (records: typeof tax) => ({
      id: "norfolk-delinquent-property-tax",
      name: "Norfolk tax",
      url: "https://data.norfolk.gov/",
      load: async () => ({
        sourceId: "norfolk-delinquent-property-tax",
        sourceName: "Norfolk tax",
        sourceUrl: "https://data.norfolk.gov/",
        records,
        warnings: [],
        sourceUpdatedAt: context.sourceUpdatedAt,
        snapshotComplete: true,
      }),
    });
    await runRefreshJob(database.binding, job.job.id, "bootstrap", [source(tax)]);
    await refreshSources(database.binding, "manual", job.job.id, [source([tax[1]!])]);
    await rebuildWatchlist(database.binding, "2026-11-07T13:00:00.000Z");
    const readStates = () =>
      database.sqlite
        .prepare(
          "SELECT source_key, snapshot_presence FROM foreclosure_records ORDER BY source_key",
        )
        .all();
    assert.deepEqual(
      readStates().map((row) => row["snapshot_presence"]),
      ["no_longer_present", "present"],
    );
    const before = readStates();
    const failed = await refreshSources(database.binding, "manual", job.job.id, [
      {
        id: "norfolk-delinquent-property-tax",
        name: "Norfolk tax",
        url: "https://data.norfolk.gov/",
        load: async () => {
          throw new Error("publisher unavailable");
        },
      },
    ]);
    assert.equal(failed.ok, false);
    assert.deepEqual(readStates(), before);
  });
});
