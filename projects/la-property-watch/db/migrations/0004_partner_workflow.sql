CREATE TABLE `source_publications` (
  `source_id` text PRIMARY KEY NOT NULL,
  `baseline_established_at` text NOT NULL,
  `last_success_run_id` text NOT NULL,
  `last_source_updated_at` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `property_change_events` (
  `id` text PRIMARY KEY NOT NULL,
  `property_key` text NOT NULL,
  `source_id` text NOT NULL,
  `source_record_id` text,
  `event_type` text NOT NULL,
  `severity` text NOT NULL,
  `detected_at` text NOT NULL,
  `published_at` text,
  `before_json` text,
  `after_json` text NOT NULL,
  `source_name` text NOT NULL,
  `source_url` text NOT NULL,
  `ingestion_run_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `property_change_property_detected_idx` ON `property_change_events` (`property_key`,`detected_at` DESC);
--> statement-breakpoint
CREATE INDEX `property_change_run_idx` ON `property_change_events` (`ingestion_run_id`);
--> statement-breakpoint
CREATE TABLE `partner_properties` (
  `property_key` text PRIMARY KEY NOT NULL,
  `saved` integer NOT NULL DEFAULT 0,
  `dismissed` integer NOT NULL DEFAULT 0,
  `stage` text NOT NULL DEFAULT 'New',
  `assigned_to` text,
  `follow_up_at` text,
  `pass_reason` text,
  `version` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `created_by` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `partner_properties_pipeline_idx` ON `partner_properties` (`stage`,`dismissed`,`follow_up_at`);
--> statement-breakpoint
CREATE TABLE `property_notes` (
  `id` text PRIMARY KEY NOT NULL,
  `property_key` text NOT NULL,
  `body` text NOT NULL,
  `author_email` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `property_notes_property_created_idx` ON `property_notes` (`property_key`,`created_at`);
--> statement-breakpoint
CREATE TABLE `buy_boxes` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `property_types_json` text NOT NULL,
  `jurisdictions_json` text NOT NULL,
  `neighborhoods_json` text NOT NULL,
  `zips_json` text NOT NULL,
  `min_size_value` integer,
  `max_size_value` integer,
  `size_basis` text NOT NULL,
  `min_value_cents` integer,
  `max_value_cents` integer,
  `value_basis` text NOT NULL,
  `distress_phases_json` text NOT NULL,
  `version` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `created_by` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `buy_boxes_updated_idx` ON `buy_boxes` (`updated_at` DESC);
--> statement-breakpoint
CREATE TABLE `user_alert_preferences` (
  `user_email` text PRIMARY KEY NOT NULL,
  `new_activity` integer NOT NULL DEFAULT 1,
  `worsening_activity` integer NOT NULL DEFAULT 1,
  `due_follow_ups` integer NOT NULL DEFAULT 1,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `property_alerts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_email` text NOT NULL,
  `property_key` text NOT NULL,
  `change_event_id` text,
  `kind` text NOT NULL,
  `title` text NOT NULL,
  `created_at` text NOT NULL,
  `available_at` text NOT NULL,
  `read_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_alert_user_event_unique` ON `property_alerts` (`user_email`,`change_event_id`);
--> statement-breakpoint
CREATE INDEX `property_alert_user_available_idx` ON `property_alerts` (`user_email`,`available_at` DESC);
--> statement-breakpoint
CREATE TABLE `property_enrichment` (
  `property_key` text PRIMARY KEY NOT NULL,
  `jurisdiction_id` text NOT NULL,
  `parcel_id` text NOT NULL,
  `source_parcel_id` text NOT NULL,
  `join_method` text NOT NULL,
  `join_source_url` text,
  `lrsn` text,
  `gpin` text,
  `assessor_address` text,
  `assessor_city` text,
  `assessor_zip` text,
  `legal_description` text,
  `owner_name` text,
  `owner_source_url` text,
  `owner_observed_at` text,
  `land_use_code` text,
  `land_use_description` text,
  `property_use` text,
  `normalized_property_type` text,
  `type_mapping_source_url` text,
  `residential_finished_area_value` integer,
  `commercial_building_area_value` integer,
  `building_area_unit_status` text NOT NULL,
  `lot_area_sqft` integer,
  `year_built` integer,
  `neighborhood` text,
  `assessed_land_cents` integer,
  `assessed_improvement_cents` integer,
  `assessed_total_cents` integer,
  `assessment_year` integer,
  `assessment_effective_date` text,
  `assessment_source_url` text,
  `last_transfer_date` text,
  `last_transfer_consideration_cents` integer,
  `last_transfer_document_number` text,
  `last_transfer_grantor` text,
  `last_transfer_grantee` text,
  `source_updated_at` text,
  `observed_at` text NOT NULL,
  `raw_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `property_enrichment_parcel_idx` ON `property_enrichment` (`jurisdiction_id`,`parcel_id`);
--> statement-breakpoint
CREATE TABLE `property_enrichment_extensions` (
  `id` text PRIMARY KEY NOT NULL,
  `property_key` text NOT NULL,
  `extension` text,
  `residential_finished_area_value` integer,
  `commercial_building_area_value` integer,
  `year_built` integer,
  `raw_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `property_enrichment_extensions_property_idx` ON `property_enrichment_extensions` (`property_key`,`extension`);
--> statement-breakpoint
CREATE TABLE `property_sales` (
  `id` text PRIMARY KEY NOT NULL,
  `subject_property_key` text NOT NULL,
  `candidate_parcel_id` text NOT NULL,
  `candidate_address` text,
  `sale_date` text NOT NULL,
  `sale_price_cents` integer NOT NULL,
  `document_number` text,
  `normalized_property_type` text,
  `building_area_source_value` integer,
  `building_area_unit_status` text NOT NULL,
  `document_parcel_count` integer,
  `qualification_status` text NOT NULL,
  `exclusion_reason` text,
  `selection_reason` text NOT NULL,
  `source_url` text NOT NULL,
  `source_updated_at` text,
  `observed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `property_sales_subject_date_idx` ON `property_sales` (`subject_property_key`,`sale_date` DESC);
--> statement-breakpoint
CREATE TABLE `enrichment_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `property_key` text NOT NULL,
  `source_id` text NOT NULL,
  `status` text NOT NULL,
  `started_at` text NOT NULL,
  `finished_at` text NOT NULL,
  `source_updated_at` text,
  `records_found` integer NOT NULL,
  `error` text
);
--> statement-breakpoint
CREATE INDEX `enrichment_runs_property_started_idx` ON `enrichment_runs` (`property_key`,`started_at` DESC);
--> statement-breakpoint
CREATE TABLE `property_value_assumptions` (
  `id` text PRIMARY KEY NOT NULL,
  `property_key` text NOT NULL,
  `label` text NOT NULL,
  `value_cents` integer NOT NULL,
  `as_of_date` text NOT NULL,
  `author_email` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `property_assumptions_property_created_idx` ON `property_value_assumptions` (`property_key`,`created_at` DESC);
