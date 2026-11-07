import type { SignalType } from "./model.ts";

export type EvidenceStatusInput = {
  readonly source_id: string;
  readonly signal_type: SignalType;
  readonly evidence_status: string | null;
};

export type EvidenceStatusState = "active" | "resolved" | "unknown";

const canonicalSignalOrder: readonly SignalType[] = [
  "tax_delinquency",
  "code_violation",
  "recorded_lien",
  "lien_release",
  "notice_of_default",
  "mortgage_foreclosure_initiated",
  "scheduled_tax_sale",
  "scheduled_trustee_sale",
  "power_to_sell",
];

export function canonicalSignalCombination(signals: string | readonly SignalType[]): string {
  const present = new Set(
    typeof signals === "string" ? signals.split(",").filter(Boolean) : signals,
  );
  const known = canonicalSignalOrder.filter((signal) => present.has(signal));
  const unknown = [...present]
    .filter((signal) => !canonicalSignalOrder.includes(signal as SignalType))
    .toSorted();
  return [...known, ...unknown].join(",") || "unknown";
}

export function canonicalSignalCombinationSql(column: string): string {
  const parts = canonicalSignalOrder.map(
    (signal) =>
      `CASE WHEN (','||${column}||',') LIKE '%,${signal},%' THEN '${signal},' ELSE '' END`,
  );
  return `RTRIM(${parts.join("||")},',')`;
}

type Vocabulary = {
  readonly sourceId: string;
  readonly signalType: SignalType;
  readonly active: readonly string[];
  readonly resolved: readonly string[];
  readonly resolvedPrefixes?: readonly string[];
};

const vocabularies: readonly Vocabulary[] = [
  // Executable local fixtures use this fixed source ID; it is never registered
  // by the production source catalog.
  {
    sourceId: "norfolk-test",
    signalType: "tax_delinquency",
    active: ["unpaid", "still unpaid", "reported at least one quarter behind"],
    resolved: ["paid", "cured", "cured as published", "resolved"],
  },
  {
    sourceId: "norfolk-test",
    signalType: "code_violation",
    active: ["open", "new", "work in progress"],
    resolved: ["closed", "complied", "resolved"],
    resolvedPrefixes: ["closed - "],
  },
  {
    sourceId: "norfolk-test",
    signalType: "recorded_lien",
    active: ["recorded"],
    resolved: ["released", "satisfied", "terminated"],
  },
  {
    sourceId: "norfolk-test",
    signalType: "lien_release",
    active: [],
    resolved: ["release recorded for instrument 44"],
  },
  {
    sourceId: "norfolk-test",
    signalType: "mortgage_foreclosure_initiated",
    active: ["initiated", "ned recorded", "active"],
    resolved: ["withdrawn", "withdrawn (cured)", "cured", "stayed", "released"],
  },
  {
    sourceId: "norfolk-delinquent-property-tax",
    signalType: "tax_delinquency",
    active: ["reported at least one quarter behind", "unpaid", "still unpaid"],
    resolved: ["paid", "cured", "resolved"],
  },
  {
    sourceId: "travis-tax-delinquency",
    signalType: "tax_delinquency",
    active: ["reported delinquent by county tax roll", "unpaid", "still unpaid"],
    resolved: ["paid", "cured", "resolved"],
  },
  {
    sourceId: "norfolk-code-violations",
    signalType: "code_violation",
    active: [
      "new",
      "work in progress",
      "not corrected",
      "extension granted",
      "court disposition - continued",
      "notice of violation issued",
      "warning issued",
      "refer for abatement",
      "magistrate summons requested",
      "summons served",
      "stop work issued",
      "refer for city tow",
      "final letter sent",
    ],
    resolved: ["closed", "complied", "resolved"],
    resolvedPrefixes: ["closed - "],
  },
  {
    sourceId: "nyc-acris-common-charge-liens",
    signalType: "recorded_lien",
    active: ["lien of common charges recorded; current outstanding status unverified"],
    resolved: ["released", "satisfied", "terminated"],
  },
  {
    sourceId: "nyc-acris-common-charge-liens",
    signalType: "lien_release",
    active: [],
    resolved: ["termination of lien of common charges recorded"],
  },
  {
    sourceId: "denver-public-trustee-ned",
    signalType: "mortgage_foreclosure_initiated",
    active: ["ned recorded", "scheduled", "active"],
    resolved: [
      "cured",
      "withdrawn",
      "withdrawn (cured)",
      "rescinded",
      "deeded",
      "sold",
      "to be withdrawn",
      "stayed",
      "released",
    ],
  },
];

