// biome-ignore-all lint/complexity/useLiteralKeys: Required by noPropertyAccessFromIndexSignature.
import { pathToFileURL } from "node:url";
import type { D1Database as WorkerD1Database } from "../apps/web/node_modules/@cloudflare/workers-types/index.ts";
import { loadDashboard } from "../apps/web/src/lib/repository.ts";

declare global {
  interface D1Database extends WorkerD1Database {}
}

const API_BASE = "https://api.cloudflare.com/client/v4";
const DATABASE_NAME = "la-property-watch-db";
const MAX_DISCOVERY_PAGES = 30;
const MAX_SQL_REQUESTS = 30;
const REQUEST_TIMEOUT_MS = 30_000;
const EXECUTION_BUDGET_MS = 60_000;
const MAX_SQL_BYTES = 100_000;
const MAX_BINDS = 100;
const PROPERTY_HINT = " INDEXED BY foreclosure_property_key_idx";
const SYNTHETIC_BUY_BOX_ID = "diagnostic-fixed-fit-boundary";
const schemaTables = [
  "property_rechecks",
  "property_sales",
  "user_alert_preferences",
  "property_qualification_overrides",
  "property_qualification_override_audit",
  "property_feedback",
  "property_feedback_audit",
  "ranking_adjustment_profile",
  "ranking_adjustment_audit",
] as const;

export type StatementId =
  | "schema.migrations"
  | "schema.objects"
  | `schema.columns.${(typeof schemaTables)[number]}`
  | "schema.indexes"
  | "schema.aggregates"
  | "schema.source_counts"
  | "schema.ranking_profile"
  | `${"original" | "corrected"}.${"default" | "qualification" | "buybox"}.${"count" | "page"}.plan`
  | `corrected.${"default.page" | "qualification.count" | "qualification.page" | "buybox.count" | "buybox.page"}.select`;

export type QuerySpec = {
  readonly id: StatementId;
  readonly sql: string;
  readonly params: readonly (string | number | null)[];
  readonly provenance: "fixed-introspection" | "generated-corrected" | "generated-original";
};

