import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  moneyToCents,
  type NorfolkViolationRow,
  parseDenverForeclosures,
  parseNorfolkTaxCsv,
  parseNorfolkViolations,
  parseTravisTaxCsv,
} from "../src/lib/current-parsers.ts";
import { parseDenverSearchPage } from "../src/lib/denver-source.ts";

const context = {
  observedAt: "2026-11-07T12:00:00.000Z",
  sourceUpdatedAt: "2026-11-06T12:27:31.000Z",
};

describe("current official source parsers", () => {
  it("uses Travis situs fields, 14-character account identity, and exact integer cents", async () => {
    const csv = await readFile(
      new URL("./fixtures/travis-current-tax.csv", import.meta.url),
      "utf8",
    );
    const parsed = parseTravisTaxCsv(csv, context);
    assert.equal(parsed.records.length, 4);
    assert.equal(parsed.excludedNonRealEstate, 0);
    const record = parsed.records[1];
    assert.ok(record);
    assert.equal(record.apn, "01000317030000");
    assert.equal(record.propertyKey, "travis-county-tx:01000317030000");
    assert.equal(record.address, "915 GIBSON ST W");
    assert.equal(record.city, null);
    assert.equal(record.zip, "78704");
    assert.equal(record.ownerName, "JOSEPH GABRIEL");
    assert.equal(record.delinquentAmountCents, 4_486_364);
    assert.equal(record.sourceUpdatedAt, context.sourceUpdatedAt);
    assert.equal(record.snapshotPresence, "present");
  });

  it("keeps Norfolk installments as exact evidence without multiplying properties", async () => {
    const csv = await readFile(
      new URL("./fixtures/norfolk-current-tax.csv", import.meta.url),
      "utf8",
    );
    const records = parseNorfolkTaxCsv(csv, context);
    assert.equal(records.length, 6);
    assert.equal(new Set(records.map((record) => record.sourceKey)).size, 6);
    const joined = records.filter((record) => record.apn === "15834200");
    assert.equal(joined.length, 2);
    assert.equal(
      joined.reduce((sum, record) => sum + (record.delinquentAmountCents ?? 0), 0),
      120_071,
    );
    assert.deepEqual(
      joined.map((record) => [
        record.taxYear,
        record.taxInstallment,
        record.taxDueCents,
        record.penaltyDueCents,
        record.interestDueCents,
        record.delinquentAmountCents,
      ]),
      [
        [2025, 4, 27_226, 0, 0, 27_226],
        [2026, 1, 83_394, 8_339, 1_112, 92_845],
      ],
    );
    assert.equal(new Set(joined.map((record) => record.propertyKey)).size, 1);
  });

  it("joins open Norfolk violations only by the exact tax account key", async () => {
    const payload = JSON.parse(
      await readFile(new URL("./fixtures/norfolk-current-violation.json", import.meta.url), "utf8"),
    ) as NorfolkViolationRow[];
    const records = parseNorfolkViolations(payload, context);
    assert.equal(records.length, 1);
    const record = records[0];
    assert.ok(record);
    assert.equal(record.sourceRecordId, "VI-0168795");
    assert.equal(record.apn, "15834200");
    assert.equal(record.propertyKey, "norfolk-va:15834200");
    assert.equal(record.address, "2800 VIMY RIDGE AVENUE");
    assert.equal(record.evidenceStatus, "Work in Progress");
    assert.equal(record.eventDate, "2026-01-05");
    assert.equal(record.evidenceUpdatedAt, "2026-11-05T21:58:23.000");
    assert.match(record.evidenceDetail ?? "", /103\.2\.3 Responsibility/);
  });

  it("maps Denver NED rows as foreclosure initiation and keeps principal separate", async () => {
    const html = await readFile(
      new URL("./fixtures/denver-search-page-1.html", import.meta.url),
      "utf8",
    );
    const parsed = parseDenverSearchPage(html, context.observedAt).records;
    const records = parseDenverForeclosures(parsed, context);
    const record = records[0];
    assert.ok(record);
    assert.equal(record.signalType, "mortgage_foreclosure_initiated");
    assert.equal(record.propertyKey, "denver-co:unmatched:public-trustee:2026-000649");
    assert.equal(record.principalBalanceCents, 36_227_742);
    assert.equal(record.unpaidBalanceCents, null);
    assert.equal(record.delinquentAmountCents, null);
    assert.equal(record.scheduledDate, "2027-03-04");
    assert.equal(record.evidenceStatus, "NED Recorded");
    assert.equal(record.priority, 1);
    assert.match(record.evidenceDetail ?? "", /not arrears/);
    const withdrawn = parseDenverForeclosures(
      [{ ...parsed[0]!, rawStatus: "Withdrawn (Cured)" }],
      context,
    )[0];
    assert.equal(withdrawn?.priority, 0);
  });

  it("rejects ambiguous or imprecise money fields", () => {
    assert.equal(moneyToCents("20137.9"), 2_013_790);
    assert.equal(moneyToCents("$44,863.64"), 4_486_364);
    assert.throws(() => moneyToCents("12.345"), /Invalid source money/);
    assert.throws(() => moneyToCents("NaN"), /Invalid source money/);
  });
});
