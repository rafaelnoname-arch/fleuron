ALTER TABLE `return_entries` ADD `cancelled_at` text;--> statement-breakpoint
ALTER TABLE `return_entries` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DROP TRIGGER IF EXISTS protect_return_stop_update;
--> statement-breakpoint
CREATE TRIGGER protect_return_stop_update BEFORE UPDATE ON route_stops
WHEN EXISTS(SELECT 1 FROM return_entries WHERE stop_id=OLD.id AND cancelled_at IS NULL)
AND (NEW.quantity<>OLD.quantity OR NEW.product_id<>OLD.product_id OR NEW.customer_id<>OLD.customer_id OR NEW.route_id<>OLD.route_id OR NEW.status NOT IN ('Refus d’installation','Refus d''installation','Erreur machine','Client absent / intervention reportée','En camion','Livré / posé'))
BEGIN SELECT RAISE(ABORT,'RETURN_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER cancel_return_on_redispatch AFTER UPDATE OF status ON route_stops
WHEN NEW.status IN ('En camion','Livré / posé') AND EXISTS(SELECT 1 FROM return_entries WHERE stop_id=NEW.id AND cancelled_at IS NULL)
BEGIN
 INSERT INTO audit_log(id,action,entity_type,entity_id,details_json)
 SELECT lower(hex(randomblob(16))),'Retour clos — marchandise réaffectée','return',id,json_object('stopId',stop_id,'quantity',quantity,'receivedQty',received_qty,'reason',reason,'validatedAt',validated_at,'validatedBy',validated_by,'newStatus',NEW.status,'revision',revision) FROM return_entries WHERE stop_id=NEW.id AND cancelled_at IS NULL;
 UPDATE return_entries SET cancelled_at=CURRENT_TIMESTAMP,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE stop_id=NEW.id AND cancelled_at IS NULL;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS return_on_status;
--> statement-breakpoint
CREATE TRIGGER return_on_status AFTER UPDATE OF status ON route_stops
WHEN NEW.status IN ('Refus d’installation','Refus d''installation','Erreur machine','Client absent / intervention reportée')
BEGIN
 INSERT INTO return_entries (id,stop_id,route_id,route_number,customer_name,product_id,product_name,team,reason,quantity)
 SELECT s.id,s.id,s.route_id,r.number,COALESCE(c.first_name||' '||c.last_name,'Client'),s.product_id,COALESCE(p.brand||' '||p.model,'Produit'),COALESCE(i.company,'')||' / '||COALESCE(s.team,'')||' / '||r.truck,s.status,s.quantity
 FROM route_stops s JOIN routes r ON r.id=s.route_id LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN products p ON p.id=s.product_id LEFT JOIN installers i ON i.id=s.installer_id WHERE s.id=NEW.id
 ON CONFLICT(stop_id) DO UPDATE SET
 route_id=excluded.route_id,route_number=excluded.route_number,customer_name=excluded.customer_name,product_id=excluded.product_id,product_name=excluded.product_name,team=excluded.team,reason=excluded.reason,quantity=excluded.quantity,
 received_qty=CASE WHEN return_entries.cancelled_at IS NOT NULL THEN 0 ELSE return_entries.received_qty END,
 validated_at=CASE WHEN return_entries.cancelled_at IS NOT NULL THEN NULL ELSE return_entries.validated_at END,
 validated_by=CASE WHEN return_entries.cancelled_at IS NOT NULL THEN NULL ELSE return_entries.validated_by END,
 created_at=CASE WHEN return_entries.cancelled_at IS NOT NULL THEN CURRENT_TIMESTAMP ELSE return_entries.created_at END,
 revision=return_entries.revision+CASE WHEN return_entries.cancelled_at IS NOT NULL THEN 1 ELSE 0 END,cancelled_at=NULL,updated_at=CURRENT_TIMESTAMP;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS protect_pending_return_stop_delete;
--> statement-breakpoint
CREATE TRIGGER protect_pending_return_stop_delete BEFORE DELETE ON route_stops
WHEN EXISTS(SELECT 1 FROM return_entries WHERE stop_id=OLD.id AND received_qty<quantity AND cancelled_at IS NULL)
BEGIN SELECT RAISE(ABORT,'RETURN_PENDING'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS protect_pending_return_route_delete;
--> statement-breakpoint
CREATE TRIGGER protect_pending_return_route_delete BEFORE DELETE ON routes
WHEN EXISTS(SELECT 1 FROM return_entries WHERE route_id=OLD.id AND received_qty<quantity AND cancelled_at IS NULL)
BEGIN SELECT RAISE(ABORT,'RETURN_PENDING'); END;
