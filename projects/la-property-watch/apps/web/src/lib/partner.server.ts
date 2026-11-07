import { allowedEmails, canonicalPartnerEmail, type SignalType } from "./model.ts";
import { loadPropertyDetail } from "./repository.ts";

export type PropertyType = "sfh" | "small_multifamily" | "commercial" | "land";
export type DistressPhase = "early_distress" | "filed_foreclosure";
export type FitStatus = "match" | "no_match" | "unknown";
export type PipelineStage = "New" | "Researching" | "Qualified" | "Passed";
export type SizeBasis =
  | "none"
  | "lot_square_feet"
  | "residential_finished_area_source_units"
  | "commercial_building_area_source_units";
export type ValueBasis = "assessed_value" | "last_reported_consideration" | "user_assumption";

export type BuyBoxInput = {
  readonly id: string | null;
  readonly expectedVersion: number;
  readonly name: string;
  readonly propertyTypes: readonly PropertyType[];
  readonly jurisdictions: readonly string[];
  readonly neighborhoods: readonly string[];
  readonly zips: readonly string[];
  readonly sizeBasis: SizeBasis;
  readonly minSizeValue: number | null;
  readonly maxSizeValue: number | null;
  readonly minValueCents: number | null;
  readonly maxValueCents: number | null;
  readonly valueBasis: ValueBasis;
  readonly valueAssumptionLabel: string | null;
  readonly distressPhases: readonly DistressPhase[];
};

export type BuyBox = Omit<BuyBoxInput, "expectedVersion"> & {
  readonly id: string;
  readonly version: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

export type FitProperty = {
  readonly propertyKey: string;
  readonly jurisdictionId: string;
  readonly zip: string | null;
  readonly neighborhood?: string | null;
  readonly normalizedPropertyType: PropertyType | null;
  readonly lotAreaSqft: number | null;
  readonly residentialFinishedAreaValue?: number | null;
  readonly commercialBuildingAreaValue?: number | null;
  readonly assessedValueCents: number | null;
  readonly lastReportedConsiderationCents?: number | null;
  readonly userAssumptionCents?: number | null;
  readonly signalTypes: readonly SignalType[];
};

export type BuyingFit = {
  readonly status: FitStatus;
  readonly reasons: readonly string[];
  readonly missingInputs: readonly string[];
};

export type PipelinePatch = Partial<{
  saved: boolean;
  dismissed: boolean;
  stage: PipelineStage;
  assignedTo: string | null;
  followUpAt: string | null;
  passReason: string | null;
}>;

export type PipelineProperty = {
  readonly propertyKey: string;
  readonly saved: boolean;
  readonly dismissed: boolean;
  readonly stage: PipelineStage;
  readonly assignedTo: string | null;
  readonly followUpAt: string | null;
  readonly passReason: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly address?: string | null;
  readonly jurisdictionName?: string | null;
};

export class PartnerValidationError extends Error {}
export class PartnerConflictError extends Error {}

const propertyTypes = new Set<PropertyType>(["sfh", "small_multifamily", "commercial", "land"]);
const distressPhases = new Set<DistressPhase>(["early_distress", "filed_foreclosure"]);
const sizeBases = new Set<SizeBasis>([
  "none",
  "lot_square_feet",
  "residential_finished_area_source_units",
  "commercial_building_area_source_units",
]);
const valueBases = new Set<ValueBasis>([
  "assessed_value",
  "last_reported_consideration",
  "user_assumption",
]);
const stages = new Set<PipelineStage>(["New", "Researching", "Qualified", "Passed"]);

export function evaluateBuyingFit(
  property: FitProperty,
  buyBox: Omit<BuyBoxInput, "id" | "expectedVersion" | "name">,
): BuyingFit {
  const reasons: string[] = [];
  const missingInputs: string[] = [];
  let mismatch = false;
  const compareList = <T>(
    label: string,
    configured: readonly T[],
    actual: T | null | undefined,
  ) => {
    if (configured.length === 0) {
      return;
    }
    if (actual === null || actual === undefined || actual === "") {
      missingInputs.push(`${label} is not published`);
    } else if (configured.includes(actual)) {
      reasons.push(`${label} matches ${String(actual)}`);
    } else {
      mismatch = true;
      reasons.push(`${label} ${String(actual)} is outside the buy box`);
    }
  };
  compareList("Market", buyBox.jurisdictions, property.jurisdictionId);
  compareList("ZIP", buyBox.zips, property.zip);
  compareList("Neighborhood", buyBox.neighborhoods, property.neighborhood);
  compareList("Property type", buyBox.propertyTypes, property.normalizedPropertyType);

  const hasSizeRange = buyBox.minSizeValue !== null || buyBox.maxSizeValue !== null;
  if (hasSizeRange) {
    let size: number | null | undefined = null;
    if (buyBox.sizeBasis === "lot_square_feet") {
      size = property.lotAreaSqft;
    } else if (buyBox.sizeBasis === "residential_finished_area_source_units") {
      size = property.residentialFinishedAreaValue;
      missingInputs.push(
        "Residential finished-area units require publisher confirmation before strict matching",
      );
      size = null;
    } else if (buyBox.sizeBasis === "commercial_building_area_source_units") {
      size = property.commercialBuildingAreaValue;
      missingInputs.push(
        "Commercial building-area units are unverified; strict size matching is disabled",
      );
      size = null;
    }
    if (size === null || size === undefined) {
      if (!missingInputs.some((entry) => /size|area/i.test(entry))) {
        missingInputs.push("Selected property size is not published");
      }
    } else if (
      (buyBox.minSizeValue !== null && size < buyBox.minSizeValue) ||
      (buyBox.maxSizeValue !== null && size > buyBox.maxSizeValue)
    ) {
      mismatch = true;
      reasons.push(`Published ${buyBox.sizeBasis} value ${size} is outside the configured range`);
    } else {
      reasons.push(`Published ${buyBox.sizeBasis} value ${size} is within range`);
    }
  }

  const hasValueRange = buyBox.minValueCents !== null || buyBox.maxValueCents !== null;
  if (hasValueRange) {
    const value =
      buyBox.valueBasis === "assessed_value"
        ? property.assessedValueCents
        : buyBox.valueBasis === "last_reported_consideration"
          ? property.lastReportedConsiderationCents
          : property.userAssumptionCents;
    if (value === null || value === undefined) {
      missingInputs.push(`${buyBox.valueBasis.replaceAll("_", " ")} is not available`);
    } else if (
      (buyBox.minValueCents !== null && value < buyBox.minValueCents) ||
      (buyBox.maxValueCents !== null && value > buyBox.maxValueCents)
    ) {
      mismatch = true;
      reasons.push(`${buyBox.valueBasis.replaceAll("_", " ")} is outside the configured range`);
    } else {
      reasons.push(`${buyBox.valueBasis.replaceAll("_", " ")} is within the configured range`);
    }
    if (buyBox.valueBasis === "assessed_value") {
      reasons.push(
        "Assessment is a named tax-assessment basis, not market value or an asking price",
      );
    } else if (buyBox.valueBasis === "user_assumption" && buyBox.valueAssumptionLabel) {
      reasons.push(
        `Fit uses the dated user-assumption label “${buyBox.valueAssumptionLabel}”, never a sourced market value`,
      );
    }
  }

  if (buyBox.distressPhases.length > 0) {
    const phase: DistressPhase = property.signalTypes.some((signal) =>
      [
        "notice_of_default",
        "mortgage_foreclosure_initiated",
        "scheduled_trustee_sale",
        "scheduled_tax_sale",
      ].includes(signal),
    )
      ? "filed_foreclosure"
      : "early_distress";
    if (buyBox.distressPhases.includes(phase)) {
      reasons.push(`Distress phase matches ${phase.replaceAll("_", " ")}`);
    } else {
      mismatch = true;
      reasons.push(`Distress phase ${phase.replaceAll("_", " ")} is outside the buy box`);
    }
  }
  return {
    status: mismatch ? "no_match" : missingInputs.length > 0 ? "unknown" : "match",
    reasons,
    missingInputs,
  };
}

export async function upsertBuyBox(
  db: D1Database,
  actor: string,
  raw: BuyBoxInput,
  now = new Date(),
): Promise<BuyBox> {
  const actorEmail = requirePartnerEmail(actor);
  const input = validateBuyBox(raw);
  const timestamp = now.toISOString();
  if (input.id === null) {
    if (input.expectedVersion !== 0) {
      throw new PartnerConflictError("A new buy box must start at version 0.");
    }
    const id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO buy_boxes (id,name,property_types_json,jurisdictions_json,neighborhoods_json,zips_json,min_size_value,max_size_value,size_basis,min_value_cents,max_value_cents,value_basis,value_assumption_label,distress_phases_json,version,created_at,created_by,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)",
      )
      .bind(...buyBoxValues({ ...input, id }, timestamp, actorEmail), timestamp, actorEmail)
      .run();
    return (await readBuyBox(db, id))!;
  }
  const result = await db
    .prepare(
      "UPDATE buy_boxes SET name=?,property_types_json=?,jurisdictions_json=?,neighborhoods_json=?,zips_json=?,min_size_value=?,max_size_value=?,size_basis=?,min_value_cents=?,max_value_cents=?,value_basis=?,value_assumption_label=?,distress_phases_json=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=?",
    )
    .bind(
      input.name,
      JSON.stringify(input.propertyTypes),
      JSON.stringify(input.jurisdictions),
      JSON.stringify(input.neighborhoods),
      JSON.stringify(input.zips),
      input.minSizeValue,
      input.maxSizeValue,
      input.sizeBasis,
      input.minValueCents,
      input.maxValueCents,
      input.valueBasis,
      input.valueAssumptionLabel,
      JSON.stringify(input.distressPhases),
      timestamp,
      actorEmail,
      input.id,
      input.expectedVersion,
    )
    .run();
  if (!result.meta.changes) {
    throw new PartnerConflictError("The buy box changed; reload before saving.");
  }
  return (await readBuyBox(db, input.id))!;
}

