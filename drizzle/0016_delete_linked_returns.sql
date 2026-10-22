-- Pending-return guards still run BEFORE deletion. Completed or cancelled
-- returns disappear atomically with their stock-out line and their route.
CREATE TRIGGER delete_returns_with_stop AFTER DELETE ON route_stops
BEGIN
 DELETE FROM return_entries WHERE stop_id=OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER delete_returns_with_route AFTER DELETE ON routes
BEGIN
 DELETE FROM route_stops WHERE route_id=OLD.id;
 DELETE FROM return_entries WHERE route_id=OLD.id;
END;
