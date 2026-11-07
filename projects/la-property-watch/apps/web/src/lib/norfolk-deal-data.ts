import type { PropertyType } from "./partner.server.ts";

export const norfolkAssessorUrl = "https://data.norfolk.gov/resource/qva7-tzrf.json";
export const norfolkAssessorMetadataUrl = "https://data.norfolk.gov/api/views/qva7-tzrf.json";
export const norfolkAssessorDatasetPage = "https://data.norfolk.gov/d/qva7-tzrf";
export const norfolkPropertyClassMappingUrl =
  "https://data.norfolk.gov/resource/qva7-tzrf.json?$select=property_use,property_class_description,count(*)%20as%20records&$group=property_use,property_class_description&$order=property_use,property_class_description&$limit=1000";
const candidateSelectionLimit = 25;
const socrataPageSize = 1000;

type NorfolkAssessorRow = {
  [key: string]: string | undefined;
  lrsn?: string;
  parcel_id?: string;
  extension?: string;
  gpin?: string;
  legal_description?: string;
  owner?: string;
  property_street_number?: string;
  property_street_number_suffix?: string;
  property_street_direction?: string;
  property_street_name?: string;
  property_street_type?: string;
  property_street_suffix?: string;
  unit_number?: string;
  property_city?: string;
  property_zip?: string;
  land_square_footage?: string;
  property_class_description?: string;
  property_use?: string;
  residential_finished_living?: string;
  commercial_building_area?: string;
  improvement_year_built?: string;
  current_improvement_value?: string;
  current_land_value?: string;
  current_total_value?: string;
  effective_year?: string;
  transfer_date?: string;
  grantor?: string;
  grantee?: string;
  consideration?: string;
  document_number?: string;
};

export type NorfolkEnrichment = {
  propertyKey: string;
  jurisdictionId: "norfolk-va";
  parcelId: string;
  sourceParcelId: string;
  joinMethod: "exact_literal_pin";
  joinSourceUrl: string;
  lrsn: string | null;
  gpin: string | null;
  assessorAddress: string | null;
  assessorCity: string | null;
  assessorZip: string | null;
  legalDescription: string | null;
  ownerName: string | null;
  ownerSourceUrl: string;
  ownerObservedAt: string;
  landUseCode: string | null;
  landUseDescription: string | null;
  propertyUse: string | null;
  normalizedPropertyType: PropertyType | null;
  typeMappingSourceUrl: string | null;
  residentialFinishedAreaValue: number | null;
  commercialBuildingAreaValue: number | null;
  buildingAreaUnitStatus: "unverified";
  lotAreaSqft: number | null;
  yearBuilt: number | null;
  neighborhood: null;
  assessedLandCents: number | null;
  assessedImprovementCents: number | null;
  assessedTotalCents: number | null;
  assessmentYear: number | null;
  assessmentEffectiveDate: string | null;
  assessmentSourceUrl: string;
  lastTransferDate: string | null;
  lastTransferConsiderationCents: number | null;
  lastTransferDocumentNumber: string | null;
  lastTransferGrantor: string | null;
  lastTransferGrantee: string | null;
  sourceUpdatedAt: string | null;
  observedAt: string;
  rawJson: string;
};

export type NorfolkSaleCandidate = {
  id: string;
  subjectPropertyKey: string;
  candidateParcelId: string;
  candidateAddress: string | null;
  saleDate: string;
  salePriceCents: number;
  documentNumber: string | null;
  normalizedPropertyType: PropertyType | null;
  buildingAreaSourceValue: number | null;
  buildingAreaUnitStatus: "unverified";
  documentParcelCount: number | null;
  qualificationStatus: "unqualified_candidate" | "requires_package_review";
  exclusionReason: string | null;
  selectionReason: string;
  sourceUrl: string;
  sourceUpdatedAt: string | null;
  observedAt: string;
};

export type NorfolkDealData = {
  enrichment: NorfolkEnrichment;
  extensions: Array<{
    id: string;
    propertyKey: string;
    extension: string | null;
    residentialFinishedAreaValue: number | null;
    commercialBuildingAreaValue: number | null;
    yearBuilt: number | null;
    rawJson: string;
  }>;
  sales: NorfolkSaleCandidate[];
  observedAt: string;
  sourceUpdatedAt: string | null;
  candidateCoverage: {
    bounded: true;
    selectionLimit: number;
    selectedParcelCount: number;
    windowStart: string;
    description: string;
  };
};