export async function updatePipelineProperty(
  db: D1Database,
  actor: string,
  propertyKey: string,
  expectedVersion: number,
  patch: PipelinePatch,
  now = new Date(),
): Promise<PipelineProperty> {
  const actorEmail = requirePartnerEmail(actor);
  validatePropertyKey(propertyKey);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new PartnerValidationError("Expected version must be a non-negative integer.");
  }
  validatePipelinePatch(patch);
  const existing = await db
    .prepare("SELECT * FROM partner_properties WHERE property_key=?")
    .bind(propertyKey)
    .first<PipelineRow>();
  const timestamp = now.toISOString();
  const merged = {
    saved: patch.saved ?? Boolean(existing?.saved ?? false),
    dismissed: patch.dismissed ?? Boolean(existing?.dismissed ?? false),
    stage: patch.stage ?? existing?.stage ?? "New",
    assignedTo: patch.assignedTo === undefined ? (existing?.assigned_to ?? null) : patch.assignedTo,
    followUpAt:
      patch.followUpAt === undefined ? (existing?.follow_up_at ?? null) : patch.followUpAt,
    passReason: patch.passReason === undefined ? (existing?.pass_reason ?? null) : patch.passReason,
  };
  if (merged.assignedTo) {
    merged.assignedTo = requirePartnerEmail(merged.assignedTo);
  }
  if (merged.passReason) {
    merged.passReason = merged.passReason.trim();
  }
  if (merged.stage === "Passed" && !merged.passReason) {
    throw new PartnerValidationError("A passed property requires an explicit pass reason.");
  }
  if (merged.stage !== "Passed") {
    merged.passReason = null;
  }
  if (merged.stage === "Passed") {
    merged.followUpAt = null;
  }
  const stateStatement = !existing
    ? db
        .prepare(
          "INSERT OR IGNORE INTO partner_properties (property_key,saved,dismissed,stage,assigned_to,follow_up_at,pass_reason,version,created_at,created_by,updated_at,updated_by) SELECT ?,?,?,?,?,?,?,1,?,?,?,? WHERE EXISTS (SELECT 1 FROM foreclosure_records WHERE property_key=? LIMIT 1)",
        )
        .bind(
          propertyKey,
          merged.saved ? 1 : 0,
          merged.dismissed ? 1 : 0,
          merged.stage,
          merged.assignedTo,
          merged.followUpAt,
          merged.passReason,
          timestamp,
          actorEmail,
          timestamp,
          actorEmail,
          propertyKey,
        )
    : db
        .prepare(
          "UPDATE partner_properties SET saved=?,dismissed=?,stage=?,assigned_to=?,follow_up_at=?,pass_reason=?,version=version+1,updated_at=?,updated_by=? WHERE property_key=? AND version=?",
        )
        .bind(
          merged.saved ? 1 : 0,
          merged.dismissed ? 1 : 0,
          merged.stage,
          merged.assignedTo,
          merged.followUpAt,
          merged.passReason,
          timestamp,
          actorEmail,
          propertyKey,
          expectedVersion,
        );
  if (!existing) {
    if (expectedVersion !== 0) {
      throw new PartnerConflictError("The property state does not exist at that version.");
    }
    const known = await db
      .prepare("SELECT 1 present FROM foreclosure_records WHERE property_key=? LIMIT 1")
      .bind(propertyKey)
      .first();
    if (!known) {
      throw new PartnerValidationError("Property key is not present in retained evidence.");
    }
  }
  const results = await db.batch([
    stateStatement,
    ...followUpAlertStatements(db, propertyKey, timestamp, actorEmail),
  ]);
  if (!results[0]?.meta.changes) {
    throw new PartnerConflictError("The property changed; reload before saving.");
  }
  return (await readPipelineProperty(db, propertyKey))!;
}

