CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`actor_email` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text,
	`last_name` text NOT NULL,
	`first_name` text NOT NULL,
	`phone` text,
	`email` text,
	`address` text,
	`preca` text,
	`area` real,
	`phase` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`category` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`object_key` text NOT NULL,
	`uploaded_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `installers` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`phone` text,
	`email` text,
	`rge_number` text,
	`rge_valid_until` text,
	`teams_json` text DEFAULT '[]' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`activity` text NOT NULL,
	`brand` text NOT NULL,
	`model` text NOT NULL,
	`power` text,
	`phase` text,
	`etas` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`supplier` text NOT NULL,
	`carrier` text,
	`product_id` text NOT NULL,
	`announced_qty` integer NOT NULL,
	`counted_qty` integer NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`payment_status` text DEFAULT 'À payer' NOT NULL,
	`due_date` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `route_stops` (
	`id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`installer_id` text,
	`team` text,
	`product_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'En camion' NOT NULL,
	`sav_status` text DEFAULT 'Aucun' NOT NULL,
	`return_reason` text,
	`planned_at` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`truck` text NOT NULL,
	`driver` text NOT NULL,
	`status` text DEFAULT 'Préparée' NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
