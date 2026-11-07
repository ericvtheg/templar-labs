import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  type AcrisLegalRow,
  type AcrisMasterRow,
  moneyToCents,
  parseAcrisCommonChargeLiens,
  parseCsv,
  parseNorfolkTaxCsv,
  parseNorfolkViolations,
} from "../src/lib/current-parsers.ts";
import { fetchAcrisCommonChargeLiens } from "../src/lib/current-sources.ts";

const context = {
  observedAt: "2026-11-07T12:00:00.000Z",
  sourceUpdatedAt: "2026-11-06T12:27:31.000Z",
  sourceGoodThrough: "2026-10-31",
};

const validMaster: AcrisMasterRow = {
  document_id: "2026000123456789",
  doc_type: "LOCC",
  recorded_datetime: "2026-10-15T09:30:00.000",
  document_date: "2026-10-14T00:00:00.000",
  modified_date: "2026-10-16T12:00:00.000",
  good_through_date: "2026-10-31T00:00:00.000",
};
const validLegal: AcrisLegalRow = {
  document_id: "2026000123456789",
  borough: "1",
  block: "123",
  lot: "45",
  street_number: "10",
  street_name: "BROADWAY",
};

function acrisFetch(masters: readonly AcrisMasterRow[]) {
  const urls: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/api/views/")) {
      return new Response(JSON.stringify({ id: "bnx9-e6tj", rowsUpdatedAt: 1_799_000_000 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/resource/bnx9-e6tj")) {
      return new Response(JSON.stringify(masters), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/resource/8h5j-fqxa")) {
      const rows = masters.map((master, index) => ({
        ...validLegal,
        document_id: master.document_id,
        block: String(123 + index),
      }));
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetchImpl: fetchImpl as typeof fetch, urls };
}

describe("current source integrity contracts", () => {
  it("requires literal eight-digit Norfolk tax PINs and never pads malformed identifiers", async () => {
    const csv = await readFile(
      new URL("./fixtures/norfolk-current-tax.csv", import.meta.url),
      "utf8",
    );
    assert.throws(
      () => parseNorfolkTaxCsv(csv.replace(/^15834200,/m, "123,"), context),
      /invalid PIN/,
    );
    assert.throws(
      () => parseNorfolkTaxCsv(csv.replace(/^15834200,/m, ","), context),
      /invalid PIN/,
    );
    const literal = parseNorfolkTaxCsv(csv, context).find((record) => record.apn === "00000218");
    assert.ok(literal);
    assert.match(literal.rawExcerpt, /"pin":"00000218"/);
  });

  it("retains invalid Norfolk violation tax accounts as unmatched evidence", () => {
    const record = parseNorfolkViolations(
      [
        {
          violation_id: "VI-BAD-PIN",
          status: "Work in Progress",
          tax_account: "123",
          address: "1 REVIEW ST",
        },
      ],
      context,
    )[0];
    assert.ok(record);
    assert.equal(record.apn, null);
    assert.equal(record.propertyKey, "norfolk-va:unmatched:norfolk-code-violations:VI-BAD-PIN");
    assert.match(record.evidenceDetail ?? "", /Invalid literal tax account 123/);
  });

  it("rejects invalid CSV quote transitions and malformed monetary grouping", () => {
    assert.throws(() => parseCsv('a,b\n12"3"4,5'), /quote inside an unquoted field/);
    assert.throws(() => parseCsv('a,b\n"unterminated,5'), /ended inside a quoted field/);
    assert.deepEqual(parseCsv('a,b\n"line 1\nline 2","x""y"'), [{ a: "line 1\nline 2", b: 'x"y' }]);
    assert.throws(() => moneyToCents("1,2,3.00"), /Invalid source money/);
    assert.throws(() => moneyToCents("12,34.00"), /Invalid source money/);
    assert.equal(moneyToCents("1,234,567.89"), 123_456_789);
  });

  it("validates ACRIS dates and retains invalid literal BBL components as unmatched", () => {
    assert.throws(
      () =>
        parseAcrisCommonChargeLiens(
          [{ ...validMaster, recorded_datetime: "2026-99-99T00:00:00.000" }],
          [validLegal],
          context,
        ),
      /invalid recorded date/,
    );
    assert.throws(
      () =>
        parseAcrisCommonChargeLiens(
          [{ ...validMaster, modified_date: "2026-02-30T25:00:00.000" }],
          [validLegal],
          context,
        ),
      /invalid modified timestamp/,
    );
    const unmatched = parseAcrisCommonChargeLiens(
      [validMaster],
      [
        {
          ...validLegal,
          borough: "9",
          block: "",
          lot: "",
        },
      ],
      context,
    )[0];
    assert.ok(unmatched);
    assert.equal(unmatched.apn, null);
    assert.match(unmatched.propertyKey, /unmatched:acris/);
    assert.match(unmatched.evidenceDetail ?? "", /Invalid or missing literal BBL/);
  });

  it("deduplicates repeated ACRIS legal rows only when document and BBL identity are exact", () => {
    const records = parseAcrisCommonChargeLiens(
      [validMaster],
      [validLegal, { ...validLegal }],
      context,
    );
    assert.equal(records.length, 1);
    assert.equal(records[0]?.apn, "1001230045");
  });

  it("loads a rolling ACRIS event window using declared good-through coverage without snapshot removal semantics", async () => {
    const mock = acrisFetch([validMaster]);
    const result = await fetchAcrisCommonChargeLiens(
      mock.fetchImpl,
      new Date("2026-11-07T12:00:00.000Z"),
    );
    assert.equal(result.snapshotComplete, false);
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0]?.sourceGoodThrough, "2026-10-31");
    assert.match(result.warnings.join(" "), /append\/update evidence/);
    const request = mock.urls.find((url) => url.includes("/resource/bnx9-e6tj.json?"));
    assert.ok(request);
    assert.match(new URL(request).searchParams.get("$where") ?? "", /2024-11-01T00:00:00/);
  });

  it("paginates ACRIS master events beyond one 5000-row page", async () => {
    const rows = Array.from({ length: 5001 }, (_, index) => ({
      ...validMaster,
      document_id: String(2026000000000000 + index),
    }));
    const offsets: number[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/api/views/")) {
        return Response.json({ id: "bnx9-e6tj", rowsUpdatedAt: 1_799_000_000 });
      }
      if (url.pathname.includes("bnx9-e6tj")) {
        const offset = Number(url.searchParams.get("$offset") ?? 0);
        offsets.push(offset);
        return Response.json(rows.slice(offset, offset + 5000));
      }
      return Response.json([]);
    }) as typeof fetch;
    const result = await fetchAcrisCommonChargeLiens(fetchImpl, new Date(context.observedAt));
    assert.deepEqual(offsets, [0, 5000]);
    assert.equal(result.records.length, 5001);
    assert.equal(result.snapshotComplete, false);
  });

  it("preserves monthly ACRIS coverage per row and fails invalid coverage or malformed masters", async () => {
    const mixed = acrisFetch([
      validMaster,
      {
        ...validMaster,
        document_id: "2026000123456790",
        good_through_date: "2026-10-30T00:00:00.000",
      },
    ]);
    const mixedResult = await fetchAcrisCommonChargeLiens(
      mixed.fetchImpl,
      new Date("2026-11-07T12:00:00.000Z"),
    );
    assert.deepEqual(
      [...new Set(mixedResult.records.map((record) => record.sourceGoodThrough))].toSorted(),
      ["2026-10-30", "2026-10-31"],
    );
    const invalidCoverage = acrisFetch([
      { ...validMaster, good_through_date: "2026-02-30T00:00:00.000" },
    ]);
    await assert.rejects(
      fetchAcrisCommonChargeLiens(invalidCoverage.fetchImpl, new Date("2026-11-07T12:00:00.000Z")),
      /valid declared good-through date/,
    );
    const malformed = acrisFetch([{ ...validMaster, doc_type: "BOGUS" }]);
    await assert.rejects(
      fetchAcrisCommonChargeLiens(malformed.fetchImpl, new Date("2026-11-07T12:00:00.000Z")),
      /outside the requested document types/,
    );
  });
});