export async function fetchNorfolkDealData(
  fetchImpl: typeof fetch,
  parcelId: string,
  now = new Date(),
): Promise<NorfolkDealData> {
  if (!/^\d{8}$/.test(parcelId)) {
    throw new Error("Norfolk enrichment requires an exact eight-digit literal PIN.");
  }
  const observedAt = now.toISOString();
  const targetParams = new URLSearchParams({
    parcel_id: parcelId,
    $order: "extension",
    $limit: String(socrataPageSize),
  });
  const targetUrl = `${norfolkAssessorUrl}?${targetParams}`;
  const metadataStart = await fetchJson<Record<string, unknown>>(
    fetchImpl,
    norfolkAssessorMetadataUrl,
    2_000_000,
  );
  assertMetadata(metadataStart);
  const targetRows = await fetchSocrataPages<NorfolkAssessorRow>(
    fetchImpl,
    targetParams,
    2_000_000,
    10_000,
  );
  if (!Array.isArray(targetRows) || targetRows.length === 0) {
    throw new Error("Norfolk assessor returned no rows for the exact literal PIN.");
  }
  if (
    targetRows.some((row) => row.parcel_id !== parcelId || !/^\d{8}$/.test(row.parcel_id ?? ""))
  ) {
    throw new Error(
      "Norfolk assessor did not preserve the requested exact eight-digit literal PIN; no zero-padding or numeric repair is allowed.",
    );
  }
  assertParcelFieldsAgree(targetRows);
  const first = targetRows[0]!;
  const classDescription = text(first.property_class_description);
  const normalizedPropertyType = normalizeNorfolkPropertyType(
    classDescription,
    text(first.property_use),
  );
  const windowStart = `${now.getUTCFullYear() - 2}-01-01T00:00:00`;
  const candidateParams = new URLSearchParams({
    $select: "parcel_id,document_number,transfer_date",
    $where: `property_class_description='${(classDescription ?? "").replaceAll("'", "''")}' AND transfer_date >= '${windowStart}' AND consideration>0`,
    $group: "parcel_id,document_number,transfer_date",
    $order: "transfer_date DESC,parcel_id,document_number",
    $limit: String(candidateSelectionLimit),
  });
  const candidateUrl = `${norfolkAssessorUrl}?${candidateParams}`;
  const selectedCandidates = classDescription
    ? await fetchJson<NorfolkAssessorRow[]>(fetchImpl, candidateUrl, 2_000_000)
    : [];
  if (!Array.isArray(selectedCandidates) || selectedCandidates.length > candidateSelectionLimit) {
    throw new Error("Norfolk bounded candidate selection was invalid.");
  }
  const candidateParcels = [
    ...new Set(
      selectedCandidates
        .map((row) => row.parcel_id)
        .filter((value): value is string => /^\d{1,8}$/.test(value ?? "")),
    ),
  ];
  const detailParams = new URLSearchParams({
    $where: candidateParcels.length
      ? `parcel_id in(${candidateParcels.map((value) => `'${value}'`).join(",")})`
      : "1=0",
    $order: "transfer_date DESC,parcel_id,extension",
  });
  const candidateRows = candidateParcels.length
    ? await fetchSocrataPages<NorfolkAssessorRow>(fetchImpl, detailParams, 8_000_000, 10_000)
    : [];
  const documents = [
    ...new Set(
      selectedCandidates
        .map((row) => row.document_number)
        .filter((value): value is string => /^\d{1,30}$/.test(value ?? "")),
    ),
  ];
  let documentRows: NorfolkAssessorRow[] = [];
  if (documents.length > 0) {
    const documentParams = new URLSearchParams({
      $where: `document_number in(${documents.map((value) => `'${value}'`).join(",")})`,
      $order: "document_number,parcel_id,extension",
    });
    documentRows = await fetchSocrataPages<NorfolkAssessorRow>(
      fetchImpl,
      documentParams,
      8_000_000,
      20_000,
    );
  }
  const metadataEnd = await fetchJson<Record<string, unknown>>(
    fetchImpl,
    norfolkAssessorMetadataUrl,
    2_000_000,
  );
  assertMetadata(metadataEnd);
  if (
    metadataEnd["rowsUpdatedAt"] !== metadataStart["rowsUpdatedAt"] ||
    metadataEnd["viewLastModified"] !== metadataStart["viewLastModified"]
  ) {
    throw new Error(
      "Norfolk assessor publication changed during enrichment; retry for a stable snapshot.",
    );
  }
  const sourceUpdatedAt = epoch(metadataEnd["rowsUpdatedAt"]);
  const extensions = targetRows.map((row, index) => ({
    id: `norfolk-fy27:${parcelId}:${row.extension ?? `none-${index}`}`,
    propertyKey: `norfolk-va:${parcelId}`,
    extension: text(row.extension),
    residentialFinishedAreaValue: integer(row.residential_finished_living),
    commercialBuildingAreaValue: integer(row.commercial_building_area),
    yearBuilt: year(row.improvement_year_built),
    rawJson: JSON.stringify(row),
  }));
  const enrichment: NorfolkEnrichment = {
    propertyKey: `norfolk-va:${parcelId}`,
    jurisdictionId: "norfolk-va",
    parcelId,
    sourceParcelId: parcelId,
    joinMethod: "exact_literal_pin",
    joinSourceUrl: targetUrl,
    lrsn: text(first.lrsn),
    gpin: text(first.gpin),
    assessorAddress: address(first),
    assessorCity: text(first.property_city),
    assessorZip: text(first.property_zip),
    legalDescription: text(first.legal_description),
    ownerName: text(first.owner),
    ownerSourceUrl: targetUrl,
    ownerObservedAt: observedAt,
    landUseCode: classDescription?.match(/^\d+/)?.[0] ?? null,
    landUseDescription: classDescription,
    propertyUse: text(first.property_use),
    normalizedPropertyType,
    typeMappingSourceUrl: normalizedPropertyType ? norfolkPropertyClassMappingUrl : null,
    residentialFinishedAreaValue:
      extensions.length === 1 ? (extensions[0]?.residentialFinishedAreaValue ?? null) : null,
    commercialBuildingAreaValue:
      extensions.length === 1 ? (extensions[0]?.commercialBuildingAreaValue ?? null) : null,
    buildingAreaUnitStatus: "unverified",
    lotAreaSqft: integer(first.land_square_footage),
    yearBuilt: extensions.length === 1 ? (extensions[0]?.yearBuilt ?? null) : null,
    neighborhood: null,
    assessedLandCents: dollarsToCents(first.current_land_value),
    assessedImprovementCents: dollarsToCents(first.current_improvement_value),
    assessedTotalCents: dollarsToCents(first.current_total_value),
    assessmentYear: calendarDate(first.effective_year)
      ? Number(first.effective_year?.slice(0, 4))
      : null,
    assessmentEffectiveDate: calendarDate(first.effective_year),
    assessmentSourceUrl: targetUrl,
    lastTransferDate: calendarDate(first.transfer_date),
    lastTransferConsiderationCents: dollarsToCents(first.consideration),
    lastTransferDocumentNumber: text(first.document_number),
    lastTransferGrantor: text(first.grantor),
    lastTransferGrantee: text(first.grantee),
    sourceUpdatedAt,
    observedAt,
    rawJson: JSON.stringify(targetRows),
  };
  const sales = saleCandidates(
    enrichment.propertyKey,
    candidateRows,
    documentRows,
    candidateUrl,
    sourceUpdatedAt,
    observedAt,
  );
  return {
    enrichment,
    extensions,
    sales,
    observedAt,
    sourceUpdatedAt,
    candidateCoverage: {
      bounded: true,
      selectionLimit: candidateSelectionLimit,
      selectedParcelCount: candidateParcels.length,
      windowStart,
      description: `Most recent ${candidateSelectionLimit} distinct same-class positive-transfer candidates; complete extension and document companions were fetched for the selected set.`,
    },
  };
}