type QueryRow = {
  detail?: unknown;
  total?: unknown;
  type?: unknown;
  name?: unknown;
  table_name?: unknown;
  index_name?: unknown;
  column_name?: unknown;
  seqno?: unknown;
  migration_count?: unknown;
  required_migration_count?: unknown;
  watchlist_count?: unknown;
  evidence_count?: unknown;
  source_count?: unknown;
  enabled?: unknown;
  minimum_samples?: unknown;
  maximum_adjustment?: unknown;
  [key: string]: unknown;
};
type QueryResult = {
  readonly results: QueryRow[];
  readonly meta: { rows_read: number; rows_written: number; duration: number };
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type FailureCategory =
  | "arguments"
  | "credentials"
  | "network_or_timeout"
  | "http"
  | "provider"
  | "response_contract"
  | "discovery"
  | "statement_contract"
  | "request_budget"
  | "schema"
  | "plan_guard"
  | "metadata"
  | "execution_deadline"
  | "internal";
type ProviderCategory =
  | "read_quota"
  | "write_quota"
  | "storage"
  | "timeout"
  | "memory_resource"
  | "authorization"
  | "sql_schema"
  | "request_contract"
  | "unclassified";

class DiagnosticError extends Error {
  readonly stage: string;
  readonly category: FailureCategory;
  readonly providerCode: number | undefined;
  readonly httpStatus: number | undefined;
  readonly providerCategory: ProviderCategory | undefined;

  constructor(
    stage: string,
    category: FailureCategory,
    options: {
      providerCode?: number;
      httpStatus?: number;
      providerCategory?: ProviderCategory;
    } = {},
  ) {
    super(`${stage}:${category}`);
    this.stage = stage;
    this.category = category;
    this.providerCode = options.providerCode;
    this.httpStatus = options.httpStatus;
    this.providerCategory = options.providerCategory;
  }
}

export function sanitizeFailure(error: unknown) {
  if (error instanceof DiagnosticError) {
    return {
      stage: safeStage(error.stage),
      category: error.category,
      ...(Number.isFinite(error.httpStatus) ? { httpStatus: error.httpStatus } : {}),
      ...(Number.isFinite(error.providerCode) ? { providerCode: error.providerCode } : {}),
      ...(error.providerCategory ? { providerCategory: error.providerCategory } : {}),
    };
  }
  return { stage: "diagnostic", category: "internal" as const };
}

function safeStage(value: string) {
  return new Set([
    "arguments",
    "credentials",
    "capture",
    "discovery",
    "schema",
    "plans",
    "execution",
    "request",
  ]).has(value)
    ? value
    : "diagnostic";
}

const syntheticBuyBox = {
  property_types_json: '["sfh"]',
  jurisdictions_json: '["norfolk-va"]',
  neighborhoods_json: "[]",
  zips_json: "[]",
  min_size_value: 1_000,
  max_size_value: 10_000,
  size_basis: "lot_square_feet",
  min_value_cents: null,
  max_value_cents: null,
  value_basis: "assessed_value",
  value_assumption_label: null,
  distress_phases_json: '["filed_foreclosure"]',
} as const;

type CapturedQuery = { sql: string; params: (string | number | null)[]; method: "first" | "all" };
export type RankingProfile = {
  enabled: number;
  minimum_samples: number;
  maximum_adjustment: number;
} | null;

class CaptureStatement {
  private params: (string | number | null)[] = [];
  private readonly sql: string;
  private readonly captured: CapturedQuery[];
  private readonly profile: RankingProfile;

  constructor(sql: string, captured: CapturedQuery[], profile: RankingProfile) {
    this.sql = sql;
    this.captured = captured;
    this.profile = profile;
  }

  bind(...params: unknown[]) {
    this.params = params.map((value) => {
      if (value === null || typeof value === "string") {
        return value;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      throw new DiagnosticError("capture", "statement_contract");
    });
    return this;
  }

  first<T>() {
    this.captured.push({ sql: this.sql, params: [...this.params], method: "first" });
    if (this.sql === "SELECT * FROM buy_boxes WHERE id=?") {
      return Promise.resolve(syntheticBuyBox as T);
    }
    if (this.sql.includes("FROM ranking_adjustment_profile")) {
      return Promise.resolve(this.profile as T);
    }
    if (/COUNT\(\*\) AS total/i.test(this.sql)) {
      return Promise.resolve({ total: 0 } as T);
    }
    return Promise.resolve(null);
  }

  all<T>() {
    this.captured.push({ sql: this.sql, params: [...this.params], method: "all" });
    return Promise.resolve({
      success: true,
      results: [],
      meta: { changes: 0 },
    } as unknown as D1Result<T>);
  }
}

function isDashboardCount(query: CapturedQuery) {
  return (
    query.method === "first" &&
    (/SELECT COUNT\(\*\) AS total FROM watchlist_properties/i.test(query.sql) ||
      /SELECT COUNT\(\*\) AS total FROM qualified/i.test(query.sql))
  );
}

function isDashboardPage(query: CapturedQuery) {
  return (
    query.method === "all" &&
    query.sql.startsWith("WITH qualified AS MATERIALIZED") &&
    /SELECT \* FROM qualified .*LIMIT \? OFFSET \?$/s.test(query.sql)
  );
}

export async function captureDashboardQueries(profile: RankingProfile) {
  const scenarios = [
    ["default", {}],
    ["qualification", { qualification: "qualified" }],
    ["buybox", { buyBoxId: SYNTHETIC_BUY_BOX_ID, fit: "match", sort: "fit" }],
  ] as const;
  const output = new Map<string, CapturedQuery>();
  const prerequisites: CapturedQuery[] = [];
  for (const [scenario, input] of scenarios) {
    const captured: CapturedQuery[] = [];
    const binding = {
      prepare(sql: string) {
        return new CaptureStatement(sql, captured, profile);
      },
    } as unknown as D1Database;
    await loadDashboard(binding, input);
    const count = captured.filter(isDashboardCount);
    const page = captured.filter(isDashboardPage);
    if (count.length !== 1 || page.length !== 1) {
      throw new DiagnosticError("capture", "statement_contract");
    }
    output.set(`${scenario}.count`, count[0]!);
    output.set(`${scenario}.page`, page[0]!);
    prerequisites.push(
      ...captured.filter(
        (query) =>
          query.sql === "SELECT * FROM buy_boxes WHERE id=?" ||
          query.sql.includes("FROM ranking_adjustment_profile"),
      ),
    );
  }
  return { queries: output, prerequisites };
}

export function statementMetrics(spec: Pick<QuerySpec, "sql" | "params">) {
  return { bytes: new TextEncoder().encode(spec.sql).byteLength, binds: spec.params.length };
}

export function validateStatement(spec: QuerySpec) {
  const { bytes, binds } = statementMetrics(spec);
  if (bytes > MAX_SQL_BYTES || binds > MAX_BINDS || hasUnquotedSemicolon(spec.sql)) {
    throw new DiagnosticError("request", "statement_contract");
  }
  const allowedPragma =
    spec.provenance === "fixed-introspection" &&
    ((spec.id === "schema.indexes" &&
      spec.sql === 'PRAGMA index_info("foreclosure_property_key_idx")') ||
      schemaTables.some(
        (table) =>
          spec.id === `schema.columns.${table}` && spec.sql === `PRAGMA table_info("${table}")`,
      ));
  if (!allowedPragma && !/^\s*(?:SELECT|WITH|EXPLAIN QUERY PLAN)\b/i.test(spec.sql)) {
    throw new DiagnosticError("request", "statement_contract");
  }
  if (
    /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|ANALYZE|VACUUM|ATTACH|DETACH)\b/i.test(spec.sql)
  ) {
    throw new DiagnosticError("request", "statement_contract");
  }
  for (const value of spec.params) {
    if (
      value !== null &&
      typeof value !== "string" &&
      !(typeof value === "number" && Number.isFinite(value))
    ) {
      throw new DiagnosticError("request", "statement_contract");
    }
  }
}

function hasUnquotedSemicolon(sql: string) {
  let quoted = false;
  for (let index = 0; index < sql.length; index++) {
    if (sql[index] === "'") {
      if (quoted && sql[index + 1] === "'") {
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (sql[index] === ";" && !quoted) {
      return true;
    }
  }
  return quoted;
}

function originalSql(corrected: string) {
  const occurrences = corrected.split(PROPERTY_HINT).length - 1;
  const containsQualification = corrected.includes("qualification_status");
  if (containsQualification && occurrences !== 3) {
    throw new DiagnosticError("capture", "statement_contract");
  }
  if (!containsQualification && occurrences !== 0) {
    throw new DiagnosticError("capture", "statement_contract");
  }
  return containsQualification ? corrected.replaceAll(PROPERTY_HINT, "") : corrected;
}

const fixedIntrospection: readonly QuerySpec[] = [
  {
    id: "schema.source_counts",
    provenance: "fixed-introspection",
    sql: "SELECT source_id,COUNT(*) AS evidence_count,SUM(CASE WHEN snapshot_presence='present' THEN 1 ELSE 0 END) AS present_count FROM foreclosure_records GROUP BY source_id",
    params: [],
  },
  {
    id: "schema.ranking_profile",
    provenance: "fixed-introspection",
    sql: "SELECT enabled,minimum_samples,maximum_adjustment FROM ranking_adjustment_profile WHERE id='shared'",
    params: [],
  },
  {
    id: "schema.migrations",
    provenance: "fixed-introspection",
    sql: "SELECT COUNT(*) AS migration_count,SUM(CASE WHEN name='0006_partner_decision_support.sql' THEN 1 ELSE 0 END) AS required_migration_count FROM d1_migrations",
    params: [],
  },
  {
    id: "schema.objects",
    provenance: "fixed-introspection",
    sql: "SELECT type,name FROM sqlite_master WHERE name IN ('foreclosure_records','foreclosure_property_key_idx','watchlist_properties','property_rechecks','property_sales','user_alert_preferences','property_qualification_overrides','property_qualification_override_audit','property_feedback','property_feedback_audit','ranking_adjustment_profile','ranking_adjustment_audit') ORDER BY type,name",
    params: [],
  },
  // D1 authorizes the documented PRAGMA statements, not pragma_* table-valued functions.
  ...schemaTables.map(
    (table): QuerySpec => ({
      id: `schema.columns.${table}`,
      provenance: "fixed-introspection",
      sql: `PRAGMA table_info("${table}")`,
      params: [],
    }),
  ),
  {
    id: "schema.indexes",
    provenance: "fixed-introspection",
    sql: 'PRAGMA index_info("foreclosure_property_key_idx")',
    params: [],
  },
  {
    id: "schema.aggregates",
    provenance: "fixed-introspection",
    sql: "SELECT (SELECT COUNT(*) FROM watchlist_properties) AS watchlist_count,(SELECT COUNT(*) FROM foreclosure_records) AS evidence_count,(SELECT COUNT(*) FROM (SELECT source_id FROM foreclosure_records GROUP BY source_id)) AS source_count",
    params: [],
  },
];

export async function buildStatementCatalog(profile: RankingProfile) {
  const capture = await captureDashboardQueries(profile);
  const catalog: QuerySpec[] = [...fixedIntrospection];
  for (const scenario of ["default", "qualification", "buybox"] as const) {
    for (const kind of ["count", "page"] as const) {
      const generated = capture.queries.get(`${scenario}.${kind}`);
      if (!generated) {
        throw new DiagnosticError("capture", "statement_contract");
      }
      const corrected: QuerySpec = {
        id: `corrected.${scenario}.${kind}.plan`,
        sql: `EXPLAIN QUERY PLAN ${generated.sql}`,
        params: generated.params,
        provenance: "generated-corrected",
      };
      const original: QuerySpec = {
        id: `original.${scenario}.${kind}.plan`,
        sql: `EXPLAIN QUERY PLAN ${originalSql(generated.sql)}`,
        params: generated.params,
        provenance: "generated-original",
      };
      validateStatement(original);
      validateStatement(corrected);
      // The three failing original access shapes suffice; omit redundant plans
      // so native schema introspection plus all corrected executions fit 30 calls.
      if (
        (scenario === "default" && kind === "page") ||
        (scenario === "qualification" && kind === "count") ||
        (scenario === "buybox" && kind === "page")
      ) {
        catalog.push(original);
      }
      catalog.push(corrected);
    }
  }
  for (const key of [
    "default.page",
    "qualification.count",
    "qualification.page",
    "buybox.count",
    "buybox.page",
  ] as const) {
    const generated = capture.queries.get(key)!;
    const select: QuerySpec = {
      id: `corrected.${key}.select`,
      sql: generated.sql,
      params: generated.params,
      provenance: "generated-corrected",
    };
    validateStatement(select);
    catalog.push(select);
  }
  for (const spec of fixedIntrospection) {
    validateStatement(spec);
  }
  return { catalog, capture };
}

function providerCategory(errors: unknown): {
  providerCategory: ProviderCategory;
  providerCode?: number;
} {
  const first =
    Array.isArray(errors) && errors[0] && typeof errors[0] === "object"
      ? (errors[0] as { code?: unknown; message?: unknown })
      : null;
  const message = typeof first?.message === "string" ? first.message : "";
  const code =
    typeof first?.code === "number" && Number.isFinite(first.code) ? first.code : undefined;
  const category: ProviderCategory = /rows?\s+read|read.*quota|quota.*read/i.test(message)
    ? "read_quota"
    : /rows?\s+written|write.*quota|quota.*write/i.test(message)
      ? "write_quota"
      : /storage|disk|database.*size|full/i.test(message)
        ? "storage"
        : /timeout|duration|execution time/i.test(message)
          ? "timeout"
          : /memory|resource|cpu/i.test(message)
            ? "memory_resource"
            : /auth|permission|token/i.test(message)
              ? "authorization"
              : /schema|syntax|no such|column|table/i.test(message)
                ? "sql_schema"
                : /batch|body|parameter|binding|request/i.test(message)
                  ? "request_contract"
                  : "unclassified";
  return { providerCategory: category, ...(code === undefined ? {} : { providerCode: code }) };
}

export class DiagnosticRestClient {
  private databaseId: string | undefined;
  private sqlRequests = 0;
  private totalRequests = 0;
  private readonly allowlist = new Map<StatementId, QuerySpec>();
  private readonly executedSelects = new Set<StatementId>();
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly apiBase: string;

  constructor(
    accountId: string,
    apiToken: string,
    fetchImpl: FetchLike = fetch,
    specs: readonly QuerySpec[] = [],
    now: () => number = Date.now,
    apiBase = API_BASE,
  ) {
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.apiBase = apiBase;
    this.register(specs);
  }

  register(specs: readonly QuerySpec[]) {
    for (const spec of specs) {
      const existing = this.allowlist.get(spec.id);
      if (
        existing &&
        (existing.sql !== spec.sql ||
          JSON.stringify(existing.params) !== JSON.stringify(spec.params))
      ) {
        throw new DiagnosticError("request", "statement_contract");
      }
      this.allowlist.set(spec.id, spec);
    }
  }

  get requestCount() {
    return this.sqlRequests;
  }

  get totalRequestCount() {
    return this.totalRequests;
  }

  private async request(path: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new DiagnosticError("execution", "execution_deadline");
    }
    if (this.totalRequests >= MAX_SQL_REQUESTS) {
      throw new DiagnosticError("request", "request_budget");
    }
    this.totalRequests++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(REQUEST_TIMEOUT_MS, timeoutMs));
    try {
      const response = await this.fetchImpl(
        `${this.apiBase}/accounts/${encodeURIComponent(this.accountId)}/d1/database${path}`,
        {
          ...init,
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        },
      );
      let payload: unknown;
      try {
        payload = JSON.parse(await response.text());
      } catch {
        throw new DiagnosticError("request", "response_contract");
      }
      if (!response.ok) {
        const classified = providerCategory((payload as { errors?: unknown })?.errors);
        throw new DiagnosticError("request", "http", {
          httpStatus: response.status,
          ...classified,
        });
      }
      if (
        !payload ||
        typeof payload !== "object" ||
        (payload as { success?: unknown }).success !== true
      ) {
        const classified = providerCategory((payload as { errors?: unknown })?.errors);
        throw new DiagnosticError("request", "provider", classified);
      }
      return payload as {
        result: unknown;
        result_info?: { total_pages?: unknown };
      };
    } catch (error) {
      if (error instanceof DiagnosticError) {
        throw error;
      }
      throw new DiagnosticError("request", "network_or_timeout");
    } finally {
      clearTimeout(timer);
    }
  }

  async discover() {
    const matches: string[] = [];
    for (let page = 1; page <= MAX_DISCOVERY_PAGES; page++) {
      const payload = await this.request(`?page=${page}&per_page=100`, { method: "GET" });
      if (!Array.isArray(payload.result)) {
        throw new DiagnosticError("discovery", "response_contract");
      }
      for (const value of payload.result) {
        if (!value || typeof value !== "object") {
          throw new DiagnosticError("discovery", "response_contract");
        }
        const row = value as { name?: unknown; uuid?: unknown };
        if (row.name === DATABASE_NAME) {
          if (typeof row.uuid !== "string" || !row.uuid) {
            throw new DiagnosticError("discovery", "response_contract");
          }
          matches.push(row.uuid);
        }
      }
      const pages = payload.result_info?.total_pages;
      if (
        pages !== undefined &&
        (!Number.isInteger(pages) || Number(pages) < 1 || Number(pages) > MAX_DISCOVERY_PAGES)
      ) {
        throw new DiagnosticError("discovery", "response_contract");
      }
      const done = pages === undefined ? payload.result.length < 100 : page >= Number(pages);
      if (done) {
        if (matches.length !== 1) {
          throw new DiagnosticError("discovery", "discovery");
        }
        this.databaseId = matches[0];
        return;
      }
    }
    throw new DiagnosticError("discovery", "discovery");
  }

  async run(spec: QuerySpec, executionDeadline?: number): Promise<QueryResult> {
    if (!this.databaseId) {
      throw new DiagnosticError("request", "discovery");
    }
    const allowed = this.allowlist.get(spec.id);
    if (
      !allowed ||
      allowed.sql !== spec.sql ||
      allowed.provenance !== spec.provenance ||
      JSON.stringify(allowed.params) !== JSON.stringify(spec.params)
    ) {
      throw new DiagnosticError("request", "statement_contract");
    }
    validateStatement(spec);
    if (
      spec.provenance === "generated-original" &&
      (!spec.id.startsWith("original.") || !/^EXPLAIN QUERY PLAN\b/i.test(spec.sql))
    ) {
      throw new DiagnosticError("request", "statement_contract");
    }
    const remaining =
      executionDeadline === undefined ? REQUEST_TIMEOUT_MS : executionDeadline - this.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      throw new DiagnosticError("execution", "execution_deadline");
    }
    if (spec.id.endsWith(".select")) {
      if (this.executedSelects.has(spec.id)) {
        throw new DiagnosticError("request", "statement_contract");
      }
      this.executedSelects.add(spec.id);
    }
    if (this.sqlRequests >= MAX_SQL_REQUESTS || this.totalRequests >= MAX_SQL_REQUESTS) {
      throw new DiagnosticError("request", "request_budget");
    }
    this.sqlRequests++;
    const payload = await this.request(
      `/${encodeURIComponent(this.databaseId)}/query`,
      { method: "POST", body: JSON.stringify({ sql: spec.sql, params: spec.params }) },
      Math.min(REQUEST_TIMEOUT_MS, remaining),
    );
    if (!Array.isArray(payload.result) || payload.result.length !== 1) {
      throw new DiagnosticError("request", "response_contract");
    }
    const result = payload.result[0] as {
      success?: unknown;
      results?: unknown;
      meta?: {
        rows_read?: unknown;
        rows_written?: unknown;
        duration?: unknown;
        [key: string]: unknown;
      };
    };
    if (result?.success !== true || !Array.isArray(result.results)) {
      throw new DiagnosticError("request", "response_contract");
    }
    const rowsRead = result.meta?.rows_read;
    const rowsWritten = result.meta?.rows_written;
    const duration = result.meta?.duration;
    if (
      typeof rowsRead !== "number" ||
      !Number.isFinite(rowsRead) ||
      rowsRead < 0 ||
      rowsWritten !== 0 ||
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration < 0
    ) {
      throw new DiagnosticError("request", "metadata");
    }
    return {
      results: result.results as Record<string, unknown>[],
      meta: { rows_read: rowsRead, rows_written: 0, duration },
    };
  }
}