export async function addPropertyNote(
  db: D1Database,
  actor: string,
  propertyKey: string,
  rawBody: string,
  now = new Date(),
) {
  const actorEmail = requirePartnerEmail(actor);
  validatePropertyKey(propertyKey);
  if (typeof rawBody !== "string") {
    throw new PartnerValidationError("Note body must be text.");
  }
  await assertKnownProperty(db, propertyKey);
  const body = rawBody.trim();
  if (body.length < 1 || body.length > 4_000) {
    throw new PartnerValidationError("Note must be 1 to 4000 characters.");
  }
  const note = {
    id: crypto.randomUUID(),
    propertyKey,
    body,
    authorEmail: actorEmail,
    createdAt: now.toISOString(),
  };
  await db
    .prepare(
      "INSERT INTO property_notes (id,property_key,body,author_email,created_at) VALUES (?,?,?,?,?)",
    )
    .bind(note.id, propertyKey, body, actorEmail, note.createdAt)
    .run();
  return note;
}

export async function addValueAssumption(
  db: D1Database,
  actor: string,
  propertyKey: string,
  input: { label: string; valueCents: number; asOfDate: string },
  now = new Date(),
) {
  const actorEmail = requirePartnerEmail(actor);
  validatePropertyKey(propertyKey);
  if (!input || typeof input !== "object") {
    throw new PartnerValidationError("Assumption input is invalid.");
  }
  if (typeof input.label !== "string" || typeof input.asOfDate !== "string") {
    throw new PartnerValidationError("Assumption label and as-of date must be text.");
  }
  await assertKnownProperty(db, propertyKey);
  const label = input.label.trim();
  if (label.length < 1 || label.length > 120) {
    throw new PartnerValidationError("Assumption label must be 1 to 120 characters.");
  }
  if (!Number.isSafeInteger(input.valueCents) || input.valueCents < 0) {
    throw new PartnerValidationError("Assumption value must be non-negative integer cents.");
  }
  if (!validCalendarDate(input.asOfDate)) {
    throw new PartnerValidationError("Assumption as-of date is invalid.");
  }
  const assumption = {
    id: crypto.randomUUID(),
    propertyKey,
    label,
    valueCents: input.valueCents,
    asOfDate: input.asOfDate,
    authorEmail: actorEmail,
    createdAt: now.toISOString(),
  };
  await db
    .prepare(
      "INSERT INTO property_value_assumptions (id,property_key,label,value_cents,as_of_date,author_email,created_at) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      assumption.id,
      propertyKey,
      label,
      input.valueCents,
      input.asOfDate,
      actorEmail,
      assumption.createdAt,
    )
    .run();
  return assumption;
}

export async function updateAlertPreferences(
  db: D1Database,
  actor: string,
  input: { newActivity: boolean; worseningActivity: boolean; dueFollowUps: boolean },
  now = new Date(),
) {
  const actorEmail = requirePartnerEmail(actor);
  if (!input || typeof input !== "object") {
    throw new PartnerValidationError("Alert preferences are invalid.");
  }
  if (
    [input.newActivity, input.worseningActivity, input.dueFollowUps].some(
      (v) => typeof v !== "boolean",
    )
  ) {
    throw new PartnerValidationError("Alert preferences must be booleans.");
  }
  await db
    .prepare(
      "INSERT INTO user_alert_preferences (user_email,new_activity,worsening_activity,due_follow_ups,updated_at) VALUES (?,?,?,?,?) ON CONFLICT DO UPDATE SET user_email=excluded.user_email,new_activity=excluded.new_activity,worsening_activity=excluded.worsening_activity,due_follow_ups=excluded.due_follow_ups,updated_at=excluded.updated_at",
    )
    .bind(
      actorEmail,
      input.newActivity ? 1 : 0,
      input.worseningActivity ? 1 : 0,
      input.dueFollowUps ? 1 : 0,
      now.toISOString(),
    )
    .run();
  return { ...input, externalDelivery: "not_configured" as const };
}

export async function markAlertsRead(
  db: D1Database,
  actor: string,
  ids: readonly string[],
  now = new Date(),
) {
  const actorEmail = requirePartnerEmail(actor);
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 200 ||
    ids.some(
      (id) =>
        typeof id !== "string" ||
        id.length < 1 ||
        id.length > 300 ||
        [...id].some((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return codePoint < 32 || codePoint === 127;
        }),
    )
  ) {
    throw new PartnerValidationError("Select 1 to 200 valid alert IDs.");
  }
  await db
    .prepare(
      "UPDATE property_alerts SET read_at=? WHERE user_email=? COLLATE NOCASE AND id IN (SELECT value FROM json_each(?))",
    )
    .bind(now.toISOString(), actorEmail, JSON.stringify([...new Set(ids)]))
    .run();
}