export async function persistNorfolkDealData(db: D1Database, data: NorfolkDealData): Promise<void> {
  const e = data.enrichment;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO property_enrichment (property_key,jurisdiction_id,parcel_id,source_parcel_id,join_method,join_source_url,lrsn,gpin,assessor_address,assessor_city,assessor_zip,legal_description,owner_name,owner_source_url,owner_observed_at,land_use_code,land_use_description,property_use,normalized_property_type,type_mapping_source_url,residential_finished_area_value,commercial_building_area_value,building_area_unit_status,lot_area_sqft,year_built,neighborhood,assessed_land_cents,assessed_improvement_cents,assessed_total_cents,assessment_year,assessment_effective_date,assessment_source_url,last_transfer_date,last_transfer_consideration_cents,last_transfer_document_number,last_transfer_grantor,last_transfer_grantee,source_updated_at,observed_at,raw_json)
         VALUES (${Array.from({ length: 40 }, () => "?").join(",")})
         ON CONFLICT(property_key) DO UPDATE SET jurisdiction_id=excluded.jurisdiction_id,parcel_id=excluded.parcel_id,source_parcel_id=excluded.source_parcel_id,join_method=excluded.join_method,join_source_url=excluded.join_source_url,lrsn=excluded.lrsn,gpin=excluded.gpin,assessor_address=excluded.assessor_address,assessor_city=excluded.assessor_city,assessor_zip=excluded.assessor_zip,legal_description=excluded.legal_description,owner_name=excluded.owner_name,owner_source_url=excluded.owner_source_url,owner_observed_at=excluded.owner_observed_at,land_use_code=excluded.land_use_code,land_use_description=excluded.land_use_description,property_use=excluded.property_use,normalized_property_type=excluded.normalized_property_type,type_mapping_source_url=excluded.type_mapping_source_url,residential_finished_area_value=excluded.residential_finished_area_value,commercial_building_area_value=excluded.commercial_building_area_value,building_area_unit_status=excluded.building_area_unit_status,lot_area_sqft=excluded.lot_area_sqft,year_built=excluded.year_built,neighborhood=excluded.neighborhood,assessed_land_cents=excluded.assessed_land_cents,assessed_improvement_cents=excluded.assessed_improvement_cents,assessed_total_cents=excluded.assessed_total_cents,assessment_year=excluded.assessment_year,assessment_effective_date=excluded.assessment_effective_date,assessment_source_url=excluded.assessment_source_url,last_transfer_date=excluded.last_transfer_date,last_transfer_consideration_cents=excluded.last_transfer_consideration_cents,last_transfer_document_number=excluded.last_transfer_document_number,last_transfer_grantor=excluded.last_transfer_grantor,last_transfer_grantee=excluded.last_transfer_grantee,source_updated_at=excluded.source_updated_at,observed_at=excluded.observed_at,raw_json=excluded.raw_json`,
      )
      .bind(
        e.propertyKey,
        e.jurisdictionId,
        e.parcelId,
        e.sourceParcelId,
        e.joinMethod,
        e.joinSourceUrl,
        e.lrsn,
        e.gpin,
        e.assessorAddress,
        e.assessorCity,
        e.assessorZip,
        e.legalDescription,
        e.ownerName,
        e.ownerSourceUrl,
        e.ownerObservedAt,
        e.landUseCode,
        e.landUseDescription,
        e.propertyUse,
        e.normalizedPropertyType,
        e.typeMappingSourceUrl,
        e.residentialFinishedAreaValue,
        e.commercialBuildingAreaValue,
        e.buildingAreaUnitStatus,
        e.lotAreaSqft,
        e.yearBuilt,
        e.neighborhood,
        e.assessedLandCents,
        e.assessedImprovementCents,
        e.assessedTotalCents,
        e.assessmentYear,
        e.assessmentEffectiveDate,
        e.assessmentSourceUrl,
        e.lastTransferDate,
        e.lastTransferConsiderationCents,
        e.lastTransferDocumentNumber,
        e.lastTransferGrantor,
        e.lastTransferGrantee,
        e.sourceUpdatedAt,
        e.observedAt,
        e.rawJson,
      ),
    db
      .prepare("DELETE FROM property_enrichment_extensions WHERE property_key=?")
      .bind(e.propertyKey),
    db.prepare("DELETE FROM property_sales WHERE subject_property_key=?").bind(e.propertyKey),
  ];
  for (const row of data.extensions) {
    statements.push(
      db
        .prepare(
          "INSERT INTO property_enrichment_extensions (id,property_key,extension,residential_finished_area_value,commercial_building_area_value,year_built,raw_json) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(
          row.id,
          row.propertyKey,
          row.extension,
          row.residentialFinishedAreaValue,
          row.commercialBuildingAreaValue,
          row.yearBuilt,
          row.rawJson,
        ),
    );
  }
  for (const sale of data.sales) {
    statements.push(
      db
        .prepare(
          "INSERT INTO property_sales (id,subject_property_key,candidate_parcel_id,candidate_address,sale_date,sale_price_cents,document_number,normalized_property_type,building_area_source_value,building_area_unit_status,document_parcel_count,qualification_status,exclusion_reason,selection_reason,source_url,source_updated_at,observed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          sale.id,
          sale.subjectPropertyKey,
          sale.candidateParcelId,
          sale.candidateAddress,
          sale.saleDate,
          sale.salePriceCents,
          sale.documentNumber,
          sale.normalizedPropertyType,
          sale.buildingAreaSourceValue,
          sale.buildingAreaUnitStatus,
          sale.documentParcelCount,
          sale.qualificationStatus,
          sale.exclusionReason,
          sale.selectionReason,
          sale.sourceUrl,
          sale.sourceUpdatedAt,
          sale.observedAt,
        ),
    );
  }
  statements.push(
    db
      .prepare(
        "INSERT INTO enrichment_runs (id,property_key,source_id,status,started_at,finished_at,source_updated_at,records_found,error) VALUES (?,?,?,'success',?,?,?,?,NULL)",
      )
      .bind(
        crypto.randomUUID(),
        e.propertyKey,
        "norfolk-fy27-assessor",
        data.observedAt,
        new Date().toISOString(),
        data.sourceUpdatedAt,
        data.extensions.length + data.sales.length,
      ),
  );
  await db.batch(statements);
}

export async function enrichNorfolkProperty(
  db: D1Database,
  parcelId: string,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
) {
  const data = await fetchNorfolkDealData(fetchImpl, parcelId, now);
  await persistNorfolkDealData(db, data);
  return {
    propertyKey: data.enrichment.propertyKey,
    sourceUpdatedAt: data.sourceUpdatedAt,
    extensionRows: data.extensions.length,
    saleCandidates: data.sales.length,
  };
}

function saleCandidates(
  subjectPropertyKey: string,
  rows: NorfolkAssessorRow[],
  documentRows: NorfolkAssessorRow[],
  sourceUrl: string,
  sourceUpdatedAt: string | null,
  observedAt: string,
): NorfolkSaleCandidate[] {
  const groups = new Map<string, NorfolkAssessorRow[]>();
  for (const row of rows) {
    const parcel = row.parcel_id;
    const date = calendarDate(row.transfer_date);
    const price = dollarsToCents(row.consideration);
    if (!parcel || !date || price === null || price <= 0) {
      continue;
    }
    const key = `${parcel}:${row.document_number ?? "no-document"}:${date}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, group]) => {
    assertParcelFieldsAgree(group);
    const row = group[0]!;
    const documentNumber = text(row.document_number);
    const related = documentNumber
      ? documentRows.filter((candidate) => candidate.document_number === documentNumber)
      : [];
    const parcels = new Set(related.map((candidate) => candidate.parcel_id).filter(Boolean));
    const hasZeroCompanion = related.some(
      (candidate) =>
        candidate.parcel_id !== row.parcel_id && dollarsToCents(candidate.consideration) === 0,
    );
    const packageReview = parcels.size > 1 || hasZeroCompanion;
    const areaValues = group.map((candidate) => integer(candidate.commercial_building_area));
    const buildingAreaSourceValue = areaValues.every((value) => value !== null)
      ? (areaValues as number[]).reduce((sum, value) => sum + value, 0)
      : null;
    return {
      id: `norfolk-sale:${subjectPropertyKey}:${key}`,
      subjectPropertyKey,
      candidateParcelId: row.parcel_id!,
      candidateAddress: address(row),
      saleDate: calendarDate(row.transfer_date)!,
      salePriceCents: dollarsToCents(row.consideration)!,
      documentNumber,
      normalizedPropertyType: normalizeNorfolkPropertyType(
        text(row.property_class_description),
        text(row.property_use),
      ),
      buildingAreaSourceValue,
      buildingAreaUnitStatus: "unverified",
      documentParcelCount: related.length > 0 ? parcels.size : null,
      qualificationStatus: packageReview ? "requires_package_review" : "unqualified_candidate",
      exclusionReason: packageReview
        ? "Document appears across multiple parcels or includes a zero-consideration companion; allocation and instrument require review."
        : "No arms-length or sale-qualification flag is published; treat as an unqualified same-class transfer candidate.",
      selectionReason: `Selected from the most recent ${candidateSelectionLimit} distinct same-official-class positive transfers in the bounded two-year window; all extension rows and document companions for the selected set were fetched. Geography, condition, units, tenure and arms-length status are not qualified.`,
      sourceUrl,
      sourceUpdatedAt,
      observedAt,
    };
  });
}

