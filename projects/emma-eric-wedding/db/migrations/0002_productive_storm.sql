CREATE TABLE `event_invitations` (
	`guest_id` text NOT NULL,
	`event_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`guest_id`, `event_id`),
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_invitations_event_id_idx` ON `event_invitations` (`event_id`);--> statement-breakpoint
INSERT INTO `event_invitations` (`guest_id`, `event_id`, `created_at`)
SELECT `id`, 'wedding', `created_at` FROM `guests`;--> statement-breakpoint
CREATE TABLE `guest_event_responses` (
	`guest_id` text NOT NULL,
	`event_id` text NOT NULL,
	`attending` integer NOT NULL,
	`meal_option_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`guest_id`, `event_id`),
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guest_event_responses_event_id_idx` ON `guest_event_responses` (`event_id`);--> statement-breakpoint
CREATE TABLE `household_rsvps` (
	`household_id` text PRIMARY KEY NOT NULL,
	`contact_email` text,
	`submitted_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plus_one_meal_selections` (
	`guest_id` text NOT NULL,
	`event_id` text NOT NULL,
	`meal_option_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`guest_id`, `event_id`),
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plus_one_responses` (
	`guest_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade
);