export async function loadPartnerWorkspace(
  db: D1Database,
  actor: string,
  now = new Date(),
  pagination: {
    activityPage?: number;
    activityPageSize?: number;
    alertPage?: number;
    alertPageSize?: number;
  } = {},
) {
  const actorEmail = requirePartnerEmail(actor);
  const activityPage = pageValue(pagination.activityPage, "Activity page");
  const activityPageSize = pageSizeValue(pagination.activityPageSize, "Activity page size");
  const alertPage = pageValue(pagination.alertPage, "Alert page");
  const alertPageSize = pageSizeValue(pagination.alertPageSize, "Alert page size");
  const activeAlertWhere = `a.user_email=? COLLATE NOCASE AND a.available_at<=?
    AND ((a.kind='due_follow_up' AND COALESCE(pref.due_follow_ups,1)=1 AND p.stage<>'Passed' AND p.follow_up_at=a.available_at)
      OR (a.kind='worsening_activity' AND COALESCE(pref.worsening_activity,1)=1)
      OR (a.kind='new_activity' AND COALESCE(pref.new_activity,1)=1))`;
  const [
    buyBoxRows,
    pipelineRows,
    activityRows,
    activityCount,
    alertRows,
    alertCount,
    preferenceRow,
  ] = await Promise.all([
    db.prepare("SELECT * FROM buy_boxes ORDER BY updated_at DESC,id").all<BuyBoxRow>(),
    db
      .prepare(
        "SELECT p.*,COALESCE(w.address,(SELECT MAX(address) FROM foreclosure_records r WHERE r.property_key=p.property_key)) address,COALESCE(w.jurisdiction_name,(SELECT MAX(jurisdiction_name) FROM foreclosure_records r WHERE r.property_key=p.property_key)) jurisdiction_name FROM partner_properties p LEFT JOIN watchlist_properties w ON w.property_key=p.property_key ORDER BY CASE p.stage WHEN 'Qualified' THEN 0 WHEN 'Researching' THEN 1 WHEN 'New' THEN 2 ELSE 3 END,COALESCE(p.follow_up_at,'9999'),p.updated_at DESC",
      )
      .all<PipelineRow & { address: string | null; jurisdiction_name: string | null }>(),
    db
      .prepare("SELECT * FROM property_change_events ORDER BY detected_at DESC,id LIMIT ? OFFSET ?")
      .bind(activityPageSize, (activityPage - 1) * activityPageSize)
      .all<ChangeRow>(),
    db.prepare("SELECT COUNT(*) total FROM property_change_events").first<{ total: number }>(),
    db
      .prepare(
        `SELECT a.* FROM property_alerts a LEFT JOIN partner_properties p ON p.property_key=a.property_key LEFT JOIN user_alert_preferences pref ON pref.user_email=a.user_email COLLATE NOCASE WHERE ${activeAlertWhere} ORDER BY a.read_at IS NOT NULL,a.available_at DESC,a.id LIMIT ? OFFSET ?`,
      )
      .bind(actorEmail, now.toISOString(), alertPageSize, (alertPage - 1) * alertPageSize)
      .all<AlertRow>(),
    db
      .prepare(
        `SELECT COUNT(*) total FROM property_alerts a LEFT JOIN partner_properties p ON p.property_key=a.property_key LEFT JOIN user_alert_preferences pref ON pref.user_email=a.user_email COLLATE NOCASE WHERE ${activeAlertWhere}`,
      )
      .bind(actorEmail, now.toISOString())
      .first<{ total: number }>(),
    db
      .prepare("SELECT * FROM user_alert_preferences WHERE user_email=? COLLATE NOCASE")
      .bind(actorEmail)
      .first<PreferenceRow>(),
  ]);
  return {
    buyBoxes: buyBoxRows.results.map(mapBuyBox),
    pipeline: pipelineRows.results.map((row) => ({
      ...mapPipeline(row),
      address: row.address,
      jurisdictionName: row.jurisdiction_name,
    })),
    activity: activityRows.results.map(mapChange),
    activityPage: pageMetadata(activityPage, activityPageSize, Number(activityCount?.total ?? 0)),
    alerts: alertRows.results.map(mapAlert),
    alertPage: pageMetadata(alertPage, alertPageSize, Number(alertCount?.total ?? 0)),
    alertPreferences: preferenceRow
      ? mapPreferences(preferenceRow)
      : {
          newActivity: true,
          worseningActivity: true,
          dueFollowUps: true,
          externalDelivery: "not_configured" as const,
        },
    dueFollowUps: pipelineRows.results
      .filter(
        (row) =>
          row.follow_up_at && row.follow_up_at <= now.toISOString() && row.stage !== "Passed",
      )
      .map(mapPipeline),
  };
}

export async function loadDealBrief(
  db: D1Database,
  propertyKey: string,
  buyBoxId?: string | null,
  evidencePage = 1,
  evidencePageSize = 200,
) {
  validatePropertyKey(propertyKey);
  const detail = await loadPropertyDetail(db, propertyKey, evidencePage, evidencePageSize);
  if (!detail) {
    return null;
  }
  const [enrichment, extensions, sales, notes, changes, pipeline, assumptions, buyBox] =
    await Promise.all([
      db
        .prepare("SELECT * FROM property_enrichment WHERE property_key=?")
        .bind(propertyKey)
        .first<EnrichmentRow>(),
      db
        .prepare(
          "SELECT * FROM property_enrichment_extensions WHERE property_key=? ORDER BY COALESCE(extension,''),id",
        )
        .bind(propertyKey)
        .all<ExtensionRow>(),
      db
        .prepare(
          "SELECT * FROM property_sales WHERE subject_property_key=? ORDER BY sale_date DESC,id",
        )
        .bind(propertyKey)
        .all<SaleRow>(),
      db
        .prepare("SELECT * FROM property_notes WHERE property_key=? ORDER BY created_at,id")
        .bind(propertyKey)
        .all<NoteRow>(),
      db
        .prepare(
          "SELECT * FROM property_change_events WHERE property_key=? ORDER BY detected_at DESC,id",
        )
        .bind(propertyKey)
        .all<ChangeRow>(),
      readPipelineProperty(db, propertyKey),
      db
        .prepare(
          "SELECT * FROM property_value_assumptions WHERE property_key=? ORDER BY as_of_date DESC,created_at DESC,id DESC",
        )
        .bind(propertyKey)
        .all<AssumptionRow>(),
      buyBoxId ? readBuyBox(db, buyBoxId) : Promise.resolve(null),
    ]);
  const selectedAssumption =
    buyBox?.valueBasis === "user_assumption" && buyBox.valueAssumptionLabel
      ? (assumptions.results.find((row) => row.label === buyBox.valueAssumptionLabel) ?? null)
      : null;
  const fitProperty: FitProperty = {
    propertyKey,
    jurisdictionId: detail.property.jurisdictionId,
    zip: detail.property.zip,
    neighborhood: enrichment?.neighborhood ?? null,
    normalizedPropertyType: (enrichment?.normalized_property_type as PropertyType | null) ?? null,
    lotAreaSqft: enrichment?.lot_area_sqft ?? null,
    residentialFinishedAreaValue: enrichment?.residential_finished_area_value ?? null,
    commercialBuildingAreaValue: enrichment?.commercial_building_area_value ?? null,
    assessedValueCents: enrichment?.assessed_total_cents ?? null,
    lastReportedConsiderationCents: enrichment?.last_transfer_consideration_cents ?? null,
    userAssumptionCents: selectedAssumption?.value_cents ?? null,
    signalTypes: detail.property.signalTypes,
  };
  const buyingFit = buyBox
    ? evaluateBuyingFit(fitProperty, buyBox)
    : { status: "unknown" as const, reasons: [], missingInputs: ["No buy box selected"] };
  const distressStrength = distressSummary(detail.property.signalTypes);
  const evidenceConfidence = confidenceSummary(detail.property.parcelId, detail.evidence);
  const missingFacts = [
    !enrichment && "Official assessor characteristics not yet retrieved",
    !enrichment?.normalized_property_type && "Authoritatively mapped property type is unknown",
    !enrichment?.residential_finished_area_value &&
      !enrichment?.commercial_building_area_value &&
      "Building area is not published",
    !enrichment?.assessed_total_cents && "Assessment is not published",
    "Current mortgage payoff and net equity are unknown without verified current balances",
    "Physical condition, asking price, and market value are unknown",
  ].filter(Boolean) as string[];
  return {
    property: detail.property,
    evidence: detail.evidence,
    evidenceTotal: detail.evidenceTotal,
    evidencePage: detail.evidencePage,
    evidenceTruncated: detail.truncated,
    distressStrength,
    evidenceConfidence,
    buyingFit,
    pipeline,
    notes: notes.results.map((row) => ({
      id: row.id,
      propertyKey: row.property_key,
      body: row.body,
      authorEmail: row.author_email,
      createdAt: row.created_at,
    })),
    changes: changes.results.map(mapChange),
    enrichment: enrichment ? mapEnrichment(enrichment) : null,
    extensions: extensions.results.map(mapExtension),
    saleCandidates: sales.results.map(mapSale),
    assumptions: assumptions.results.map((row) => ({
      id: row.id,
      label: row.label,
      valueCents: row.value_cents,
      asOfDate: row.as_of_date,
      authorEmail: row.author_email,
      createdAt: row.created_at,
    })),
    ownerProvenance: [
      ...(enrichment?.owner_name && enrichment.owner_source_url
        ? [
            {
              ownerName: enrichment.owner_name,
              sourceName: "City of Norfolk FY27 assessor data",
              sourceUrl: enrichment.owner_source_url,
              observedAt: enrichment.owner_observed_at ?? enrichment.observed_at,
            },
          ]
        : []),
      ...detail.evidence
        .filter((record) => record.ownerName)
        .map((record) => ({
          ownerName: record.ownerName!,
          sourceName: record.sourceName,
          sourceUrl: record.sourceUrl,
          observedAt: record.observedAt,
        })),
    ],
    situsAliases: [
      ...new Set(
        detail.evidence
          .map((record) => record.address)
          .filter((value): value is string => Boolean(value)),
      ),
    ],
    missingFacts,
    nextChecks: [
      "Open each linked official record and confirm current legal/status meaning",
      "Confirm title, lien linkage and any release against the exact instrument",
      "Verify condition, acquisition price, financing and current payoff independently",
      ...(enrichment?.building_area_unit_status === "unverified"
        ? [
            "Confirm commercial building-area units with the Norfolk publisher before size-based analysis",
          ]
        : []),
    ],
    limitations: [
      "A publication refresh is not a property-status reconfirmation",
      "Assessment is not market value",
      "Recent same-type transfers are candidates, not an appraisal or qualified comparable set",
    ],
  };
}

