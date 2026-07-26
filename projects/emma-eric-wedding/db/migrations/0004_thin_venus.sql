CREATE TABLE `guest_rsvp_details` (
	`guest_id` text PRIMARY KEY NOT NULL,
	`dietary_restrictions` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `plus_one_responses` ADD `dietary_restrictions` text DEFAULT '' NOT NULL;
