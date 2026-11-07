import { publicationChangeStatements } from "./change-tracking.ts";
import {
  fetchAcrisCommonChargeLiens,
  fetchDenverMortgageForeclosureInitiations,
  fetchNorfolkCodeViolations,
  fetchNorfolkTaxDelinquencies,
  fetchTravisTaxDelinquencies,
} from "./current-sources.ts";
import type {
  DashboardData,
  IngestionTrigger,
  PropertyDetail,
  RankedProperty,
  RefreshJob,
  ResearchRecord,
  RunStatus,
  SignalType,
  SourceRun,
} from "./model.ts";
import { statusFor } from "./model.ts";
import {
  fetchOrangeCountyPowerToSell,
  fetchOrangeCountyThreeYearDelinquencies,
  fetchTaxAuction,
  fetchTrusteeNotices,
  type SourceResult,
} from "./sources.ts";

type SourceDefinition = {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly load: () => Promise<SourceResult>;
};
export type RefreshResult = { readonly ok: boolean; readonly runs: readonly SourceRun[] };
export type RefreshJobRequest = { readonly job: RefreshJob; readonly created: boolean };
export type DashboardQuery = {
  readonly page?: number;
  readonly pageSize?: number;
  readonly query?: string;
  readonly jurisdiction?: string;
  readonly signalType?: SignalType | "all";
  readonly buyBoxId?: string | null;
  readonly fit?: "all" | "match" | "unknown" | "no_match";
  readonly sort?: "distress" | "confidence" | "fit" | "recent";
};
const refreshCooldownMs = 20_000;
const refreshLease = "foreclosure-source-refresh";

export function defaultSources(
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
) {
  return [
    {
      id: "travis-tax-delinquency",
      name: "Travis County Tax Office · Delinquent Tax Roll",
      url: "https://tax-office.traviscountytx.gov/voterdata/TaxDelqOpenData.csv",
      load: () => fetchTravisTaxDelinquencies(fetchImpl, now()),
    },
    {
      id: "norfolk-delinquent-property-tax",
      name: "City of Norfolk · Delinquent Property Taxes",
      url: "https://data.norfolk.gov/api/views/7qie-z5gv/rows.csv?accessType=DOWNLOAD",
      load: () => fetchNorfolkTaxDelinquencies(fetchImpl, now()),
    },
    {
      id: "norfolk-code-violations",
      name: "City of Norfolk · Neighborhood Quality Violations",
      url: "https://data.norfolk.gov/resource/agip-sqwc.json",
      load: () => fetchNorfolkCodeViolations(fetchImpl, now()),
    },
    {
      id: "nyc-acris-common-charge-liens",
      name: "NYC ACRIS · Common Charge Lien Recordings",
      url: "https://data.cityofnewyork.us/resource/bnx9-e6tj.json",
      load: () => fetchAcrisCommonChargeLiens(fetchImpl, now()),
    },
    {
      id: "denver-public-trustee-ned",
      name: "Denver Public Trustee · Foreclosure Search",
      url: "https://denvergov.org/foreclosuresearch/",
      load: () => fetchDenverMortgageForeclosureInitiations(fetchImpl, now()),
    },
    {
      id: "oc-three-year-tax-delinquency",
      name: "Orange County Treasurer-Tax Collector · Three-Year Delinquency",
      url: "https://www.octreasurer.gov/PublishedNotices",
      load: () => fetchOrangeCountyThreeYearDelinquencies(fetchImpl, now()),
    },
    {
      id: "oc-impending-power-to-sell",
      name: "Orange County Treasurer-Tax Collector · Impending Power to Sell",
      url: "https://www.octreasurer.gov/PublishedNotices",
      load: () => fetchOrangeCountyPowerToSell(fetchImpl, now()),
    },
    {
      id: "la-ttc-tax-auction",
      name: "LA County Treasurer and Tax Collector",
      url: "https://ttc.lacounty.gov/schedule-of-upcoming-auctions/",
      load: () => fetchTaxAuction(fetchImpl, now()),
    },
    {
      id: "cnpa-trustee-notices",
      name: "CNPA Public Notices",
      url: "https://www.capublicnotice.com/category/legals/notice-of-trustee-sale",
      load: () => fetchTrusteeNotices(fetchImpl, now()),
    },
  ] satisfies SourceDefinition[];
}

export async function requestRefreshJob(
  db: D1Database,
  trigger: IngestionTrigger,
  now: Date = new Date(),
): Promise<RefreshJobRequest> {
  const requestedAt = now.toISOString();
  await db
    .prepare(
      "UPDATE refresh_jobs SET status='failed', finished_at=?, error='Refresh lease expired before completion.', active_lease=NULL WHERE active_lease=? AND requested_at<?",
    )
    .bind(requestedAt, refreshLease, new Date(now.getTime() - 60 * 60_000).toISOString())
    .run();
  const recent = await db
    .prepare(
      "SELECT * FROM refresh_jobs WHERE active_lease=? OR finished_at>=? ORDER BY requested_at DESC LIMIT 1",
    )
    .bind(refreshLease, new Date(now.getTime() - refreshCooldownMs).toISOString())
    .first<RefreshJobRow>();
  if (recent) {
    return { job: mapRefreshJob(recent), created: false };
  }
  const job: RefreshJob = {
    id: crypto.randomUUID(),
    trigger,
    status: "queued",
    requestedAt,
    startedAt: null,
    finishedAt: null,
    error: null,
  };
  try {
    await db
      .prepare(
        "INSERT INTO refresh_jobs (id,trigger,status,requested_at,active_lease) VALUES (?,?,'queued',?,?)",
      )
      .bind(job.id, trigger, requestedAt, refreshLease)
      .run();
    return { job, created: true };
  } catch (cause) {
    const active = await db
      .prepare("SELECT * FROM refresh_jobs WHERE active_lease=? LIMIT 1")
      .bind(refreshLease)
      .first<RefreshJobRow>();
    if (active) {
      return { job: mapRefreshJob(active), created: false };
    }
    throw cause;
  }
}
export async function failRefreshJob(db: D1Database, jobId: string, cause: unknown) {
  await db
    .prepare(
      "UPDATE refresh_jobs SET status='failed',finished_at=?,error=?,active_lease=NULL WHERE id=?",
    )
    .bind(new Date().toISOString(), safeSourceError(cause), jobId)
    .run();
}

