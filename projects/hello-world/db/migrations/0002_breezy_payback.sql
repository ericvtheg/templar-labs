CREATE TABLE `queue_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`published_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `queue_events_message_id_unique` ON `queue_events` (`message_id`);