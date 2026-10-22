DROP TRIGGER IF EXISTS return_on_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS return_on_status;
--> statement-breakpoint
DROP TRIGGER IF EXISTS protect_return_stop_update;
--> statement-breakpoint
CREATE TRIGGER return_on_insert AFTER INSERT ON route_stops
WHEN NEW.status IN ('Refus d’installation','Refus d''installation','Erreur machine','Client absent / intervention reportée')
BEGIN
 INSERT INTO return_entries (id,stop_id,route_id,route_number,customer_name,product_id,product_name,team,reason,quantity) SELECT s.id,s.id,s.route_id,r.number,COALESCE(c.first_name||' '||c.last_name,'Client'),s.product_id,COALESCE(p.brand||' '||p.model,'Produit'),COALESCE(i.company,'')||' / '||COALESCE(s.team,'')||' / '||r.truck,s.status,s.quantity
FROM route_stops s JOIN routes r ON r.id=s.route_id
LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN products p ON p.id=s.product_id LEFT JOIN installers i ON i.id=s.installer_id WHERE s.id=NEW.id ON CONFLICT(stop_id) DO UPDATE SET reason=excluded.reason,updated_at=CURRENT_TIMESTAMP;
END;
--> statement-breakpoint
CREATE TRIGGER return_on_status AFTER UPDATE OF status ON route_stops
WHEN NEW.status IN ('Refus d’installation','Refus d''installation','Erreur machine','Client absent / intervention reportée')
BEGIN
 INSERT INTO return_entries (id,stop_id,route_id,route_number,customer_name,product_id,product_name,team,reason,quantity) SELECT s.id,s.id,s.route_id,r.number,COALESCE(c.first_name||' '||c.last_name,'Client'),s.product_id,COALESCE(p.brand||' '||p.model,'Produit'),COALESCE(i.company,'')||' / '||COALESCE(s.team,'')||' / '||r.truck,s.status,s.quantity
FROM route_stops s JOIN routes r ON r.id=s.route_id
LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN products p ON p.id=s.product_id LEFT JOIN installers i ON i.id=s.installer_id WHERE s.id=NEW.id ON CONFLICT(stop_id) DO UPDATE SET reason=excluded.reason,updated_at=CURRENT_TIMESTAMP;
END;
--> statement-breakpoint
CREATE TRIGGER protect_return_stop_update BEFORE UPDATE ON route_stops
WHEN EXISTS(SELECT 1 FROM return_entries WHERE stop_id=OLD.id)
AND (NEW.quantity<>OLD.quantity OR NEW.product_id<>OLD.product_id OR NEW.customer_id<>OLD.customer_id OR NEW.route_id<>OLD.route_id OR NEW.status NOT IN ('Refus d’installation','Refus d''installation','Erreur machine','Client absent / intervention reportée'))
BEGIN SELECT RAISE(ABORT,'RETURN_LOCKED'); END;
