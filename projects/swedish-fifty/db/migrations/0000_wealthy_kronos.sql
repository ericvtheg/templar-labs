CREATE TABLE `swedish_fifty_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mission_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`prompt_text` text NOT NULL,
	`transcript` text NOT NULL,
	`evaluation_json` text NOT NULL,
	`intelligibility_score` integer NOT NULL,
	`voice_metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mission_id`) REFERENCES `swedish_fifty_missions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `swedish_fifty_attempts_user_idx` ON `swedish_fifty_attempts` (`user_id`);--> statement-breakpoint
CREATE INDEX `swedish_fifty_attempts_mission_idx` ON `swedish_fifty_attempts` (`mission_id`);--> statement-breakpoint
CREATE TABLE `swedish_fifty_memory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`scenario_key` text NOT NULL,
	`pattern` text NOT NULL,
	`evidence` text NOT NULL,
	`next_practice` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `swedish_fifty_memory_items_user_idx` ON `swedish_fifty_memory_items` (`user_id`);--> statement-breakpoint
CREATE INDEX `swedish_fifty_memory_items_user_scenario_idx` ON `swedish_fifty_memory_items` (`user_id`,`scenario_key`);--> statement-breakpoint
CREATE TABLE `swedish_fifty_missions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mission_date` text NOT NULL,
	`day_number` integer NOT NULL,
	`scenario_key` text NOT NULL,
	`title` text NOT NULL,
	`phase` text NOT NULL,
	`difficulty` integer NOT NULL,
	`context` text NOT NULL,
	`dialogue_json` text NOT NULL,
	`prompts_json` text NOT NULL,
	`roleplay_setup` text NOT NULL,
	`coach_notes_json` text NOT NULL,
	`generated_by` text NOT NULL,
	`model` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `swedish_fifty_missions_user_date_uidx` ON `swedish_fifty_missions` (`user_id`,`mission_date`);--> statement-breakpoint
CREATE INDEX `swedish_fifty_missions_user_idx` ON `swedish_fifty_missions` (`user_id`);--> statement-breakpoint
CREATE TABLE `swedish_fifty_roleplay_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mission_id` text NOT NULL,
	`speaker` text NOT NULL,
	`content` text NOT NULL,
	`english_summary` text,
	`model` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mission_id`) REFERENCES `swedish_fifty_missions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `swedish_fifty_roleplay_turns_user_idx` ON `swedish_fifty_roleplay_turns` (`user_id`);--> statement-breakpoint
CREATE INDEX `swedish_fifty_roleplay_turns_mission_idx` ON `swedish_fifty_roleplay_turns` (`mission_id`);--> statement-breakpoint
CREATE TABLE `swedish_fifty_scenario_readiness` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scenario_key` text NOT NULL,
	`score` integer DEFAULT 8 NOT NULL,
	`confidence_label` text DEFAULT 'Starting' NOT NULL,
	`evidence_summary` text DEFAULT 'No practice logged yet.' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `swedish_fifty_scenario_readiness_user_scenario_uidx` ON `swedish_fifty_scenario_readiness` (`user_id`,`scenario_key`);--> statement-breakpoint
CREATE INDEX `swedish_fifty_scenario_readiness_user_idx` ON `swedish_fifty_scenario_readiness` (`user_id`);--> statement-breakpoint
CREATE TABLE `swedish_fifty_user_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`starting_level` text DEFAULT 'very_little_swedish' NOT NULL,
	`target_trip_start` text DEFAULT '2026-07-23' NOT NULL,
	`target_trip_end` text DEFAULT '2026-07-30' NOT NULL,
	`home_language` text DEFAULT 'English' NOT NULL,
	`swedish_confidence` integer DEFAULT 1 NOT NULL,
	`pronunciation_confidence` integer DEFAULT 3 NOT NULL,
	`coach_swedish_ratio` integer DEFAULT 10 NOT NULL,
	`free_mission_used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `swedish_fifty_user_profiles_user_uidx` ON `swedish_fifty_user_profiles` (`user_id`);