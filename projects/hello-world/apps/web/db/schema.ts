import { integer, sqliteTable, text } from "@templar/db/sqlite-core";

export const helloEvents = sqliteTable("hello_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