export async function selectedEvidenceCsv(
  db: D1Database,
  rawKeys: readonly string[],
): Promise<string> {
  if (!Array.isArray(rawKeys) || rawKeys.some((key) => typeof key !== "string")) {
    throw new PartnerValidationError("Property keys must be a list of text values.");
  }
  const keys = [...new Set(rawKeys)];
  if (keys.length < 1 || keys.length > 100) {
    throw new PartnerValidationError("Select 1 to 100 property keys.");
  }
  keys.forEach(validatePropertyKey);
  const keyJson = JSON.stringify(keys);
  const found = await db
    .prepare(
      "SELECT property_key FROM foreclosure_records WHERE property_key IN (SELECT value FROM json_each(?)) GROUP BY property_key ORDER BY property_key",
    )
    .bind(keyJson)
    .all<{ property_key: string }>();
  const foundKeys = new Set(found.results.map((row) => row.property_key));
  const missing = keys.filter((key) => !foundKeys.has(key));
  if (missing.length > 0) {
    throw new PartnerValidationError(`Selected properties were not found: ${missing.join(", ")}`);
  }
  const beforeToken = await selectedPublicationToken(db, keyJson);
  const columns = [
    "property_key",
    "jurisdiction",
    "parcel_id",
    "address",
    "owner_as_published",
    "evidence_id",
    "signal_type",
    "snapshot_presence",
    "delinquent_or_arrears_cents",
    "unpaid_balance_cents",
    "principal_balance_cents",
    "reported_amount_basis",
    "reported_amount_cents",
    "event_date",
    "source_name",
    "source_url",
    "source_updated_at",
  ];
  const lines = [columns.map(csvCell).join(",")];
  let lastId = "";
  while (true) {
    const rows = await db
      .prepare(
        `SELECT property_key,jurisdiction_name,apn,address,owner_name,id,signal_type,snapshot_presence,delinquent_amount_cents,unpaid_balance_cents,principal_balance_cents,event_date,source_name,source_url,source_updated_at FROM foreclosure_records WHERE property_key IN (SELECT value FROM json_each(?)) AND id>? ORDER BY id LIMIT 1000`,
      )
      .bind(keyJson, lastId)
      .all<SelectedEvidenceRow>();
    if (rows.results.length === 0) {
      break;
    }
    for (const row of rows.results) {
      lines.push(
        [
          row.property_key,
          row.jurisdiction_name,
          row.apn,
          row.address,
          row.owner_name,
          row.id,
          row.signal_type,
          row.snapshot_presence,
          row.delinquent_amount_cents,
          row.unpaid_balance_cents,
          row.principal_balance_cents,
          row.delinquent_amount_cents !== null
            ? "delinquent_or_arrears"
            : row.unpaid_balance_cents !== null
              ? "unpaid_balance"
              : row.principal_balance_cents !== null
                ? "principal_balance"
                : null,
          row.delinquent_amount_cents ?? row.unpaid_balance_cents ?? row.principal_balance_cents,
          row.event_date,
          row.source_name,
          row.source_url,
          row.source_updated_at,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    lastId = String(rows.results.at(-1)?.id ?? lastId);
  }
  const afterToken = await selectedPublicationToken(db, keyJson);
  if (afterToken !== beforeToken) {
    throw new Error("Selected evidence changed during export; retry for one coherent snapshot.");
  }
  return lines.join("\n");
}

async function selectedPublicationToken(db: D1Database, keyJson: string): Promise<string> {
  const row = await db
    .prepare(
      `SELECT COALESCE(json_group_array(json_object('source_id',source_id,'run_id',last_success_run_id,'updated_at',updated_at)),'[]') token
       FROM (SELECT p.source_id,p.last_success_run_id,p.updated_at FROM source_publications p
         WHERE p.source_id IN (SELECT DISTINCT r.source_id FROM foreclosure_records r WHERE r.property_key IN (SELECT value FROM json_each(?)))
         ORDER BY p.source_id)`,
    )
    .bind(keyJson)
    .first<{ token: string }>();
  return row?.token ?? "[]";
}

function distressSummary(signals: readonly SignalType[]) {
  const independent = new Set(signals);
  let score = 0;
  const reasons: string[] = [];
  if (independent.has("mortgage_foreclosure_initiated") || independent.has("notice_of_default")) {
    score += 80;
    reasons.push("80 · filed foreclosure/default signal type is present");
  }
  if (independent.has("tax_delinquency")) {
    score += 40;
    reasons.push("40 · official tax-delinquency signal type is present");
  }
  if (independent.has("recorded_lien")) {
    score += 35;
    reasons.push(
      "35 · recorded-lien signal type is present; outstanding status remains unverified",
    );
  }
  if (independent.has("code_violation")) {
    score += 25;
    reasons.push("25 · municipal code signal type is present");
  }
  const counted = [...independent].filter((signal) =>
    [
      "mortgage_foreclosure_initiated",
      "notice_of_default",
      "tax_delinquency",
      "recorded_lien",
      "code_violation",
    ].includes(signal),
  ).length;
  const combination = Math.min(20, Math.max(0, counted - 1) * 10);
  if (combination) {
    reasons.push(`${combination} · multiple independent signal types`);
  }
  score += combination;
  if (score > 100) {
    reasons.push(`Score capped at 100 from ${score} contribution points`);
  }
  score = Math.min(100, score);
  return {
    score,
    level: score >= 80 ? "strong" : score >= 45 ? "moderate" : score > 0 ? "limited" : "unknown",
    reasons,
    limitations: [
      "Repeated bills or violations do not count as independent signal types",
      "Dollar size does not establish foreclosure likelihood",
      "This is triage strength, never a foreclosure probability",
    ],
  };
}

function confidenceSummary(
  parcelId: string | null,
  evidence: readonly {
    sourceUrl: string;
    sourceUpdatedAt: string | null;
    snapshotPresence: string;
  }[],
) {
  if (!parcelId) {
    return {
      level: "unknown",
      score: null,
      reasons: ["No authoritative parcel key is available"],
      missingInputs: ["Exact parcel identity"],
    };
  }
  const dated = evidence.filter((record) => record.sourceUpdatedAt).length;
  return {
    level: "source_backed",
    score: dated > 0 ? 80 : 65,
    reasons: [
      "Evidence is linked to an exact jurisdiction-scoped parcel identifier",
      `${dated} of ${evidence.length} evidence rows publish a source-update timestamp`,
      "Source provenance is strong; current property status is still not independently verified",
    ],
    missingInputs: evidence.some((record) => record.snapshotPresence === "no_longer_present")
      ? ["No-longer-present evidence requires status verification"]
      : [],
  };
}

function validateBuyBox(input: BuyBoxInput): BuyBoxInput {
  if (!input || typeof input !== "object") {
    throw new PartnerValidationError("Buy box input is invalid.");
  }
  if (input.id !== null && typeof input.id !== "string") {
    throw new PartnerValidationError("Invalid buy box ID.");
  }
  if (input.id !== null && !/^[a-zA-Z0-9-]{1,100}$/.test(input.id)) {
    throw new PartnerValidationError("Invalid buy box ID.");
  }
  if (typeof input.name !== "string") {
    throw new PartnerValidationError("Buy box name must be text.");
  }
  const name = input.name.trim();
  if (name.length < 1 || name.length > 100) {
    throw new PartnerValidationError("Buy box name must be 1 to 100 characters.");
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new PartnerValidationError("Invalid buy box version.");
  }
  if (
    !Array.isArray(input.propertyTypes) ||
    input.propertyTypes.some((value) => !propertyTypes.has(value))
  ) {
    throw new PartnerValidationError("Unknown property type.");
  }
  if (
    !Array.isArray(input.distressPhases) ||
    input.distressPhases.some((value) => !distressPhases.has(value))
  ) {
    throw new PartnerValidationError("Unknown distress phase.");
  }
  if (
    !Array.isArray(input.jurisdictions) ||
    !Array.isArray(input.neighborhoods) ||
    !Array.isArray(input.zips)
  ) {
    throw new PartnerValidationError("Buy box locations must be lists.");
  }
  if (!sizeBases.has(input.sizeBasis) || !valueBases.has(input.valueBasis)) {
    throw new PartnerValidationError("Unknown size or value basis.");
  }
  const valueAssumptionLabel =
    input.valueAssumptionLabel === null
      ? null
      : typeof input.valueAssumptionLabel === "string"
        ? input.valueAssumptionLabel.trim()
        : (() => {
            throw new PartnerValidationError("Assumption label must be text.");
          })();
  if (
    valueAssumptionLabel !== null &&
    (valueAssumptionLabel.length < 1 || valueAssumptionLabel.length > 120)
  ) {
    throw new PartnerValidationError("Assumption label must be 1 to 120 characters.");
  }
  if (input.valueBasis === "user_assumption" && valueAssumptionLabel === null) {
    throw new PartnerValidationError("Select a named assumption label for assumption-based fit.");
  }
  const jurisdictions = uniqueStrings(input.jurisdictions, 40, /^[a-z0-9-]+$/);
  const neighborhoods = uniqueStrings(input.neighborhoods, 100);
  const zips = uniqueStrings(input.zips, 10, /^\d{5}(?:-\d{4})?$/);
  for (const value of [
    input.minSizeValue,
    input.maxSizeValue,
    input.minValueCents,
    input.maxValueCents,
  ]) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
      throw new PartnerValidationError("Ranges must use non-negative whole numbers.");
    }
  }
  if (
    input.minSizeValue !== null &&
    input.maxSizeValue !== null &&
    input.minSizeValue > input.maxSizeValue
  ) {
    throw new PartnerValidationError("Minimum size exceeds maximum size.");
  }
  if (
    input.minValueCents !== null &&
    input.maxValueCents !== null &&
    input.minValueCents > input.maxValueCents
  ) {
    throw new PartnerValidationError("Minimum value exceeds maximum value.");
  }
  return {
    ...input,
    name,
    valueAssumptionLabel: input.valueBasis === "user_assumption" ? valueAssumptionLabel : null,
    propertyTypes: [...new Set(input.propertyTypes)],
    distressPhases: [...new Set(input.distressPhases)],
    jurisdictions,
    neighborhoods,
    zips,
  };
}

function validatePipelinePatch(patch: PipelinePatch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new PartnerValidationError("Pipeline patch is invalid.");
  }
  const keys = Object.keys(patch);
  const allowed = new Set([
    "saved",
    "dismissed",
    "stage",
    "assignedTo",
    "followUpAt",
    "passReason",
  ]);
  if (keys.every((key) => !allowed.has(key))) {
    throw new PartnerValidationError("No pipeline fields were supplied.");
  }
  if (keys.some((key) => !allowed.has(key))) {
    throw new PartnerValidationError("Unknown pipeline field.");
  }
  if (patch.saved !== undefined && typeof patch.saved !== "boolean") {
    throw new PartnerValidationError("Saved must be a boolean.");
  }
  if (patch.dismissed !== undefined && typeof patch.dismissed !== "boolean") {
    throw new PartnerValidationError("Dismissed must be a boolean.");
  }
  if (patch.stage !== undefined && !stages.has(patch.stage)) {
    throw new PartnerValidationError("Unknown pipeline stage.");
  }
  if (
    patch.assignedTo !== undefined &&
    patch.assignedTo !== null &&
    !allowedEmails.some((email) => email.toLowerCase() === patch.assignedTo?.toLowerCase())
  ) {
    throw new PartnerValidationError("Assignment must use an authorized partner identity.");
  }
  if (
    patch.followUpAt !== undefined &&
    patch.followUpAt !== null &&
    !validTimestamp(patch.followUpAt)
  ) {
    throw new PartnerValidationError("Follow-up must be a valid timestamp.");
  }
  if (
    patch.passReason !== undefined &&
    patch.passReason !== null &&
    (patch.passReason.trim().length < 1 || patch.passReason.length > 500)
  ) {
    throw new PartnerValidationError("Pass reason must be 1 to 500 characters.");
  }
}

