import {
  index,
  integer,
  // biome-ignore lint/suspicious/noDeprecatedImports: This file uses the current config-object overload.
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "@templar/db/sqlite-core";

export const households = sqliteTable(
  "households",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    contactEmail: text("contact_email"),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("households_created_at_idx").on(table.createdAt)],
);

export const rsvpSettings = sqliteTable("rsvp_settings", {
  id: text("id").primaryKey(),
  deadline: text("deadline").notNull(),
  isOpen: integer("is_open", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

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

export const eventInvitations = sqliteTable(
  "event_invitations",
  {
    guestId: text("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.guestId, table.eventId] }),
    index("event_invitations_event_id_idx").on(table.eventId),
  ],
);

export const householdRsvps = sqliteTable("household_rsvps", {
  householdId: text("household_id")
    .primaryKey()
    .references(() => households.id, { onDelete: "cascade" }),
  contactEmail: text("contact_email"),
  message: text("message").notNull().default(""),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const guestRsvpDetails = sqliteTable("guest_rsvp_details", {
  guestId: text("guest_id")
    .primaryKey()
    .references(() => guests.id, { onDelete: "cascade" }),
  dietaryRestrictions: text("dietary_restrictions").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const rsvpRevisions = sqliteTable(
  "rsvp_revisions",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    responseJson: text("response_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("rsvp_revisions_household_id_idx").on(table.householdId)],
);

export const guestEventResponses = sqliteTable(
  "guest_event_responses",
  {
    guestId: text("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    attending: integer("attending", { mode: "boolean" }).notNull(),
    mealOptionId: text("meal_option_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.guestId, table.eventId] }),
    index("guest_event_responses_event_id_idx").on(table.eventId),
  ],
);

export const plusOneResponses = sqliteTable("plus_one_responses", {
  guestId: text("guest_id")
    .primaryKey()
    .references(() => guests.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dietaryRestrictions: text("dietary_restrictions").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const plusOneMealSelections = sqliteTable(
  "plus_one_meal_selections",
  {
    guestId: text("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    mealOptionId: text("meal_option_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.guestId, table.eventId] })],
);

export const weddingSiteDocuments = sqliteTable("wedding_site_documents", {
  id: text("id").primaryKey(),
  version: integer("version").notNull(),
  draftJson: text("draft_json").notNull(),
  publishedJson: text("published_json"),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
});

export const weddingSiteRevisions = sqliteTable(
  "wedding_site_revisions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => weddingSiteDocuments.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    action: text("action", { enum: ["save", "publish", "restore"] }).notNull(),
    contentJson: text("content_json").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("wedding_site_revisions_document_version_uidx").on(table.documentId, table.version),
    index("wedding_site_revisions_created_at_idx").on(table.createdAt),
  ],
);
