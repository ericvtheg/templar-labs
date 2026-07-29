CREATE TABLE `templar_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`audience` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`key_prefix` text NOT NULL,
	`secret_digest` text NOT NULL,
	`secret_version` integer NOT NULL,
	`permissions` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `templar_api_keys_owner_idx` ON `templar_api_keys` (`audience`,`user_id`);
--> statement-breakpoint
CREATE INDEX `templar_api_keys_active_idx` ON `templar_api_keys` (`audience`,`revoked_at`,`expires_at`);