const requiredColumns = new Map<string, readonly string[]>([
  ["property_rechecks", ["id", "property_key", "findings_json"]],
  ["property_sales", ["candidate_property_key", "identity_status"]],
  ["user_alert_preferences", ["version"]],
  ["property_qualification_overrides", ["operation_token"]],
  ["property_qualification_override_audit", ["operation_token"]],
  ["property_feedback", ["reviewer_email", "data_source", "operation_token"]],
  ["property_feedback_audit", ["operation_token"]],
  [
    "ranking_adjustment_profile",
    ["id", "enabled", "minimum_samples", "maximum_adjustment", "operation_token"],
  ],
  ["ranking_adjustment_audit", ["operation_token"]],
]);

export function validateSchema(results: Map<string, QueryResult>) {
  const migration = results.get("schema.migrations")?.results[0];
  if (
    !migration ||
    !Number.isSafeInteger(migration.migration_count) ||
    (migration.migration_count as number) < 0 ||
    migration.required_migration_count !== 1
  ) {
    throw new DiagnosticError("schema", "schema");
  }
  const objects = new Set(
    (results.get("schema.objects")?.results ?? []).map(
      (row) => `${String(row.type)}:${String(row.name)}`,
    ),
  );
  for (const object of [
    "table:foreclosure_records",
    "index:foreclosure_property_key_idx",
    "table:watchlist_properties",
    ...[...requiredColumns.keys()].map((name) => `table:${name}`),
  ]) {
    if (!objects.has(object)) {
      throw new DiagnosticError("schema", "schema");
    }
  }
  const columns = new Set(
    schemaTables.flatMap((table) =>
      (results.get(`schema.columns.${table}`)?.results ?? []).map(
        (row) => `${table}.${String(row.name)}`,
      ),
    ),
  );
  for (const [table, names] of requiredColumns) {
    for (const name of names) {
      if (!columns.has(`${table}.${name}`)) {
        throw new DiagnosticError("schema", "schema");
      }
    }
  }
  const index = results.get("schema.indexes")?.results ?? [];
  if (index.length !== 1 || index[0]?.name !== "property_key" || Number(index[0]?.seqno) !== 0) {
    throw new DiagnosticError("schema", "schema");
  }
  const aggregate = results.get("schema.aggregates")?.results[0];
  for (const key of ["watchlist_count", "evidence_count", "source_count"] as const) {
    if (!aggregate || !Number.isSafeInteger(aggregate[key]) || (aggregate[key] as number) < 0) {
      throw new DiagnosticError("schema", "schema");
    }
  }
  return {
    migrationCount: migration.migration_count as number,
    requiredMigration: "present" as const,
    requiredObjects: "present" as const,
    requiredColumns: "present" as const,
    propertyIndex: "valid" as const,
    aggregates: {
      watchlist: aggregate?.watchlist_count as number,
      evidence: aggregate?.evidence_count as number,
      sources: aggregate?.source_count as number,
    },
  };
}