export async function runRefreshJob(
  db: D1Database,
  jobId: string,
  trigger: IngestionTrigger,
  sources: readonly SourceDefinition[] = defaultSources(),
): Promise<RefreshResult> {
  const claimed = await db
    .prepare(
      "UPDATE refresh_jobs SET status='running',started_at=?,error=NULL WHERE id=? AND status='queued'",
    )
    .bind(new Date().toISOString(), jobId)
    .run();
  if (!claimed.meta.changes) {
    const existing = await db
      .prepare("SELECT status FROM refresh_jobs WHERE id=?")
      .bind(jobId)
      .first<{ status: string }>();
    if (existing?.status === "success" || existing?.status === "partial") {
      return { ok: true, runs: [] };
    }
    throw new Error("The refresh job was missing or had already been claimed.");
  }
  try {
    const result = await refreshSources(db, trigger, jobId, sources);
    const failed = result.runs.filter((run) => run.status === "failed").length;
    const status: RunStatus =
      failed === 0 ? "success" : failed < result.runs.length ? "partial" : "failed";
    const summary = result.runs
      .filter((run) => run.status === "failed" && run.error)
      .map((run) => `${run.sourceName}: ${run.error}`)
      .join(" ")
      .slice(0, 1000);
    await db
      .prepare(
        "UPDATE refresh_jobs SET status=?,finished_at=?,error=?,active_lease=NULL WHERE id=?",
      )
      .bind(status, new Date().toISOString(), summary || null, jobId)
      .run();
    return { ok: failed === 0, runs: result.runs };
  } catch (cause) {
    await failRefreshJob(db, jobId, cause);
    throw cause;
  }
}

export async function refreshSources(
  db: D1Database,
  trigger: IngestionTrigger,
  refreshJobId: string,
  sources: readonly SourceDefinition[] = defaultSources(),
): Promise<RefreshResult> {
  const runs: SourceRun[] = [];
  for (const source of sources) {
    const startedAt = new Date().toISOString();
    const id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO ingestion_runs (id,refresh_job_id,source_id,source_name,source_url,trigger,status,started_at,records_found,records_upserted) VALUES (?,?,?,?,?,?,'running',?,0,0)",
      )
      .bind(id, refreshJobId, source.id, source.name, source.url, trigger, startedAt)
      .run();
    try {
      const result = await source.load();
      if (result.sourceId !== source.id) {
        throw new Error("Source adapter identity did not match its definition.");
      }
      const snapshotId = `${id}:${result.sourceUpdatedAt ?? startedAt}`;
      await stageRecords(db, id, result.records, snapshotId);
      const finishedAt = new Date().toISOString();
      const notes = result.warnings.join(" ").slice(0, 1000) || null;
      const mutable = recordColumns.filter((column) => !["id", "first_seen_at"].includes(column));
      const publishSql = `INSERT INTO foreclosure_records (${recordColumns.join(",")}) SELECT ${recordColumns.join(",")} FROM foreclosure_record_staging WHERE staging_run_id=? ON CONFLICT(id) DO UPDATE SET ${mutable.map((column) => `${column}=excluded.${column}`).join(",")}`;
      const statements: D1PreparedStatement[] = [
        ...publicationChangeStatements(db, {
          runId: id,
          sourceId: source.id,
          sourceName: source.name,
          sourceUrl: source.url,
          detectedAt: finishedAt,
          sourceUpdatedAt: result.sourceUpdatedAt ?? null,
          snapshotComplete: result.snapshotComplete === true,
        }),
        db.prepare(publishSql).bind(id),
      ];
      let reconciliationIndex = -1;
      if (result.snapshotComplete === true) {
        reconciliationIndex = statements.length;
        statements.push(
          db
            .prepare(
              "UPDATE foreclosure_records SET snapshot_presence='no_longer_present',no_longer_present_at=?,updated_at=? WHERE source_id=? AND snapshot_presence='present' AND COALESCE(snapshot_id,'')<>?",
            )
            .bind(finishedAt, finishedAt, source.id, snapshotId),
        );
      }
      statements.push(...watchlistStatements(db, finishedAt));
      statements.push(
        db
          .prepare(
            "UPDATE ingestion_runs SET status='success',finished_at=?,records_found=?,records_upserted=?,records_no_longer_present=(SELECT COUNT(*) FROM foreclosure_records WHERE source_id=? AND no_longer_present_at=?),source_updated_at=?,snapshot_complete=?,error=? WHERE id=?",
          )
          .bind(
            finishedAt,
            result.records.length,
            result.records.length,
            source.id,
            finishedAt,
            result.sourceUpdatedAt ?? null,
            result.snapshotComplete === true ? 1 : 0,
            notes,
            id,
          ),
        db.prepare("DELETE FROM foreclosure_record_staging WHERE staging_run_id=?").bind(id),
      );
      const published = await db.batch(statements);
      const removed =
        reconciliationIndex >= 0 ? Number(published[reconciliationIndex]?.meta.changes ?? 0) : 0;
      runs.push({
        id,
        refreshJobId,
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.url,
        trigger,
        status: "success",
        startedAt,
        finishedAt,
        recordsFound: result.records.length,
        recordsUpserted: result.records.length,
        recordsNoLongerPresent: removed,
        sourceUpdatedAt: result.sourceUpdatedAt ?? null,
        snapshotComplete: result.snapshotComplete === true,
        error: notes,
      });
    } catch (cause) {
      await db
        .prepare("DELETE FROM foreclosure_record_staging WHERE staging_run_id=?")
        .bind(id)
        .run();
      const finishedAt = new Date().toISOString();
      const error = safeSourceError(cause);
      await db
        .prepare("UPDATE ingestion_runs SET status='failed',finished_at=?,error=? WHERE id=?")
        .bind(finishedAt, error, id)
        .run();
      runs.push({
        id,
        refreshJobId,
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.url,
        trigger,
        status: "failed",
        startedAt,
        finishedAt,
        recordsFound: 0,
        recordsUpserted: 0,
        recordsNoLongerPresent: 0,
        sourceUpdatedAt: null,
        snapshotComplete: false,
        error,
      });
    }
  }
  return { ok: runs.every((run) => run.status === "success"), runs };
}

