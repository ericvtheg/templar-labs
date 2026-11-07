ALTER TABLE `property_deal_scenario_candidates` ADD COLUMN `evidence_snapshot_json` text;
--> statement-breakpoint
ALTER TABLE `blind_benchmarks` ADD COLUMN `buy_box_snapshot_json` text;
--> statement-breakpoint
ALTER TABLE `blind_benchmark_reviews` ADD COLUMN `operation_token` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `blind_benchmark_review_audit` ADD COLUMN `operation_token` text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE UNIQUE INDEX `blind_benchmark_review_audit_operation_unique`
ON `blind_benchmark_review_audit` (`benchmark_id`,`reviewer_email`,`operation_token`);
