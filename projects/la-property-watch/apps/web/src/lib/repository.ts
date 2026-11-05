import type {
  DashboardData,
  IngestionTrigger,
  RefreshJob,
  ResearchRecord,
  RunStatus,
  SourceRun,
} from "./model.ts";
import { statusFor } from "./model.ts";
import { fetchTaxAuction, fetchTrusteeNotices, type SourceResult } from "./sources.ts";

type SourceDefinition = {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly load: () => Promise<SourceResult>;
};

export type RefreshResult = {
  readonly ok: boolean;
  readonly runs: readonly SourceRun[];
};

export type RefreshJobRequest = {
  readonly job: RefreshJob;
  readonly created: boolean;
};

const refreshCooldownMs = 20_000;
const refreshLease = "foreclosure-source-refresh";

export function defaultSources(
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
) {
  return [
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
  const staleBefore = new Date(now.getTime() - 30 * 60 * 1_000).toISOString();
  const cooldownAfter = new Date(now.getTime() - refreshCooldownMs).toISOString();
  await db
    .prepare(
      "UPDATE refresh_jobs SET status = 'failed', finished_at = ?, error = 'Refresh lease expired before completion.', active_lease = NULL WHERE active_lease = ? AND requested_at < ?",
    )
    .bind(requestedAt, refreshLease, staleBefore)
    .run();
  const recent = await db
    .prepare(
      "SELECT * FROM refresh_jobs WHERE active_lease = ? OR finished_at >= ? ORDER BY requested_at DESC LIMIT 1",
    )
    .bind(refreshLease, cooldownAfter)
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
        "INSERT INTO refresh_jobs (id, trigger, status, requested_at, active_lease) VALUES (?, ?, 'queued', ?, ?)",
      )
      .bind(job.id, trigger, job.requestedAt, refreshLease)
      .run();
    return { job, created: true };
  } catch (cause) {
    const active = await db
      .prepare("SELECT * FROM refresh_jobs WHERE active_lease = ? LIMIT 1")
      .bind(refreshLease)
      .first<RefreshJobRow>();
    if (active) {
      return { job: mapRefreshJob(active), created: false };
    }
    throw cause;
  }
}

export async function failRefreshJob(db: D1Database, jobId: string, cause: unknown): Promise<void> {
  await db
    .prepare(
      "UPDATE refresh_jobs SET status = 'failed', finished_at = ?, error = ?, active_lease = NULL WHERE id = ?",
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
  const startedAt = new Date().toISOString();
  const claimed = await db
    .prepare(
      "UPDATE refresh_jobs SET status = 'running', started_at = ?, error = NULL WHERE id = ? AND status = 'queued'",
    )
    .bind(startedAt, jobId)
    .run();
  if (!claimed.meta.changes) {
    const existing = await db
      .prepare("SELECT status FROM refresh_jobs WHERE id = ?")
      .bind(jobId)
      .first<{ status: string }>();
    if (existing?.status === "success" || existing?.status === "partial") {
      return { ok: true, runs: [] };
    }
    throw new Error("The refresh job was missing or had already been claimed.");
  }
  try {
    const result = await refreshSources(db, trigger, jobId, sources);
    const successful = result.runs.filter((run) => run.status === "success").length;
    const failed = result.runs.filter((run) => run.status === "failed").length;
    const usable = result.runs.length - failed;
    const status =
      successful === result.runs.length ? "success" : usable > 0 ? "partial" : "failed";
    const summary = result.runs
      .filter((run) => run.error)
      .map((run) => `${run.sourceName}: ${run.error}`)
      .join(" ")
      .slice(0, 1_000);
    await db
      .prepare(
        "UPDATE refresh_jobs SET status = ?, finished_at = ?, error = ?, active_lease = NULL WHERE id = ?",
      )
      .bind(status, new Date().toISOString(), summary || null, jobId)
      .run();
    return { ok: failed === 0 && status === "success", runs: result.runs };
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
        "INSERT INTO ingestion_runs (id, refresh_job_id, source_id, source_name, source_url, trigger, status, started_at, records_found, records_upserted) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, 0, 0)",
      )
      .bind(id, refreshJobId, source.id, source.name, source.url, trigger, startedAt)
      .run();
    try {
      // Sources intentionally run independently so one blocked publisher never hides a healthy feed.
      // eslint-disable-next-line no-await-in-loop
      const result = await source.load();
      // eslint-disable-next-line no-await-in-loop
      await upsertRecords(db, result.records);
      const finishedAt = new Date().toISOString();
      const status: RunStatus =
        result.records.length === 0 || result.warnings.length > 0 ? "partial" : "success";
      const warning = result.warnings.join(" ").slice(0, 1_000) || null;
      // eslint-disable-next-line no-await-in-loop
      await db
        .prepare(
          "UPDATE ingestion_runs SET status = ?, finished_at = ?, records_found = ?, records_upserted = ?, error = ? WHERE id = ?",
        )
        .bind(status, finishedAt, result.records.length, result.records.length, warning, id)
        .run();
      runs.push({
        id,
        refreshJobId,
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.url,
        trigger,
        status,
        startedAt,
        finishedAt,
        recordsFound: result.records.length,
        recordsUpserted: result.records.length,
        error: warning,
      });
    } catch (cause) {
      const finishedAt = new Date().toISOString();
      const error = safeSourceError(cause);
      // eslint-disable-next-line no-await-in-loop
      await db
        .prepare(
          "UPDATE ingestion_runs SET status = 'failed', finished_at = ?, error = ? WHERE id = ?",
        )
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
        error,
      });
    }
  }
  return { ok: runs.every((run) => run.status === "success"), runs };
}

