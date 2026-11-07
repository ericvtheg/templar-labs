import type { D1Database as WorkerD1Database } from "../apps/web/node_modules/@cloudflare/workers-types/index.ts";

// The Node project does not load Worker globals. Expose only D1's type to the
// shared repository, without replacing Node's URL/fetch/stream declarations.
declare global {
  interface D1Database extends WorkerD1Database {}
}

import { pathToFileURL } from "node:url";
import type { IngestionTrigger } from "../apps/web/src/lib/model.ts";
import {
  defaultSources,
  requestRefreshJob,
  runRefreshJob,
} from "../apps/web/src/lib/repository.ts";

// Run with Node 24: node scripts/ingest-production.ts [--queued-only]
// Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (D1 read/write).
// Serialize invocations in Actions; a running job older than five minutes is
// considered terminated. No fixtures or source overrides are used by the CLI.
type Query = { sql: string; params: unknown[] };
type QueryResult<T = Record<string, unknown>> = {
  success: boolean;
  results: T[];
  meta: { changes: number; [key: string]: unknown };
};
type Envelope<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result: T;
  result_info?: { total_pages?: number; total_count?: number };
};
type ApiOptions = {
  accountId: string;
  apiToken: string;
  apiBase?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
};

export function safeD1ErrorSummary(errors: unknown): string {
  if (!Array.isArray(errors)) {
    return "provider detail unavailable";
  }
  return (
    errors
      .slice(0, 3)
      .map((error: unknown) => {
        if (!error || typeof error !== "object") {
          return "unclassified provider error";
        }
        const value = error as { code?: unknown; message?: unknown };
        const code = typeof value.code === "number" ? String(value.code) : "unknown";
        const message = typeof value.message === "string" ? value.message : "";
        const categories = [
          [/row.*(?:read|writ)|(?:read|writ).*row/i, "row usage"],
          [/limit|quota|exceed/i, "limit exceeded"],
          [/size|storage|disk|full/i, "storage"],
          [/timeout|duration|execution time/i, "execution timeout"],
          [/syntax|no such|column|table|schema/i, "SQL/schema"],
          [/constraint|unique|foreign key/i, "constraint"],
          [/auth|permission|token/i, "authorization"],
          [/batch|body|parameter|binding/i, "request contract"],
        ] as const;
        const labels = categories
          .filter(([pattern]) => pattern.test(message))
          .map(([, label]) => label);
        return `code ${code}: ${labels.join(", ") || "unclassified provider error"}`;
      })
      .join("; ") || "provider detail unavailable"
  );
}

export class CloudflareD1 {
  private readonly options: ApiOptions;
  private databaseId: string | undefined;

  constructor(options: ApiOptions) {
    this.options = options;
  }

