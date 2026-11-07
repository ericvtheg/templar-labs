import type { DenverForeclosureRecord } from "./denver-source.ts";
import { isCalendarDate, normalizeParcelId, type ResearchRecord, statusFor } from "./model.ts";

export const travisTaxCsvUrl =
  "https://tax-office.traviscountytx.gov/voterdata/TaxDelqOpenData.csv";
export const travisTaxDocumentationUrl =
  "https://tax-office.traviscountytx.gov/pages/DelinquentFileLayout.php";
export const norfolkTaxCsvUrl =
  "https://data.norfolk.gov/api/views/7qie-z5gv/rows.csv?accessType=DOWNLOAD";
export const norfolkTaxMetadataUrl = "https://data.norfolk.gov/api/views/7qie-z5gv";
export const norfolkViolationUrl = "https://data.norfolk.gov/resource/agip-sqwc.json";
export const norfolkViolationMetadataUrl = "https://data.norfolk.gov/api/views/agip-sqwc.json";
export const acrisMasterUrl = "https://data.cityofnewyork.us/resource/bnx9-e6tj.json";
export const acrisLegalsUrl = "https://data.cityofnewyork.us/resource/8h5j-fqxa.json";
export const acrisMetadataUrl = "https://data.cityofnewyork.us/api/views/bnx9-e6tj";

const activeNorfolkViolationStatuses = new Set([
  "New",
  "Work in Progress",
  "Not Corrected",
  "Extension Granted",
  "Court Disposition - Continued",
  "Notice of Violation Issued",
  "Warning Issued",
  "Refer for Abatement",
  "Magistrate Summons Requested",
  "Summons Served",
  "Stop Work Issued",
  "Refer for City Tow",
  "Final Letter Sent",
]);

export type ParseContext = {
  readonly observedAt: string;
  readonly sourceUpdatedAt: string | null;
  readonly sourceGoodThrough?: string | null;
};

export function parseCsv(text: string): Array<Record<string, string>> {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let afterQuote = false;
  let atFieldStart = true;
  const finishField = () => {
    row.push(value);
    value = "";
    quoted = false;
    afterQuote = false;
    atFieldStart = true;
  };
  const finishRow = () => {
    finishField();
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
    row = [];
  };
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        value += character;
      }
      continue;
    }
    if (afterQuote) {
      if (character === ",") {
        finishField();
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && input[index + 1] === "\n") {
          index += 1;
        }
        finishRow();
      } else {
        throw new Error("CSV contained characters after a closing quote.");
      }
      continue;
    }
    if (character === '"') {
      if (!atFieldStart) {
        throw new Error("CSV contained a quote inside an unquoted field.");
      }
      quoted = true;
      atFieldStart = false;
    } else if (character === ",") {
      finishField();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") {
        index += 1;
      }
      finishRow();
    } else {
      value += character;
      atFieldStart = false;
    }
  }
  if (quoted) {
    throw new Error("CSV ended inside a quoted field.");
  }
  if (afterQuote || value.length > 0 || row.length > 0) {
    finishRow();
  }
  const header = rows.shift()?.map((cell) => cell.trim());
  if (!header || new Set(header).size !== header.length) {
    throw new Error("CSV headers were missing or duplicated.");
  }
  return rows.map((cells, rowIndex) => {
    if (cells.length !== header.length) {
      throw new Error(
        `CSV row ${rowIndex + 2} had ${cells.length} fields; expected ${header.length}.`,
      );
    }
    return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]));
  });
}

