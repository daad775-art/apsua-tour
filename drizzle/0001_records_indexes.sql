CREATE INDEX IF NOT EXISTS `records_kind_owner_created_idx` ON `records` (`kind`,`owner`,`created`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_owner_created_idx` ON `records` (`owner`,`created`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `records_kind_status_created_idx` ON `records` (`kind`,`status`,`created`);
