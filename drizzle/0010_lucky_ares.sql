CREATE TABLE `sequence_counters` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `customers` ADD `material_product_id` text;