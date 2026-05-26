CREATE TABLE `templar_payment_stripe_customers` (
  `id` text PRIMARY KEY NOT NULL,
  `project_key` text NOT NULL,
  `user_id` text NOT NULL,
  `user_email` text,
  `stripe_customer_id` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX `templar_payment_stripe_customers_user_uidx`
  ON `templar_payment_stripe_customers` (`user_id`);

CREATE UNIQUE INDEX `templar_payment_stripe_customers_stripe_uidx`
  ON `templar_payment_stripe_customers` (`stripe_customer_id`);

CREATE TABLE `templar_payment_subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `project_key` text NOT NULL,
  `user_id` text NOT NULL,
  `stripe_customer_id` text NOT NULL,
  `stripe_subscription_id` text NOT NULL,
  `stripe_price_id` text,
  `plan_key` text NOT NULL,
  `entitlement_key` text NOT NULL,
  `status` text NOT NULL,
  `access_status` text NOT NULL,
  `trial_ends_at` integer,
  `current_period_ends_at` integer,
  `grace_ends_at` integer,
  `cancel_at_period_end` integer NOT NULL,
  `canceled_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `templar_payment_subscriptions_user_idx`
  ON `templar_payment_subscriptions` (`user_id`);

CREATE UNIQUE INDEX `templar_payment_subscriptions_stripe_uidx`
  ON `templar_payment_subscriptions` (`stripe_subscription_id`);

CREATE TABLE `templar_payment_lifetime_purchases` (
  `id` text PRIMARY KEY NOT NULL,
  `project_key` text NOT NULL,
  `user_id` text NOT NULL,
  `stripe_customer_id` text NOT NULL,
  `stripe_checkout_session_id` text NOT NULL,
  `stripe_payment_intent_id` text,
  `stripe_price_id` text,
  `purchase_key` text NOT NULL,
  `entitlement_key` text NOT NULL,
  `purchased_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `templar_payment_lifetime_purchases_user_idx`
  ON `templar_payment_lifetime_purchases` (`user_id`);

CREATE UNIQUE INDEX `templar_payment_lifetime_purchases_checkout_uidx`
  ON `templar_payment_lifetime_purchases` (`stripe_checkout_session_id`);

CREATE UNIQUE INDEX `templar_payment_lifetime_purchases_intent_uidx`
  ON `templar_payment_lifetime_purchases` (`stripe_payment_intent_id`);

CREATE TABLE `templar_payment_entitlements` (
  `id` text PRIMARY KEY NOT NULL,
  `project_key` text NOT NULL,
  `user_id` text NOT NULL,
  `entitlement_key` text NOT NULL,
  `source_type` text NOT NULL,
  `source_id` text NOT NULL,
  `access_status` text NOT NULL,
  `access_kind` text NOT NULL,
  `active` integer NOT NULL,
  `starts_at` integer NOT NULL,
  `expires_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `templar_payment_entitlements_user_key_idx`
  ON `templar_payment_entitlements` (`user_id`, `entitlement_key`);

CREATE UNIQUE INDEX `templar_payment_entitlements_source_uidx`
  ON `templar_payment_entitlements` (`source_type`, `source_id`);

CREATE TABLE `templar_payment_processed_stripe_events` (
  `stripe_event_id` text PRIMARY KEY NOT NULL,
  `event_type` text NOT NULL,
  `object_type` text,
  `object_id` text,
  `processing_status` text NOT NULL,
  `received_at` integer NOT NULL,
  `processed_at` integer NOT NULL
);

CREATE INDEX `templar_payment_processed_stripe_events_type_idx`
  ON `templar_payment_processed_stripe_events` (`event_type`);

CREATE INDEX `templar_payment_processed_stripe_events_object_idx`
  ON `templar_payment_processed_stripe_events` (`object_type`, `object_id`);