  private async request<T>(path: string, queries?: Query | Query[]): Promise<Envelope<T>> {
    const readOnly =
      queries === undefined ||
      (Array.isArray(queries) ? queries : [queries]).every((query) =>
        /^\s*SELECT\b/i.test(query.sql),
      );
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      let payload: Envelope<T>;
      try {
        response = await fetch(
          `${this.options.apiBase ?? "https://api.cloudflare.com/client/v4"}/accounts/${encodeURIComponent(this.options.accountId)}/d1/database${path}`,
          {
            method: queries === undefined ? "GET" : "POST",
            headers: {
              Authorization: `Bearer ${this.options.apiToken}`,
              "Content-Type": "application/json",
            },
            ...(queries === undefined
              ? {}
              : { body: JSON.stringify(Array.isArray(queries) ? { batch: queries } : queries) }),
            signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
          },
        );
        // Consume the response body under the same timeout. Never log API bodies,
        // headers, or fetch errors, which can contain sensitive request details.
        payload = (await response.json()) as Envelope<T>;
      } catch {
        if (readOnly && attempt < 2) {
          await this.pause(attempt);
          continue;
        }
        throw new Error(
          "Cloudflare D1 request failed (network, timeout, or invalid response); write outcome may be unknown.",
        );
      }
      if (!response.ok) {
        // A timed-out/5xx write may already have committed. Replaying a job claim
        // would lose its changes=1 result, so only replay reads or explicit 429s.
        if (
          attempt < 2 &&
          (response.status === 429 ||
            (readOnly && (response.status === 408 || response.status >= 500)))
        ) {
          await this.pause(attempt);
          continue;
        }
        throw new Error(
          `Cloudflare D1 HTTP ${response.status}; ${readOnly ? "read failed" : "write outcome may be unknown"}; ${safeD1ErrorSummary(payload.errors)}.`,
        );
      }
      if (payload.success !== true || !Array.isArray(payload.result)) {
        throw new Error("Cloudflare D1 API rejected request or returned an invalid result.");
      }
      return payload;
    }
    throw new Error("Cloudflare D1 retry limit reached.");
  }

  private pause(attempt: number) {
    return new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(this.options.retryDelayMs ?? 500, 5_000) * 2 ** attempt),
    );
  }

  async discover(): Promise<void> {
    // Explicit pagination, exact equality: never select a similarly named preview DB.
    const matches: string[] = [];
    for (let page = 1; page <= 1_000; page++) {
      const data = await this.request<Array<{ name: string; uuid: string }>>(
        `?page=${page}&per_page=100`,
      );
      for (const database of data.result) {
        if (database.name === "la-property-watch-db") {
          matches.push(database.uuid);
        }
      }
      const pages = data.result_info?.total_pages;
      if (
        (pages !== undefined && page >= pages) ||
        (pages === undefined && data.result.length < 100)
      ) {
        if (matches.length !== 1 || !matches[0]) {
          throw new Error(
            `Expected exactly one D1 database named la-property-watch-db; found ${matches.length}.`,
          );
        }
        this.databaseId = matches[0];
        return;
      }
    }
    throw new Error("D1 database discovery exceeded pagination safety limit.");
  }

  prepare(sql: string): RestStatement {
    return new RestStatement(this, { sql, params: [] });
  }

  async query<T = Record<string, unknown>>(queries: Query | Query[]): Promise<QueryResult<T>[]> {
    if (!this.databaseId) {
      throw new Error("Discover the D1 database before querying.");
    }
    const data = await this.request<QueryResult<T>[]>(
      `/${encodeURIComponent(this.databaseId)}/query`,
      queries,
    );
    const expected = Array.isArray(queries) ? queries.length : 1;
    if (
      data.result.length !== expected ||
      data.result.some(
        (result) =>
          result.success !== true ||
          !Array.isArray(result.results) ||
          typeof result.meta?.changes !== "number",
      )
    ) {
      throw new Error("Cloudflare D1 query failed or returned incomplete results.");
    }
    return data.result;
  }

  batch<T = Record<string, unknown>>(statements: RestStatement[]): Promise<QueryResult<T>[]> {
    if (statements.some((statement) => statement.database !== this)) {
      throw new Error("Cannot batch statements from another database.");
    }
    if (statements.length === 0) {
      return Promise.resolve([]);
    }
    // D1's array query request executes as one transactional batch.
    return this.query<T>(statements.map((statement) => statement.query));
  }
}

class RestStatement {
  readonly database: CloudflareD1;
  readonly query: Query;
  constructor(database: CloudflareD1, query: Query) {
    this.database = database;
    this.query = query;
  }
  bind(...params: unknown[]) {
    if (
      params.some(
        (value) =>
          value !== null &&
          typeof value !== "string" &&
          (typeof value !== "number" || !Number.isFinite(value)),
      )
    ) {
      throw new Error("REST D1 adapter accepts only null, string, and finite numeric parameters.");
    }
    return new RestStatement(this.database, { sql: this.query.sql, params });
  }
  async all<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
    const result = (await this.database.query<T>(this.query))[0];
    if (!result) {
      throw new Error("Missing D1 query result.");
    }
    return result;
  }
  run<T = Record<string, unknown>>() {
    return this.all<T>();
  }
  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = (await this.all<Record<string, unknown>>()).results[0];
    if (!row) {
      return null;
    }
    if (column === undefined) {
      return row as T;
    }
    if (!(column in row)) {
      throw new Error("D1 first(): unknown column.");
    }
    return row[column] as T;
  }
}

type Job = { id: string; trigger: IngestionTrigger; status: string; error: string | null };
type Run = {
  id: string;
  source_id: string;
  status: string;
  records_found: number;
  records_upserted: number;
  error: string | null;
};

