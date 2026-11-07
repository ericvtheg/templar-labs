import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseNorfolkTaxCsv, parseNorfolkViolations } from "../../src/lib/current-parsers.ts";

const observedAt = "2026-11-07T12:00:00.000Z";
const sourceUpdatedAt = "2026-11-06T12:27:31.000Z";
const taxCsv = await readFile(
  new URL("../fixtures/norfolk-current-tax.csv", import.meta.url),
  "utf8",
);
const violationJson = JSON.parse(
  await readFile(new URL("../fixtures/norfolk-current-violation.json", import.meta.url), "utf8"),
);
const context = { observedAt, sourceUpdatedAt };
const tax = parseNorfolkTaxCsv(taxCsv, context);
const violations = parseNorfolkViolations(violationJson, context);
const liveViolation = violations[0];
if (!liveViolation) {
  throw new Error("The Norfolk violation fixture was empty.");
}
const history = Array.from({ length: 55 }, (_, index) => ({
  ...liveViolation,
  id: `e2e-history-${String(index + 1).padStart(2, "0")}`,
  sourceRecordId: `E2E-HISTORY-${index + 1}`,
  sourceKey: `E2E-HISTORY-${index + 1}`,
  snapshotPresence: "no_longer_present",
  noLongerPresentAt: "2026-11-06T13:00:00.000Z",
  evidenceStatus: "Retained historical workflow record",
}));
const records = [...tax, ...violations, ...history];
const quote = String.fromCharCode(39);
const literal = (value) => {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return `${quote}${String(value).replaceAll(quote, quote + quote)}${quote}`;
};
const columns = [
  "id",
  "sale_type",
  "signal_type",
  "jurisdiction_id",
  "jurisdiction_name",
  "source_record_id",
  "source_key",
  "source_id",
  "source_name",
  "source_url",
  "source_document_url",
  "source_published_at",
  "source_as_of_date",
  "source_updated_at",
  "source_good_through",
  "source_kind",
  "snapshot_presence",
  "snapshot_id",
  "no_longer_present_at",
  "observed_at",
  "event_date",
  "scheduled_date",
  "scheduled_time",
  "status",
  "apn",
  "property_key",
  "address",
  "city",
  "state",
  "zip",
  "assessor_address",
  "assessor_city",
  "assessor_state",
  "assessor_zip",
  "assessor_observed_at",
  "assessor_source_url",
  "item_number",
  "minimum_bid_cents",
  "delinquent_amount_cents",
  "unpaid_balance_cents",
  "principal_balance_cents",
  "principal_as_of_date",
  "trustee_sale_number",
  "trustee_name",
  "sale_verification_phone",
  "sale_place",
  "legal_description",
  "owner_name",
  "property_type",
  "tax_year",
  "tax_installment",
  "tax_due_cents",
  "penalty_due_cents",
  "interest_due_cents",
  "evidence_status",
  "evidence_detail",
  "evidence_updated_at",
  "priority",
  "raw_excerpt",
  "first_seen_at",
  "last_seen_at",
  "updated_at",
];
const values = (record) => [
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
  record.sourceUpdatedAt,
  record.sourceGoodThrough,
  record.sourceKind,
  record.snapshotPresence,
  "e2e-snapshot",
  record.noLongerPresentAt,
  record.observedAt,
  record.eventDate,
  record.scheduledDate,
  record.scheduledTime,
  record.status,
  record.apn,
  record.propertyKey,
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
  record.principalBalanceCents,
  record.principalAsOfDate,
  record.trusteeSaleNumber,
  record.trusteeName,
  record.saleVerificationPhone,
  record.salePlace,
  record.legalDescription,
  record.ownerName,
  record.propertyType,
  record.taxYear,
  record.taxInstallment,
  record.taxDueCents,
  record.penaltyDueCents,
  record.interestDueCents,
  record.evidenceStatus,
  record.evidenceDetail,
  record.evidenceUpdatedAt,
  record.priority,
  record.rawExcerpt,
  record.firstSeenAt,
  record.lastSeenAt,
  record.updatedAt,
];
const recordSql = records
  .map(
    (record) =>
      `INSERT INTO foreclosure_records (${columns.join(",")}) VALUES (${values(record).map(literal).join(",")});`,
  )
  .join("\n");