function normalizeNorfolkPropertyType(
  classDescription: string | null,
  propertyUse: string | null,
): PropertyType | null {
  if (!classDescription || !propertyUse) {
    return null;
  }
  const singleFamily = new Set([
    "510 S/F Detached",
    "511 S/F Attached (Townhome)",
    "512 S/F Detached >1 but <2 Sty",
    "513 S/F Detached =2 but <3 Sty",
    "514 S/F Detached =3 and higher",
    "515 S/F Detached Split Level",
    "518 S/F w Add'l Dwelling Unit",
  ]);
  if (
    singleFamily.has(classDescription) &&
    (propertyUse === "Single Family - Detached" || propertyUse === "Single Family - Attached")
  ) {
    return "sfh";
  }
  const smallMultifamily = new Set([
    "520 Res Duplex Designed",
    "521 Res Duplex Converted",
    "530 Res Triplex Designed",
    "531 Res Triplex Converted",
    "540 Res Fourplex Designed",
    "541 Res Fourplex Converted",
  ]);
  if (
    smallMultifamily.has(classDescription) &&
    ["Duplex", "Triplex", "Fourplex"].includes(propertyUse)
  ) {
    return "small_multifamily";
  }
  if (
    propertyUse === "Vacant Land" &&
    new Set([
      "300 Industrial Vacant Land",
      "400 Commercial Vacant Land",
      "500 Residential Vacant lot",
    ]).has(classDescription)
  ) {
    return "land";
  }
  if (
    propertyUse === "Commercial" ||
    (propertyUse === "Apartment" && /^40[1-7] /.test(classDescription))
  ) {
    return "commercial";
  }
  // A condominium row represents an individual parcel/unit even when its
  // building class says 2–4; it is deliberately not mapped as a whole small
  // multifamily parcel.
  return null;
}

