import { index, integer, sqliteTable, text, uniqueIndex } from "@templar/db/sqlite-core";

export const trips = sqliteTable(
  "trips",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    currency: text("currency", { enum: ["USD"] })
      .notNull()
      .default("USD"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("trips_slug_idx").on(table.slug)],
);

export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    avatarType: text("avatar_type", { enum: ["emoji", "initials"] }).notNull(),
    avatarValue: text("avatar_value").notNull(),
    color: text("color").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("participants_trip_id_idx").on(table.tripId)],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    amountCents: integer("amount_cents").notNull(),
    payerParticipantId: text("payer_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    expenseDate: integer("expense_date", { mode: "timestamp_ms" }).notNull(),
    splitMethod: text("split_method", { enum: ["equal", "exact", "percentage"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("expenses_trip_id_idx").on(table.tripId),
    index("expenses_payer_participant_id_idx").on(table.payerParticipantId),
  ],
);

export const expenseSplits = sqliteTable(
  "expense_splits",
  {
    id: text("id").primaryKey(),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    percentageBasisPoints: integer("percentage_basis_points"),
  },
  (table) => [
    index("expense_splits_expense_id_idx").on(table.expenseId),
    index("expense_splits_participant_id_idx").on(table.participantId),
  ],
);

export const settlements = sqliteTable(
  "settlements",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    fromParticipantId: text("from_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    toParticipantId: text("to_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("settlements_trip_id_idx").on(table.tripId),
    index("settlements_from_participant_id_idx").on(table.fromParticipantId),
    index("settlements_to_participant_id_idx").on(table.toParticipantId),
  ],
);

export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    actorLabel: text("actor_label").notNull(),
    eventType: text("event_type", {
      enum: ["created", "edited", "deleted", "settled"],
    }).notNull(),
    entityType: text("entity_type", {
      enum: ["trip", "participant", "expense", "settlement"],
    }).notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("activity_events_trip_id_idx").on(table.tripId)],
);
