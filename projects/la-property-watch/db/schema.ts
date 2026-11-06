import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const foreclosureRecords = sqliteTable(
  "foreclosure_records",
  {
    id: text("id").primaryKey(),
    saleType: text("sale_type", { enum: ["tax_default", "trustee"] }).notNull(),
    signalType: text("signal_type", {
      enum: [
        "tax_delinquency",
        "power_to_sell",
        "recorded_lien",
        "notice_of_default",
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
    trusteeSaleNumber: text("trustee_sale_number"),
    trusteeName: text("trustee_name"),
    saleVerificationPhone: text("sale_verification_phone"),
    salePlace: text("sale_place"),
    legalDescription: text("legal_description"),
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
    error: text("error"),
  },
  (table) => [
    index("ingestion_runs_source_started_idx").on(table.sourceId, table.startedAt),
    index("ingestion_runs_job_idx").on(table.refreshJobId),
  ],
);
