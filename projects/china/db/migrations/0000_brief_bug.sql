CREATE TABLE `cheers` (
	`user_id` text NOT NULL,
	`target_id` text NOT NULL,
	`mission_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `target_id`, `mission_id`)
);
--> statement-breakpoint
CREATE TABLE `completions` (
	`user_id` text NOT NULL,
	`mission_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `mission_id`)
);
--> statement-breakpoint
CREATE TABLE `mastery` (
	`user_id` text NOT NULL,
	`mission_id` text NOT NULL,
	`task` integer NOT NULL,
	`level` integer NOT NULL,
	`due` integer NOT NULL,
	PRIMARY KEY(`user_id`, `mission_id`, `task`)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
