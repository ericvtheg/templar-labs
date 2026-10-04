CREATE TABLE `offscroll_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`reward` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`goal` integer NOT NULL,
	`color` text NOT NULL,
	`creator_id` text NOT NULL,
	`invite_token` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `offscroll_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offscroll_challenges_invite_token_unique` ON `offscroll_challenges` (`invite_token`);--> statement-breakpoint
CREATE TABLE `offscroll_members` (
	`challenge_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`challenge_id`, `user_id`),
	FOREIGN KEY (`challenge_id`) REFERENCES `offscroll_challenges`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `offscroll_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `offscroll_members_user_idx` ON `offscroll_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `offscroll_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`goal` integer DEFAULT 45 NOT NULL,
	`baseline` integer DEFAULT 120 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `offscroll_usage` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`instagram` integer NOT NULL,
	`tiktok` integer NOT NULL,
	`youtube` integer NOT NULL,
	`other` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `offscroll_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
