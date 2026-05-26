import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const paymentsStripeCustomers = sqliteTable(
  "templar_payment_stripe_customers",
  {
    id: text("id").primaryKey(),
    projectKey: text("project_key").notNull(),
    userId: text("user_id").notNull(),
    userEmail: text("user_email"),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("templar_payment_stripe_customers_user_uidx").on(table.userId),
    uniqueIndex("templar_payment_stripe_customers_stripe_uidx").on(table.stripeCustomerId),
  ],
);

export const paymentsSubscriptions = sqliteTable(
  "templar_payment_subscriptions",
  {
    id: text("id").primaryKey(),
    projectKey: text("project_key").notNull(),
    userId: text("user_id").notNull(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    stripePriceId: text("stripe_price_id"),
    planKey: text("plan_key").notNull(),
    entitlementKey: text("entitlement_key").notNull(),
    status: text("status").notNull(),
    accessStatus: text("access_status").notNull(),
    trialEndsAt: integer("trial_ends_at", { mode: "timestamp_ms" }),
    currentPeriodEndsAt: integer("current_period_ends_at", { mode: "timestamp_ms" }),
    graceEndsAt: integer("grace_ends_at", { mode: "timestamp_ms" }),
    cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).notNull(),
    canceledAt: integer("canceled_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("templar_payment_subscriptions_user_idx").on(table.userId),
    uniqueIndex("templar_payment_subscriptions_stripe_uidx").on(table.stripeSubscriptionId),
  ],
);

export const paymentsLifetimePurchases = sqliteTable(
  "templar_payment_lifetime_purchases",
  {
    id: text("id").primaryKey(),
    projectKey: text("project_key").notNull(),
    userId: text("user_id").notNull(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripePriceId: text("stripe_price_id"),
    purchaseKey: text("purchase_key").notNull(),
    entitlementKey: text("entitlement_key").notNull(),
    purchasedAt: integer("purchased_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("templar_payment_lifetime_purchases_user_idx").on(table.userId),
    uniqueIndex("templar_payment_lifetime_purchases_checkout_uidx").on(
      table.stripeCheckoutSessionId,
    ),
    uniqueIndex("templar_payment_lifetime_purchases_intent_uidx").on(table.stripePaymentIntentId),
  ],
);

export const paymentsEntitlements = sqliteTable(
  "templar_payment_entitlements",
  {
    id: text("id").primaryKey(),
    projectKey: text("project_key").notNull(),
    userId: text("user_id").notNull(),
    entitlementKey: text("entitlement_key").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    accessStatus: text("access_status").notNull(),
    accessKind: text("access_kind").notNull(),
    active: integer("active", { mode: "boolean" }).notNull(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("templar_payment_entitlements_user_key_idx").on(table.userId, table.entitlementKey),
    uniqueIndex("templar_payment_entitlements_source_uidx").on(table.sourceType, table.sourceId),
  ],
);

export const paymentsProcessedStripeEvents = sqliteTable(
  "templar_payment_processed_stripe_events",
  {
    stripeEventId: text("stripe_event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    objectType: text("object_type"),
    objectId: text("object_id"),
    processingStatus: text("processing_status").notNull(),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("templar_payment_processed_stripe_events_type_idx").on(table.eventType),
    index("templar_payment_processed_stripe_events_object_idx").on(
      table.objectType,
      table.objectId,
    ),
  ],
);

export const paymentsSchema = {
  paymentsStripeCustomers,
  paymentsSubscriptions,
  paymentsLifetimePurchases,
  paymentsEntitlements,
  paymentsProcessedStripeEvents,
};

export type PaymentsSchema = typeof paymentsSchema;
export type PaymentEntitlementRecord = typeof paymentsEntitlements.$inferSelect;
