ALTER TABLE `buy_boxes` ADD COLUMN `value_assumption_label` text;
--> statement-breakpoint
CREATE INDEX `property_change_detected_idx` ON `property_change_events` (`detected_at` DESC,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_alert_preferences_email_nocase_unique` ON `user_alert_preferences` (LOWER(`user_email`));
--> statement-breakpoint
UPDATE `watchlist_properties`
SET `score` = MIN(100,
  CASE WHEN ','||`signal_types`||',' LIKE '%,mortgage_foreclosure_initiated,%' OR ','||`signal_types`||',' LIKE '%,notice_of_default,%' THEN 80 ELSE 0 END
  + CASE WHEN ','||`signal_types`||',' LIKE '%,tax_delinquency,%' THEN 40 ELSE 0 END
  + CASE WHEN ','||`signal_types`||',' LIKE '%,recorded_lien,%' THEN 35 ELSE 0 END
  + CASE WHEN ','||`signal_types`||',' LIKE '%,code_violation,%' THEN 25 ELSE 0 END
  + CASE WHEN `independent_signal_count` > 1 THEN MIN(20, (`independent_signal_count` - 1) * 10) ELSE 0 END
);
