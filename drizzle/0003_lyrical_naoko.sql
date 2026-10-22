ALTER TABLE `route_stops` ADD `route_date` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_stops_customer_route_date_active` ON `route_stops` (`customer_id`,`route_date`) WHERE "route_stops"."status" <> 'Annulé';--> statement-breakpoint
PRAGMA optimize;
