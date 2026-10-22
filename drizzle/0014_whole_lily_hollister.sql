DROP INDEX `uniq_stops_customer_route_date_active`;--> statement-breakpoint
CREATE TRIGGER `prevent_customer_two_routes_same_day_insert`
BEFORE INSERT ON `route_stops`
WHEN NEW.`status` <> 'Annulé' AND NEW.`route_date` IS NOT NULL AND EXISTS (
  SELECT 1 FROM `route_stops` existing
  WHERE existing.`customer_id` = NEW.`customer_id`
    AND existing.`route_date` = NEW.`route_date`
    AND existing.`status` <> 'Annulé'
    AND existing.`route_id` <> NEW.`route_id`
)
BEGIN
  SELECT RAISE(ABORT, 'CUSTOMER_ROUTE_DATE_CONFLICT');
END;--> statement-breakpoint
CREATE TRIGGER `prevent_customer_two_routes_same_day_update`
BEFORE UPDATE OF `customer_id`, `route_id`, `route_date`, `status` ON `route_stops`
WHEN NEW.`status` <> 'Annulé' AND NEW.`route_date` IS NOT NULL AND EXISTS (
  SELECT 1 FROM `route_stops` existing
  WHERE existing.`id` <> NEW.`id`
    AND existing.`customer_id` = NEW.`customer_id`
    AND existing.`route_date` = NEW.`route_date`
    AND existing.`status` <> 'Annulé'
    AND existing.`route_id` <> NEW.`route_id`
)
BEGIN
  SELECT RAISE(ABORT, 'CUSTOMER_ROUTE_DATE_CONFLICT');
END;
