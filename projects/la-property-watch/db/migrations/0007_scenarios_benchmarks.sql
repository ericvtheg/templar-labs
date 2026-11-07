CREATE TABLE `property_deal_scenarios` (
  `id` text PRIMARY KEY NOT NULL,
  `property_key` text NOT NULL,
  `name` text NOT NULL,
  `kind` text NOT NULL,
  `financing` text,
  `currency` text NOT NULL DEFAULT 'USD',
  `inputs_cents_json` text NOT NULL,
  `sensitivity_cents_json` text NOT NULL DEFAULT '[]',
  `result_json` text NOT NULL,
  `version` integer NOT NULL,
  `created_at` text NOT NULL,
  `created_by` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL,
  `operation_token` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `property_deal_scenarios_property_updated_idx` ON `property_deal_scenarios` (`property_key`,`updated_at` DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_deal_scenarios_property_name_unique` ON `property_deal_scenarios` (`property_key`,`name`);
--> statement-breakpoint
CREATE TABLE `property_deal_scenario_candidates` (
  `scenario_id` text NOT NULL,
  `sale_id` text NOT NULL,
  `disposition` text NOT NULL,
  `reason` text NOT NULL,
  `created_at` text NOT NULL,
  `created_by` text NOT NULL,
  PRIMARY KEY (`scenario_id`,`sale_id`)
);
--> statement-breakpoint
CREATE INDEX `property_deal_scenario_candidates_scenario_idx` ON `property_deal_scenario_candidates` (`scenario_id`,`disposition`);
--> statement-breakpoint
CREATE TABLE `blind_benchmarks` (
  `id` text PRIMARY KEY NOT NULL,
  `private_name` text NOT NULL,
  `market` text NOT NULL,
  `as_of_date` text NOT NULL,
  `buy_box_id` text NOT NULL,
  `buy_box_version` integer NOT NULL,
  `buy_box_fingerprint` text NOT NULL,
  `identifier_scheme` text NOT NULL,
  `identifier_pattern` text NOT NULL,
  `mode` text NOT NULL,
  `private_state_json` text NOT NULL,
  `private_counts_json` text NOT NULL,
  `reviewer_ids_json` text NOT NULL,
  `status` text NOT NULL,
  `version` integer NOT NULL,
  `created_at` text NOT NULL,
  `created_by` text NOT NULL,
  `revealed_at` text,
  `revealed_by` text,
  `reveal_confirmation` text
);
--> statement-breakpoint
CREATE INDEX `blind_benchmarks_created_idx` ON `blind_benchmarks` (`created_at` DESC);
--> statement-breakpoint
CREATE TABLE `blind_benchmark_imports` (
  `id` text PRIMARY KEY NOT NULL,
  `benchmark_id` text NOT NULL,
  `source_id` text NOT NULL,
  `source_kind` text NOT NULL,
  `private_label` text NOT NULL,
  `private_file_name` text,
  `private_mapping_json` text NOT NULL,
  `private_raw_csv` text,
  `private_counts_json` text NOT NULL,
  `created_at` text NOT NULL,
  `created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blind_benchmark_imports_source_unique` ON `blind_benchmark_imports` (`benchmark_id`,`source_id`);
--> statement-breakpoint
CREATE TABLE `blind_benchmark_reviews` (
  `benchmark_id` text NOT NULL,
  `card_id` text NOT NULL,
  `reviewer_email` text NOT NULL,
  `useful` text NOT NULL,
  `correctness` text NOT NULL,
  `research_seconds` integer,
  `reason` text NOT NULL,
  `version` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`benchmark_id`,`card_id`,`reviewer_email`)
);
--> statement-breakpoint
CREATE INDEX `blind_benchmark_reviews_benchmark_idx` ON `blind_benchmark_reviews` (`benchmark_id`,`reviewer_email`,`card_id`);
--> statement-breakpoint
CREATE TABLE `blind_benchmark_review_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `benchmark_id` text NOT NULL,
  `card_id` text NOT NULL,
  `reviewer_email` text NOT NULL,
  `useful` text NOT NULL,
  `correctness` text NOT NULL,
  `research_seconds` integer,
  `reason` text NOT NULL,
  `version` integer NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `blind_benchmark_review_audit_idx` ON `blind_benchmark_review_audit` (`benchmark_id`,`reviewer_email`,`created_at` DESC);
