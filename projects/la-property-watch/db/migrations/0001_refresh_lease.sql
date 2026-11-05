ALTER TABLE `refresh_jobs` ADD `active_lease` text;--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_jobs_active_lease_unique` ON `refresh_jobs` (`active_lease`);