export function parseTravisTaxCsv(
  text: string,
  context: ParseContext,
): { records: ResearchRecord[]; excludedNonRealEstate: number } {
  const rows = parseCsv(text);
  const required = [
    "Account #",
    "Property Type Code",
    "Delinquent Total",
    "Street Number",
    "Street Name",
    "Property Zip",
  ];
  assertColumns(rows, required, "Travis tax");
  const records: ResearchRecord[] = [];
  let excludedNonRealEstate = 0;
  for (const row of rows) {
    const propertyType = row["Property Type Code"]?.trim() ?? "";
    // Travis/TCAD real-property categories are A-F and O. Personal-property and
    // utility/mineral categories are deliberately excluded from the property watchlist.
    if (!/^[A-F]|^O/.test(propertyType)) {
      excludedNonRealEstate += 1;
      continue;
    }
    const account = normalizeParcelId(row["Account #"]?.trim(), "travis-county-tx");
    if (!account) {
      throw new Error("Travis tax row had an invalid 14-character account ID.");
    }
    const streetNumber = clean(row["Street Number"]);
    const streetName = clean(row["Street Name"]);
    const address = [streetNumber, streetName].filter(Boolean).join(" ") || null;
    const earliestYear = integerOrNull(row["1st Year Delinquent"], 1900, 2100);
    const amount = moneyToCents(row["Delinquent Total"]);
    const sourceKey = account;
    records.push(
      currentRecord({
        id: `travis-tax:${account}`,
        saleType: "tax_default",
        signalType: "tax_delinquency",
        jurisdictionId: "travis-county-tx",
        jurisdictionName: "Travis County, TX",
        sourceRecordId: account,
        sourceKey,
        sourceId: "travis-tax-delinquency",
        sourceName: "Travis County Tax Office · Delinquent Tax Roll",
        sourceUrl: travisTaxCsvUrl,
        sourceDocumentUrl: travisTaxDocumentationUrl,
        context,
        eventDate: null,
        apn: account,
        propertyKey: `travis-county-tx:${account}`,
        address,
        city: null,
        state: "TX",
        zip: zip5(row["Property Zip"]),
        ownerName: clean(row["Owner Name"]),
        propertyType,
        taxYear: earliestYear,
        delinquentAmountCents: amount,
        taxDueCents: amount,
        evidenceStatus: "Reported delinquent by county tax roll",
        evidenceDetail: compact([
          earliestYear ? `First delinquent tax year ${earliestYear}` : null,
          clean(row["Cause #"]) ? `Cause ${clean(row["Cause #"])}` : null,
          clean(row["Judgement Date"]) ? `Judgment date ${clean(row["Judgement Date"])}` : null,
          clean(row["Bankruptcy Number"]) ? `Bankruptcy ${clean(row["Bankruptcy Number"])}` : null,
        ]),
        evidenceUpdatedAt: context.sourceUpdatedAt,
        legalDescription: clean(row["Legal Description"]),
        rawExcerpt: JSON.stringify({
          account,
          propertyType,
          delinquentTotal: row["Delinquent Total"],
          currentYearTotal: row["Current Year Total"],
          firstYearDelinquent: row["1st Year Delinquent"],
          cause: row["Cause #"],
          judgmentDate: row["Judgement Date"],
        }),
      }),
    );
  }
  assertUnique(records, "sourceKey", "Travis account");
  return { records, excludedNonRealEstate };
}

export function parseNorfolkTaxCsv(text: string, context: ParseContext): ResearchRecord[] {
  const rows = parseCsv(text);
  assertColumns(
    rows,
    [
      "PIN",
      "YEAR",
      "QUARTER",
      "PROPERTY ADDRESS",
      "TAX DUE",
      "PENALTY DUE",
      "INTEREST DUE",
      "TOTAL",
      "ACCOUNT NUMBER",
    ],
    "Norfolk tax",
  );
  return parseNorfolkTaxRows(
    rows.map((row) => ({
      pin: row["PIN"],
      year: row["YEAR"],
      installment: row["QUARTER"],
      address: row["PROPERTY ADDRESS"],
      ownerName: row["PROPERTY OWNER"],
      taxDue: row["TAX DUE"],
      penaltyDue: row["PENALTY DUE"],
      interestDue: row["INTEREST DUE"],
      total: row["TOTAL"],
      account: row["ACCOUNT NUMBER"],
    })),
    context,
  );
}