export function validateRankingProfile(result: QueryResult): RankingProfile {
  // No persisted profile is normal: loadDashboard uses its disabled defaults.
  if (result.results.length === 0) {
    return null;
  }
  if (result.results.length !== 1) {
    throw new DiagnosticError("schema", "schema");
  }
  const row = result.results[0]!;
  if (
    !Number.isSafeInteger(row.enabled) ||
    ![0, 1].includes(row.enabled as number) ||
    !Number.isSafeInteger(row.minimum_samples) ||
    (row.minimum_samples as number) < 0 ||
    !Number.isSafeInteger(row.maximum_adjustment) ||
    (row.maximum_adjustment as number) < 0
  ) {
    throw new DiagnosticError("schema", "schema");
  }
  return {
    enabled: row.enabled as number,
    minimum_samples: row.minimum_samples as number,
    maximum_adjustment: row.maximum_adjustment as number,
  };
}

export function summarizePlan(rows: readonly QueryRow[], requireAccesses: boolean) {
  let propertyIndexPaths = 0;
  let rejectedPaths = 0;
  for (const row of rows) {
    const detail = typeof row.detail === "string" ? row.detail : null;
    if (detail === null) {
      throw new DiagnosticError("plans", "response_contract");
    }
    if (!/\b(?:SCAN|SEARCH)\s+(?:r|owners)\b/i.test(detail)) {
      continue;
    }
    if (
      /\bSEARCH\s+(?:r|owners)\b/i.test(detail) &&
      /foreclosure_property_key_idx/i.test(detail) &&
      /property_key\s*=\s*\?/i.test(detail)
    ) {
      propertyIndexPaths++;
    } else {
      rejectedPaths++;
    }
  }
  if (rejectedPaths > 0 || (requireAccesses && propertyIndexPaths === 0)) {
    throw new DiagnosticError("plans", "plan_guard");
  }
  return { propertyIndexPaths, rejectedPaths };
}