const runColumns = [
  "id",
  "refresh_job_id",
  "source_id",
  "source_name",
  "source_url",
  "trigger",
  "status",
  "started_at",
  "finished_at",
  "records_found",
  "records_upserted",
  "records_no_longer_present",
  "source_updated_at",
  "snapshot_complete",
];
const runs = [
  [
    "e2e-tax",
    "e2e-refresh",
    "norfolk-delinquent-property-tax",
    "City of Norfolk · Delinquent Property Taxes",
    "https://data.norfolk.gov/api/views/7qie-z5gv/rows.csv?accessType=DOWNLOAD",
    "bootstrap",
    "success",
    observedAt,
    observedAt,
    tax.length,
    tax.length,
    0,
    sourceUpdatedAt,
    1,
  ],
  [
    "e2e-violations",
    "e2e-refresh",
    "norfolk-code-violations",
    "City of Norfolk · Neighborhood Quality Violations",
    "https://data.norfolk.gov/resource/agip-sqwc.json",
    "bootstrap",
    "success",
    observedAt,
    observedAt,
    violations.length,
    violations.length,
    0,
    "2026-11-06T12:16:24.000Z",
    1,
  ],
];
const runSql = runs
  .map(
    (run) =>
      `INSERT INTO ingestion_runs (${runColumns.join(",")}) VALUES (${run.map(literal).join(",")});`,
  )
  .join("\n");
const watchlistColumns = [
  "property_key",
  "jurisdiction_id",
  "jurisdiction_name",
  "parcel_id",
  "address",
  "city",
  "state",
  "zip",
  "owner_name",
  "property_type",
  "score",
  "signal_types",
  "independent_signal_count",
  "evidence_count",
  "tax_installment_count",
  "code_violation_count",
  "recorded_lien_count",
  "total_delinquent_cents",
  "earliest_tax_year",
  "freshest_source_updated_at",
  "first_seen_at",
  "last_seen_at",
  "source_names",
  "ranked_at",
];
const watchlist = [
  [
    "norfolk-va:15834200",
    "norfolk-va",
    "Norfolk, VA",
    "15834200",
    "2800 VIMY RIDGE AV",
    "Norfolk",
    "VA",
    null,
    "GARRIS, LEONDER P & HERMINE E",
    "Real estate",
    75,
    "tax_delinquency,code_violation",
    2,
    3,
    2,
    1,
    0,
    120071,
    2025,
    sourceUpdatedAt,
    observedAt,
    observedAt,
    "City of Norfolk · Delinquent Property Taxes,City of Norfolk · Neighborhood Quality Violations",
    observedAt,
  ],
  [
    "norfolk-va:00000218",
    "norfolk-va",
    "Norfolk, VA",
    "00000218",
    "E S TAPLEY AV",
    "Norfolk",
    "VA",
    null,
    "HOMES ASSOCIATION OF NORFOLK, INC",
    "Real estate",
    40,
    "tax_delinquency",
    1,
    4,
    4,
    0,
    0,
    39810,
    2006,
    sourceUpdatedAt,
    observedAt,
    observedAt,
    "City of Norfolk · Delinquent Property Taxes",
    observedAt,
  ],
];
const watchlistSql = watchlist
  .map(
    (row) =>
      `INSERT INTO watchlist_properties (${watchlistColumns.join(",")}) VALUES (${row.map(literal).join(",")});`,
  )
  .join("\n");
const sql = `
DELETE FROM ranking_adjustment_audit;
DELETE FROM ranking_adjustment_profile;
DELETE FROM property_feedback_audit;
DELETE FROM property_feedback;
DELETE FROM property_qualification_override_audit;
DELETE FROM property_qualification_overrides;
DELETE FROM property_assessments;
DELETE FROM property_rechecks;
DELETE FROM property_alerts;
DELETE FROM user_alert_preferences;
DELETE FROM property_notes;
DELETE FROM property_value_assumptions;
DELETE FROM partner_properties;
DELETE FROM buy_boxes;
DELETE FROM property_change_events;
DELETE FROM source_publications;
DELETE FROM property_sales;
DELETE FROM property_enrichment_extensions;
DELETE FROM property_enrichment;
DELETE FROM enrichment_runs;
DELETE FROM foreclosure_record_staging;
DELETE FROM watchlist_properties;
DELETE FROM ingestion_runs;
DELETE FROM refresh_jobs;
DELETE FROM foreclosure_records;
INSERT INTO refresh_jobs (id,trigger,status,requested_at,started_at,finished_at)
VALUES (${["e2e-refresh", "bootstrap", "success", observedAt, observedAt, observedAt].map(literal).join(",")});
${runSql}
${recordSql}
${watchlistSql}
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