export async function upsertRecords(
  db: D1Database,
  records: readonly ResearchRecord[],
): Promise<void> {
  const statement = `INSERT INTO foreclosure_records (
    id, sale_type, source_key, source_id, source_name, source_url, source_document_url,
    source_published_at, observed_at, scheduled_date, scheduled_time, status, apn, address,
    city, state, zip, assessor_address, assessor_city, assessor_state, assessor_zip,
    assessor_observed_at, assessor_source_url, item_number, minimum_bid_cents,
    unpaid_balance_cents, trustee_sale_number, trustee_name, sale_verification_phone,
    sale_place, legal_description, raw_excerpt, first_seen_at, last_seen_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    source_name = excluded.source_name,
    source_url = excluded.source_url,
    source_document_url = excluded.source_document_url,
    source_published_at = excluded.source_published_at,
    observed_at = excluded.observed_at,
    scheduled_date = excluded.scheduled_date,
    scheduled_time = excluded.scheduled_time,
    status = excluded.status,
    apn = excluded.apn,
    address = excluded.address,
    city = excluded.city,
    state = excluded.state,
    zip = excluded.zip,
    assessor_address = excluded.assessor_address,
    assessor_city = excluded.assessor_city,
    assessor_state = excluded.assessor_state,
    assessor_zip = excluded.assessor_zip,
    assessor_observed_at = excluded.assessor_observed_at,
    assessor_source_url = excluded.assessor_source_url,
    item_number = excluded.item_number,
    minimum_bid_cents = excluded.minimum_bid_cents,
    unpaid_balance_cents = excluded.unpaid_balance_cents,
    trustee_sale_number = excluded.trustee_sale_number,
    trustee_name = excluded.trustee_name,
    sale_verification_phone = excluded.sale_verification_phone,
    sale_place = excluded.sale_place,
    legal_description = excluded.legal_description,
    raw_excerpt = excluded.raw_excerpt,
    last_seen_at = excluded.last_seen_at,
    updated_at = excluded.updated_at`;
  for (let index = 0; index < records.length; index += 100) {
    const batch = records
      .slice(index, index + 100)
      .map((record) =>
        db
          .prepare(statement)
          .bind(
            record.id,
            record.saleType,
            record.sourceKey,
            record.sourceId,
            record.sourceName,
            record.sourceUrl,
            record.sourceDocumentUrl,
            record.sourcePublishedAt,
            record.observedAt,
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
          ),
      );
    // eslint-disable-next-line no-await-in-loop
    await db.batch(batch);
  }
}

