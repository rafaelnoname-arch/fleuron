ALTER TABLE `installers` ADD `qualification_type` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `group_id` text;--> statement-breakpoint
ALTER TABLE `receipts` ADD `bl_number` text;--> statement-breakpoint
CREATE INDEX `idx_receipts_group` ON `receipts` (`group_id`);