function planSummary(rows: readonly QueryRow[]) {
  let propertyIndexPaths = 0;
  let sourceOnlyOrScanPaths = 0;
  for (const row of rows) {
    const detail = typeof row.detail === "string" ? row.detail : null;
    if (detail === null) {
      throw new DiagnosticError("plans", "response_contract");
    }
    if (!/\b(?:SCAN|SEARCH)\s+(?:r|owners)\b/i.test(detail)) {
      continue;
    }
    if (/foreclosure_property_key_idx/i.test(detail) && /property_key\s*=\s*\?/i.test(detail)) {
      propertyIndexPaths++;
    } else {
      sourceOnlyOrScanPaths++;
    }
  }
  return { propertyIndexPaths, sourceOnlyOrScanPaths };
}

function sourceCounts(result: QueryResult) {
  const knownSources = new Set([
    "travis-tax-delinquency",
    "norfolk-delinquent-property-tax",
    "norfolk-code-violations",
    "nyc-acris-common-charge-liens",
    "denver-public-trustee-ned",
    "oc-three-year-tax-delinquency",
    "oc-impending-power-to-sell",
    "la-ttc-tax-auction",
    "cnpa-trustee-notices",
  ]);
  const seen = new Set<string>();
  const output = [...knownSources, "other_sources"].map((id) => ({
    id,
    evidenceCount: 0,
    presentCount: 0,
  }));
  for (const row of result.results) {
    const id = row["source_id"];
    const count = row.evidence_count;
    const present = row["present_count"];
    if (
      typeof id !== "string" ||
      seen.has(id) ||
      !Number.isSafeInteger(count) ||
      (count as number) < 0 ||
      !Number.isSafeInteger(present) ||
      (present as number) < 0 ||
      (present as number) > (count as number)
    ) {
      throw new DiagnosticError("schema", "response_contract");
    }
    seen.add(id);
    const entry = output.find((item) => item.id === (knownSources.has(id) ? id : "other_sources"))!;
    entry.evidenceCount += count as number;
    entry.presentCount += present as number;
    if (!Number.isSafeInteger(entry.evidenceCount) || !Number.isSafeInteger(entry.presentCount)) {
      throw new DiagnosticError("schema", "response_contract");
    }
  }
  return output;
}

