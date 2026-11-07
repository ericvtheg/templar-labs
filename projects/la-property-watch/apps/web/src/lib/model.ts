export const allowedEmails: readonly string[] = ["ericventor97@gmail.com", "Rhwcreative@gmail.com"];

export function canonicalPartnerEmail(value: string): string | null {
  return allowedEmails.find((email) => email.toLowerCase() === value.trim().toLowerCase()) ?? null;
}

// saleType remains for backwards compatibility with existing records and clients.
export type SaleType = "tax_default" | "trustee";
export type SignalType =
  | "tax_delinquency"
  | "code_violation"
  | "power_to_sell"
  | "recorded_lien"
  | "lien_release"
  | "notice_of_default"
  | "mortgage_foreclosure_initiated"
  | "scheduled_trustee_sale"
  | "scheduled_tax_sale";
export type RecordStatus =
  | "signal_status_unverified"
  | "scheduled_as_published"
  | "past_outcome_unverified"
  | "date_not_found";
export type IngestionTrigger = "manual" | "scheduled" | "bootstrap";
export type RunStatus = "running" | "success" | "partial" | "failed";
export type RefreshJobStatus = "queued" | RunStatus;

export type ResearchRecord = {
  readonly id: string;
  readonly saleType: SaleType;
  readonly signalType: SignalType;
  readonly jurisdictionId: string;
  readonly jurisdictionName: string;
  readonly sourceRecordId: string;
  readonly sourceKey: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceUrl: string;
  readonly sourceDocumentUrl: string | null;
  readonly sourcePublishedAt: string | null;
  readonly sourceAsOfDate: string | null;
  readonly sourceUpdatedAt: string | null;
  readonly sourceGoodThrough: string | null;
  readonly sourceKind: "current" | "secondary";
  readonly snapshotPresence: "present" | "no_longer_present";
  readonly noLongerPresentAt: string | null;
  readonly observedAt: string;
  readonly eventDate: string | null;
  readonly scheduledDate: string | null;
  readonly scheduledTime: string | null;
  readonly status: RecordStatus;
  readonly apn: string | null;
  readonly propertyKey: string;
  readonly address: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly zip: string | null;
  readonly assessorAddress: string | null;
  readonly assessorCity: string | null;
  readonly assessorState: string | null;
  readonly assessorZip: string | null;
  readonly assessorObservedAt: string | null;
  readonly assessorSourceUrl: string | null;
  readonly itemNumber: string | null;
  readonly minimumBidCents: number | null;
  readonly delinquentAmountCents: number | null;
  readonly unpaidBalanceCents: number | null;
  readonly principalBalanceCents: number | null;
  readonly principalAsOfDate: string | null;
  readonly trusteeSaleNumber: string | null;
  readonly trusteeName: string | null;
  readonly saleVerificationPhone: string | null;
  readonly salePlace: string | null;
  readonly legalDescription: string | null;
  readonly ownerName: string | null;
  readonly propertyType: string | null;
  readonly taxYear: number | null;
  readonly taxInstallment: number | null;
  readonly taxDueCents: number | null;
  readonly penaltyDueCents: number | null;
  readonly interestDueCents: number | null;
  readonly evidenceStatus: string | null;
  readonly evidenceDetail: string | null;
  readonly evidenceUpdatedAt: string | null;
  readonly priority: number | null;
  readonly rawExcerpt: string;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly updatedAt: string;
};

export type SourceRun = {
  readonly id: string;
  readonly refreshJobId: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceUrl: string;
  readonly trigger: IngestionTrigger;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly recordsFound: number;
  readonly recordsUpserted: number;
  readonly recordsNoLongerPresent: number;
  readonly sourceUpdatedAt: string | null;
  readonly snapshotComplete: boolean;
  readonly error: string | null;
};

export type RankedProperty = {
  readonly propertyKey: string;
  readonly jurisdictionId: string;
  readonly jurisdictionName: string;
  readonly parcelId: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly zip: string | null;
  readonly ownerName: string | null;
  readonly propertyType: string | null;
  readonly score: number;
  readonly scoreReasons: readonly string[];
  readonly signalTypes: readonly SignalType[];
  readonly independentSignalCount: number;
  readonly evidenceCount: number;
  readonly taxInstallmentCount: number;
  readonly codeViolationCount: number;
  readonly recordedLienCount: number;
  readonly totalDelinquentCents: number;
  readonly earliestTaxYear: number | null;
  readonly freshestSourceUpdatedAt: string | null;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly sourceNames: readonly string[];
  readonly normalizedPropertyType: "sfh" | "small_multifamily" | "commercial" | "land" | null;
  readonly neighborhood: string | null;
  readonly lotAreaSqft: number | null;
  readonly residentialFinishedAreaValue: number | null;
  readonly commercialBuildingAreaValue: number | null;
  readonly buildingAreaUnitStatus: string | null;
  readonly assessedValueCents: number | null;
  readonly lastReportedConsiderationCents: number | null;
  readonly userAssumptionCents: number | null;
};

