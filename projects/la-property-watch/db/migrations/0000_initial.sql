CREATE TABLE `foreclosure_records` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_type` text NOT NULL,
	`source_key` text NOT NULL,
	`source_id` text NOT NULL,
	`source_name` text NOT NULL,
	`source_url` text NOT NULL,
	`source_document_url` text,
	`source_published_at` text,
	`observed_at` text NOT NULL,
	`scheduled_date` text,
	`scheduled_time` text,
	`status` text NOT NULL,
	`apn` text,
	`address` text,
	`city` text,
	`state` text,
	`zip` text,
	`assessor_address` text,
	`assessor_city` text,
	`assessor_state` text,
	`assessor_zip` text,
	`assessor_observed_at` text,
	`assessor_source_url` text,
	`item_number` text,
	`minimum_bid_cents` integer,
	`unpaid_balance_cents` integer,
	`trustee_sale_number` text,
	`trustee_name` text,
	`sale_verification_phone` text,
	`sale_place` text,
	`legal_description` text,
	`raw_excerpt` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `foreclosure_source_record_unique` ON `foreclosure_records` (`source_id`,`source_key`);--> statement-breakpoint
CREATE INDEX `foreclosure_sale_type_idx` ON `foreclosure_records` (`sale_type`);--> statement-breakpoint
CREATE INDEX `foreclosure_scheduled_date_idx` ON `foreclosure_records` (`scheduled_date`);--> statement-breakpoint
CREATE INDEX `foreclosure_apn_idx` ON `foreclosure_records` (`apn`);--> statement-breakpoint
CREATE TABLE `refresh_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `refresh_jobs_status_requested_idx` ON `refresh_jobs` (`status`,`requested_at`);--> statement-breakpoint
CREATE TABLE `ingestion_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`refresh_job_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_name` text NOT NULL,
	`source_url` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`records_found` integer DEFAULT 0 NOT NULL,
	`records_upserted` integer DEFAULT 0 NOT NULL,
	`error` text,
	FOREIGN KEY (`refresh_job_id`) REFERENCES `refresh_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ingestion_runs_source_started_idx` ON `ingestion_runs` (`source_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `ingestion_runs_job_idx` ON `ingestion_runs` (`refresh_job_id`);