export type NorfolkTaxRow = {
  readonly pin: string | undefined;
  readonly year: string | undefined;
  readonly installment: string | undefined;
  readonly address: string | undefined;
  readonly ownerName: string | undefined;
  readonly taxDue: string | undefined;
  readonly penaltyDue: string | undefined;
  readonly interestDue: string | undefined;
  readonly total: string | undefined;
  readonly account: string | undefined;
};

export function parseNorfolkTaxRows(
  rows: readonly NorfolkTaxRow[],
  context: ParseContext,
): ResearchRecord[] {
  const records = rows.map((row) => {
    const pin = String(row.pin ?? "").trim();
    const apn = normalizeParcelId(pin, "norfolk-va");
    if (!apn) {
      throw new Error("Norfolk tax row had an invalid PIN.");
    }
    const year = integerOrThrow(row.year, 1900, 2100, "Norfolk tax year");
    const quarter = integerOrThrow(row.installment, 1, 4, "Norfolk tax quarter");
    const account = clean(row.account);
    if (!account) {
      throw new Error("Norfolk tax row had no account number.");
    }
    const tax = moneyToCents(row.taxDue);
    const penalty = moneyToCents(row.penaltyDue);
    const interest = moneyToCents(row.interestDue);
    const total = moneyToCents(row.total);
    if (tax + penalty + interest !== total) {
      throw new Error(
        `Norfolk installment ${pin}/${year}/${quarter} components did not equal TOTAL.`,
      );
    }
    const sourceKey = `${pin}:${account}:${year}:${quarter}`;
    return currentRecord({
      id: `norfolk-tax:${sourceKey}`,
      saleType: "tax_default",
      signalType: "tax_delinquency",
      jurisdictionId: "norfolk-va",
      jurisdictionName: "Norfolk, VA",
      sourceRecordId: sourceKey,
      sourceKey,
      sourceId: "norfolk-delinquent-property-tax",
      sourceName: "City of Norfolk · Delinquent Property Taxes",
      sourceUrl: norfolkTaxCsvUrl,
      sourceDocumentUrl: norfolkTaxMetadataUrl,
      context,
      eventDate: null,
      apn,
      propertyKey: `norfolk-va:${apn}`,
      address: clean(row.address),
      city: "Norfolk",
      state: "VA",
      zip: null,
      ownerName: clean(row.ownerName),
      propertyType: "Real estate",
      taxYear: year,
      taxInstallment: quarter,
      delinquentAmountCents: total,
      taxDueCents: tax,
      penaltyDueCents: penalty,
      interestDueCents: interest,
      evidenceStatus: "Reported at least one quarter behind",
      evidenceDetail: `Tax year ${year}, installment ${quarter}`,
      evidenceUpdatedAt: context.sourceUpdatedAt,
      rawExcerpt: JSON.stringify({ pin, account, year, quarter, tax, penalty, interest, total }),
    });
  });
  assertUnique(records, "sourceKey", "Norfolk PIN/account/year/quarter");
  return records;
}

export type NorfolkViolationRow = {
  violation_id?: string;
  gpin?: string;
  tax_account?: string;
  address?: string;
  created_date?: string;
  last_modified_date?: string;
  corrected_date?: string;
  abatement_date?: string;
  complaint_id?: string;
  status?: string;
  ordinance?: string;
  department?: string;
};