export type PropertyPage = {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
};

export type PropertyDetail = {
  readonly property: RankedProperty;
  readonly evidence: readonly ResearchRecord[];
  readonly evidenceTotal: number;
  readonly evidencePage: PropertyPage;
  readonly truncated: boolean;
};

export type RefreshJob = {
  readonly id: string;
  readonly trigger: IngestionTrigger;
  readonly status: RefreshJobStatus;
  readonly requestedAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly error: string | null;
};

export type DashboardData = {
  /** @deprecated Compatibility alias for the historical evidence view. */
  readonly records: readonly ResearchRecord[];
  readonly properties: readonly RankedProperty[];
  readonly page: PropertyPage;
  readonly archiveRecords: readonly ResearchRecord[];
  readonly archiveTotal: number;
  readonly sources: readonly SourceRun[];
  readonly refreshJobs: readonly RefreshJob[];
  readonly generatedAt: string;
};

export type LoaderData =
  | { readonly mode: "signed_out" }
  | { readonly mode: "forbidden"; readonly email: string }
  | ({ readonly mode: "ready"; readonly viewerName: string } & DashboardData);

export function statusFor(
  scheduledDate: string | null,
  observedAt: string,
  signalType: SignalType = "scheduled_tax_sale",
  eventDate: string | null = null,
): RecordStatus {
  if (
    signalType === "tax_delinquency" ||
    signalType === "code_violation" ||
    signalType === "recorded_lien" ||
    signalType === "lien_release" ||
    signalType === "notice_of_default" ||
    signalType === "mortgage_foreclosure_initiated"
  ) {
    return "signal_status_unverified";
  }
  if (signalType === "power_to_sell") {
    return eventDate && isCalendarDate(eventDate) && eventDate < dateInLosAngeles(observedAt)
      ? "past_outcome_unverified"
      : "signal_status_unverified";
  }
  if (scheduledDate === null || !isCalendarDate(scheduledDate)) {
    return "date_not_found";
  }
  return scheduledDate < dateInLosAngeles(observedAt)
    ? "past_outcome_unverified"
    : "scheduled_as_published";
}

export function isCalendarDate(value: string): boolean {
  const match = value.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match?.[1] || !match[2] || !match[3]) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function normalizeApn(value: string | null | undefined): string | null {
  const match = value?.match(/^\s*(\d{4})[-\s]?(\d{3})[-\s]?(\d{3})\s*$/);
  return match ? `${match[1]}${match[2]}${match[3]}` : null;
}

export function normalizeParcelId(
  value: string | null | undefined,
  jurisdictionId: string,
): string | null {
  if (!value) {
    return null;
  }
  if (jurisdictionId === "la-county-ca") {
    return normalizeApn(value);
  }
  if (jurisdictionId === "oc-ca") {
    const standard = value.match(/^(\d{3})-(\d{3})-(\d{2})$/);
    if (standard) {
      return `${standard[1]}${standard[2]}${standard[3]}`;
    }
    const extended = value.match(/^(\d{3})-(\d{3})-(\d{2})\.(\d{2})$/);
    return extended ? `${extended[1]}${extended[2]}${extended[3]}${extended[4]}` : null;
  }
  if (jurisdictionId === "travis-county-tx") {
    return /^\d{14}$/.test(value) ? value : null;
  }
  if (jurisdictionId === "norfolk-va") {
    return /^\d{8}$/.test(value) ? value : null;
  }
  if (jurisdictionId === "nyc-ny") {
    return /^\d{10}$/.test(value) ? value : null;
  }
  return null;
}

export function formatApn(value: string | null): string {
  if (value?.length === 10) {
    return `${value.slice(0, 4)}-${value.slice(4, 7)}-${value.slice(7)}`;
  }
  return value ?? "—";
}

export function formatParcelId(value: string | null, jurisdictionId: string): string {
  if (jurisdictionId === "oc-ca" && value?.length === 8) {
    return `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`;
  }
  if (jurisdictionId === "oc-ca" && value?.length === 10) {
    return `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6, 8)}.${value.slice(8)}`;
  }
  if (jurisdictionId === "travis-county-tx" && value?.length === 14) {
    return `${value.slice(0, 10)}-${value.slice(10)}`;
  }
  if (jurisdictionId === "nyc-ny" && value?.length === 10) {
    return `${value.slice(0, 1)}-${value.slice(1, 6)}-${value.slice(6)}`;
  }
  return formatApn(value);
}

export function dateInLosAngeles(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("A valid observation timestamp is required.");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${read("year")}-${read("month")}-${read("day")}`;
}