const recordColumns = [
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
] as const;
export async function upsertRecords(
  db: D1Database,
  records: readonly ResearchRecord[],
  snapshotId: string = crypto.randomUUID(),
) {
  const mutable = recordColumns.filter((column) => !["id", "first_seen_at"].includes(column));
  const sql = `INSERT INTO foreclosure_records (${recordColumns.join(",")}) VALUES (${recordColumns.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${mutable.map((column) => `${column}=excluded.${column}`).join(",")}`;
  for (let index = 0; index < records.length; index += 100) {
    await db.batch(
      records
        .slice(index, index + 100)
        .map((record) => db.prepare(sql).bind(...recordValues(record, snapshotId))),
    );
  }
}
async function stageRecords(
  db: D1Database,
  runId: string,
  records: readonly ResearchRecord[],
  snapshotId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM foreclosure_record_staging WHERE staging_run_id=?")
    .bind(runId)
    .run();
  const columns = ["staging_run_id", ...recordColumns];
  const sql = `INSERT INTO foreclosure_record_staging (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`;
  for (let index = 0; index < records.length; index += 100) {
    await db.batch(
      records
        .slice(index, index + 100)
        .map((record) => db.prepare(sql).bind(runId, ...recordValues(record, snapshotId))),
    );
  }
}

function recordValues(r: ResearchRecord, snapshotId: string): unknown[] {
  return [
    r.id,
    r.saleType,
    r.signalType,
    r.jurisdictionId,
    r.jurisdictionName,
    r.sourceRecordId,
    r.sourceKey,
    r.sourceId,
    r.sourceName,
    r.sourceUrl,
    r.sourceDocumentUrl,
    r.sourcePublishedAt,
    r.sourceAsOfDate,
    r.sourceUpdatedAt,
    r.sourceGoodThrough,
    r.sourceKind,
    "present",
    snapshotId,
    null,
    r.observedAt,
    r.eventDate,
    r.scheduledDate,
    r.scheduledTime,
    r.status,
    r.apn,
    r.propertyKey || `${r.jurisdictionId}:${r.apn ?? `${r.sourceId}:${r.sourceRecordId}`}`,
    r.address,
    r.city,
    r.state,
    r.zip,
    r.assessorAddress,
    r.assessorCity,
    r.assessorState,
    r.assessorZip,
    r.assessorObservedAt,
    r.assessorSourceUrl,
    r.itemNumber,
    r.minimumBidCents,
    r.delinquentAmountCents,
    r.unpaidBalanceCents,
    r.principalBalanceCents,
    r.principalAsOfDate,
    r.trusteeSaleNumber,
    r.trusteeName,
    r.saleVerificationPhone,
    r.salePlace,
    r.legalDescription,
    r.ownerName,
    r.propertyType,
    r.taxYear,
    r.taxInstallment,
    r.taxDueCents,
    r.penaltyDueCents,
    r.interestDueCents,
    r.evidenceStatus,
    r.evidenceDetail,
    r.evidenceUpdatedAt,
    r.priority,
    r.rawExcerpt,
    r.firstSeenAt,
    r.lastSeenAt,
    r.updatedAt,
  ];
}

function watchlistStatements(db: D1Database, rankedAt: string): D1PreparedStatement[] {
  if (!Number.isInteger(Number(rankedAt.slice(0, 4)))) {
    throw new Error("A valid ranking timestamp is required.");
  }
  const independentCount =
    "COUNT(DISTINCT CASE WHEN signal_type IN ('tax_delinquency','code_violation','recorded_lien','mortgage_foreclosure_initiated') THEN signal_type END)";
  const score = `(CASE WHEN SUM(CASE WHEN signal_type='tax_delinquency' THEN 1 ELSE 0 END)>0 THEN 40 ELSE 0 END)+(CASE WHEN SUM(CASE WHEN signal_type='code_violation' THEN 1 ELSE 0 END)>0 THEN 25 ELSE 0 END)+(CASE WHEN SUM(CASE WHEN signal_type='recorded_lien' THEN 1 ELSE 0 END)>0 THEN 35 ELSE 0 END)+(CASE WHEN SUM(CASE WHEN signal_type='mortgage_foreclosure_initiated' THEN 1 ELSE 0 END)>0 THEN 80 ELSE 0 END)+(CASE WHEN ${independentCount}>1 THEN MIN(20,(${independentCount}-1)*10) ELSE 0 END)`;
  const insert = `INSERT INTO watchlist_properties (property_key,jurisdiction_id,jurisdiction_name,parcel_id,address,city,state,zip,owner_name,property_type,score,signal_types,independent_signal_count,evidence_count,tax_installment_count,code_violation_count,recorded_lien_count,total_delinquent_cents,earliest_tax_year,freshest_source_updated_at,first_seen_at,last_seen_at,source_names,ranked_at) SELECT property_key,MAX(jurisdiction_id),MAX(jurisdiction_name),MAX(apn),COALESCE(MAX(CASE WHEN signal_type='tax_delinquency' THEN address END),MAX(address)),COALESCE(MAX(CASE WHEN signal_type='tax_delinquency' THEN city END),MAX(city)),MAX(state),MAX(zip),MAX(owner_name),MAX(property_type),MIN(100,${score}),GROUP_CONCAT(DISTINCT signal_type),COUNT(DISTINCT CASE WHEN signal_type IN ('tax_delinquency','code_violation','recorded_lien','mortgage_foreclosure_initiated') THEN signal_type END),COUNT(*),SUM(CASE WHEN signal_type='tax_delinquency' THEN 1 ELSE 0 END),SUM(CASE WHEN signal_type='code_violation' THEN 1 ELSE 0 END),SUM(CASE WHEN signal_type='recorded_lien' THEN 1 ELSE 0 END),SUM(CASE WHEN signal_type='tax_delinquency' THEN COALESCE(delinquent_amount_cents,0) ELSE 0 END),MIN(CASE WHEN signal_type='tax_delinquency' THEN tax_year END),MAX(source_updated_at),MIN(first_seen_at),MAX(last_seen_at),GROUP_CONCAT(DISTINCT source_name),? FROM foreclosure_records WHERE source_kind='current' AND snapshot_presence='present' AND COALESCE(priority,1)>0 AND property_key<>'' GROUP BY property_key HAVING SUM(CASE WHEN signal_type IN ('tax_delinquency','code_violation','recorded_lien','mortgage_foreclosure_initiated') THEN 1 ELSE 0 END)>0`;
  return [db.prepare("DELETE FROM watchlist_properties"), db.prepare(insert).bind(rankedAt)];
}