export function parseNorfolkViolations(
  rows: readonly NorfolkViolationRow[],
  context: ParseContext,
): ResearchRecord[] {
  const records: ResearchRecord[] = [];
  for (const row of rows) {
    const violationId = clean(row.violation_id);
    const status = clean(row.status);
    if (!violationId || !status) {
      throw new Error("Norfolk violation lacked ID or status.");
    }
    if (status.startsWith("Closed")) {
      continue;
    }
    const taxAccount = clean(row.tax_account);
    const apn = normalizeParcelId(taxAccount, "norfolk-va");
    const knownStatus = activeNorfolkViolationStatuses.has(status);
    records.push(
      currentRecord({
        id: `norfolk-code:${violationId}`,
        saleType: "tax_default",
        signalType: "code_violation",
        jurisdictionId: "norfolk-va",
        jurisdictionName: "Norfolk, VA",
        sourceRecordId: violationId,
        sourceKey: violationId,
        sourceId: "norfolk-code-violations",
        sourceName: "City of Norfolk · Neighborhood Quality Violations",
        sourceUrl: norfolkViolationUrl,
        sourceDocumentUrl: norfolkViolationMetadataUrl,
        context,
        sourcePublishedAt: dateOnly(row.created_date),
        eventDate: dateOnly(row.created_date),
        apn,
        propertyKey: apn
          ? `norfolk-va:${apn}`
          : `norfolk-va:unmatched:norfolk-code-violations:${violationId}`,
        address: clean(row.address),
        city: "Norfolk",
        state: "VA",
        zip: null,
        ownerName: null,
        propertyType: null,
        evidenceStatus: knownStatus ? status : `Review status: ${status}`,
        evidenceDetail: compact([
          clean(row.ordinance),
          clean(row.department),
          clean(row.complaint_id) ? `Complaint ${clean(row.complaint_id)}` : null,
          apn
            ? null
            : taxAccount
              ? `Invalid literal tax account ${taxAccount}; retained unmatched`
              : "No exact tax-account parcel join; retained unmatched",
        ]),
        evidenceUpdatedAt: localTimestamp(row.last_modified_date),
        rawExcerpt: JSON.stringify(row),
      }),
    );
  }
  assertUnique(records, "sourceKey", "Norfolk violation ID");
  return records;
}

export type AcrisMasterRow = {
  document_id?: string;
  record_type?: string;
  crfn?: string;
  doc_type?: string;
  document_date?: string;
  recorded_datetime?: string;
  modified_date?: string;
  document_amt?: string;
  good_through_date?: string;
};
export type AcrisLegalRow = {
  document_id?: string;
  borough?: string;
  block?: string;
  lot?: string;
  street_number?: string;
  street_name?: string;
  unit?: string;
  property_type?: string;
};

export function validateAcrisMasterRow(master: AcrisMasterRow): {
  documentId: string;
  modifiedAt: string | null;
} {
  const documentId = clean(master.document_id);
  const docType = clean(master.doc_type);
  if (!documentId || !/^\d{16}$/.test(documentId)) {
    throw new Error("ACRIS master row had an invalid document ID.");
  }
  if (docType !== "LOCC" && docType !== "TOLCC") {
    throw new Error("ACRIS returned a row outside the requested document types.");
  }
  if (!dateOnly(master.recorded_datetime)) {
    throw new Error(`ACRIS ${documentId} had an invalid recorded date.`);
  }
  if (!dateOnly(master.good_through_date)) {
    throw new Error(`ACRIS ${documentId} lacked a valid declared good-through date.`);
  }
  if (master.document_date && !dateOnly(master.document_date)) {
    throw new Error(`ACRIS ${documentId} had an invalid document date.`);
  }
  const modifiedAt = localTimestamp(master.modified_date);
  if (master.modified_date && !modifiedAt) {
    throw new Error(`ACRIS ${documentId} had an invalid modified timestamp.`);
  }
  return { documentId, modifiedAt };
}

export function parseAcrisCommonChargeLiens(
  masters: readonly AcrisMasterRow[],
  legals: readonly AcrisLegalRow[],
  context: ParseContext,
): ResearchRecord[] {
  const byDocument = new Map<string, AcrisLegalRow[]>();
  for (const legal of legals) {
    const documentId = clean(legal.document_id);
    if (!documentId) {
      throw new Error("ACRIS legal row lacked a document ID.");
    }
    byDocument.set(documentId, [...(byDocument.get(documentId) ?? []), legal]);
  }
  const records: ResearchRecord[] = [];
  const identities = new Set<string>();
  const add = (record: ResearchRecord) => {
    if (!identities.has(record.sourceKey)) {
      identities.add(record.sourceKey);
      records.push(record);
    }
  };
  for (const master of masters) {
    const { documentId } = validateAcrisMasterRow(master);
    const properties = byDocument.get(documentId) ?? [];
    if (properties.length === 0) {
      add(acrisRecord(master, null, null, context));
    } else {
      for (const [index, legal] of properties.entries()) {
        add(acrisRecord(master, legal, index, context));
      }
    }
  }
  assertUnique(records, "sourceKey", "ACRIS document/property");
  return records;
}