function normalizedStatus(value: string | null): string {
  return value?.trim().toLocaleLowerCase("en-US") ?? "";
}

export function evidenceStatusState(input: EvidenceStatusInput): EvidenceStatusState {
  const status = normalizedStatus(input.evidence_status);
  const vocabulary = vocabularies.find(
    (entry) => entry.sourceId === input.source_id && entry.signalType === input.signal_type,
  );
  if (!vocabulary || !status) {
    return "unknown";
  }
  if (vocabulary.resolved.includes(status)) {
    return "resolved";
  }
  if (vocabulary.resolvedPrefixes?.some((prefix) => status.startsWith(prefix))) {
    return "resolved";
  }
  return vocabulary.active.includes(status) ? "active" : "unknown";
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function evidenceStatusSql(
  alias: string,
  wanted: Exclude<EvidenceStatusState, "unknown">,
): string {
  const expressions = vocabularies.flatMap((vocabulary) => {
    const values = vocabulary[wanted];
    const exact =
      values.length > 0
        ? `LOWER(TRIM(COALESCE(${alias}.evidence_status,''))) IN (${values.map(sqlText).join(",")})`
        : null;
    const prefixes =
      wanted === "resolved"
        ? (vocabulary.resolvedPrefixes ?? []).map(
            (prefix) =>
              `LOWER(TRIM(COALESCE(${alias}.evidence_status,''))) LIKE ${sqlText(`${prefix}%`)}`,
          )
        : [];
    const statuses = [exact, ...prefixes].filter(Boolean).join(" OR ");
    return statuses
      ? [
          `(${alias}.source_id=${sqlText(vocabulary.sourceId)} AND ${alias}.signal_type=${sqlText(vocabulary.signalType)} AND (${statuses}))`,
        ]
      : [];
  });
  return expressions.length > 0 ? `(${expressions.join(" OR ")})` : "0=1";
}

export function normalizeOwnerName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleUpperCase("en-US")
    .replaceAll(/[^A-Z0-9]/g, "");
}

type EvidenceLinkInput = {
  readonly source_id: string;
  readonly source_record_id: string;
  readonly source_url: string;
  readonly source_document_url: string | null;
  readonly apn?: string | null;
  readonly tax_year?: number | null;
  readonly tax_installment?: number | null;
};

export function evidenceLink(input: EvidenceLinkInput): {
  sourceUrl: string;
  sourceLinkKind: "exact_record" | "dataset" | "publisher";
} {
  if (input.source_id === "norfolk-delinquent-property-tax" && input.apn) {
    const parts = input.source_record_id.split(":");
    const account = parts.length >= 4 ? parts.at(-3) : null;
    const year = input.tax_year ?? (parts.length >= 4 ? Number(parts.at(-2)) : null);
    const installment = input.tax_installment ?? (parts.length >= 4 ? Number(parts.at(-1)) : null);
    const filters = [`biitem='${input.apn}'`];
    if (account) {
      filters.push(`account='${account.replaceAll("'", "''")}'`);
    }
    if (Number.isInteger(year)) {
      filters.push(`bwtaxyear=${String(year)}`);
    }
    if (Number.isInteger(installment)) {
      filters.push(`bwtaxinstallment=${String(installment)}`);
    }
    const params = new URLSearchParams({ $where: filters.join(" AND "), $limit: "1000" });
    return {
      sourceUrl: `https://data.norfolk.gov/resource/7qie-z5gv.json?${params}`,
      sourceLinkKind: "exact_record",
    };
  }
  if (input.source_id === "norfolk-code-violations") {
    const id = input.source_record_id.replaceAll("'", "''");
    const params = new URLSearchParams({ $where: `violation_id='${id}'`, $limit: "1" });
    return {
      sourceUrl: `https://data.norfolk.gov/resource/agip-sqwc.json?${params}`,
      sourceLinkKind: "exact_record",
    };
  }
  return { sourceUrl: input.source_url, sourceLinkKind: "publisher" };
}
