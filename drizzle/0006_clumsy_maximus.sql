CREATE TABLE `return_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`stop_id` text NOT NULL,
	`route_id` text NOT NULL,
	`route_number` text NOT NULL,
	`customer_name` text NOT NULL,
	`product_id` text NOT NULL,
	`product_name` text NOT NULL,
	`team` text NOT NULL,
	`reason` text NOT NULL,
	`quantity` integer NOT NULL,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`validated_at` text,
	`validated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "valid_return_quantities" CHECK("return_entries"."quantity">0 AND "return_entries"."received_qty">=0 AND "return_entries"."received_qty"<="return_entries"."quantity")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_return_stop` ON `return_entries` (`stop_id`);--> statement-breakpoint
CREATE INDEX `idx_return_route` ON `return_entries` (`route_id`);
--> statement-breakpoint
CREATE TRIGGER return_on_insert AFTER INSERT ON route_stops
WHEN NEW.status IN ('Refus d’installation','Refus d''installation','Erreur machine')
BEGIN
 INSERT INTO return_entries (id,stop_id,route_id,route_number,customer_name,product_id,product_name,team,reason,quantity) SELECT s.id,s.id,s.route_id,r.number,COALESCE(c.first_name||' '||c.last_name,'Client'),s.product_id,COALESCE(p.brand||' '||p.model,'Produit'),COALESCE(i.company,'')||' / '||COALESCE(s.team,'')||' / '||r.truck,s.status,s.quantity
FROM route_stops s JOIN routes r ON r.id=s.route_id
LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN products p ON p.id=s.product_id LEFT JOIN installers i ON i.id=s.installer_id WHERE s.id=NEW.id ON CONFLICT(stop_id) DO UPDATE SET reason=excluded.reason,updated_at=CURRENT_TIMESTAMP;
END;

--> statement-breakpoint
CREATE TRIGGER return_on_status AFTER UPDATE OF status ON route_stops
WHEN NEW.status IN ('Refus d’installation','Refus d''installation','Erreur machine')
BEGIN
 INSERT INTO return_entries (id,stop_id,route_id,route_number,customer_name,product_id,product_name,team,reason,quantity) SELECT s.id,s.id,s.route_id,r.number,COALESCE(c.first_name||' '||c.last_name,'Client'),s.product_id,COALESCE(p.brand||' '||p.model,'Produit'),COALESCE(i.company,'')||' / '||COALESCE(s.team,'')||' / '||r.truck,s.status,s.quantity
FROM route_stops s JOIN routes r ON r.id=s.route_id
LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN products p ON p.id=s.product_id LEFT JOIN installers i ON i.id=s.installer_id WHERE s.id=NEW.id ON CONFLICT(stop_id) DO UPDATE SET reason=excluded.reason,updated_at=CURRENT_TIMESTAMP;
END;

--> statement-breakpoint
CREATE TRIGGER protect_return_stop_update BEFORE UPDATE ON route_stops
WHEN EXISTS(SELECT 1 FROM return_entries WHERE stop_id=OLD.id)
AND (NEW.quantity<>OLD.quantity OR NEW.product_id<>OLD.product_id OR NEW.customer_id<>OLD.customer_id OR NEW.route_id<>OLD.route_id OR NEW.status NOT IN ('Refus d’installation','Refus d''installation','Erreur machine'))
BEGIN SELECT RAISE(ABORT,'RETURN_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER protect_pending_return_stop_delete BEFORE DELETE ON route_stops
WHEN EXISTS(SELECT 1 FROM return_entries WHERE stop_id=OLD.id AND received_qty<quantity)
BEGIN SELECT RAISE(ABORT,'RETURN_PENDING'); END;
--> statement-breakpoint
CREATE TRIGGER protect_pending_return_route_delete BEFORE DELETE ON routes
WHEN EXISTS(SELECT 1 FROM return_entries WHERE route_id=OLD.id AND received_qty<quantity)
BEGIN SELECT RAISE(ABORT,'RETURN_PENDING'); END;