function assertParcelFieldsAgree(rows: NorfolkAssessorRow[]) {
  const parcelFields = [
    "parcel_id",
    "lrsn",
    "gpin",
    "owner",
    "land_square_footage",
    "property_class_description",
    "property_use",
    "current_improvement_value",
    "current_land_value",
    "current_total_value",
    "effective_year",
    "transfer_date",
    "consideration",
    "document_number",
  ];
  for (const field of parcelFields) {
    if (new Set(rows.map((row) => row[field] ?? null)).size > 1) {
      throw new Error(`Norfolk parcel-level field ${field} differed across extension rows.`);
    }
  }
}

function address(row: NorfolkAssessorRow): string | null {
  const value = [
    row.property_street_number,
    row.property_street_number_suffix,
    row.property_street_direction,
    row.property_street_name,
    row.property_street_type,
    row.property_street_suffix,
    row.unit_number ? `Unit ${row.unit_number}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return value || null;
}
function text(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
function integer(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
function year(value: string | undefined): number | null {
  const parsed = integer(value);
  return parsed !== null && parsed >= 1600 && parsed <= 2100 ? parsed : null;
}
function dollarsToCents(value: string | undefined): number | null {
  if (value === undefined || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    return null;
  }
  const [whole, decimal = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
function calendarDate(value: string | undefined): string | null {
  const date = value?.slice(0, 10) ?? "";
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
}
function epoch(value: unknown): string | null {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}
function assertMetadata(value: Record<string, unknown>) {
  if (value["id"] !== "qva7-tzrf") {
    throw new Error("Norfolk current assessor dataset identity changed.");
  }
  if (
    !Number.isFinite(Number(value["rowsUpdatedAt"])) ||
    !Number.isFinite(Number(value["viewLastModified"]))
  ) {
    throw new Error("Norfolk assessor metadata omitted required publication clocks.");
  }
}
async function fetchSocrataPages<T>(
  fetchImpl: typeof fetch,
  baseParams: URLSearchParams,
  byteLimit: number,
  maxRows: number,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += socrataPageSize) {
    const params = new URLSearchParams(baseParams);
    params.set("$limit", String(socrataPageSize));
    params.set("$offset", String(offset));
    const page = await fetchJson<T[]>(fetchImpl, `${norfolkAssessorUrl}?${params}`, byteLimit);
    if (!Array.isArray(page) || page.length > socrataPageSize) {
      throw new Error("Norfolk official source returned an invalid page.");
    }
    rows.push(...page);
    if (page.length < socrataPageSize) {
      return rows;
    }
    if (rows.length >= maxRows) {
      throw new Error("Norfolk official source exceeded the documented complete-response guard.");
    }
  }
}
async function fetchJson<T>(fetchImpl: typeof fetch, url: string, byteLimit: number): Promise<T> {
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json",
      "user-agent": "TemplarLabs-PropertyWatch/3.0 (+https://la-property-watch.breli.app)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Norfolk official source returned HTTP ${response.status}.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > byteLimit) {
    throw new Error("Norfolk official source exceeded its response limit.");
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new Error("Norfolk official source returned invalid JSON.");
  }
}