export async function runOnce(
  db: D1Database,
  options: {
    queuedOnly?: boolean;
    now?: Date;
    sources?: Parameters<typeof runRefreshJob>[3];
  } = {},
) {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - 45 * 60_000).toISOString();
  const ended = now.toISOString();
  const error =
    "Ingestion runtime terminated before completion (running job exceeded 45-minute recovery threshold).";
  await db.batch([
    db
      .prepare(
        "UPDATE ingestion_runs SET status = 'failed', finished_at = ?, error = ? WHERE status = 'running' AND (started_at < ? OR refresh_job_id IN (SELECT id FROM refresh_jobs WHERE status = 'running' AND COALESCE(started_at, requested_at) < ?))",
      )
      .bind(ended, error, cutoff, cutoff),
    db
      .prepare(
        "UPDATE refresh_jobs SET status = 'failed', finished_at = ?, error = ?, active_lease = NULL WHERE status = 'running' AND COALESCE(started_at, requested_at) < ?",
      )
      .bind(ended, error, cutoff),
  ]);
  let skipped: string | null = null;
  let jobId: string | undefined;
  const active = await db
    .prepare("SELECT id FROM refresh_jobs WHERE status = 'running' LIMIT 1")
    .first<{ id: string }>();
  if (active) {
    skipped = "active job";
  } else {
    let queued = await db
      .prepare(
        "SELECT id, trigger FROM refresh_jobs WHERE status = 'queued' ORDER BY requested_at ASC, id ASC LIMIT 1",
      )
      .first<{ id: string; trigger: IngestionTrigger }>();
    if (!queued && !options.queuedOnly) {
      let requested = await requestRefreshJob(db, "scheduled", now);
      if (
        !requested.created &&
        requested.job.status === "failed" &&
        requested.job.finishedAt === ended &&
        requested.job.error === error
      ) {
        // Recovery is not a successful refresh. Honor the repository's cooldown,
        // then retry once with real time so this invocation can bootstrap ingestion.
        await new Promise<void>((resolve) => setTimeout(resolve, 20_100));
        requested = await requestRefreshJob(db, "scheduled", new Date());
      }
      if (requested.job.status === "queued") {
        queued = requested.job;
      } else {
        skipped = requested.job.status === "running" ? "active job" : "cooldown";
      }
    }
    if (queued) {
      jobId = queued.id;
      await runRefreshJob(db, queued.id, queued.trigger, options.sources);
    } else {
      skipped ??= "no queued job";
    }
  }
  // Logs come from committed data, not optimistic source results or row-write counts.
  const job = jobId
    ? await db
        .prepare("SELECT id, trigger, status, error FROM refresh_jobs WHERE id = ?")
        .bind(jobId)
        .first<Job>()
    : null;
  if (jobId && !job) {
    throw new Error("Completed job was missing on read-back.");
  }
  const runs = jobId
    ? (
        await db
          .prepare(
            "SELECT id, source_id, status, records_found, records_upserted, error FROM ingestion_runs WHERE refresh_job_id = ? ORDER BY started_at ASC",
          )
          .bind(jobId)
          .all<Run>()
      ).results
    : [];
  const counts = await db
    .prepare("SELECT COUNT(*) AS total FROM foreclosure_records")
    .first<{ total: number }>();
  const sourceCounts = (
    await db
      .prepare(
        "SELECT source_id, COUNT(*) AS total FROM foreclosure_records GROUP BY source_id ORDER BY source_id",
      )
      .all<{ source_id: string; total: number }>()
  ).results;
  const recovered = (
    await db
      .prepare(
        "SELECT id, status, error FROM refresh_jobs WHERE status = 'failed' AND finished_at = ? AND error = ? ORDER BY id",
      )
      .bind(ended, error)
      .all<{ id: string; status: string; error: string }>()
  ).results;
  if (!counts) {
    throw new Error("Missing persisted record counts.");
  }
  return { skipped, job, runs, counts, sourceCounts, recovered };
}

export function parseIngestionArgs(args: string[]) {
  const usage = "Usage: node scripts/ingest-production.ts [--queued-only | --source=SOURCE_ID]";
  if (args.length > 1) {
    throw new Error(usage);
  }
  const arg = args[0];
  if (arg === undefined || arg === "--queued-only") {
    return { queuedOnly: arg === "--queued-only", sources: undefined };
  }
  if (!arg.startsWith("--source=")) {
    throw new Error(usage);
  }
  const sources = defaultSources().filter((source) => source.id === arg.slice(9));
  if (sources.length !== 1) {
    throw new Error(`Unknown source ID. ${usage}`);
  }
  return { queuedOnly: false, sources };
}

async function main() {
  const options = parseIngestionArgs(process.argv.slice(2));
  const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
  const apiToken = process.env["CLOUDFLARE_API_TOKEN"];
  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
  }
  const adapter = new CloudflareD1({ accountId, apiToken });
  await adapter.discover();
  // This intentionally implements only the repository's prepare/bind/run/first/all
  // and batch surface, not D1 exec/dump/raw/sessions. Keep the cast at this boundary.
  const summary = await runOnce(adapter as unknown as D1Database, {
    ...options,
  });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.job?.status === "failed" || summary.runs.some((run) => run.status === "failed")) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : "Production ingestion failed.");
    process.exitCode = 1;
  });
}
