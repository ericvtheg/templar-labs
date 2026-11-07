ALTER TABLE `property_sales` ADD `candidate_property_key` text;
--> statement-breakpoint
ALTER TABLE `property_sales` ADD `identity_status` text NOT NULL DEFAULT 'exact_literal_pin';
--> statement-breakpoint
ALTER TABLE `user_alert_preferences` ADD `version` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE `property_rechecks` (
  `id` text PRIMARY KEY NOT NULL,
  `property_key` text NOT NULL,
  `source_id` text NOT NULL,
  `status` text NOT NULL,
  `attempted_at` text NOT NULL,
  `fetched_at` text,
  `dataset_as_of` text,
  `verified_at` text,
  `findings_json` text NOT NULL DEFAULT '{}',
  `actor_email` text NOT NULL,
  `error` text
);
--> statement-breakpoint
CREATE INDEX `property_rechecks_property_attempted_idx` ON `property_rechecks` (`property_key`,`attempted_at` DESC);
--> statement-breakpoint
CREATE TABLE `property_assessments` (
  `id` text PRIMARY KEY NOT NULL,
  `property_key` text NOT NULL,
  `version` integer NOT NULL,
  `summary` text NOT NULL,
  `evidence_total` integer NOT NULL,
  `evidence_included` integer NOT NULL,
  `evidence_omitted` integer NOT NULL,
  `assertions_json` text NOT NULL,
  `contradictions_json` text NOT NULL,
  `outstanding_questions_json` text NOT NULL,
  `dataset_as_of` text,
  `fetched_at` text,
  `reviewed_at` text NOT NULL,
  `verified_at` text,
  `created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_assessments_property_version_unique` ON `property_assessments` (`property_key`,`version`);
--> statement-breakpoint
CREATE INDEX `property_assessments_property_reviewed_idx` ON `property_assessments` (`property_key`,`reviewed_at` DESC);
--> statement-breakpoint
CREATE TABLE `property_qualification_overrides` (
  `property_key` text PRIMARY KEY NOT NULL,
  `action` text NOT NULL,
  `reason` text NOT NULL,
  `version` integer NOT NULL,
  `created_at` text NOT NULL,
  `created_by` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL
  ,`operation_token` text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `property_qualification_override_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `property_key` text NOT NULL,
  `action` text NOT NULL,
  `reason` text NOT NULL,
  `version` integer NOT NULL,
  `actor_email` text NOT NULL,
  `created_at` text NOT NULL
  ,`operation_token` text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX `qualification_override_audit_property_idx` ON `property_qualification_override_audit` (`property_key`,`created_at` DESC);
--> statement-breakpoint
CREATE TABLE `property_feedback` (
  `property_key` text NOT NULL,
  `reviewer_email` text NOT NULL,
  `data_source` text NOT NULL DEFAULT 'partner_review',
  `usefulness` text NOT NULL,
  `verification` text NOT NULL,
  `interest` text NOT NULL,
  `outcome` text NOT NULL,
  `research_minutes` integer,
  `reason` text NOT NULL,
  `market_context` text NOT NULL,
  `signal_combination_context` text NOT NULL,
  `version` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `operation_token` text NOT NULL DEFAULT '',
  PRIMARY KEY (`property_key`,`reviewer_email`,`data_source`)
);
--> statement-breakpoint
CREATE INDEX `property_feedback_performance_idx` ON `property_feedback` (`data_source`,`market_context`,`signal_combination_context`);
--> statement-breakpoint
CREATE TABLE `property_feedback_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `property_key` text NOT NULL,
  `reviewer_email` text NOT NULL,
  `data_source` text NOT NULL,
  `usefulness` text NOT NULL,
  `verification` text NOT NULL,
  `interest` text NOT NULL,
  `outcome` text NOT NULL,
  `research_minutes` integer,
  `reason` text NOT NULL,
  `market_context` text NOT NULL,
  `signal_combination_context` text NOT NULL,
  `version` integer NOT NULL,
  `created_at` text NOT NULL
  ,`operation_token` text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX `property_feedback_audit_property_idx` ON `property_feedback_audit` (`property_key`,`reviewer_email`,`created_at` DESC);
--> statement-breakpoint
CREATE TABLE `ranking_adjustment_profile` (
  `id` text PRIMARY KEY NOT NULL,
  `enabled` integer NOT NULL,
  `minimum_samples` integer NOT NULL,
  `maximum_adjustment` integer NOT NULL,
  `reason` text NOT NULL,
  `version` integer NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL
  ,`operation_token` text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `ranking_adjustment_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `enabled` integer NOT NULL,
  `minimum_samples` integer NOT NULL,
  `maximum_adjustment` integer NOT NULL,
  `reason` text NOT NULL,
  `version` integer NOT NULL,
  `actor_email` text NOT NULL,
  `created_at` text NOT NULL
  ,`operation_token` text NOT NULL DEFAULT ''
);
