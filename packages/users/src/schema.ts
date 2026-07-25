import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
});

export const usersSchema = { appUsers };

export type AppUser = typeof appUsers.$inferSelect;
export type UsersSchema = typeof usersSchema;
