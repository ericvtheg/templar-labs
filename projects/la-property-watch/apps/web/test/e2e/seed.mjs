import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  parseCnpaRss,
  parseOrangeCountyPowerToSellText,
  parseOrangeCountyThreeYearDelinquencyText,
  parseTaxAuctionText,
} from "../../src/lib/parsers.ts";

const observedAt = "2026-11-05T12:00:00.000Z";
const taxText = await readFile(
  new URL("../fixtures/ttc-2026b-excerpt.txt", import.meta.url),
  "utf8",
);
const rss = await readFile(new URL("../fixtures/cnpa-la-trustee-rss.xml", import.meta.url), "utf8");
const threeYearText = await readFile(
  new URL("../fixtures/orange-county-three-year-delinquency-2026.txt", import.meta.url),
  "utf8",
);
const powerToSellText = await readFile(
  new URL("../fixtures/orange-county-power-to-sell-2026.txt", import.meta.url),
  "utf8",
);
const tax = parseTaxAuctionText(taxText, {
  auctionId: "2026B",
  documentUrl: "https://ttc.lacounty.gov/wp-content/uploads/2026/08/2026B-Auction-Book.pdf",
  observedAt,
  scheduledDate: "2026-10-17",
  scheduledTime: "15:00",
}).slice(0, 8);
const trustee = parseCnpaRss(rss, observedAt).records;
const threeYear = parseOrangeCountyThreeYearDelinquencyText(threeYearText, {
  documentUrl:
    "https://www.octreasurer.gov/sites/ttc/files/2026-09/Property%20TaxDefault%20List%202026.pdf",
  observedAt,
  sourceAsOfDate: "2026-09-30",
  publicationDate: "2026-09-07",
});
const powerToSell = parseOrangeCountyPowerToSellText(powerToSellText, {
  documentUrl:
    "https://www.octreasurer.gov/sites/ttc/files/2026-09/PTS-List-Published-June2026.pdf",
  observedAt,
});
const records = [...threeYear, ...powerToSell, ...tax, ...trustee];
const literal = (value) =>
  value === null || value === undefined
    ? "NULL"
    : typeof value === "number"
      ? String(value)
      : `'${String(value).replaceAll("'", "''")}'`;
const recordValues = (record) =>
  [
    record.id,
    record.saleType,
    record.signalType,
    record.jurisdictionId,
    record.jurisdictionName,
    record.sourceRecordId,
    record.sourceKey,
    record.sourceId,
    record.sourceName,
    record.sourceUrl,
    record.sourceDocumentUrl,
    record.sourcePublishedAt,
    record.sourceAsOfDate,
    record.observedAt,
    record.eventDate,
    record.scheduledDate,
    record.scheduledTime,
    record.status,
    record.apn,
    record.address,
    record.city,
    record.state,
    record.zip,
    record.assessorAddress,
    record.assessorCity,
    record.assessorState,
    record.assessorZip,
    record.assessorObservedAt,
    record.assessorSourceUrl,
    record.itemNumber,
    record.minimumBidCents,
    record.delinquentAmountCents,
    record.unpaidBalanceCents,
    record.trusteeSaleNumber,
    record.trusteeName,
    record.saleVerificationPhone,
    record.salePlace,
    record.legalDescription,
    record.rawExcerpt,
    record.firstSeenAt,
    record.lastSeenAt,
    record.updatedAt,
  ]
    .map(literal)
    .join(",");
const sql = `
DELETE FROM ingestion_runs;
DELETE FROM refresh_jobs;
DELETE FROM foreclosure_records;
INSERT INTO refresh_jobs (id, trigger, status, requested_at, started_at, finished_at)
VALUES ('e2e-refresh', 'bootstrap', 'success', '${observedAt}', '${observedAt}', '${observedAt}');
INSERT INTO ingestion_runs (id, refresh_job_id, source_id, source_name, source_url, trigger, status, started_at, finished_at, records_found, records_upserted)
VALUES
('e2e-three-year', 'e2e-refresh', 'oc-three-year-tax-delinquency', 'Orange County Treasurer-Tax Collector · Three-Year Delinquency', 'https://www.octreasurer.gov/PublishedNotices', 'bootstrap', 'partial', '${observedAt}', '${observedAt}', ${threeYear.length}, ${threeYear.length}),
('e2e-power', 'e2e-refresh', 'oc-impending-power-to-sell', 'Orange County Treasurer-Tax Collector · Impending Power to Sell', 'https://www.octreasurer.gov/PublishedNotices', 'bootstrap', 'partial', '${observedAt}', '${observedAt}', ${powerToSell.length}, ${powerToSell.length}),
('e2e-tax', 'e2e-refresh', 'la-ttc-tax-auction', 'LA County Treasurer and Tax Collector', 'https://ttc.lacounty.gov/schedule-of-upcoming-auctions/', 'bootstrap', 'success', '${observedAt}', '${observedAt}', ${tax.length}, ${tax.length}),
('e2e-trustee', 'e2e-refresh', 'cnpa-trustee-notices', 'CNPA Public Notices', 'https://www.capublicnotice.com/category/legals/notice-of-trustee-sale', 'bootstrap', 'partial', '${observedAt}', '${observedAt}', ${trustee.length}, ${trustee.length});
${records
  .map(
    (record) => `INSERT INTO foreclosure_records (
 id, sale_type, signal_type, jurisdiction_id, jurisdiction_name, source_record_id,
 source_key, source_id, source_name, source_url, source_document_url, source_published_at,
 source_as_of_date, observed_at, event_date, scheduled_date, scheduled_time, status, apn,
 address, city, state, zip, assessor_address, assessor_city, assessor_state, assessor_zip,
 assessor_observed_at, assessor_source_url, item_number, minimum_bid_cents,
 delinquent_amount_cents, unpaid_balance_cents, trustee_sale_number, trustee_name,
 sale_verification_phone, sale_place, legal_description, raw_excerpt, first_seen_at,
 last_seen_at, updated_at
) VALUES (${recordValues(record)});`,
  )
  .join("\n")}
`;
const seedDirectory = new URL("../.results/", import.meta.url);
await mkdir(seedDirectory, { recursive: true });
const seedFile = new URL("e2e-seed.sql", seedDirectory);
await writeFile(seedFile, sql);
execFileSync(
  "pnpm",
  [
    "exec",
    "wrangler",
    "d1",
    "execute",
    "la-property-watch-local",
    "--local",
    "--file",
    fileURLToPath(seedFile),
  ],
  { cwd: new URL("../../", import.meta.url), stdio: "inherit" },
);