function acrisRecord(
  master: AcrisMasterRow,
  legal: AcrisLegalRow | null,
  legalIndex: number | null,
  context: ParseContext,
): ResearchRecord {
  const documentId = clean(master.document_id) as string;
  const boroughRaw = clean(legal?.borough);
  const blockRaw = clean(legal?.block);
  const lotRaw = clean(legal?.lot);
  const validBorough = boroughRaw !== null && /^[1-5]$/.test(boroughRaw);
  const validBlock = blockRaw !== null && /^\d{1,5}$/.test(blockRaw) && Number(blockRaw) > 0;
  const validLot = lotRaw !== null && /^\d{1,4}$/.test(lotRaw) && Number(lotRaw) > 0;
  const bbl =
    validBorough && validBlock && validLot
      ? normalizeParcelId(
          `${boroughRaw}${blockRaw.padStart(5, "0")}${lotRaw.padStart(4, "0")}`,
          "nyc-ny",
        )
      : null;
  const suffix =
    bbl ??
    (legalIndex === null ? `unmatched:${documentId}` : `unmatched:${documentId}:${legalIndex}`);
  const docType = master.doc_type === "TOLCC" ? "TOLCC" : "LOCC";
  const recorded = dateOnly(master.recorded_datetime);
  return currentRecord({
    id: `acris:${documentId}:${suffix}`,
    saleType: "tax_default",
    signalType: docType === "LOCC" ? "recorded_lien" : "lien_release",
    jurisdictionId: "nyc-ny",
    jurisdictionName: "New York City, NY",
    sourceRecordId: documentId,
    sourceKey: `${documentId}:${suffix}`,
    sourceId: "nyc-acris-common-charge-liens",
    sourceName: "NYC ACRIS · Common Charge Lien Recordings",
    sourceUrl: acrisMasterUrl,
    sourceDocumentUrl: acrisMetadataUrl,
    context: { ...context, sourceGoodThrough: dateOnly(master.good_through_date) },
    sourcePublishedAt: recorded,
    eventDate: recorded,
    apn: bbl,
    propertyKey: bbl
      ? `nyc-ny:${bbl}`
      : `nyc-ny:unmatched:acris:${documentId}:${legalIndex ?? "none"}`,
    address: compact([clean(legal?.street_number), clean(legal?.street_name)]),
    city: null,
    state: "NY",
    zip: null,
    ownerName: null,
    propertyType: clean(legal?.property_type),
    evidenceStatus:
      docType === "LOCC"
        ? "Lien of common charges recorded; current outstanding status unverified"
        : "Termination of lien of common charges recorded",
    evidenceDetail: compact([
      clean(master.crfn) ? `CRFN ${clean(master.crfn)}` : null,
      clean(legal?.unit) ? `Unit ${clean(legal?.unit)}` : null,
      clean(master.document_date) ? `Document date ${dateOnly(master.document_date)}` : null,
      legal && !bbl ? "Invalid or missing literal BBL components; retained unmatched" : null,
    ]),
    evidenceUpdatedAt: localTimestamp(master.modified_date),
    rawExcerpt: JSON.stringify({ master, legal }),
  });
}

