CREATE TABLE `rsvp_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`deadline` text NOT NULL,
	`is_open` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `rsvp_settings` (`id`, `deadline`, `is_open`, `updated_at`)
VALUES ('wedding-rsvp', '2027-08-15', true, strftime('%s', 'now') * 1000);