function validatePropertyKey(value: string) {
  if (typeof value !== "string") {
    throw new PartnerValidationError("Invalid property key.");
  }
  if (!/^[a-z0-9-]+:[^\s]{1,260}$/i.test(value) || value.length > 300) {
    throw new PartnerValidationError("Invalid property key.");
  }
}
function requirePartnerEmail(value: string) {
  const canonical = typeof value === "string" ? canonicalPartnerEmail(value) : null;
  if (!canonical) {
    throw new PartnerValidationError("Actor is not an authorized partner identity.");
  }
  return canonical;
}
async function assertKnownProperty(db: D1Database, propertyKey: string) {
  const known = await db
    .prepare("SELECT 1 present FROM foreclosure_records WHERE property_key=? LIMIT 1")
    .bind(propertyKey)
    .first();
  if (!known) {
    throw new PartnerValidationError("Property key is not present in retained evidence.");
  }
}
function pageValue(value: number | undefined, label: string) {
  const result = value ?? 1;
  if (!Number.isInteger(result) || result < 1 || result > 10_000) {
    throw new PartnerValidationError(`${label} must be an integer from 1 to 10000.`);
  }
  return result;
}
function pageSizeValue(value: number | undefined, label: string) {
  const result = value ?? 200;
  if (!Number.isInteger(result) || result < 1 || result > 200) {
    throw new PartnerValidationError(`${label} must be an integer from 1 to 200.`);
  }
  return result;
}
function pageMetadata(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
function validTimestamp(value: string) {
  if (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}
function validCalendarDate(value: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function uniqueStrings(values: readonly string[], maxLength: number, pattern?: RegExp) {
  if (values.length > 100) {
    throw new PartnerValidationError("Too many configured values.");
  }
  if (values.some((value) => typeof value !== "string")) {
    throw new PartnerValidationError("Configured values must be text.");
  }
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].map((value) => {
    if (value.length > maxLength || (pattern && !pattern.test(value))) {
      throw new PartnerValidationError("Invalid configured value.");
    }
    return value;
  });
}
function buyBoxValues(input: BuyBoxInput & { id: string }, timestamp: string, actor: string) {
  return [
    input.id,
    input.name,
    JSON.stringify(input.propertyTypes),
    JSON.stringify(input.jurisdictions),
    JSON.stringify(input.neighborhoods),
    JSON.stringify(input.zips),
    input.minSizeValue,
    input.maxSizeValue,
    input.sizeBasis,
    input.minValueCents,
    input.maxValueCents,
    input.valueBasis,
    input.valueAssumptionLabel,
    JSON.stringify(input.distressPhases),
    timestamp,
    actor,
  ] as const;
}
async function readBuyBox(db: D1Database, id: string) {
  const row = await db.prepare("SELECT * FROM buy_boxes WHERE id=?").bind(id).first<BuyBoxRow>();
  return row ? mapBuyBox(row) : null;
}
async function readPipelineProperty(db: D1Database, propertyKey: string) {
  const row = await db
    .prepare("SELECT * FROM partner_properties WHERE property_key=?")
    .bind(propertyKey)
    .first<PipelineRow>();
  return row ? mapPipeline(row) : null;
}
function followUpAlertStatements(
  db: D1Database,
  propertyKey: string,
  updatedAt: string,
  actor: string,
) {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "DELETE FROM property_alerts WHERE property_key=? AND kind='due_follow_up' AND EXISTS (SELECT 1 FROM partner_properties p WHERE p.property_key=? AND p.updated_at=? AND p.updated_by=?)",
      )
      .bind(propertyKey, propertyKey, updatedAt, actor),
  ];
  for (const email of allowedEmails) {
    const id = `followup:${email.toLowerCase().replaceAll(/[^a-z0-9]/g, "_")}:${crypto.randomUUID()}`;
    statements.push(
      db
        .prepare(`INSERT OR IGNORE INTO property_alerts (id,user_email,property_key,kind,title,created_at,available_at)
        SELECT ?,?,p.property_key,'due_follow_up','Follow-up is due',?,p.follow_up_at
        FROM partner_properties p LEFT JOIN user_alert_preferences pref ON pref.user_email=? COLLATE NOCASE
        WHERE p.property_key=? AND p.updated_at=? AND p.updated_by=? AND p.stage<>'Passed' AND p.follow_up_at IS NOT NULL AND COALESCE(pref.due_follow_ups,1)=1`)
        .bind(id, email, updatedAt, email, propertyKey, updatedAt, actor),
    );
  }
  return statements;
}
function mapBuyBox(row: BuyBoxRow): BuyBox {
  return {
    id: row.id,
    name: row.name,
    propertyTypes: JSON.parse(row.property_types_json),
    jurisdictions: JSON.parse(row.jurisdictions_json),
    neighborhoods: JSON.parse(row.neighborhoods_json),
    zips: JSON.parse(row.zips_json),
    minSizeValue: row.min_size_value,
    maxSizeValue: row.max_size_value,
    sizeBasis: row.size_basis,
    minValueCents: row.min_value_cents,
    maxValueCents: row.max_value_cents,
    valueBasis: row.value_basis,
    valueAssumptionLabel: row.value_assumption_label,
    distressPhases: JSON.parse(row.distress_phases_json),
    version: row.version,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
function mapPipeline(row: PipelineRow): PipelineProperty {
  return {
    propertyKey: row.property_key,
    saved: Boolean(row.saved),
    dismissed: Boolean(row.dismissed),
    stage: row.stage,
    assignedTo: row.assigned_to,
    followUpAt: row.follow_up_at,
    passReason: row.pass_reason,
    version: row.version,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
function mapChange(row: ChangeRow) {
  return {
    id: row.id,
    propertyKey: row.property_key,
    sourceId: row.source_id,
    sourceRecordId: row.source_record_id,
    eventType: row.event_type,
    severity: row.severity,
    detectedAt: row.detected_at,
    publishedAt: row.published_at,
    before: row.before_json ? JSON.parse(row.before_json) : null,
    after: JSON.parse(row.after_json),
    sourceName: row.source_name,
    sourceUrl: row.source_url,
  };
}
function mapAlert(row: AlertRow) {
  return {
    id: row.id,
    propertyKey: row.property_key,
    changeEventId: row.change_event_id,
    kind: row.kind,
    title: row.title,
    createdAt: row.created_at,
    availableAt: row.available_at,
    readAt: row.read_at,
  };
}
function mapPreferences(row: PreferenceRow) {
  return {
    newActivity: Boolean(row.new_activity),
    worseningActivity: Boolean(row.worsening_activity),
    dueFollowUps: Boolean(row.due_follow_ups),
    externalDelivery: "not_configured" as const,
  };
}
function mapEnrichment(row: EnrichmentRow) {
  return {
    propertyKey: row.property_key,
    parcelId: row.parcel_id,
    sourceParcelId: row.source_parcel_id,
    joinMethod: row.join_method,
    joinSourceUrl: row.join_source_url,
    lrsn: row.lrsn,
    gpin: row.gpin,
    assessorAddress: row.assessor_address,
    assessorCity: row.assessor_city,
    assessorZip: row.assessor_zip,
    legalDescription: row.legal_description,
    ownerName: row.owner_name,
    ownerSourceUrl: row.owner_source_url,
    ownerObservedAt: row.owner_observed_at,
    landUseCode: row.land_use_code,
    landUseDescription: row.land_use_description,
    propertyUse: row.property_use,
    normalizedPropertyType: row.normalized_property_type,
    typeMappingSourceUrl: row.type_mapping_source_url,
    residentialFinishedAreaValue: row.residential_finished_area_value,
    commercialBuildingAreaValue: row.commercial_building_area_value,
    buildingAreaUnitStatus: row.building_area_unit_status,
    lotAreaSqft: row.lot_area_sqft,
    yearBuilt: row.year_built,
    neighborhood: row.neighborhood,
    assessedLandCents: row.assessed_land_cents,
    assessedImprovementCents: row.assessed_improvement_cents,
    assessedTotalCents: row.assessed_total_cents,
    assessmentYear: row.assessment_year,
    assessmentEffectiveDate: row.assessment_effective_date,
    assessmentSourceUrl: row.assessment_source_url,
    lastTransferDate: row.last_transfer_date,
    lastTransferConsiderationCents: row.last_transfer_consideration_cents,
    lastTransferDocumentNumber: row.last_transfer_document_number,
    lastTransferGrantor: row.last_transfer_grantor,
    lastTransferGrantee: row.last_transfer_grantee,
    sourceUpdatedAt: row.source_updated_at,
    observedAt: row.observed_at,
  };
}
function mapExtension(row: ExtensionRow) {
  return {
    id: row.id,
    extension: row.extension,
    residentialFinishedAreaValue: row.residential_finished_area_value,
    commercialBuildingAreaValue: row.commercial_building_area_value,
    yearBuilt: row.year_built,
  };
}
function mapSale(row: SaleRow) {
  return {
    id: row.id,
    candidateParcelId: row.candidate_parcel_id,
    candidateAddress: row.candidate_address,
    saleDate: row.sale_date,
    salePriceCents: row.sale_price_cents,
    documentNumber: row.document_number,
    normalizedPropertyType: row.normalized_property_type,
    buildingAreaSourceValue: row.building_area_source_value,
    buildingAreaUnitStatus: row.building_area_unit_status,
    documentParcelCount: row.document_parcel_count,
    qualificationStatus: row.qualification_status,
    exclusionReason: row.exclusion_reason,
    selectionReason: row.selection_reason,
    sourceUrl: row.source_url,
    sourceUpdatedAt: row.source_updated_at,
    observedAt: row.observed_at,
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
  let first = 0;
  while (first < raw.length && raw.charCodeAt(first) <= 32) {
    first += 1;
  }
  const unsafe = new Set(["=", "+", "-", "@"]).has(raw[first] ?? "");
  const safe = unsafe ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

type BuyBoxRow = {
  id: string;
  name: string;
  property_types_json: string;
  jurisdictions_json: string;
  neighborhoods_json: string;
  zips_json: string;
  min_size_value: number | null;
  max_size_value: number | null;
  size_basis: SizeBasis;
  min_value_cents: number | null;
  max_value_cents: number | null;
  value_basis: ValueBasis;
  value_assumption_label: string | null;
  distress_phases_json: string;
  version: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
};
type PipelineRow = {
  property_key: string;
  saved: number;
  dismissed: number;
  stage: PipelineStage;
  assigned_to: string | null;
  follow_up_at: string | null;
  pass_reason: string | null;
  version: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
};
type ChangeRow = {
  id: string;
  property_key: string;
  source_id: string;
  source_record_id: string | null;
  event_type: string;
  severity: string;
  detected_at: string;
  published_at: string | null;
  before_json: string | null;
  after_json: string;
  source_name: string;
  source_url: string;
};
type AlertRow = {
  id: string;
  property_key: string;
  change_event_id: string | null;
  kind: string;
  title: string;
  created_at: string;
  available_at: string;
  read_at: string | null;
};
type PreferenceRow = { new_activity: number; worsening_activity: number; due_follow_ups: number };
type NoteRow = {
  id: string;
  property_key: string;
  body: string;
  author_email: string;
  created_at: string;
};
type AssumptionRow = {
  id: string;
  label: string;
  value_cents: number;
  as_of_date: string;
  author_email: string;
  created_at: string;
};
type EnrichmentRow = {
  property_key: string;
  parcel_id: string;
  source_parcel_id: string;
  join_method: string;
  join_source_url: string | null;
  lrsn: string | null;
  gpin: string | null;
  assessor_address: string | null;
  assessor_city: string | null;
  assessor_zip: string | null;
  legal_description: string | null;
  owner_name: string | null;
  owner_source_url: string | null;
  owner_observed_at: string | null;
  land_use_code: string | null;
  land_use_description: string | null;
  property_use: string | null;
  normalized_property_type: string | null;
  type_mapping_source_url: string | null;
  residential_finished_area_value: number | null;
  commercial_building_area_value: number | null;
  building_area_unit_status: string;
  lot_area_sqft: number | null;
  year_built: number | null;
  neighborhood: string | null;
  assessed_land_cents: number | null;
  assessed_improvement_cents: number | null;
  assessed_total_cents: number | null;
  assessment_year: number | null;
  assessment_effective_date: string | null;
  assessment_source_url: string | null;
  last_transfer_date: string | null;
  last_transfer_consideration_cents: number | null;
  last_transfer_document_number: string | null;
  last_transfer_grantor: string | null;
  last_transfer_grantee: string | null;
  source_updated_at: string | null;
  observed_at: string;
};
type ExtensionRow = {
  id: string;
  extension: string | null;
  residential_finished_area_value: number | null;
  commercial_building_area_value: number | null;
  year_built: number | null;
};
type SaleRow = {
  id: string;
  candidate_parcel_id: string;
  candidate_address: string | null;
  sale_date: string;
  sale_price_cents: number;
  document_number: string | null;
  normalized_property_type: string | null;
  building_area_source_value: number | null;
  building_area_unit_status: string;
  document_parcel_count: number | null;
  qualification_status: string;
  exclusion_reason: string | null;
  selection_reason: string;
  source_url: string;
  source_updated_at: string | null;
  observed_at: string;
};
type SelectedEvidenceRow = {
  property_key: string;
  jurisdiction_name: string;
  apn: string | null;
  address: string | null;
  owner_name: string | null;
  id: string;
  signal_type: string;
  snapshot_presence: string;
  delinquent_amount_cents: number | null;
  unpaid_balance_cents: number | null;
  principal_balance_cents: number | null;
  event_date: string | null;
  source_name: string;
  source_url: string;
  source_updated_at: string | null;
};
