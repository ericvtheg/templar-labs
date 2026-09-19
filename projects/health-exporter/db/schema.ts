import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const healthSyncRuns = sqliteTable(
  "health_sync_runs",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    requestId: text("request_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    acceptedCount: integer("accepted_count").notNull(),
    insertedCount: integer("inserted_count").notNull(),
    unchangedCount: integer("unchanged_count").notNull(),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("health_sync_runs_device_request_uidx").on(table.deviceId, table.requestId),
    index("health_sync_runs_received_idx").on(table.receivedAt),
  ],
);

export const healthStepSamples = sqliteTable(
  "health_step_samples",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    sampleId: text("sample_id").notNull(),
    syncRunId: text("sync_run_id")
      .notNull()
      .references(() => healthSyncRuns.id),
    value: integer("value").notNull(),
    startAt: integer("start_at", { mode: "timestamp_ms" }).notNull(),
    endAt: integer("end_at", { mode: "timestamp_ms" }).notNull(),
    sourceBundleId: text("source_bundle_id").notNull(),
    sourceName: text("source_name").notNull(),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("health_step_samples_device_sample_uidx").on(table.deviceId, table.sampleId),
    index("health_step_samples_start_idx").on(table.startAt),
  ],
);
