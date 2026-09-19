CREATE TABLE `health_sync_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `device_id` text NOT NULL,
  `request_id` text NOT NULL,
  `payload_hash` text NOT NULL,
  `accepted_count` integer NOT NULL,
  `inserted_count` integer NOT NULL,
  `unchanged_count` integer NOT NULL,
  `received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_sync_runs_device_request_uidx` ON `health_sync_runs` (`device_id`, `request_id`);
--> statement-breakpoint
CREATE INDEX `health_sync_runs_received_idx` ON `health_sync_runs` (`received_at`);
--> statement-breakpoint
CREATE TABLE `health_step_samples` (
  `id` text PRIMARY KEY NOT NULL,
  `device_id` text NOT NULL,
  `sample_id` text NOT NULL,
  `sync_run_id` text NOT NULL REFERENCES `health_sync_runs`(`id`),
  `value` integer NOT NULL,
  `start_at` integer NOT NULL,
  `end_at` integer NOT NULL,
  `source_bundle_id` text NOT NULL,
  `source_name` text NOT NULL,
  `received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_step_samples_device_sample_uidx` ON `health_step_samples` (`device_id`, `sample_id`);
--> statement-breakpoint
CREATE INDEX `health_step_samples_start_idx` ON `health_step_samples` (`start_at`);
