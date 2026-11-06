ALTER TABLE `foreclosure_records` ADD `signal_type` text NOT NULL DEFAULT 'scheduled_tax_sale';
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `jurisdiction_id` text NOT NULL DEFAULT 'la-county-ca';
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `jurisdiction_name` text NOT NULL DEFAULT 'Los Angeles County, CA';
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `source_record_id` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `source_as_of_date` text;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `event_date` text;
--> statement-breakpoint
ALTER TABLE `foreclosure_records` ADD `delinquent_amount_cents` integer;
--> statement-breakpoint
UPDATE `foreclosure_records`
SET `signal_type` = CASE
      WHEN `sale_type` = 'trustee' THEN 'scheduled_trustee_sale'
      ELSE 'scheduled_tax_sale'
    END,
    `source_record_id` = `source_key`,
    `event_date` = `scheduled_date`;
--> statement-breakpoint
CREATE INDEX `foreclosure_signal_type_idx` ON `foreclosure_records` (`signal_type`);
--> statement-breakpoint
CREATE INDEX `foreclosure_jurisdiction_idx` ON `foreclosure_records` (`jurisdiction_id`);
--> statement-breakpoint
CREATE INDEX `foreclosure_jurisdiction_apn_idx` ON `foreclosure_records` (`jurisdiction_id`,`apn`);
