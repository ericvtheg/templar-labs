import {
  type NorfolkTaxRow,
  type NorfolkViolationRow,
  norfolkTaxMetadataUrl,
  norfolkViolationMetadataUrl,
  norfolkViolationUrl,
  parseNorfolkTaxRows,
  parseNorfolkViolations,
} from "./current-parsers.ts";
import { evidenceLink, evidenceStatusState } from "./evidence-semantics.ts";

const norfolkTaxResourceUrl = "https://data.norfolk.gov/resource/7qie-z5gv.json";
const pageSize = 1_000;
const maximumRows = 10_000;
const maximumBytes = 4 * 1024 * 1024;
const taxCurrencySelect =
  "biitem,bwtaxyear,bwtaxinstallment,owner_name,address," +
  "round(taxdue,2) as taxdue,round(penaltydue,2) as penaltydue," +
  "round(interestdue,2) as interestdue,round(total,2) as total,account";

export type RecheckSourceFinding = {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly status: "success" | "failed" | "unsupported";
  readonly presence: "present" | "absent" | "unknown";
  readonly fetchedAt: string | null;
  readonly publicationAsOf: string | null;
  readonly sourceAsOf: string | null;
  readonly metadataUrl: string | null;
  readonly queryUrl: string | null;
  readonly recordCount: number;
  readonly records: readonly RecheckEvidenceRecord[];
  readonly boundary: string;
  readonly error: string | null;
};

export type RecheckEvidenceRecord = {
  readonly sourceRecordId: string;
  readonly signalType: "tax_delinquency" | "code_violation";
  readonly statusText: string;
  readonly statusState: "active" | "resolved" | "unknown";
  readonly eventDate: string | null;
  readonly sourceAsOf: string | null;
  readonly fetchedAt: string;
  readonly recordUrl: string;
  readonly facts: Readonly<Record<string, string | number | null>>;
};

export type NorfolkDistressFindings = {
  readonly tax: RecheckSourceFinding;
  readonly code: RecheckSourceFinding;
};

type TaxApiRow = {
  biitem?: string;
  bwtaxyear?: string;
  bwtaxinstallment?: string;
  owner_name?: string;
  address?: string;
  taxdue?: string;
  penaltydue?: string;
  interestdue?: string;
  total?: string;
  account?: string;
};

export async function fetchNorfolkDistressEvidence(
  fetchImpl: typeof fetch,
  parcelId: string,
  now = new Date(),
): Promise<NorfolkDistressFindings> {
  if (!/^\d{8}$/.test(parcelId)) {
    throw new Error("Norfolk distress recheck requires an exact eight-digit literal PIN.");
  }
  const fetchedAt = now.toISOString();
  const [tax, code] = await Promise.all([
    fetchTaxFinding(fetchImpl, parcelId, fetchedAt).catch((cause) =>
      failedFinding(
        "norfolk-delinquent-property-tax",
        "City of Norfolk · Delinquent Property Taxes",
        norfolkTaxMetadataUrl,
        safeError(cause),
      ),
    ),
    fetchCodeFinding(fetchImpl, parcelId, fetchedAt).catch((cause) =>
      failedFinding(
        "norfolk-code-violations",
        "City of Norfolk · Neighborhood Quality Violations",
        norfolkViolationMetadataUrl,
        safeError(cause),
      ),
    ),
  ]);
  return { tax, code };
}