export async function rebuildWatchlist(
  db: D1Database,
  rankedAt = new Date().toISOString(),
): Promise<void> {
  await db.batch(watchlistStatements(db, rankedAt));
}

export class DashboardQueryError extends Error {}

function dashboardInput(query: DashboardQuery) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;
  if (!Number.isFinite(page) || !Number.isInteger(page) || page < 1 || page > 10_000) {
    throw new DashboardQueryError("Page must be an integer from 1 to 10000.");
  }
  if (
    !Number.isFinite(pageSize) ||
    !Number.isInteger(pageSize) ||
    pageSize < 10 ||
    pageSize > 100
  ) {
    throw new DashboardQueryError("Page size must be an integer from 10 to 100.");
  }
  const allowedSignals = new Set<SignalType>([
    "tax_delinquency",
    "code_violation",
    "power_to_sell",
    "recorded_lien",
    "lien_release",
    "notice_of_default",
    "mortgage_foreclosure_initiated",
    "scheduled_trustee_sale",
    "scheduled_tax_sale",
  ]);
  if (query.signalType && query.signalType !== "all" && !allowedSignals.has(query.signalType)) {
    throw new DashboardQueryError("Unknown signal type.");
  }
  const jurisdiction = query.jurisdiction ?? "all";
  if (jurisdiction !== "all" && !/^[a-z0-9-]{1,40}$/.test(jurisdiction)) {
    throw new DashboardQueryError("Invalid jurisdiction.");
  }
  const search = (query.query ?? "").trim();
  const escapedSearch = search
    .split("\\")
    .join("\\\\")
    .split("%")
    .join("\\%")
    .split("_")
    .join("\\_");
  if (new TextEncoder().encode(`%${escapedSearch}%`).byteLength > 50) {
    throw new DashboardQueryError("Search is too long for this data store.");
  }
  const fit = query.fit ?? "all";
  if (!new Set(["all", "match", "unknown", "no_match"]).has(fit)) {
    throw new DashboardQueryError("Unknown buy-box fit filter.");
  }
  const sort = query.sort ?? "distress";
  if (!new Set(["distress", "confidence", "fit", "recent"]).has(sort)) {
    throw new DashboardQueryError("Unknown shortlist sort.");
  }
  const buyBoxId = query.buyBoxId ?? null;
  if (buyBoxId !== null && !/^[a-zA-Z0-9-]{1,100}$/.test(buyBoxId)) {
    throw new DashboardQueryError("Invalid buy box ID.");
  }
  if (fit !== "all" && buyBoxId === null) {
    throw new DashboardQueryError("Select a buy box before filtering by fit.");
  }
  return {
    page,
    pageSize,
    signalType: query.signalType ?? "all",
    jurisdiction,
    search,
    escapedSearch,
    buyBoxId,
    fit: fit as "all" | "match" | "unknown" | "no_match",
    sort: sort as "distress" | "confidence" | "fit" | "recent",
  };
}

