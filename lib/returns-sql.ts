// Used by authenticated return endpoints. One SQL statement per prepare.
export const syncReturnsSql = `INSERT INTO return_entries (id,stop_id,route_id,route_number,customer_name,product_id,product_name,team,reason,quantity)
SELECT s.id,s.id,s.route_id,r.number,COALESCE(c.first_name||' '||c.last_name,'Client'),s.product_id,COALESCE(p.brand||' '||p.model,'Produit'),COALESCE(i.company,'')||' / '||COALESCE(s.team,'')||' / '||r.truck,s.status,s.quantity
FROM route_stops s JOIN routes r ON r.id=s.route_id
LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN products p ON p.id=s.product_id LEFT JOIN installers i ON i.id=s.installer_id
WHERE s.status IN ('Refus d’installation','Refus d''installation','Erreur machine','Client absent / intervention reportée')
AND NOT EXISTS (SELECT 1 FROM return_entries e WHERE e.stop_id=s.id)
ON CONFLICT(stop_id) DO NOTHING`;

export const validateReturnSql = `UPDATE return_entries SET received_qty=?,validated_at=?,validated_by=?,updated_at=?
WHERE id=? AND received_qty=? AND ?>received_qty AND ?<=quantity
AND cancelled_at IS NULL AND revision=?
AND EXISTS (SELECT 1 FROM route_stops s WHERE s.id=return_entries.stop_id AND s.product_id=return_entries.product_id AND s.quantity=return_entries.quantity)`;
export const auditReturnSql = `INSERT INTO audit_log(id,actor_id,actor_email,action,entity_type,entity_id,details_json)
SELECT ?,?,?,'Réception retour validée','return',?,? WHERE changes()=1`;

// The whole client receipt succeeds or fails together, including concurrent edits.
export const validateReturnGroupSql = `WITH requested AS (SELECT json_extract(value,'$.id') id,json_extract(value,'$.quantity') qty,json_extract(value,'$.expectedReceived') expected,json_extract(value,'$.revision') revision FROM json_each(?))
UPDATE return_entries SET received_qty=received_qty+(SELECT qty FROM requested WHERE requested.id=return_entries.id),validated_at=?,validated_by=?,updated_at=?
WHERE id IN (SELECT id FROM requested)
AND (SELECT COUNT(*) FROM requested q JOIN return_entries e ON e.id=q.id JOIN route_stops s ON s.id=e.stop_id
 WHERE e.cancelled_at IS NULL AND e.received_qty=q.expected AND e.revision=q.revision AND q.qty>0 AND e.received_qty+q.qty<=e.quantity AND s.quantity=e.quantity AND s.product_id=e.product_id
 AND e.route_id=? AND s.customer_id=?)=(SELECT COUNT(*) FROM requested)`;
export const auditReturnGroupSql = `INSERT INTO audit_log(id,actor_id,actor_email,action,entity_type,entity_id,details_json)
SELECT ?,?,?,'Réception retour client validée','return',?,? WHERE changes()>0`;

// Only already-received or cancelled returns without a stock-out line can be
// cleaned independently. Removing a receipt linked to a live line changes stock.
export const cleanupOrphanReturnsSql = `DELETE FROM return_entries
WHERE id IN (SELECT value FROM json_each(?))
AND (received_qty=quantity OR cancelled_at IS NOT NULL)
AND NOT EXISTS (SELECT 1 FROM route_stops s WHERE s.id=return_entries.stop_id)`;
export const auditCleanupReturnsSql = `INSERT INTO audit_log(id,actor_id,actor_email,action,entity_type,entity_id,details_json)
SELECT ?,?,?,'Anciens retours sans tournée supprimés','return',NULL,json_object('ids',json(?),'deleted',changes()) WHERE changes()>0`;
