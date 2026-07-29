import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const apiKeys = sqliteTable(
  "templar_api_keys",
  {
    id: text("id").primaryKey(),
    audience: text("audience").notNull(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    secretDigest: text("secret_digest").notNull(),
    secretVersion: integer("secret_version").notNull(),
    permissions: text("permissions").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("templar_api_keys_owner_idx").on(table.audience, table.userId),
    index("templar_api_keys_active_idx").on(table.audience, table.revokedAt, table.expiresAt),
  ],
);

export const apiAuthSchema = { apiKeys };

export type ApiAuthSchema = typeof apiAuthSchema;
export type ApiKeyDatabaseRecord = typeof apiKeys.$inferSelect;
