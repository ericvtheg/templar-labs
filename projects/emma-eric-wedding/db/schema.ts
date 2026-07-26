import { index, integer, sqliteTable, text } from "@templar/db/sqlite-core";

export const households = sqliteTable(
  "households",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("households_created_at_idx").on(table.createdAt)],
);

export const guests = sqliteTable(
  "guests",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    plusOneAllowed: integer("plus_one_allowed", { mode: "boolean" }).notNull().default(false),
    position: integer("position").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("guests_household_id_idx").on(table.householdId)],
);