async function fetchTaxFinding(fetchImpl: typeof fetch, parcelId: string, fetchedAt: string) {
  const where = `biitem='${parcelId}'`;
  const queryUrl = targetedUrl(
    norfolkTaxResourceUrl,
    where,
    "bwtaxyear,bwtaxinstallment,account",
    0,
    taxCurrencySelect,
  );
  const stable = await stableTargetedFetch<TaxApiRow>(
    fetchImpl,
    "7qie-z5gv",
    norfolkTaxMetadataUrl,
    norfolkTaxResourceUrl,
    where,
    "bwtaxyear,bwtaxinstallment,account",
    taxCurrencySelect,
    assertTaxCurrencyMetadata,
  );
  if (stable.rows.some((row) => row.biitem !== parcelId)) {
    throw new Error("Norfolk tax targeted query returned a different literal PIN.");
  }
  const parsedRows: NorfolkTaxRow[] = stable.rows.map((row) => ({
    pin: row.biitem,
    year: row.bwtaxyear,
    installment: row.bwtaxinstallment,
    address: row.address,
    ownerName: row.owner_name,
    taxDue: row.taxdue,
    penaltyDue: row.penaltydue,
    interestDue: row.interestdue,
    total: row.total,
    account: row.account,
  }));
  const sourceAsOf = epoch(stable.metadata["rowsUpdatedAt"]);
  const parsed = parseNorfolkTaxRows(parsedRows, {
    observedAt: fetchedAt,
    sourceUpdatedAt: sourceAsOf,
  });
  const records = parsed.map((row) => {
    const link = evidenceLink({
      source_id: row.sourceId,
      source_record_id: row.sourceRecordId,
      source_url: row.sourceUrl,
      source_document_url: row.sourceDocumentUrl,
      apn: row.apn,
      tax_year: row.taxYear,
      tax_installment: row.taxInstallment,
    });
    return {
      sourceRecordId: row.sourceRecordId,
      signalType: "tax_delinquency" as const,
      statusText: row.evidenceStatus ?? "status not published",
      statusState: evidenceStatusState({
        source_id: row.sourceId,
        signal_type: row.signalType,
        evidence_status: row.evidenceStatus,
      }),
      eventDate: row.eventDate,
      sourceAsOf,
      fetchedAt,
      recordUrl: link.sourceUrl,
      facts: {
        taxYear: row.taxYear,
        installment: row.taxInstallment,
        reportedBalanceCents: row.delinquentAmountCents,
        account: row.sourceRecordId.split(":").at(-3) ?? null,
      },
    };
  });
  return successfulFinding(
    "norfolk-delinquent-property-tax",
    "City of Norfolk · Delinquent Property Taxes",
    norfolkTaxMetadataUrl,
    queryUrl,
    fetchedAt,
    sourceAsOf,
    records,
  );
}

async function fetchCodeFinding(fetchImpl: typeof fetch, parcelId: string, fetchedAt: string) {
  const where = `tax_account='${parcelId}'`;
  const queryUrl = targetedUrl(norfolkViolationUrl, where, "violation_id");
  const stable = await stableTargetedFetch<NorfolkViolationRow>(
    fetchImpl,
    "agip-sqwc",
    norfolkViolationMetadataUrl,
    norfolkViolationUrl,
    where,
    "violation_id",
    null,
    undefined,
  );
  if (stable.rows.some((row) => row.tax_account !== parcelId)) {
    throw new Error("Norfolk code targeted query returned a different exact tax account.");
  }
  const sourceAsOf = epoch(stable.metadata["rowsUpdatedAt"]);
  // Exercise the production parser against the exact same schema. Closed rows are
  // deliberately absent from its active snapshot output but remain in this audit finding.
  parseNorfolkViolations(stable.rows, { observedAt: fetchedAt, sourceUpdatedAt: sourceAsOf });
  const records = stable.rows.map((row) => {
    const sourceRecordId = row.violation_id ?? "";
    const statusText = row.status?.trim() || "status not published";
    const link = evidenceLink({
      source_id: "norfolk-code-violations",
      source_record_id: sourceRecordId,
      source_url: norfolkViolationUrl,
      source_document_url: norfolkViolationMetadataUrl,
      apn: row.tax_account ?? null,
    });
    return {
      sourceRecordId,
      signalType: "code_violation" as const,
      statusText,
      statusState: evidenceStatusState({
        source_id: "norfolk-code-violations",
        signal_type: "code_violation",
        evidence_status: statusText,
      }),
      eventDate: dateOnly(row.created_date),
      sourceAsOf,
      fetchedAt,
      recordUrl: link.sourceUrl,
      facts: {
        lastModifiedDate: row.last_modified_date ?? null,
        correctedDate: row.corrected_date ?? null,
        abatementDate: row.abatement_date ?? null,
        ordinance: row.ordinance ?? null,
      },
    };
  });
  return successfulFinding(
    "norfolk-code-violations",
    "City of Norfolk · Neighborhood Quality Violations",
    norfolkViolationMetadataUrl,
    queryUrl,
    fetchedAt,
    sourceAsOf,
    records,
  );
}

