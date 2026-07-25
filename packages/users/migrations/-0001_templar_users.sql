CREATE TABLE IF NOT EXISTS `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