export function parseDenverForeclosures(
  rows: readonly DenverForeclosureRecord[],
  context: ParseContext,
): ResearchRecord[] {
  const records = rows.map((row) => {
    const inactive = /withdrawn|cured|rescinded|deeded|sold|to be withdrawn/i.test(row.rawStatus);
    return currentRecord({
      id: `denver-ned:${row.caseId}`,
      saleType: "trustee",
      signalType: "mortgage_foreclosure_initiated",
      jurisdictionId: "denver-co",
      jurisdictionName: "Denver, CO",
      sourceRecordId: row.caseId,
      sourceKey: row.caseId,
      sourceId: "denver-public-trustee-ned",
      sourceName: "Denver Public Trustee · Foreclosure Search",
      sourceUrl: row.sourceSearchUrl,
      sourceDocumentUrl:
        "https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Denver-Clerk-and-Recorder/Recording-Division/Denver-Public-Trustee",
      context,
      sourcePublishedAt: row.nedRecordedDate,
      eventDate: row.nedRecordedDate,
      scheduledDate: row.scheduledSaleDate,
      apn: null,
      propertyKey: `denver-co:unmatched:public-trustee:${row.caseId}`,
      address: row.street,
      city: row.city,
      state: row.state,
      zip: row.zip,
      ownerName: null,
      propertyType: "Deed-of-trust foreclosure filing",
      principalBalanceCents: row.principalAmountCents,
      principalAsOfDate: row.principalAsOfDate,
      evidenceStatus: row.rawStatus,
      evidenceDetail: compact([
        "Notice of Election and Demand foreclosure initiation registry",
        row.nedDocumentNumber ? `NED reception ${row.nedDocumentNumber}` : null,
        row.principalAmountCents !== null
          ? "Published principal balance; not arrears, cure, reinstatement, or payoff"
          : null,
        inactive ? "Registry status is not ranked as active distress" : null,
      ]),
      evidenceUpdatedAt: null,
      priority: inactive ? 0 : 1,
      rawExcerpt: JSON.stringify(row),
    });
  });
  assertUnique(records, "sourceKey", "Denver Public Trustee case");
  return records;
}

type CurrentInput = Omit<
  ResearchRecord,
  | "observedAt"
  | "sourceAsOfDate"
  | "sourceUpdatedAt"
  | "sourceGoodThrough"
  | "sourceKind"
  | "snapshotPresence"
  | "noLongerPresentAt"
  | "scheduledDate"
  | "scheduledTime"
  | "status"
  | "assessorAddress"
  | "assessorCity"
  | "assessorState"
  | "assessorZip"
  | "assessorObservedAt"
  | "assessorSourceUrl"
  | "itemNumber"
  | "minimumBidCents"
  | "unpaidBalanceCents"
  | "principalBalanceCents"
  | "principalAsOfDate"
  | "trusteeSaleNumber"
  | "trusteeName"
  | "saleVerificationPhone"
  | "salePlace"
  | "firstSeenAt"
  | "lastSeenAt"
  | "updatedAt"
  | "taxInstallment"
  | "taxDueCents"
  | "penaltyDueCents"
  | "interestDueCents"
  | "priority"
  | "sourcePublishedAt"
  | "legalDescription"
  | "delinquentAmountCents"
  | "taxYear"
> & {
  readonly context: ParseContext;
  readonly sourcePublishedAt?: string | null;
  readonly legalDescription?: string | null;
  readonly taxInstallment?: number | null;
  readonly taxDueCents?: number | null;
  readonly penaltyDueCents?: number | null;
  readonly interestDueCents?: number | null;
  readonly priority?: number | null;
  readonly scheduledDate?: string | null;
  readonly principalBalanceCents?: number | null;
  readonly principalAsOfDate?: string | null;
  readonly delinquentAmountCents?: number | null;
  readonly taxYear?: number | null;
};