export async function loadDashboard(
  db: D1Database,
  query: DashboardQuery = {},
): Promise<DashboardData> {
  const input = dashboardInput(query);
  const generatedAt = new Date().toISOString();
  const clauses: string[] = [];
  const parameters: unknown[] = [];
  const buyBox = input.buyBoxId
    ? await db
        .prepare("SELECT * FROM buy_boxes WHERE id=?")
        .bind(input.buyBoxId)
        .first<FitBuyBoxRow>()
    : null;
  if (input.buyBoxId && !buyBox) {
    throw new DashboardQueryError("Buy box not found.");
  }
  if (input.jurisdiction !== "all") {
    clauses.push("p.jurisdiction_id=?");
    parameters.push(input.jurisdiction);
  }
  if (input.signalType !== "all") {
    clauses.push("(','||p.signal_types||',') LIKE ?");
    parameters.push(`%,${input.signalType},%`);
  }
  if (input.search) {
    const needle = `%${input.escapedSearch.toLowerCase()}%`;
    clauses.push(
      "(LOWER(COALESCE(p.address,'')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(p.parcel_id,'')) LIKE ? ESCAPE '\\' OR LOWER(p.jurisdiction_name) LIKE ? ESCAPE '\\')",
    );
    parameters.push(needle, needle, needle);
  }
  const fitSql = buyBox ? buyBoxFitSql(buyBox) : null;
  const assumptionSelect =
    buyBox?.value_basis === "user_assumption" && buyBox.value_assumption_label
      ? `(SELECT va.value_cents FROM property_value_assumptions va WHERE va.property_key=p.property_key AND va.label='${buyBox.value_assumption_label.replaceAll("'", "''")}' ORDER BY va.as_of_date DESC,va.created_at DESC,va.id DESC LIMIT 1)`
      : "NULL";
  if (fitSql && input.fit !== "all") {
    if (input.fit === "no_match") {
      clauses.push(`(${fitSql.mismatch})`);
    } else if (input.fit === "unknown") {
      clauses.push(`NOT (${fitSql.mismatch}) AND (${fitSql.unknown})`);
    } else {
      clauses.push(`NOT (${fitSql.mismatch}) AND NOT (${fitSql.unknown})`);
    }
    parameters.push(...fitSql.parameters);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const fitOrder = fitSql
    ? `CASE WHEN ${fitSql.mismatch} THEN 2 WHEN ${fitSql.unknown} THEN 1 ELSE 0 END,`
    : "";
  const order = {
    distress: "p.score DESC,p.property_key ASC",
    confidence:
      "p.parcel_id IS NULL,(LENGTH(p.source_names)-LENGTH(REPLACE(p.source_names,',',''))) DESC,p.property_key ASC",
    recent: "p.last_seen_at DESC,p.property_key ASC",
    fit: `${fitOrder}p.score DESC,p.property_key ASC`,
  }[input.sort];
  const orderParameters = input.sort === "fit" && fitSql ? fitSql.parameters : [];
  const [count, propertyRows, runRows, refreshRows, archiveRows, archiveCount] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS total FROM watchlist_properties p LEFT JOIN property_enrichment e ON e.property_key=p.property_key ${where}`,
      )
      .bind(...parameters)
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT p.*,e.normalized_property_type,e.neighborhood,e.lot_area_sqft,e.residential_finished_area_value,e.commercial_building_area_value,e.building_area_unit_status,e.assessed_total_cents,e.last_transfer_consideration_cents,${assumptionSelect} selected_user_assumption_cents FROM watchlist_properties p LEFT JOIN property_enrichment e ON e.property_key=p.property_key ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      )
      .bind(...parameters, ...orderParameters, input.pageSize, (input.page - 1) * input.pageSize)
      .all<PropertyRow>(),
    db.prepare("SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 100").all<RunRow>(),
    db
      .prepare("SELECT * FROM refresh_jobs ORDER BY requested_at DESC LIMIT 10")
      .all<RefreshJobRow>(),
    db
      .prepare(
        "SELECT * FROM foreclosure_records WHERE source_kind='secondary' ORDER BY COALESCE(event_date,scheduled_date) DESC,source_id,source_record_id LIMIT 50",
      )
      .all<RecordRow>(),
    db
      .prepare("SELECT COUNT(*) AS total FROM foreclosure_records WHERE source_kind='secondary'")
      .first<{ total: number }>(),
  ]);
  const latest = new Map<string, SourceRun>();
  for (const row of runRows.results) {
    if (!latest.has(row.source_id)) {
      latest.set(row.source_id, mapRun(row));
    }
  }
  const total = Number(count?.total ?? 0);
  const archiveRecords = archiveRows.results.map(mapRecord);
  return {
    records: archiveRecords,
    properties: propertyRows.results.map(mapProperty),
    page: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
    archiveRecords,
    archiveTotal: Number(archiveCount?.total ?? 0),
    sources: [...latest.values()],
    refreshJobs: refreshRows.results.map(mapRefreshJob),
    generatedAt,
  };
}

export async function loadPropertyDetail(
  db: D1Database,
  propertyKey: string,
  page = 1,
  pageSize = 200,
): Promise<PropertyDetail | null> {
  if (!Number.isInteger(page) || page < 1 || page > 10_000) {
    throw new DashboardQueryError("Evidence page is invalid.");
  }
  if (!Number.isInteger(pageSize) || pageSize < 10 || pageSize > 500) {
    throw new DashboardQueryError("Evidence page size is invalid.");
  }
  const count = await db
    .prepare("SELECT COUNT(*) AS total FROM foreclosure_records WHERE property_key=?")
    .bind(propertyKey)
    .first<{ total: number }>();
  const total = Number(count?.total ?? 0);
  if (total === 0) {
    return null;
  }
  const ranked = await db
    .prepare("SELECT * FROM watchlist_properties WHERE property_key=?")
    .bind(propertyKey)
    .first<PropertyRow>();
  const historical =
    ranked ??
    (await db
      .prepare(
        `SELECT property_key,MAX(jurisdiction_id) jurisdiction_id,MAX(jurisdiction_name) jurisdiction_name,MAX(apn) parcel_id,MAX(address) address,MAX(city) city,MAX(state) state,MAX(zip) zip,MAX(owner_name) owner_name,MAX(property_type) property_type,0 score,GROUP_CONCAT(DISTINCT signal_type) signal_types,COUNT(DISTINCT CASE WHEN signal_type IN ('tax_delinquency','code_violation','recorded_lien','mortgage_foreclosure_initiated') THEN signal_type END) independent_signal_count,COUNT(*) evidence_count,SUM(CASE WHEN signal_type='tax_delinquency' THEN 1 ELSE 0 END) tax_installment_count,SUM(CASE WHEN signal_type='code_violation' THEN 1 ELSE 0 END) code_violation_count,SUM(CASE WHEN signal_type='recorded_lien' THEN 1 ELSE 0 END) recorded_lien_count,SUM(CASE WHEN signal_type='tax_delinquency' THEN COALESCE(delinquent_amount_cents,0) ELSE 0 END) total_delinquent_cents,MIN(CASE WHEN signal_type='tax_delinquency' THEN tax_year END) earliest_tax_year,MAX(source_updated_at) freshest_source_updated_at,MIN(first_seen_at) first_seen_at,MAX(last_seen_at) last_seen_at,GROUP_CONCAT(DISTINCT source_name) source_names,MAX(updated_at) ranked_at FROM foreclosure_records WHERE property_key=? GROUP BY property_key`,
      )
      .bind(propertyKey)
      .first<PropertyRow>());
  if (!historical) {
    return null;
  }
  const evidence = await db
    .prepare(
      "SELECT * FROM foreclosure_records WHERE property_key=? ORDER BY CASE snapshot_presence WHEN 'present' THEN 0 ELSE 1 END,signal_type,COALESCE(tax_year,9999),COALESCE(tax_installment,0),COALESCE(event_date,''),source_record_id,id LIMIT ? OFFSET ?",
    )
    .bind(propertyKey, pageSize, (page - 1) * pageSize)
    .all<RecordRow>();
  const mapped = mapProperty(historical);
  const property = ranked
    ? mapped
    : {
        ...mapped,
        score: 0,
        scoreReasons: ["No current ranked signal; retained evidence history only"],
      };
  return {
    property,
    evidence: evidence.results.map(mapRecord),
    evidenceTotal: total,
    evidencePage: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    truncated: page * pageSize < total,
  };
}

export async function currentEvidenceCsv(db: D1Database): Promise<string> {
  const columns = [
    "rank_score",
    "rank_reasons",
    "property_key",
    "jurisdiction",
    "parcel_id",
    "property_address",
    "property_total_delinquent_cents",
    "property_signal_types",
    "evidence_id",
    "evidence_type",
    "evidence_status",
    "evidence_detail",
    "snapshot_presence",
    "source_record_id",
    "tax_year",
    "tax_installment",
    "tax_due_cents",
    "penalty_due_cents",
    "interest_due_cents",
    "evidence_total_cents",
    "principal_balance_cents",
    "principal_as_of_date",
    "event_date",
    "evidence_updated_at",
    "source_updated_at",
    "source_good_through",
    "first_seen_at",
    "last_seen_at",
    "source_name",
    "source_url",
  ];
  const lines = [columns.map(csvCell).join(",")];
  const state = await db
    .prepare(
      "SELECT MAX(p.ranked_at) generation,COUNT(*) total FROM watchlist_properties p JOIN foreclosure_records r ON r.property_key=p.property_key WHERE r.source_kind='current'",
    )
    .first<{ generation: string | null; total: number }>();
  const generation = state?.generation ?? null;
  const expected = Number(state?.total ?? 0);
  if (!generation || expected === 0) {
    return lines.join("\n");
  }
  let lastId = "";
  let emitted = 0;
  while (true) {
    const rows = await db
      .prepare(
        "SELECT p.*,r.id AS r_id,r.signal_type AS r_signal_type,r.evidence_status AS r_evidence_status,r.evidence_detail AS r_evidence_detail,r.snapshot_presence AS r_snapshot_presence,r.source_record_id AS r_source_record_id,r.tax_year AS r_tax_year,r.tax_installment AS r_tax_installment,r.tax_due_cents AS r_tax_due_cents,r.penalty_due_cents AS r_penalty_due_cents,r.interest_due_cents AS r_interest_due_cents,r.delinquent_amount_cents AS r_delinquent_amount_cents,r.principal_balance_cents AS r_principal_balance_cents,r.principal_as_of_date AS r_principal_as_of_date,r.event_date AS r_event_date,r.evidence_updated_at AS r_evidence_updated_at,r.source_updated_at AS r_source_updated_at,r.source_good_through AS r_source_good_through,r.first_seen_at AS r_first_seen_at,r.last_seen_at AS r_last_seen_at,r.source_name AS r_source_name,r.source_url AS r_source_url FROM watchlist_properties p JOIN foreclosure_records r ON r.property_key=p.property_key WHERE r.source_kind='current' AND p.ranked_at=? AND r.id>? ORDER BY r.id LIMIT 1000",
      )
      .bind(generation, lastId)
      .all<PropertyEvidenceRow>();
    if (rows.results.length === 0) {
      break;
    }
    for (const row of rows.results) {
      const property = mapProperty(row);
      lines.push(
        [
          property.score,
          property.scoreReasons.join("; "),
          row.property_key,
          row.jurisdiction_name,
          row.parcel_id,
          row.address,
          row.total_delinquent_cents,
          row.signal_types,
          row.r_id,
          row.r_signal_type,
          row.r_evidence_status,
          row.r_evidence_detail,
          row.r_snapshot_presence,
          row.r_source_record_id,
          row.r_tax_year,
          row.r_tax_installment,
          row.r_tax_due_cents,
          row.r_penalty_due_cents,
          row.r_interest_due_cents,
          row.r_delinquent_amount_cents,
          row.r_principal_balance_cents,
          row.r_principal_as_of_date,
          row.r_event_date,
          row.r_evidence_updated_at,
          row.r_source_updated_at,
          row.r_source_good_through,
          row.r_first_seen_at,
          row.r_last_seen_at,
          row.r_source_name,
          row.r_source_url,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    emitted += rows.results.length;
    lastId = rows.results.at(-1)?.r_id ?? lastId;
  }
  const finalState = await db
    .prepare(
      "SELECT MAX(p.ranked_at) generation,COUNT(*) total FROM watchlist_properties p JOIN foreclosure_records r ON r.property_key=p.property_key WHERE r.source_kind='current'",
    )
    .first<{ generation: string | null; total: number }>();
  if (
    finalState?.generation !== generation ||
    Number(finalState?.total ?? 0) !== expected ||
    emitted !== expected
  ) {
    throw new Error("Evidence changed during export; retry for one coherent snapshot.");
  }
  return lines.join("\n");
}

export function dashboardCsv(data: DashboardData): string {
  const columns = [
    "rank_score",
    "rank_reasons",
    "property_key",
    "jurisdiction_id",
    "parcel_id",
    "address",
    "signal_types",
    "evidence_count",
    "total_delinquent_cents",
    "freshest_source_updated_at",
  ];
  return [
    columns.map(csvCell).join(","),
    ...data.properties.map((p) =>
      [
        p.score,
        p.scoreReasons.join("; "),
        p.propertyKey,
        p.jurisdictionId,
        p.parcelId,
        p.address,
        p.signalTypes.join(";"),
        p.evidenceCount,
        p.totalDelinquentCents,
        p.freshestSourceUpdatedAt,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");
}

function mapProperty(row: PropertyRow): RankedProperty {
  const signalTypes = row.signal_types.split(",").filter(Boolean) as SignalType[];
  const reasons: string[] = [];
  if (signalTypes.includes("tax_delinquency")) {
    reasons.push("40 · official tax-delinquency signal type is present");
  }
  if (signalTypes.includes("code_violation")) {
    reasons.push("25 · municipal code signal type is present");
  }
  if (signalTypes.includes("recorded_lien")) {
    reasons.push("35 · recorded-lien signal type is present (outstanding status unverified)");
  }
  if (signalTypes.includes("mortgage_foreclosure_initiated")) {
    reasons.push("80 · official foreclosure-initiation signal type is present");
  }
  if (row.independent_signal_count >= 3) {
    reasons.push("20 · three or more independent signal types");
  } else if (row.independent_signal_count === 2) {
    reasons.push("10 · two independent signal types");
  }
  const rawDistress =
    (signalTypes.includes("tax_delinquency") ? 40 : 0) +
    (signalTypes.includes("code_violation") ? 25 : 0) +
    (signalTypes.includes("recorded_lien") ? 35 : 0) +
    (signalTypes.includes("mortgage_foreclosure_initiated") ? 80 : 0) +
    Math.min(20, Math.max(0, row.independent_signal_count - 1) * 10);
  if (rawDistress > 100) {
    reasons.push(`Score capped at 100 from ${rawDistress} contribution points`);
  }
  reasons.push(
    "Dollar amounts, repeated rows, tax age, and publication freshness do not increase distress strength",
  );
  return {
    propertyKey: row.property_key,
    jurisdictionId: row.jurisdiction_id,
    jurisdictionName: row.jurisdiction_name,
    parcelId: row.parcel_id,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    ownerName: row.owner_name,
    propertyType: row.property_type,
    score: row.score,
    scoreReasons: reasons,
    signalTypes,
    independentSignalCount: row.independent_signal_count,
    evidenceCount: row.evidence_count,
    taxInstallmentCount: row.tax_installment_count,
    codeViolationCount: row.code_violation_count,
    recordedLienCount: row.recorded_lien_count,
    totalDelinquentCents: row.total_delinquent_cents,
    earliestTaxYear: row.earliest_tax_year,
    freshestSourceUpdatedAt: row.freshest_source_updated_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    sourceNames: row.source_names.split(",").filter(Boolean),
    normalizedPropertyType: row.normalized_property_type ?? null,
    neighborhood: row.neighborhood ?? null,
    lotAreaSqft: row.lot_area_sqft ?? null,
    residentialFinishedAreaValue: row.residential_finished_area_value ?? null,
    commercialBuildingAreaValue: row.commercial_building_area_value ?? null,
    buildingAreaUnitStatus: row.building_area_unit_status ?? null,
    assessedValueCents: row.assessed_total_cents ?? null,
    lastReportedConsiderationCents: row.last_transfer_consideration_cents ?? null,
    userAssumptionCents: row.selected_user_assumption_cents ?? null,
  };
}

function buyBoxFitSql(row: FitBuyBoxRow) {
  const mismatch: string[] = [];
  const unknown: string[] = [];
  const parameters: unknown[] = [];
  const list = (column: string, raw: string, nullable: boolean) => {
    const values = JSON.parse(raw) as string[];
    if (values.length === 0) {
      return;
    }
    mismatch.push(`${column} IS NOT NULL AND ${column} NOT IN (SELECT value FROM json_each(?))`);
    parameters.push(raw);
    if (nullable) {
      unknown.push(`${column} IS NULL`);
    }
  };
  list("p.jurisdiction_id", row.jurisdictions_json, false);
  list("p.zip", row.zips_json, true);
  list("e.neighborhood", row.neighborhoods_json, true);
  list("e.normalized_property_type", row.property_types_json, true);
  if (row.min_size_value !== null || row.max_size_value !== null) {
    if (row.size_basis === "lot_square_feet") {
      unknown.push("e.lot_area_sqft IS NULL");
      if (row.min_size_value !== null) {
        mismatch.push("e.lot_area_sqft IS NOT NULL AND e.lot_area_sqft<?");
        parameters.push(row.min_size_value);
      }
      if (row.max_size_value !== null) {
        mismatch.push("e.lot_area_sqft IS NOT NULL AND e.lot_area_sqft>?");
        parameters.push(row.max_size_value);
      }
    } else {
      unknown.push("1=1");
    }
  }
  if (row.min_value_cents !== null || row.max_value_cents !== null) {
    const column =
      row.value_basis === "assessed_value"
        ? "e.assessed_total_cents"
        : row.value_basis === "last_reported_consideration"
          ? "e.last_transfer_consideration_cents"
          : row.value_assumption_label
            ? `(SELECT va.value_cents FROM property_value_assumptions va WHERE va.property_key=p.property_key AND va.label='${row.value_assumption_label.replaceAll("'", "''")}' ORDER BY va.as_of_date DESC,va.created_at DESC,va.id DESC LIMIT 1)`
            : null;
    if (!column) {
      unknown.push("1=1");
    } else {
      unknown.push(`${column} IS NULL`);
      if (row.min_value_cents !== null) {
        mismatch.push(`${column} IS NOT NULL AND ${column}<?`);
        parameters.push(row.min_value_cents);
      }
      if (row.max_value_cents !== null) {
        mismatch.push(`${column} IS NOT NULL AND ${column}>?`);
        parameters.push(row.max_value_cents);
      }
    }
  }
  const phases = JSON.parse(row.distress_phases_json) as string[];
  if (phases.length === 1) {
    const filed =
      "(p.signal_types LIKE '%mortgage_foreclosure_initiated%' OR p.signal_types LIKE '%notice_of_default%' OR p.signal_types LIKE '%scheduled_trustee_sale%' OR p.signal_types LIKE '%scheduled_tax_sale%')";
    mismatch.push(phases[0] === "filed_foreclosure" ? `NOT ${filed}` : filed);
  }
  return {
    mismatch: mismatch.length ? mismatch.map((value) => `(${value})`).join(" OR ") : "0=1",
    unknown: unknown.length ? unknown.map((value) => `(${value})`).join(" OR ") : "0=1",
    parameters,
  };
}
function mapRecord(row: RecordRow): ResearchRecord {
  const record = {
    id: row.id,
    saleType: row.sale_type,
    signalType: row.signal_type,
    jurisdictionId: row.jurisdiction_id,
    jurisdictionName: row.jurisdiction_name,
    sourceRecordId: row.source_record_id,
    sourceKey: row.source_key,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    sourceDocumentUrl: row.source_document_url,
    sourcePublishedAt: row.source_published_at,
    sourceAsOfDate: row.source_as_of_date,
    sourceUpdatedAt: row.source_updated_at,
    sourceGoodThrough: row.source_good_through,
    sourceKind: row.source_kind,
    snapshotPresence: row.snapshot_presence,
    noLongerPresentAt: row.no_longer_present_at,
    observedAt: row.observed_at,
    eventDate: row.event_date,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    status: row.status,
    apn: row.apn,
    propertyKey: row.property_key,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    assessorAddress: row.assessor_address,
    assessorCity: row.assessor_city,
    assessorState: row.assessor_state,
    assessorZip: row.assessor_zip,
    assessorObservedAt: row.assessor_observed_at,
    assessorSourceUrl: row.assessor_source_url,
    itemNumber: row.item_number,
    minimumBidCents: row.minimum_bid_cents,
    delinquentAmountCents: row.delinquent_amount_cents,
    unpaidBalanceCents: row.unpaid_balance_cents,
    principalBalanceCents: row.principal_balance_cents,
    principalAsOfDate: row.principal_as_of_date,
    trusteeSaleNumber: row.trustee_sale_number,
    trusteeName: row.trustee_name,
    saleVerificationPhone: row.sale_verification_phone,
    salePlace: row.sale_place,
    legalDescription: row.legal_description,
    ownerName: row.owner_name,
    propertyType: row.property_type,
    taxYear: row.tax_year,
    taxInstallment: row.tax_installment,
    taxDueCents: row.tax_due_cents,
    penaltyDueCents: row.penalty_due_cents,
    interestDueCents: row.interest_due_cents,
    evidenceStatus: row.evidence_status,
    evidenceDetail: row.evidence_detail,
    evidenceUpdatedAt: row.evidence_updated_at,
    priority: row.priority,
    rawExcerpt: row.raw_excerpt,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
  } satisfies ResearchRecord;
  return {
    ...record,
    status: statusFor(
      record.scheduledDate,
      new Date().toISOString(),
      record.signalType,
      record.eventDate,
    ),
  };
}
function mapRun(row: RunRow): SourceRun {
  return {
    id: row.id,
    refreshJobId: row.refresh_job_id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    recordsFound: row.records_found,
    recordsUpserted: row.records_upserted,
    recordsNoLongerPresent: row.records_no_longer_present,
    sourceUpdatedAt: row.source_updated_at,
    snapshotComplete: Boolean(row.snapshot_complete),
    error: row.error,
  };
}
function mapRefreshJob(row: RefreshJobRow): RefreshJob {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    requestedAt: row.requested_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    error: row.error,
  };
}
function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  const raw = String(value);
  let firstVisible = 0;
  while (firstVisible < raw.length && raw.charCodeAt(firstVisible) <= 32) {
    firstVisible += 1;
  }
  const unsafePrefix = new Set(["=", "+", "-", "@"]).has(raw[firstVisible] ?? "");
  const safe = unsafePrefix ? `\u0027${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
function safeSourceError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "Unknown source error.";
  return message.replace(/https?:\/\/\S+/g, "source URL").slice(0, 500);
}

type PropertyRow = {
  property_key: string;
  jurisdiction_id: string;
  jurisdiction_name: string;
  parcel_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  owner_name: string | null;
  property_type: string | null;
  score: number;
  signal_types: string;
  independent_signal_count: number;
  evidence_count: number;
  tax_installment_count: number;
  code_violation_count: number;
  recorded_lien_count: number;
  total_delinquent_cents: number;
  earliest_tax_year: number | null;
  freshest_source_updated_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  source_names: string;
  ranked_at: string;
  normalized_property_type?: RankedProperty["normalizedPropertyType"];
  neighborhood?: string | null;
  lot_area_sqft?: number | null;
  residential_finished_area_value?: number | null;
  commercial_building_area_value?: number | null;
  building_area_unit_status?: string | null;
  assessed_total_cents?: number | null;
  last_transfer_consideration_cents?: number | null;
  selected_user_assumption_cents?: number | null;
};
type FitBuyBoxRow = {
  property_types_json: string;
  jurisdictions_json: string;
  neighborhoods_json: string;
  zips_json: string;
  min_size_value: number | null;
  max_size_value: number | null;
  size_basis: string;
  min_value_cents: number | null;
  max_value_cents: number | null;
  value_basis: string;
  value_assumption_label: string | null;
  distress_phases_json: string;
};
type PropertyEvidenceRow = PropertyRow & {
  r_id: string;
  r_signal_type: string;
  r_evidence_status: string | null;
  r_evidence_detail: string | null;
  r_snapshot_presence: string;
  r_source_record_id: string;
  r_tax_year: number | null;
  r_tax_installment: number | null;
  r_tax_due_cents: number | null;
  r_penalty_due_cents: number | null;
  r_interest_due_cents: number | null;
  r_delinquent_amount_cents: number | null;
  r_principal_balance_cents: number | null;
  r_principal_as_of_date: string | null;
  r_event_date: string | null;
  r_evidence_updated_at: string | null;
  r_source_updated_at: string | null;
  r_source_good_through: string | null;
  r_first_seen_at: string;
  r_last_seen_at: string;
  r_source_name: string;
  r_source_url: string;
};
type RecordRow = {
  id: string;
  sale_type: ResearchRecord["saleType"];
  signal_type: ResearchRecord["signalType"];
  jurisdiction_id: string;
  jurisdiction_name: string;
  source_record_id: string;
  source_key: string;
  source_id: string;
  source_name: string;
  source_url: string;
  source_document_url: string | null;
  source_published_at: string | null;
  source_as_of_date: string | null;
  source_updated_at: string | null;
  source_good_through: string | null;
  source_kind: ResearchRecord["sourceKind"];
  snapshot_presence: ResearchRecord["snapshotPresence"];
  no_longer_present_at: string | null;
  observed_at: string;
  event_date: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: ResearchRecord["status"];
  apn: string | null;
  property_key: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  assessor_address: string | null;
  assessor_city: string | null;
  assessor_state: string | null;
  assessor_zip: string | null;
  assessor_observed_at: string | null;
  assessor_source_url: string | null;
  item_number: string | null;
  minimum_bid_cents: number | null;
  delinquent_amount_cents: number | null;
  unpaid_balance_cents: number | null;
  principal_balance_cents: number | null;
  principal_as_of_date: string | null;
  trustee_sale_number: string | null;
  trustee_name: string | null;
  sale_verification_phone: string | null;
  sale_place: string | null;
  legal_description: string | null;
  owner_name: string | null;
  property_type: string | null;
  tax_year: number | null;
  tax_installment: number | null;
  tax_due_cents: number | null;
  penalty_due_cents: number | null;
  interest_due_cents: number | null;
  evidence_status: string | null;
  evidence_detail: string | null;
  evidence_updated_at: string | null;
  priority: number | null;
  raw_excerpt: string;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
};
type RunRow = {
  id: string;
  refresh_job_id: string;
  source_id: string;
  source_name: string;
  source_url: string;
  trigger: SourceRun["trigger"];
  status: SourceRun["status"];
  started_at: string;
  finished_at: string | null;
  records_found: number;
  records_upserted: number;
  records_no_longer_present: number;
  source_updated_at: string | null;
  snapshot_complete: number;
  error: string | null;
};
type RefreshJobRow = {
  id: string;
  trigger: RefreshJob["trigger"];
  status: RefreshJob["status"];
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
};
