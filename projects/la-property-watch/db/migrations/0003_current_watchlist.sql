ALTER TABLE `foreclosure_records` ADD `property_key` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `source_updated_at` text;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `source_good_through` text;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `source_kind` text NOT NULL DEFAULT 'secondary';
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `snapshot_presence` text NOT NULL DEFAULT 'present';
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `snapshot_id` text;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `no_longer_present_at` text;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `principal_balance_cents` integer;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `principal_as_of_date` text;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `owner_name` text;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `property_type` text;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `tax_year` integer;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `tax_installment` integer;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `tax_due_cents` integer;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `penalty_due_cents` integer;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `interest_due_cents` integer;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `evidence_status` text;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `evidence_detail` text;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `evidence_updated_at` text;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `priority` integer;
--> statement-breakpoint
UPDATE `foreclosure_records`
SET `property_key` = `jurisdiction_id` || ':' || COALESCE(`apn`, `source_id` || ':' || `source_record_id`);
--> statement-breakpoint
CREATE INDEX `foreclosure_property_key_idx` ON `foreclosure_records` (`property_key`);
--> statement-breakpoint
CREATE INDEX `foreclosure_snapshot_source_idx` ON `foreclosure_records` (`source_id`,`snapshot_presence`,`snapshot_id`);
--> statement-breakpoint
ALTER TABLE `ingestion_runs` ADD `records_no_longer_present` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `ingestion_runs` ADD `source_updated_at` text;
--> statement-breakpoint
ALTER TABLE `ingestion_runs` ADD `snapshot_complete` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `watchlist_properties` (
  `property_key` text PRIMARY KEY NOT NULL,
  `jurisdiction_id` text NOT NULL,
  `jurisdiction_name` text NOT NULL,
  `parcel_id` text,
  `address` text,
  `city` text,
  `state` text,
  `zip` text,
  `owner_name` text,
  `property_type` text,
  `score` integer NOT NULL,
  `signal_types` text NOT NULL,
  `independent_signal_count` integer NOT NULL,
  `evidence_count` integer NOT NULL,
  `tax_installment_count` integer NOT NULL,
  `code_violation_count` integer NOT NULL,
  `recorded_lien_count` integer NOT NULL,
  `total_delinquent_cents` integer NOT NULL,
  `earliest_tax_year` integer,
  `freshest_source_updated_at` text,
  `first_seen_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  `source_names` text NOT NULL,
  `ranked_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `watchlist_rank_idx` ON `watchlist_properties` (`score` DESC,`property_key`);
--> statement-breakpoint
CREATE INDEX `watchlist_jurisdiction_rank_idx` ON `watchlist_properties` (`jurisdiction_id`,`score` DESC);

--> statement-breakpoint
CREATE TABLE `foreclosure_record_staging` AS
SELECT '' AS `staging_run_id`, * FROM `foreclosure_records` WHERE 0;
--> statement-breakpoint
CREATE INDEX `foreclosure_record_staging_run_idx` ON `foreclosure_record_staging` (`staging_run_id`);