function currentRecord(input: CurrentInput): ResearchRecord {
  const { context, ...record } = input;
  return {
    ...record,
    sourcePublishedAt: input.sourcePublishedAt ?? null,
    sourceAsOfDate: null,
    sourceUpdatedAt: context.sourceUpdatedAt,
    sourceGoodThrough: context.sourceGoodThrough ?? null,
    sourceKind: "current",
    snapshotPresence: "present",
    noLongerPresentAt: null,
    observedAt: context.observedAt,
    scheduledDate: input.scheduledDate ?? null,
    scheduledTime: null,
    status: statusFor(
      input.scheduledDate ?? null,
      context.observedAt,
      record.signalType,
      record.eventDate,
    ),
    assessorAddress: null,
    assessorCity: null,
    assessorState: null,
    assessorZip: null,
    assessorObservedAt: null,
    assessorSourceUrl: null,
    itemNumber: null,
    minimumBidCents: null,
    unpaidBalanceCents: null,
    principalBalanceCents: input.principalBalanceCents ?? null,
    principalAsOfDate: input.principalAsOfDate ?? null,
    trusteeSaleNumber: null,
    trusteeName: null,
    saleVerificationPhone: null,
    salePlace: null,
    legalDescription: input.legalDescription ?? null,
    taxInstallment: input.taxInstallment ?? null,
    taxDueCents: input.taxDueCents ?? null,
    penaltyDueCents: input.penaltyDueCents ?? null,
    interestDueCents: input.interestDueCents ?? null,
    priority: input.priority ?? null,
    delinquentAmountCents: input.delinquentAmountCents ?? null,
    taxYear: input.taxYear ?? null,
    firstSeenAt: context.observedAt,
    lastSeenAt: context.observedAt,
    updatedAt: context.observedAt,
  };
}

function assertColumns(
  rows: Array<Record<string, string>>,
  required: readonly string[],
  name: string,
) {
  if (rows.length === 0) {
    throw new Error(`${name} snapshot contained no rows.`);
  }
  for (const column of required) {
    if (!(column in (rows[0] ?? {}))) {
      throw new Error(`${name} snapshot lacked ${column}.`);
    }
  }
}

function assertUnique(records: readonly ResearchRecord[], field: "sourceKey", name: string) {
  if (new Set(records.map((record) => record[field])).size !== records.length) {
    throw new Error(`${name} snapshot contained duplicate record identities.`);
  }
}

export function moneyToCents(value: string | undefined): number {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^\$/, "");
  const match = normalized.match(/^(-?)(?:(\d+)|(\d{1,3}(?:,\d{3})+))(?:\.(\d{1,2}))?$/);
  const digits = match?.[2] ?? match?.[3]?.replaceAll(",", "");
  if (!digits) {
    throw new Error(`Invalid source money value: ${String(value)}`);
  }
  const cents = Number(digits) * 100 + Number((match?.[4] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Source money value exceeded safe cents.");
  }
  return match?.[1] ? -cents : cents;
}

function integerOrThrow(value: string | undefined, minimum: number, maximum: number, name: string) {
  const integer = Number(value);
  if (!Number.isInteger(integer) || integer < minimum || integer > maximum) {
    throw new Error(`Invalid ${name}.`);
  }
  return integer;
}
function integerOrNull(value: string | undefined, minimum: number, maximum: number) {
  const integer = Number(value);
  return Number.isInteger(integer) && integer >= minimum && integer <= maximum ? integer : null;
}
function clean(value: unknown): string | null {
  const result = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return result || null;
}
function compact(values: readonly (string | null | undefined)[]): string | null {
  return values.filter((value): value is string => Boolean(value)).join(" · ") || null;
}
function zip5(value: string | undefined): string | null {
  return value?.match(/\d{5}/)?.[0] ?? null;
}
function dateOnly(value: string | undefined): string | null {
  const match = value?.match(/^(20\d{2}-\d{2}-\d{2})/);
  return match?.[1] && isCalendarDate(match[1]) ? match[1] : null;
}
function localTimestamp(value: string | undefined): string | null {
  const match = value?.match(
    /^(20\d{2}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))?$/,
  );
  if (!match || !isCalendarDate(match[1] ?? "")) {
    return null;
  }
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offsetHour = match[6] === undefined ? 0 : Number(match[6]);
  const offsetMinute = match[7] === undefined ? 0 : Number(match[7]);
  return hour <= 23 && minute <= 59 && second <= 59 && offsetHour <= 23 && offsetMinute <= 59
    ? (value ?? null)
    : null;
}
