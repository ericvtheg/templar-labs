import {
  type AcrisLegalRow,
  type AcrisMasterRow,
  acrisLegalsUrl,
  acrisMasterUrl,
  acrisMetadataUrl,
  type NorfolkViolationRow,
  norfolkTaxCsvUrl,
  norfolkTaxMetadataUrl,
  norfolkViolationMetadataUrl,
  norfolkViolationUrl,
  parseAcrisCommonChargeLiens,
  parseDenverForeclosures,
  parseNorfolkTaxCsv,
  parseNorfolkViolations,
  parseTravisTaxCsv,
  travisTaxCsvUrl,
} from "./current-parsers.ts";
import { fetchDenverForeclosureInitiations } from "./denver-source.ts";
import { isCalendarDate } from "./model.ts";
import type { SourceResult } from "./sources.ts";

const textLimit = 12 * 1024 * 1024;
const jsonLimit = 25 * 1024 * 1024;
const sourceTimeoutMs = 60_000;

export async function fetchTravisTaxDelinquencies(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<SourceResult> {
  const response = await fetchBounded(fetchImpl, travisTaxCsvUrl, textLimit, "text/csv");
  const sourceUpdatedAt = httpDate(response.headers.get("last-modified"));
  const parsed = parseTravisTaxCsv(new TextDecoder().decode(response.bytes), {
    observedAt: now.toISOString(),
    sourceUpdatedAt,
  });
  if (parsed.records.length === 0) {
    throw new Error("Travis returned no real-property delinquencies.");
  }
  return {
    sourceId: "travis-tax-delinquency",
    sourceName: "Travis County Tax Office · Delinquent Tax Roll",
    sourceUrl: travisTaxCsvUrl,
    records: parsed.records,
    sourceUpdatedAt,
    snapshotComplete: true,
    warnings: parsed.excludedNonRealEstate
      ? [`Excluded ${parsed.excludedNonRealEstate} non-real-estate row(s) by property type.`]
      : [],
  };
}

export async function fetchNorfolkTaxDelinquencies(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<SourceResult> {
  const [csv, metadata] = await Promise.all([
    fetchBounded(fetchImpl, norfolkTaxCsvUrl, textLimit, "text/csv"),
    fetchJson<Record<string, unknown>>(fetchImpl, norfolkTaxMetadataUrl, 2 * 1024 * 1024),
  ]);
  if (metadata["id"] !== "7qie-z5gv") {
    throw new Error("Norfolk tax metadata ID changed.");
  }
  const sourceUpdatedAt = epoch(metadata["rowsUpdatedAt"]);
  const records = parseNorfolkTaxCsv(new TextDecoder().decode(csv.bytes), {
    observedAt: now.toISOString(),
    sourceUpdatedAt,
  });
  if (records.length === 0) {
    throw new Error("Norfolk returned no delinquent-tax installments.");
  }
  return {
    sourceId: "norfolk-delinquent-property-tax",
    sourceName: "City of Norfolk · Delinquent Property Taxes",
    sourceUrl: norfolkTaxCsvUrl,
    records,
    sourceUpdatedAt,
    snapshotComplete: true,
    warnings: [],
  };
}

export async function fetchNorfolkCodeViolations(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<SourceResult> {
  const params = new URLSearchParams({
    $where: "status not like 'Closed%'",
    $order: "violation_id",
    $limit: "10000",
  });
  const [rows, metadata] = await Promise.all([
    fetchJson<NorfolkViolationRow[]>(fetchImpl, `${norfolkViolationUrl}?${params}`, jsonLimit),
    fetchJson<Record<string, unknown>>(fetchImpl, norfolkViolationMetadataUrl, 2 * 1024 * 1024),
  ]);
  if (!Array.isArray(rows) || rows.length === 0 || rows.length >= 10_000) {
    throw new Error("Norfolk violation snapshot was empty or exceeded its completeness limit.");
  }
  if (metadata["id"] !== "agip-sqwc") {
    throw new Error("Norfolk violation metadata ID changed.");
  }
  const sourceUpdatedAt = epoch(metadata["rowsUpdatedAt"]);
  const records = parseNorfolkViolations(rows, {
    observedAt: now.toISOString(),
    sourceUpdatedAt,
  });
  return {
    sourceId: "norfolk-code-violations",
    sourceName: "City of Norfolk · Neighborhood Quality Violations",
    sourceUrl: norfolkViolationUrl,
    records,
    sourceUpdatedAt,
    snapshotComplete: true,
    warnings: records.some((record) => record.apn === null)
      ? ["Rows without an exact tax-account key were retained as unmatched evidence."]
      : [],
  };
}

export async function fetchDenverMortgageForeclosureInitiations(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<SourceResult> {
  const result = await fetchDenverForeclosureInitiations(fetchImpl, now);
  const records = parseDenverForeclosures(result.records, {
    observedAt: now.toISOString(),
    sourceUpdatedAt: result.sourceUpdatedAt,
  });
  return {
    sourceId: "denver-public-trustee-ned",
    sourceName: "Denver Public Trustee · Foreclosure Search",
    sourceUrl: "https://denvergov.org/foreclosuresearch/",
    records,
    sourceUpdatedAt: result.sourceUpdatedAt,
    snapshotComplete: result.complete,
    warnings: [result.scope, ...result.warnings],
  };
}

export async function fetchAcrisCommonChargeLiens(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<SourceResult> {
  const metadata = await fetchJson<Record<string, unknown>>(
    fetchImpl,
    acrisMetadataUrl,
    2 * 1024 * 1024,
  );
  if (metadata["id"] !== "bnx9-e6tj") {
    throw new Error("ACRIS metadata ID changed.");
  }
  const sourceUpdatedAt = epoch(metadata["rowsUpdatedAt"]);
  const windowStart = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const params = new URLSearchParams({
    $where: `doc_type in('LOCC','TOLCC') AND recorded_datetime >= '${windowStart}T00:00:00'`,
    $order: "recorded_datetime,document_id",
    $limit: "5000",
  });
  const masters: AcrisMasterRow[] = [];
  for (let offset = 0; ; offset += 5_000) {
    if (offset >= 20_000) {
      throw new Error("ACRIS event window exceeded its bounded pagination limit.");
    }
    params.set("$offset", String(offset));
    // eslint-disable-next-line no-await-in-loop
    const page = await fetchJson<AcrisMasterRow[]>(
      fetchImpl,
      `${acrisMasterUrl}?${params}`,
      jsonLimit,
    );
    if (!Array.isArray(page) || page.length > 5_000) {
      throw new Error("ACRIS returned an invalid master page.");
    }
    masters.push(...page);
    if (page.length < 5_000) {
      break;
    }
  }
  if (masters.length === 0) {
    throw new Error("ACRIS event window was empty.");
  }
  if (new Set(masters.map((row) => row.document_id)).size !== masters.length) {
    throw new Error("ACRIS repeated document IDs while paging; retry a stable event window.");
  }
  const coverage = [
    ...new Set(masters.map((row) => row.good_through_date?.slice(0, 10) ?? "")),
  ].toSorted();
  if (coverage.some((value) => !isCalendarDate(value))) {
    throw new Error("ACRIS rows lacked valid declared good-through dates.");
  }
  const latestGoodThrough = coverage.at(-1) as string;
  const documentIds = [...new Set(masters.map((row) => row.document_id ?? ""))];
  if (documentIds.some((id) => !/^\d{16}$/.test(id))) {
    throw new Error("ACRIS master rows contained invalid document IDs.");
  }
  const legals: AcrisLegalRow[] = [];
  for (let index = 0; index < documentIds.length; index += 50) {
    const group = documentIds.slice(index, index + 50);
    const legalParams = new URLSearchParams({
      $where: `document_id in(${group.map((id) => `'${id}'`).join(",")})`,
      $order: "document_id,borough,block,lot",
      $limit: "5000",
    });
    // eslint-disable-next-line no-await-in-loop
    const page = await fetchJson<AcrisLegalRow[]>(
      fetchImpl,
      `${acrisLegalsUrl}?${legalParams}`,
      jsonLimit,
    );
    if (!Array.isArray(page) || page.length >= 5_000) {
      throw new Error("ACRIS legal-property batch exceeded its completeness limit.");
    }
    legals.push(...page);
  }
  const records = parseAcrisCommonChargeLiens(masters, legals, {
    observedAt: now.toISOString(),
    sourceUpdatedAt,
  });
  if (records.length === 0) {
    throw new Error("ACRIS event rows produced no validated evidence.");
  }
  return {
    sourceId: "nyc-acris-common-charge-liens",
    sourceName: "NYC ACRIS · Common Charge Lien Recordings",
    sourceUrl: acrisMasterUrl,
    records,
    sourceUpdatedAt,
    snapshotComplete: false,
    warnings: [
      `Monthly recorded-event window starts ${windowStart}; row-level declared good-through dates range from ${coverage[0]} to ${latestGoodThrough}. This is append/update evidence, not a complete outstanding-lien roll.`,
      "A filing is not proof that a lien remains outstanding; terminations are separate events and are not applied to every lien on a BBL.",
    ],
  };
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string, limit: number): Promise<T> {
  const response = await fetchBounded(fetchImpl, url, limit, "application/json");
  try {
    return JSON.parse(new TextDecoder().decode(response.bytes)) as T;
  } catch {
    throw new Error("Source returned invalid JSON.");
  }
}

async function fetchBounded(
  fetchImpl: typeof fetch,
  url: string,
  limit: number,
  accept: string,
): Promise<{ bytes: Uint8Array; headers: Headers }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchImpl(url, {
      headers: {
        accept,
        "user-agent": "TemplarLabs-PropertyWatch/2.0 (+https://la-property-watch.breli.app)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(sourceTimeoutMs),
    });
    if (!response.ok) {
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
        continue;
      }
      throw new Error(`Source request failed with HTTP ${response.status}.`);
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limit) {
      throw new Error("Source exceeded its response limit.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limit) {
      throw new Error("Source exceeded its response limit.");
    }
    return { bytes, headers: response.headers };
  }
  throw new Error("Source retry limit reached.");
}

function epoch(value: unknown): string | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return new Date(seconds * 1_000).toISOString();
}
function httpDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
