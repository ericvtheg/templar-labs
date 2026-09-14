CREATE TABLE `health_devices` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `installation_id` text NOT NULL,
  `display_name` text NOT NULL,
  `platform` text NOT NULL,
  `token_hash` text NOT NULL,
  `token_hint` text NOT NULL,
  `created_at` integer NOT NULL,
  `last_seen_at` integer,
  `revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_devices_installation_uidx` ON `health_devices` (`installation_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_devices_token_hash_uidx` ON `health_devices` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `health_devices_owner_idx` ON `health_devices` (`owner_id`);
--> statement-breakpoint
CREATE TABLE `health_samples` (
  `id` text PRIMARY KEY NOT NULL,
  `device_id` text NOT NULL REFERENCES `health_devices`(`id`) ON DELETE cascade,
  `sample_id` text NOT NULL,
  `type` text NOT NULL,
  `value` integer NOT NULL,
  `unit` text NOT NULL,
  `start_at` integer NOT NULL,
  `end_at` integer NOT NULL,
  `source_bundle_id` text NOT NULL,
  `source_name` text NOT NULL,
  `source_version` text,
  `source_product_type` text,
  `source_metadata_json` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_samples_device_sample_uidx` ON `health_samples` (`device_id`,`sample_id`);
--> statement-breakpoint
CREATE INDEX `health_samples_type_start_idx` ON `health_samples` (`type`,`start_at`);
--> statement-breakpoint
CREATE INDEX `health_samples_source_idx` ON `health_samples` (`source_bundle_id`,`source_name`);
--> statement-breakpoint
CREATE INDEX `health_samples_deleted_idx` ON `health_samples` (`deleted_at`);
--> statement-breakpoint
CREATE TABLE `health_deletion_tombstones` (
  `id` text PRIMARY KEY NOT NULL,
  `device_id` text NOT NULL REFERENCES `health_devices`(`id`) ON DELETE cascade,
  `sample_id` text NOT NULL,
  `deleted_at` integer NOT NULL,
  `received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_deletions_device_sample_uidx` ON `health_deletion_tombstones` (`device_id`,`sample_id`);
--> statement-breakpoint
CREATE INDEX `health_deletions_received_idx` ON `health_deletion_tombstones` (`received_at`);
--> statement-breakpoint
CREATE TABLE `health_sync_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `device_id` text NOT NULL REFERENCES `health_devices`(`id`) ON DELETE cascade,
  `request_id` text NOT NULL,
  `payload_hash` text NOT NULL,
  `anchor` text,
  `sample_count` integer NOT NULL,
  `deletion_count` integer NOT NULL,
  `inserted_count` integer NOT NULL,
  `unchanged_count` integer NOT NULL,
  `deleted_count` integer NOT NULL,
  `received_at` integer NOT NULL,
  `completed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_sync_runs_device_request_uidx` ON `health_sync_runs` (`device_id`,`request_id`);
--> statement-breakpoint
CREATE INDEX `health_sync_runs_device_received_idx` ON `health_sync_runs` (`device_id`,`received_at`);
--> statement-breakpoint
CREATE TABLE `health_ingestion_items` (
  `run_id` text NOT NULL REFERENCES `health_sync_runs`(`id`) ON DELETE cascade,
  `sample_id` text NOT NULL,
  `kind` text NOT NULL,
  `outcome` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_ingestion_items_run_sample_uidx` ON `health_ingestion_items` (`run_id`,`sample_id`);