export async function loadDashboard(db: D1Database): Promise<DashboardData> {
  const generatedAt = new Date().toISOString();
  const [recordRows, runRows, refreshRows] = await Promise.all([
    db
      .prepare(
        "SELECT * FROM foreclosure_records ORDER BY CASE WHEN scheduled_date IS NULL THEN 1 ELSE 0 END, scheduled_date ASC, address ASC LIMIT 5000",
      )
      .all<RecordRow>(),
    db.prepare("SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 50").all<RunRow>(),
    db
      .prepare("SELECT * FROM refresh_jobs ORDER BY requested_at DESC LIMIT 10")
      .all<RefreshJobRow>(),
  ]);
  const latest = new Map<string, SourceRun>();
  for (const row of runRows.results) {
    if (!latest.has(row.source_id)) {
      latest.set(row.source_id, mapRun(row));
    }
  }
  return {
    records: recordRows.results.map((row) => {
      const record = mapRecord(row);
      return { ...record, status: statusFor(record.scheduledDate, generatedAt) };
    }),
    sources: [...latest.values()],
    refreshJobs: refreshRows.results.map(mapRefreshJob),
    generatedAt,
  };
}

export function dashboardCsv(data: DashboardData): string {
  const columns: Array<[string, (record: ResearchRecord) => unknown]> = [
    ["sale_type", (record) => record.saleType],
    ["status", (record) => statusFor(record.scheduledDate, data.generatedAt)],
    ["scheduled_date_as_published", (record) => record.scheduledDate],
    ["scheduled_time_pt_as_published", (record) => record.scheduledTime],
    ["apn", (record) => record.apn],
    ["published_address", (record) => record.address],
    ["published_city", (record) => record.city],
    ["published_zip", (record) => record.zip],
    ["assessor_address", (record) => record.assessorAddress],
    ["assessor_city", (record) => record.assessorCity],
    ["assessor_zip", (record) => record.assessorZip],
    ["minimum_bid_cents", (record) => record.minimumBidCents],
    ["unpaid_balance_cents", (record) => record.unpaidBalanceCents],
    ["trustee_sale_number", (record) => record.trusteeSaleNumber],
    ["trustee_name", (record) => record.trusteeName],
    ["sale_verification_phone", (record) => record.saleVerificationPhone],
    ["source_name", (record) => record.sourceName],
    ["source_url", (record) => record.sourceUrl],
    ["source_published_at", (record) => record.sourcePublishedAt],
    ["observed_at", (record) => record.observedAt],
  ];
  return [
    columns.map(([name]) => csvCell(name)).join(","),
    ...data.records.map((record) => columns.map(([, value]) => csvCell(value(record))).join(",")),
  ].join("\n");
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return `"${String(value).replace(/"/g, '""')}"`;
}

function safeSourceError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "Unknown source error.";
  return message.replace(/https?:\/\/\S+/g, "source URL").slice(0, 500);
}

type RecordRow = {
  id: string;
  sale_type: ResearchRecord["saleType"];
  source_key: string;
  source_id: string;
  source_name: string;
  source_url: string;
  source_document_url: string | null;
  source_published_at: string | null;
  observed_at: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: ResearchRecord["status"];
  apn: string | null;
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
  unpaid_balance_cents: number | null;
  trustee_sale_number: string | null;
  trustee_name: string | null;
  sale_verification_phone: string | null;
  sale_place: string | null;
  legal_description: string | null;
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

function mapRecord(row: RecordRow): ResearchRecord {
  return {
    id: row.id,
    saleType: row.sale_type,
    sourceKey: row.source_key,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    sourceDocumentUrl: row.source_document_url,
    sourcePublishedAt: row.source_published_at,
    observedAt: row.observed_at,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    status: row.status,
    apn: row.apn,
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
    unpaidBalanceCents: row.unpaid_balance_cents,
    trusteeSaleNumber: row.trustee_sale_number,
    trusteeName: row.trustee_name,
    saleVerificationPhone: row.sale_verification_phone,
    salePlace: row.sale_place,
    legalDescription: row.legal_description,
    rawExcerpt: row.raw_excerpt,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
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