function executionSummary(spec: QuerySpec, result: QueryResult) {
  const countStatement = spec.id.includes(".count.");
  if (countStatement && result.results.length !== 1) {
    throw new DiagnosticError("execution", "response_contract");
  }
  const reportedCount = countStatement ? result.results[0]?.total : result.results.length;
  if (!Number.isSafeInteger(reportedCount) || (reportedCount as number) < 0) {
    throw new DiagnosticError("execution", "response_contract");
  }
  return {
    id: spec.id,
    status: "ok" as const,
    ...statementMetrics(spec),
    rowCount: result.results.length,
    ...(countStatement ? { matchCount: reportedCount as number } : {}),
    durationMs: result.meta.duration,
    rowsRead: result.meta.rows_read,
    rowsWritten: 0,
  };
}

export async function runDiagnostic(
  argv = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = fetch,
  now: () => number = Date.now,
) {
  const executeCorrected = argv.length === 1 && argv[0] === "--execute-corrected";
  const validArgs = argv.length === 0 || executeCorrected;
  const schemaRequests: Record<string, unknown>[] = [];
  const planEvidence: Record<string, unknown>[] = [];
  const executionEvidence: Record<string, unknown>[] = [];
  const report: Record<string, unknown> = {
    version: 1,
    mode: executeCorrected ? "execute-corrected" : "plans-only",
    status: "failed",
    database: { name: DATABASE_NAME, discovery: "pending" },
    syntheticCriteria: {
      purpose: "synthetic buybox boundary; not persisted",
      persistedRemotely: false,
      jurisdictionCount: 1,
      propertyTypeCount: 1,
      sizeBoundary: true,
      distressPhaseCount: 1,
    },
    capturedStatements: [],
    schema: { status: "pending", requests: schemaRequests },
    plans: planEvidence,
    executions: executionEvidence,
    budget: { sqlRequests: 0, sqlRequestLimit: MAX_SQL_REQUESTS },
  };
  let client: DiagnosticRestClient | undefined;
  try {
    if (!validArgs) {
      throw new DiagnosticError("arguments", "arguments");
    }
    const accountId = env["CLOUDFLARE_ACCOUNT_ID"];
    const apiToken = env["CLOUDFLARE_API_TOKEN"];
    if (!accountId || !apiToken) {
      throw new DiagnosticError("credentials", "credentials");
    }
    client = new DiagnosticRestClient(accountId, apiToken, fetchImpl, fixedIntrospection, now);
    await client.discover();
    report["database"] = { name: DATABASE_NAME, discovery: "unique" };

    const schemaResults = new Map<string, QueryResult>();
    for (const spec of fixedIntrospection) {
      const started = now();
      try {
        const result = await client.run(spec);
        schemaResults.set(spec.id, result);
        schemaRequests.push({
          id: spec.id,
          status: "ok",
          ...statementMetrics(spec),
          rowCount: result.results.length,
          durationMs: result.meta.duration,
          elapsedMs: Math.max(0, now() - started),
          rowsRead: result.meta.rows_read,
          rowsWritten: 0,
        });
      } catch (error) {
        schemaRequests.push({
          id: spec.id,
          status: "failed",
          ...statementMetrics(spec),
          elapsedMs: Math.max(0, now() - started),
          failure: sanitizeFailure(error),
        });
        throw error;
      }
    }
    const profileResult = schemaResults.get("schema.ranking_profile");
    if (!profileResult) {
      throw new DiagnosticError("schema", "schema");
    }
    const profile = validateRankingProfile(profileResult);
    const schemaSummary = validateSchema(schemaResults);
    const sources = sourceCounts(schemaResults.get("schema.source_counts")!);
    if (
      sources.reduce((total, source) => total + source.evidenceCount, 0) !==
      schemaSummary.aggregates.evidence
    ) {
      throw new DiagnosticError("schema", "response_contract");
    }
    report["schema"] = {
      status: "valid",
      ...schemaSummary,
      sourceCounts: sources,
      rankingProfile: "captured",
      requests: schemaRequests,
    };

    const { catalog, capture } = await buildStatementCatalog(profile);
    client.register(catalog);
    report["capturedStatements"] = [...capture.queries.entries()].map(([id, query]) => ({
      id,
      ...statementMetrics({ sql: query.sql, params: query.params }),
    }));
    report["prerequisites"] = {
      rankingProfileCaptured: capture.prerequisites.some((query) =>
        query.sql.includes("ranking_adjustment_profile"),
      ),
      syntheticBuyBoxCaptured: capture.prerequisites.some(
        (query) => query.sql === "SELECT * FROM buy_boxes WHERE id=?",
      ),
    };

    for (const spec of catalog.filter((entry) => entry.id.endsWith(".plan"))) {
      const started = now();
      try {
        const result = await client.run(spec);
        const requiresAccesses = spec.sql.includes("qualification_status");
        const summary = spec.id.startsWith("corrected.")
          ? summarizePlan(result.results, requiresAccesses)
          : planSummary(result.results);
        planEvidence.push({
          id: spec.id,
          status: "valid",
          ...statementMetrics(spec),
          ...summary,
          rowCount: result.results.length,
          durationMs: result.meta.duration,
          elapsedMs: Math.max(0, now() - started),
          rowsRead: result.meta.rows_read,
          rowsWritten: 0,
        });
      } catch (error) {
        planEvidence.push({
          id: spec.id,
          status: "failed",
          ...statementMetrics(spec),
          elapsedMs: Math.max(0, now() - started),
          failure: sanitizeFailure(error),
        });
        throw error;
      }
    }

    if (executeCorrected) {
      const deadline = now() + EXECUTION_BUDGET_MS;
      for (const spec of catalog.filter((entry) => entry.id.endsWith(".select"))) {
        const started = now();
        try {
          const summary = executionSummary(spec, await client.run(spec, deadline));
          executionEvidence.push({ ...summary, elapsedMs: Math.max(0, now() - started) });
        } catch (error) {
          executionEvidence.push({
            id: spec.id,
            status: "failed",
            ...statementMetrics(spec),
            elapsedMs: Math.max(0, now() - started),
            failure: sanitizeFailure(error),
          });
          throw error;
        }
      }
    }
    report["status"] = "ok";
  } catch (error) {
    report["failure"] = sanitizeFailure(error);
  } finally {
    report["budget"] = {
      sqlRequests: client?.requestCount ?? 0,
      sqlRequestLimit: MAX_SQL_REQUESTS,
      totalRequests: client?.totalRequestCount ?? 0,
      totalRequestLimit: MAX_SQL_REQUESTS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      correctedExecutionBudgetMs: EXECUTION_BUDGET_MS,
    };
  }
  return report;
}

async function main() {
  const report = await runDiagnostic();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report["status"] !== "ok") {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
