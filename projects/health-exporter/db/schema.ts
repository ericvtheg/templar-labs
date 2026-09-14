import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const healthDevices = sqliteTable(
  "health_devices",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    installationId: text("installation_id").notNull(),
    displayName: text("display_name").notNull(),
    platform: text("platform", { enum: ["ios"] }).notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenHint: text("token_hint").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("health_devices_installation_uidx").on(table.installationId),
    uniqueIndex("health_devices_token_hash_uidx").on(table.tokenHash),
    index("health_devices_owner_idx").on(table.ownerId),
  ],
);

export const healthSamples = sqliteTable(
  "health_samples",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => healthDevices.id, { onDelete: "cascade" }),
    sampleId: text("sample_id").notNull(),
    type: text("type", { enum: ["bodyMass"] }).notNull(),
    value: integer("value").notNull(),
    unit: text("unit", { enum: ["g"] }).notNull(),
    startAt: integer("start_at", { mode: "timestamp_ms" }).notNull(),
    endAt: integer("end_at", { mode: "timestamp_ms" }).notNull(),
    sourceBundleId: text("source_bundle_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourceVersion: text("source_version"),
    sourceProductType: text("source_product_type"),
    sourceMetadataJson: text("source_metadata_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("health_samples_device_sample_uidx").on(table.deviceId, table.sampleId),
    index("health_samples_type_start_idx").on(table.type, table.startAt),
    index("health_samples_source_idx").on(table.sourceBundleId, table.sourceName),
    index("health_samples_deleted_idx").on(table.deletedAt),
  ],
);

export const healthDeletionTombstones = sqliteTable(
  "health_deletion_tombstones",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => healthDevices.id, { onDelete: "cascade" }),
    sampleId: text("sample_id").notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }).notNull(),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("health_deletions_device_sample_uidx").on(table.deviceId, table.sampleId),
    index("health_deletions_received_idx").on(table.receivedAt),
  ],
);

export const healthSyncRuns = sqliteTable(
  "health_sync_runs",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => healthDevices.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    anchor: text("anchor"),
    sampleCount: integer("sample_count").notNull(),
    deletionCount: integer("deletion_count").notNull(),
    insertedCount: integer("inserted_count").notNull(),
    unchangedCount: integer("unchanged_count").notNull(),
    deletedCount: integer("deleted_count").notNull(),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("health_sync_runs_device_request_uidx").on(table.deviceId, table.requestId),
    index("health_sync_runs_device_received_idx").on(table.deviceId, table.receivedAt),
  ],
);

export const healthIngestionItems = sqliteTable(
  "health_ingestion_items",
  {
    runId: text("run_id")
      .notNull()
      .references(() => healthSyncRuns.id, { onDelete: "cascade" }),
    sampleId: text("sample_id").notNull(),
    kind: text("kind", { enum: ["sample", "deletion"] }).notNull(),
    outcome: text("outcome", { enum: ["inserted", "unchanged", "deleted"] }).notNull(),
  },
  (table) => [
    uniqueIndex("health_ingestion_items_run_sample_uidx").on(table.runId, table.sampleId),
  ],
);
