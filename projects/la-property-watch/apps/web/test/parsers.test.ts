import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { canAccessResearch } from "../src/lib/access.ts";
import { dateInLosAngeles, normalizeApn, statusFor } from "../src/lib/model.ts";
import { decodeHtml, parseCnpaRss, parseTaxAuctionText } from "../src/lib/parsers.ts";

const observedAt = "2026-11-05T12:00:00.000Z";

describe("real-source foreclosure parsers", () => {
  it("parses bounded rows from the captured official TTC 2026B PDF without crossing items", async () => {
    const text = await readFile(
      new URL("./fixtures/ttc-2026b-excerpt.txt", import.meta.url),
      "utf8",
    );
    const records = parseTaxAuctionText(text, {
      auctionId: "2026B",
      documentUrl: "https://ttc.lacounty.gov/wp-content/uploads/2026/08/2026B-Auction-Book.pdf",
      observedAt,
      scheduledDate: "2026-10-17",
      scheduledTime: "15:00",
    });
    assert.equal(records.length, 12);
    assert.equal(new Set(records.map((record) => record.itemNumber)).size, 12);
    assert.deepEqual(
      records.slice(0, 3).map((record) => record.itemNumber),
      ["2388", "2390", "2391"],
    );
    assert.equal(records.at(-1)?.itemNumber, "2400");
    assert.equal(records[0]?.apn, "2024002096");
    assert.equal(records[0]?.minimumBidCents, 4_137_400);
    assert.doesNotMatch(records[0]?.rawExcerpt ?? "", /2390\s+2049-016-027/);
    assert.equal(
      records[1]?.address,
      null,
      "legal description must not be mislabeled as an address",
    );
    assert.equal(records[1]?.status, "past_outcome_unverified");
  });

  it("parses one allowed CNPA RSS fetch, deduplicates it, and rejects non-LA county evidence", async () => {
    const xml = await readFile(
      new URL("./fixtures/cnpa-la-trustee-rss.xml", import.meta.url),
      "utf8",
    );
    const result = parseCnpaRss(xml, observedAt);
    assert.equal(result.itemCount, 4);
    assert.equal(result.records.length, 3);
    assert.equal(result.rejectedCount, 1);
    const first = result.records[0];
    assert.ok(first);
    assert.equal(first.sourceKey, "Notices_1024393");
    assert.equal(first.apn, "4007017003");
    assert.equal(first.scheduledDate, "2026-11-20");
    assert.equal(first.scheduledTime, "11:00");
    assert.equal(first.unpaidBalanceCents, 35_364_970);
    assert.equal(first.trusteeName, "Superior Loan Servicing");
    assert.equal(first.saleVerificationPhone, "(714) 730-2727");
    assert.doesNotMatch(first.rawExcerpt, /homeowner phone/i);
    assert.match(first.sourceUrl, /^https:\/\/www\.capublicnotice\.com\/advert\/-Notices_/);
  });

  it("rejects impossible calendar days without discarding the notice", async () => {
    const xml = await readFile(
      new URL("./fixtures/cnpa-la-trustee-rss.xml", import.meta.url),
      "utf8",
    );
    const malformed = xml.replace("Date of Sale: 11/20/2026", "Date of Sale: 02/31/2027");
    const record = parseCnpaRss(malformed, observedAt).records.find(
      (candidate) => candidate.sourceKey === "Notices_1024393",
    );
    assert.ok(record);
    assert.equal(record.scheduledDate, null);
    assert.equal(record.scheduledTime, null);
    assert.equal(record.status, "date_not_found");
  });

  it("contains invalid numeric entities to one replacement character and preserves the feed", async () => {
    const xml = await readFile(
      new URL("./fixtures/cnpa-la-trustee-rss.xml", import.meta.url),
      "utf8",
    );
    const malformed = xml.replace("Loan No.: ODLG051324", "Loan No.: ODLG051324 &#x110000;");
    const result = parseCnpaRss(malformed, observedAt);
    assert.equal(result.records.length, 3);
    assert.equal(result.rejectedCount, 1);
    assert.equal(decodeHtml("before &#x110000; after"), "before \uFFFD after");
  });
});

describe("date, parcel, and access invariants", () => {
  it("compares scheduled dates against the Los Angeles observation date", () => {
    assert.equal(dateInLosAngeles("2026-11-05T07:30:00.000Z"), "2026-11-04");
    assert.equal(statusFor("2026-11-04", "2026-11-05T07:30:00.000Z"), "scheduled_as_published");
    assert.equal(statusFor("2026-11-03", "2026-11-05T07:30:00.000Z"), "past_outcome_unverified");
    assert.equal(statusFor(null, observedAt), "date_not_found");
    assert.equal(statusFor("2027-02-31", observedAt), "date_not_found");
  });

  it("accepts only a complete ten-digit LA AIN and never repairs malformed values", () => {
    assert.equal(normalizeApn("4007-017-003"), "4007017003");
    assert.equal(normalizeApn("4007017003"), "4007017003");
    assert.equal(normalizeApn("1076-091-38-0-000"), null);
    assert.equal(normalizeApn("APN 4007-017-003"), null);
    assert.equal(normalizeApn("4007-017-00x"), null);
  });

  it("allows only the exact verified account without an admin override", () => {
    assert.equal(canAccessResearch({ email: "ERICVENTOR97@gmail.com", emailVerified: true }), true);
    assert.equal(
      canAccessResearch({ email: "ericventor97@gmail.com", emailVerified: false }),
      false,
    );
    assert.equal(canAccessResearch({ email: "other@example.com", emailVerified: true }), false);
  });
});
