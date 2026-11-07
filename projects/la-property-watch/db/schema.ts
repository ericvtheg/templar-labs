import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const foreclosureRecords = sqliteTable(
  "foreclosure_records",
  {
    id: text("id").primaryKey(),
    saleType: text("sale_type", { enum: ["tax_default", "trustee"] }).notNull(),
    signalType: text("signal_type", {
      enum: [
        "tax_delinquency",
        "code_violation",
        "power_to_sell",
        "recorded_lien",
        "lien_release",
        "notice_of_default",
        "mortgage_foreclosure_initiated",
        "scheduled_trustee_sale",
        "scheduled_tax_sale",
      ],
    }).notNull(),
    jurisdictionId: text("jurisdiction_id").notNull(),
    jurisdictionName: text("jurisdiction_name").notNull(),
    sourceRecordId: text("source_record_id").notNull(),
    sourceKey: text("source_key").notNull(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceDocumentUrl: text("source_document_url"),
    sourcePublishedAt: text("source_published_at"),
    sourceAsOfDate: text("source_as_of_date"),
    sourceUpdatedAt: text("source_updated_at"),
    sourceGoodThrough: text("source_good_through"),
    sourceKind: text("source_kind", { enum: ["current", "secondary"] })
      .notNull()
      .default("secondary"),
    snapshotPresence: text("snapshot_presence", { enum: ["present", "no_longer_present"] })
      .notNull()
      .default("present"),
    snapshotId: text("snapshot_id"),
    noLongerPresentAt: text("no_longer_present_at"),
    observedAt: text("observed_at").notNull(),
    eventDate: text("event_date"),
    scheduledDate: text("scheduled_date"),
    scheduledTime: text("scheduled_time"),
    status: text("status", {
      enum: [
        "signal_status_unverified",
        "scheduled_as_published",
        "past_outcome_unverified",
        "date_not_found",
      ],
    }).notNull(),
    apn: text("apn"),
    propertyKey: text("property_key").notNull().default(""),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    assessorAddress: text("assessor_address"),
    assessorCity: text("assessor_city"),
    assessorState: text("assessor_state"),
    assessorZip: text("assessor_zip"),
    assessorObservedAt: text("assessor_observed_at"),
    assessorSourceUrl: text("assessor_source_url"),
    itemNumber: text("item_number"),
    minimumBidCents: integer("minimum_bid_cents"),
    delinquentAmountCents: integer("delinquent_amount_cents"),
    unpaidBalanceCents: integer("unpaid_balance_cents"),
    principalBalanceCents: integer("principal_balance_cents"),
    principalAsOfDate: text("principal_as_of_date"),
    trusteeSaleNumber: text("trustee_sale_number"),
    trusteeName: text("trustee_name"),
    saleVerificationPhone: text("sale_verification_phone"),
    salePlace: text("sale_place"),
    legalDescription: text("legal_description"),
    ownerName: text("owner_name"),
    propertyType: text("property_type"),
    taxYear: integer("tax_year"),
    taxInstallment: integer("tax_installment"),
    taxDueCents: integer("tax_due_cents"),
    penaltyDueCents: integer("penalty_due_cents"),
    interestDueCents: integer("interest_due_cents"),
    evidenceStatus: text("evidence_status"),
    evidenceDetail: text("evidence_detail"),
    evidenceUpdatedAt: text("evidence_updated_at"),
    priority: integer("priority"),
    rawExcerpt: text("raw_excerpt").notNull(),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("foreclosure_source_record_unique").on(table.sourceId, table.sourceKey),
    index("foreclosure_sale_type_idx").on(table.saleType),
    index("foreclosure_signal_type_idx").on(table.signalType),
    index("foreclosure_jurisdiction_idx").on(table.jurisdictionId),
    index("foreclosure_scheduled_date_idx").on(table.scheduledDate),
    index("foreclosure_apn_idx").on(table.apn),
    index("foreclosure_jurisdiction_apn_idx").on(table.jurisdictionId, table.apn),
    index("foreclosure_property_key_idx").on(table.propertyKey),
    index("foreclosure_snapshot_source_idx").on(
      table.sourceId,
      table.snapshotPresence,
      table.snapshotId,
    ),
  ],
);

export const refreshJobs = sqliteTable(
  "refresh_jobs",
  {
    id: text("id").primaryKey(),
    trigger: text("trigger", { enum: ["manual", "scheduled", "bootstrap"] }).notNull(),
    status: text("status", {
      enum: ["queued", "running", "success", "partial", "failed"],
    }).notNull(),
    requestedAt: text("requested_at").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    error: text("error"),
    activeLease: text("active_lease"),
  },
  (table) => [
    index("refresh_jobs_status_requested_idx").on(table.status, table.requestedAt),
    uniqueIndex("refresh_jobs_active_lease_unique").on(table.activeLease),
  ],
);

export const ingestionRuns = sqliteTable(
  "ingestion_runs",
  {
    id: text("id").primaryKey(),
    refreshJobId: text("refresh_job_id")
      .notNull()
      .references(() => refreshJobs.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    trigger: text("trigger", { enum: ["manual", "scheduled", "bootstrap"] }).notNull(),
    status: text("status", { enum: ["running", "success", "partial", "failed"] }).notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    recordsFound: integer("records_found").notNull().default(0),
    recordsUpserted: integer("records_upserted").notNull().default(0),
    recordsNoLongerPresent: integer("records_no_longer_present").notNull().default(0),
    sourceUpdatedAt: text("source_updated_at"),
    snapshotComplete: integer("snapshot_complete", { mode: "boolean" }).notNull().default(false),
    error: text("error"),
  },
  (table) => [
    index("ingestion_runs_source_started_idx").on(table.sourceId, table.startedAt),
    index("ingestion_runs_job_idx").on(table.refreshJobId),
  ],
);

export const watchlistProperties = sqliteTable(
  "watchlist_properties",
  {
    propertyKey: text("property_key").primaryKey(),
    jurisdictionId: text("jurisdiction_id").notNull(),
    jurisdictionName: text("jurisdiction_name").notNull(),
    parcelId: text("parcel_id"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    ownerName: text("owner_name"),
    propertyType: text("property_type"),
    score: integer("score").notNull(),
    signalTypes: text("signal_types").notNull(),
    independentSignalCount: integer("independent_signal_count").notNull(),
    evidenceCount: integer("evidence_count").notNull(),
    taxInstallmentCount: integer("tax_installment_count").notNull(),
    codeViolationCount: integer("code_violation_count").notNull(),
    recordedLienCount: integer("recorded_lien_count").notNull(),
    totalDelinquentCents: integer("total_delinquent_cents").notNull(),
    earliestTaxYear: integer("earliest_tax_year"),
    freshestSourceUpdatedAt: text("freshest_source_updated_at"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    sourceNames: text("source_names").notNull(),
    rankedAt: text("ranked_at").notNull(),
  },
  (table) => [
    index("watchlist_rank_idx").on(table.score, table.propertyKey),
    index("watchlist_jurisdiction_rank_idx").on(table.jurisdictionId, table.score),
  ],
);

export const sourcePublications = sqliteTable("source_publications", {
  sourceId: text("source_id").primaryKey(),
  baselineEstablishedAt: text("baseline_established_at").notNull(),
  lastSuccessRunId: text("last_success_run_id").notNull(),
  lastSourceUpdatedAt: text("last_source_updated_at"),
  updatedAt: text("updated_at").notNull(),
});

export const propertyChangeEvents = sqliteTable(
  "property_change_events",
  {
    id: text("id").primaryKey(),
    propertyKey: text("property_key").notNull(),
    sourceId: text("source_id").notNull(),
    sourceRecordId: text("source_record_id"),
    eventType: text("event_type").notNull(),
    severity: text("severity").notNull(),
    detectedAt: text("detected_at").notNull(),
    publishedAt: text("published_at"),
    beforeJson: text("before_json"),
    afterJson: text("after_json").notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    ingestionRunId: text("ingestion_run_id").notNull(),
  },
  (table) => [
    index("property_change_property_detected_idx").on(table.propertyKey, table.detectedAt),
    index("property_change_detected_idx").on(table.detectedAt, table.id),
    index("property_change_run_idx").on(table.ingestionRunId),
  ],
);

export const partnerProperties = sqliteTable(
  "partner_properties",
  {
    propertyKey: text("property_key").primaryKey(),
    saved: integer("saved", { mode: "boolean" }).notNull().default(false),
    dismissed: integer("dismissed", { mode: "boolean" }).notNull().default(false),
    stage: text("stage").notNull().default("New"),
    assignedTo: text("assigned_to"),
    followUpAt: text("follow_up_at"),
    passReason: text("pass_reason"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull(),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (table) => [index("partner_properties_pipeline_idx").on(table.stage, table.dismissed)],
);

export const propertyNotes = sqliteTable(
  "property_notes",
  {
    id: text("id").primaryKey(),
    propertyKey: text("property_key").notNull(),
    body: text("body").notNull(),
    authorEmail: text("author_email").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("property_notes_property_created_idx").on(table.propertyKey, table.createdAt)],
);

export const buyBoxes = sqliteTable("buy_boxes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  propertyTypesJson: text("property_types_json").notNull(),
  jurisdictionsJson: text("jurisdictions_json").notNull(),
  neighborhoodsJson: text("neighborhoods_json").notNull(),
  zipsJson: text("zips_json").notNull(),
  minSizeValue: integer("min_size_value"),
  maxSizeValue: integer("max_size_value"),
  sizeBasis: text("size_basis").notNull(),
  minValueCents: integer("min_value_cents"),
  maxValueCents: integer("max_value_cents"),
  valueBasis: text("value_basis").notNull(),
  valueAssumptionLabel: text("value_assumption_label"),
  distressPhasesJson: text("distress_phases_json").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const propertyEnrichment = sqliteTable("property_enrichment", {
  propertyKey: text("property_key").primaryKey(),
  jurisdictionId: text("jurisdiction_id").notNull(),
  parcelId: text("parcel_id").notNull(),
  sourceParcelId: text("source_parcel_id").notNull(),
  joinMethod: text("join_method").notNull(),
  joinSourceUrl: text("join_source_url"),
  lrsn: text("lrsn"),
  gpin: text("gpin"),
  assessorAddress: text("assessor_address"),
  assessorCity: text("assessor_city"),
  assessorZip: text("assessor_zip"),
  legalDescription: text("legal_description"),
  ownerName: text("owner_name"),
  ownerSourceUrl: text("owner_source_url"),
  ownerObservedAt: text("owner_observed_at"),
  landUseCode: text("land_use_code"),
  landUseDescription: text("land_use_description"),
  propertyUse: text("property_use"),
  normalizedPropertyType: text("normalized_property_type"),
  typeMappingSourceUrl: text("type_mapping_source_url"),
  residentialFinishedAreaValue: integer("residential_finished_area_value"),
  commercialBuildingAreaValue: integer("commercial_building_area_value"),
  buildingAreaUnitStatus: text("building_area_unit_status").notNull(),
  lotAreaSqft: integer("lot_area_sqft"),
  yearBuilt: integer("year_built"),
  neighborhood: text("neighborhood"),
  assessedLandCents: integer("assessed_land_cents"),
  assessedImprovementCents: integer("assessed_improvement_cents"),
  assessedTotalCents: integer("assessed_total_cents"),
  assessmentYear: integer("assessment_year"),
  assessmentEffectiveDate: text("assessment_effective_date"),
  assessmentSourceUrl: text("assessment_source_url"),
  lastTransferDate: text("last_transfer_date"),
  lastTransferConsiderationCents: integer("last_transfer_consideration_cents"),
  lastTransferDocumentNumber: text("last_transfer_document_number"),
  lastTransferGrantor: text("last_transfer_grantor"),
  lastTransferGrantee: text("last_transfer_grantee"),
  sourceUpdatedAt: text("source_updated_at"),
  observedAt: text("observed_at").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const userAlertPreferences = sqliteTable(
  "user_alert_preferences",
  {
    userEmail: text("user_email").primaryKey(),
    newActivity: integer("new_activity", { mode: "boolean" }).notNull().default(true),
    worseningActivity: integer("worsening_activity", { mode: "boolean" }).notNull().default(true),
    dueFollowUps: integer("due_follow_ups", { mode: "boolean" }).notNull().default(true),
    version: integer("version").notNull().default(1),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("user_alert_preferences_email_nocase_unique").on(sql`lower(${table.userEmail})`),
  ],
);

export const propertyAlerts = sqliteTable(
  "property_alerts",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    propertyKey: text("property_key").notNull(),
    changeEventId: text("change_event_id"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    createdAt: text("created_at").notNull(),
    availableAt: text("available_at").notNull(),
    readAt: text("read_at"),
  },
  (table) => [
    uniqueIndex("property_alert_user_event_unique").on(table.userEmail, table.changeEventId),
    index("property_alert_user_available_idx").on(table.userEmail, table.availableAt),
  ],
);

export const propertyEnrichmentExtensions = sqliteTable(
  "property_enrichment_extensions",
  {
    id: text("id").primaryKey(),
    propertyKey: text("property_key").notNull(),
    extension: text("extension"),
    residentialFinishedAreaValue: integer("residential_finished_area_value"),
    commercialBuildingAreaValue: integer("commercial_building_area_value"),
    yearBuilt: integer("year_built"),
    rawJson: text("raw_json").notNull(),
  },
  (table) => [
    index("property_enrichment_extensions_property_idx").on(table.propertyKey, table.extension),
  ],
);

export const propertySales = sqliteTable(
  "property_sales",
  {
    id: text("id").primaryKey(),
    subjectPropertyKey: text("subject_property_key").notNull(),
    candidateParcelId: text("candidate_parcel_id").notNull(),
    candidatePropertyKey: text("candidate_property_key"),
    identityStatus: text("identity_status").notNull().default("exact_literal_pin"),
    candidateAddress: text("candidate_address"),
    saleDate: text("sale_date").notNull(),
    salePriceCents: integer("sale_price_cents").notNull(),
    documentNumber: text("document_number"),
    normalizedPropertyType: text("normalized_property_type"),
    buildingAreaSourceValue: integer("building_area_source_value"),
    buildingAreaUnitStatus: text("building_area_unit_status").notNull(),
    documentParcelCount: integer("document_parcel_count"),
    qualificationStatus: text("qualification_status").notNull(),
    exclusionReason: text("exclusion_reason"),
    selectionReason: text("selection_reason").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceUpdatedAt: text("source_updated_at"),
    observedAt: text("observed_at").notNull(),
  },
  (table) => [
    index("property_sales_subject_date_idx").on(table.subjectPropertyKey, table.saleDate),
  ],
);

export const enrichmentRuns = sqliteTable(
  "enrichment_runs",
  {
    id: text("id").primaryKey(),
    propertyKey: text("property_key").notNull(),
    sourceId: text("source_id").notNull(),
    status: text("status").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at").notNull(),
    sourceUpdatedAt: text("source_updated_at"),
    recordsFound: integer("records_found").notNull(),
    error: text("error"),
  },
  (table) => [index("enrichment_runs_property_started_idx").on(table.propertyKey, table.startedAt)],
);

export const propertyValueAssumptions = sqliteTable(
  "property_value_assumptions",
  {
    id: text("id").primaryKey(),
    propertyKey: text("property_key").notNull(),
    label: text("label").notNull(),
    valueCents: integer("value_cents").notNull(),
    asOfDate: text("as_of_date").notNull(),
    authorEmail: text("author_email").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("property_assumptions_property_created_idx").on(table.propertyKey, table.createdAt),
  ],
);

export const propertyRechecks = sqliteTable(
  "property_rechecks",
  {
    id: text("id").primaryKey(),
    propertyKey: text("property_key").notNull(),
    sourceId: text("source_id").notNull(),
    status: text("status").notNull(),
    attemptedAt: text("attempted_at").notNull(),
    fetchedAt: text("fetched_at"),
    datasetAsOf: text("dataset_as_of"),
    verifiedAt: text("verified_at"),
    findingsJson: text("findings_json").notNull().default("{}"),
    actorEmail: text("actor_email").notNull(),
    error: text("error"),
  },
  (table) => [
    index("property_rechecks_property_attempted_idx").on(table.propertyKey, table.attemptedAt),
  ],
);

export const propertyAssessments = sqliteTable(
  "property_assessments",
  {
    id: text("id").primaryKey(),
    propertyKey: text("property_key").notNull(),
    version: integer("version").notNull(),
    summary: text("summary").notNull(),
    evidenceTotal: integer("evidence_total").notNull(),
    evidenceIncluded: integer("evidence_included").notNull(),
    evidenceOmitted: integer("evidence_omitted").notNull(),
    assertionsJson: text("assertions_json").notNull(),
    contradictionsJson: text("contradictions_json").notNull(),
    outstandingQuestionsJson: text("outstanding_questions_json").notNull(),
    datasetAsOf: text("dataset_as_of"),
    fetchedAt: text("fetched_at"),
    reviewedAt: text("reviewed_at").notNull(),
    verifiedAt: text("verified_at"),
    createdBy: text("created_by").notNull(),
  },
  (table) => [
    uniqueIndex("property_assessments_property_version_unique").on(
      table.propertyKey,
      table.version,
    ),
    index("property_assessments_property_reviewed_idx").on(table.propertyKey, table.reviewedAt),
  ],
);

export const propertyQualificationOverrides = sqliteTable("property_qualification_overrides", {
  propertyKey: text("property_key").primaryKey(),
  action: text("action").notNull(),
  reason: text("reason").notNull(),
  version: integer("version").notNull(),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
  operationToken: text("operation_token").notNull().default(""),
});

export const propertyQualificationOverrideAudit = sqliteTable(
  "property_qualification_override_audit",
  {
    id: text("id").primaryKey(),
    propertyKey: text("property_key").notNull(),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    version: integer("version").notNull(),
    actorEmail: text("actor_email").notNull(),
    createdAt: text("created_at").notNull(),
    operationToken: text("operation_token").notNull().default(""),
  },
  (table) => [
    index("qualification_override_audit_property_idx").on(table.propertyKey, table.createdAt),
  ],
);

export const propertyFeedback = sqliteTable(
  "property_feedback",
  {
    propertyKey: text("property_key").notNull(),
    reviewerEmail: text("reviewer_email").notNull(),
    dataSource: text("data_source").notNull().default("partner_review"),
    usefulness: text("usefulness").notNull(),
    verification: text("verification").notNull(),
    interest: text("interest").notNull(),
    outcome: text("outcome").notNull(),
    researchMinutes: integer("research_minutes"),
    reason: text("reason").notNull(),
    marketContext: text("market_context").notNull(),
    signalCombinationContext: text("signal_combination_context").notNull(),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    operationToken: text("operation_token").notNull().default(""),
  },
  (table) => [
    uniqueIndex("property_feedback_identity_unique").on(
      table.propertyKey,
      table.reviewerEmail,
      table.dataSource,
    ),
    index("property_feedback_performance_idx").on(
      table.dataSource,
      table.marketContext,
      table.signalCombinationContext,
    ),
  ],
);

export const propertyFeedbackAudit = sqliteTable(
  "property_feedback_audit",
  {
    id: text("id").primaryKey(),
    propertyKey: text("property_key").notNull(),
    reviewerEmail: text("reviewer_email").notNull(),
    dataSource: text("data_source").notNull(),
    usefulness: text("usefulness").notNull(),
    verification: text("verification").notNull(),
    interest: text("interest").notNull(),
    outcome: text("outcome").notNull(),
    researchMinutes: integer("research_minutes"),
    reason: text("reason").notNull(),
    marketContext: text("market_context").notNull(),
    signalCombinationContext: text("signal_combination_context").notNull(),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    operationToken: text("operation_token").notNull().default(""),
  },
  (table) => [index("property_feedback_audit_property_idx").on(table.propertyKey, table.createdAt)],
);

export const rankingAdjustmentProfile = sqliteTable("ranking_adjustment_profile", {
  id: text("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  minimumSamples: integer("minimum_samples").notNull(),
  maximumAdjustment: integer("maximum_adjustment").notNull(),
  reason: text("reason").notNull(),
  version: integer("version").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
  operationToken: text("operation_token").notNull().default(""),
});

export const rankingAdjustmentAudit = sqliteTable("ranking_adjustment_audit", {
  id: text("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  minimumSamples: integer("minimum_samples").notNull(),
  maximumAdjustment: integer("maximum_adjustment").notNull(),
  reason: text("reason").notNull(),
  version: integer("version").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: text("created_at").notNull(),
  operationToken: text("operation_token").notNull().default(""),
});
