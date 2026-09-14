CREATE TABLE `ai_usage` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`bucket` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `bucket`)
);
--> statement-breakpoint
CREATE TABLE `coach_scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mission_id` text NOT NULL,
	`target` text NOT NULL,
	`scene` text NOT NULL,
	`history` text NOT NULL,
	`turns` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `speech_jobs` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL
);
