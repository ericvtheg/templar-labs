import { integer, sqliteTable, text } from "@templar/db/sqlite-core";

export const helloEvents = sqliteTable("hello_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const queueEvents = sqliteTable("queue_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: text("message_id").notNull().unique(),
  message: text("message").notNull(),
  status: text("status", { enum: ["queued", "processed"] }).notNull(),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }).notNull(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
});
