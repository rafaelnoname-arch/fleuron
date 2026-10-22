CREATE INDEX `idx_documents_entity` ON `documents` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_receipts_product_date` ON `receipts` (`product_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_stops_route` ON `route_stops` (`route_id`);--> statement-breakpoint
CREATE INDEX `idx_stops_customer` ON `route_stops` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_stops_product_status` ON `route_stops` (`product_id`,`status`);