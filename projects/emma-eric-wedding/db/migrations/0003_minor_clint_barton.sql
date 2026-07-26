CREATE TABLE `rsvp_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rsvp_revisions_household_id_idx` ON `rsvp_revisions` (`household_id`);