async function stableTargetedFetch<T>(
  fetchImpl: typeof fetch,
  expectedId: string,
  metadataUrl: string,
  resourceUrl: string,
  where: string,
  order: string,
  select: string | null,
  validateMetadata?: (metadata: Record<string, unknown>) => void,
) {
  const before = await fetchJson<Record<string, unknown>>(fetchImpl, metadataUrl);
  assertMetadata(before, expectedId);
  validateMetadata?.(before);
  const rows: T[] = [];
  for (let offset = 0; offset < maximumRows; offset += pageSize) {
    const url = targetedUrl(resourceUrl, where, order, offset, select);
    // eslint-disable-next-line no-await-in-loop
    const page = await fetchJson<T[]>(fetchImpl, url);
    if (!Array.isArray(page) || page.length > pageSize) {
      throw new Error("Norfolk targeted source returned an invalid page.");
    }
    rows.push(...page);
    if (page.length < pageSize) {
      break;
    }
    if (offset + pageSize >= maximumRows) {
      throw new Error("Norfolk targeted source exceeded its bounded complete-fetch limit.");
    }
  }
  const after = await fetchJson<Record<string, unknown>>(fetchImpl, metadataUrl);
  assertMetadata(after, expectedId);
  validateMetadata?.(after);
  if (
    before["rowsUpdatedAt"] !== after["rowsUpdatedAt"] ||
    before["viewLastModified"] !== after["viewLastModified"]
  ) {
    throw new Error("Norfolk targeted source publication changed during recheck.");
  }
  return { rows, metadata: after };
}

function targetedUrl(
  resourceUrl: string,
  where: string,
  order: string,
  offset = 0,
  select: string | null = null,
): string {
  const params = new URLSearchParams({
    $where: where,
    $order: order,
    $limit: String(pageSize),
    $offset: String(offset),
  });
  if (select) {
    params.set("$select", select);
  }
  return `${resourceUrl}?${params}`;
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string): Promise<T> {
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Norfolk official source returned HTTP ${response.status}.`);
  }
  const text = await response.text();
  if (text.length > maximumBytes) {
    throw new Error("Norfolk official source response exceeded its byte limit.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Norfolk official source returned invalid JSON.");
  }
}

function assertMetadata(value: Record<string, unknown>, expectedId: string) {
  if (
    value["id"] !== expectedId ||
    typeof value["rowsUpdatedAt"] !== "number" ||
    typeof value["viewLastModified"] !== "number"
  ) {
    throw new Error(`Norfolk official source ${expectedId} metadata drifted.`);
  }
}

function assertTaxCurrencyMetadata(value: Record<string, unknown>) {
  const columns = Array.isArray(value["columns"])
    ? (value["columns"] as Array<Record<string, unknown>>)
    : [];
  for (const fieldName of ["taxdue", "penaltydue", "interestdue", "total"]) {
    const column = columns.find((entry) => entry["fieldName"] === fieldName);
    const format = column?.["format"] as Record<string, unknown> | undefined;
    if (
      !column ||
      format?.["precisionStyle"] !== "currency" ||
      String(format["precision"]) !== "2"
    ) {
      throw new Error(
        `Norfolk tax ${fieldName} lost its declared two-decimal currency schema; source-local rounding is unsafe.`,
      );
    }
  }
}

function successfulFinding(
  sourceId: string,
  sourceName: string,
  metadataUrl: string,
  queryUrl: string,
  fetchedAt: string,
  sourceAsOf: string | null,
  records: readonly RecheckEvidenceRecord[],
): RecheckSourceFinding {
  return {
    sourceId,
    sourceName,
    status: "success",
    presence: records.length > 0 ? "present" : "absent",
    fetchedAt,
    publicationAsOf: sourceAsOf,
    sourceAsOf,
    metadataUrl,
    queryUrl,
    recordCount: records.length,
    records,
    boundary:
      records.length > 0
        ? "Exact matching rows were returned by the bounded official query. This is source publication evidence, not independent payoff verification."
        : "The bounded exact query returned no matching rows. Absence does not establish paid, cured, resolved, or closed status.",
    error: null,
  };
}

function failedFinding(
  sourceId: string,
  sourceName: string,
  metadataUrl: string,
  error: string,
): RecheckSourceFinding {
  return {
    sourceId,
    sourceName,
    status: "failed",
    presence: "unknown",
    fetchedAt: null,
    publicationAsOf: null,
    sourceAsOf: null,
    metadataUrl,
    queryUrl: null,
    recordCount: 0,
    records: [],
    boundary: "The latest lookup failed or drifted; no verification clock was advanced.",
    error,
  };
}

function epoch(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return new Date(value * 1_000).toISOString();
}

function dateOnly(value: string | undefined): string | null {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function safeError(cause: unknown): string {
  return (cause instanceof Error ? cause.message : "Public source request failed.")
    .replace(/https?:\/\/\S+/g, "public source")
    .slice(0, 500);
}
