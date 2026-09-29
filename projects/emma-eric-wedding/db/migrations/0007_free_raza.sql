CREATE TABLE `wedding_site_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`draft_json` text NOT NULL,
	`published_json` text,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer
);
--> statement-breakpoint
CREATE TABLE `wedding_site_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`action` text NOT NULL,
	`content_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `wedding_site_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wedding_site_revisions_document_version_uidx` ON `wedding_site_revisions` (`document_id`,`version`);--> statement-breakpoint
CREATE INDEX `wedding_site_revisions_created_at_idx` ON `wedding_site_revisions` (`created_at`);