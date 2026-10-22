"""Exercise the shipped migrations and endpoint SQL against an isolated database."""
import pathlib
import re
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SQL = (ROOT / "lib/returns-sql.ts").read_text()
def statement(name):
    return re.search(r"export const " + name + r" = `(.*?)`;", SQL, re.S).group(1)

class ReturnsTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        for migration in sorted((ROOT / "drizzle").glob("*.sql")):
            self.db.executescript(migration.read_text())
        self.db.execute("INSERT INTO products(id,activity,brand,model) VALUES('p','PAC','Brand','Model')")
        self.db.execute("INSERT INTO customers(id,first_name,last_name) VALUES('c','Rudi','Test')")
        self.db.execute("INSERT INTO routes(id,number,date,truck,driver) VALUES('r','BS-1','2026-09-17','Truck','Driver')")
        self.db.execute("INSERT INTO receipts(id,date,supplier,product_id,announced_qty,counted_qty,unit_price) VALUES('in','2026-09-17','Supplier','p',2,2,100)")
        self.db.execute("INSERT INTO route_stops(id,route_id,customer_id,product_id,quantity,status) VALUES('s','r','c','p',2,'En camion')")
    def mark(self, status="Refus d’installation"):
        self.db.execute("UPDATE route_stops SET status=? WHERE id='s'", (status,))
    def validate(self, expected, quantity):
        total = expected + quantity
        self.db.execute(statement("validateReturnSql"), (total,"now","user","now","s",expected,total,total,(self.db.execute("SELECT revision FROM return_entries WHERE id='s'").fetchone() or [0])[0]))
        changed = self.db.execute("SELECT changes()").fetchone()[0]
        self.db.execute(statement("auditReturnSql"), (f"a-{expected}-{quantity}","user","email","s","{}"))
        return changed
    def stock(self):
        return self.db.execute("SELECT 2-COALESCE(SUM(s.quantity-COALESCE(e.received_qty,0)),0) FROM route_stops s LEFT JOIN return_entries e ON s.id=e.stop_id AND e.cancelled_at IS NULL").fetchone()[0]
    def test_pending_partial_complete_and_duplicate_validation(self):
        self.assertEqual(self.stock(), 0)
        self.mark()
        self.assertEqual(self.stock(), 0)
        self.assertEqual(self.db.execute("SELECT customer_name FROM return_entries").fetchone()[0], "Rudi Test")
        self.assertEqual(self.validate(0,1), 1)
        self.assertEqual(self.stock(), 1)
        self.assertEqual(self.validate(0,1), 0)
        self.assertEqual(self.stock(), 1)
        self.assertEqual(self.validate(1,2), 0)
        self.assertEqual(self.validate(1,1), 1)
        self.assertEqual(self.stock(), 2)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0], 2)
        self.assertEqual(self.db.execute("SELECT SUM(counted_qty*unit_price)/SUM(counted_qty) FROM receipts").fetchone()[0], 100)
    def test_repeated_reason_keeps_one_return_and_received_quantity(self):
        self.mark()
        self.validate(0,1)
        self.mark("Erreur machine")
        self.mark()
        self.assertEqual(self.db.execute("SELECT COUNT(*),received_qty FROM return_entries").fetchone(), (1,1))
    def test_absent_customer_creates_pending_return(self):
        self.mark("Client absent / intervention reportée")
        row = self.db.execute("SELECT reason,quantity,received_qty FROM return_entries WHERE stop_id='s'").fetchone()
        self.assertEqual(row, ("Client absent / intervention reportée",2,0))
        self.assertEqual(self.stock(),0)
    def test_pending_cannot_be_cancelled_edited_or_deleted(self):
        self.mark()
        for query in ["UPDATE route_stops SET status='Annulé'", "UPDATE route_stops SET quantity=3", "UPDATE route_stops SET product_id='another'", "DELETE FROM route_stops", "DELETE FROM routes"]:
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(query)
        self.assertEqual(self.stock(), 0)
    def test_completed_can_be_deleted_without_duplicate_stock_credit(self):
        self.mark()
        self.validate(0,2)
        self.db.execute("DELETE FROM route_stops")
        self.db.execute("DELETE FROM routes")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM return_entries").fetchone()[0],0)
        self.assertEqual(self.validate(0,2),0)
        self.assertEqual(self.stock(),2)
    def test_route_deletion_cleans_lines_and_returns_atomically(self):
        self.mark()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM routes WHERE id='r'")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM route_stops").fetchone()[0],1)
        self.validate(0,2)
        self.db.execute("DELETE FROM routes WHERE id='r'")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM route_stops").fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM return_entries").fetchone()[0],0)
        self.assertEqual(self.stock(),2)
        self.db.execute(statement("syncReturnsSql"))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM return_entries").fetchone()[0],0)

    def test_cleanup_old_orphans_leaves_live_and_pending_returns_unchanged(self):
        import json
        self.mark()
        self.validate(0,2)
        self.db.execute("INSERT INTO return_entries(id,stop_id,route_id,route_number,customer_name,product_id,product_name,team,reason,quantity,received_qty) SELECT 'orphan','deleted-stop','deleted-route',route_number,customer_name,product_id,product_name,team,reason,quantity,received_qty FROM return_entries WHERE id='s'")
        self.db.execute("INSERT INTO return_entries(id,stop_id,route_id,route_number,customer_name,product_id,product_name,team,reason,quantity,received_qty) SELECT 'pending','deleted-stop2','deleted-route',route_number,customer_name,product_id,product_name,team,reason,quantity,0 FROM return_entries WHERE id='s'")
        before=self.stock()
        self.db.execute(statement("cleanupOrphanReturnsSql"),(json.dumps(['s','orphan','pending']),))
        self.assertEqual(self.db.execute("SELECT changes()").fetchone()[0],1)
        self.assertEqual(self.db.execute("SELECT id FROM return_entries ORDER BY id").fetchall(),[('pending',),('s',)])
        self.assertEqual(self.stock(),before)
        self.db.execute(statement("cleanupOrphanReturnsSql"),(json.dumps(['orphan']),))
        self.assertEqual(self.db.execute("SELECT changes()").fetchone()[0],0)

    def test_legacy_sync_and_direct_creation(self):
        self.db.execute("DROP TRIGGER return_on_status")
        self.mark("Erreur machine")
        self.db.execute(statement("syncReturnsSql"))
        self.db.execute(statement("syncReturnsSql"))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM return_entries").fetchone()[0],1)
        self.assertEqual(self.stock(),0)
        self.db.execute("INSERT INTO route_stops(id,route_id,customer_id,product_id,quantity,status) VALUES('s2','r','c','p',1,'Erreur machine')")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM return_entries").fetchone()[0],2)

    def test_redispatch_before_and_after_physical_return(self):
        self.mark("Client absent / intervention reportée")
        self.mark("En camion")
        self.assertEqual(self.stock(),0)
        self.assertIsNotNone(self.db.execute("SELECT cancelled_at FROM return_entries").fetchone()[0])
        self.assertEqual(self.validate(0,1),0)
        self.mark("Erreur machine")
        self.assertEqual(self.validate(0,1),1)
        self.assertEqual(self.stock(),1)
        self.mark("En camion")
        self.assertEqual(self.stock(),0)
        self.mark("Refus d’installation")
        self.assertEqual(self.db.execute("SELECT received_qty FROM return_entries").fetchone()[0],0)
        # A validation prepared for an earlier return cycle must not credit stock.
        self.db.execute(statement("validateReturnSql"),(1,"now","user","now","s",0,1,1,0))
        self.assertEqual(self.db.execute("SELECT changes()").fetchone()[0],0)
        self.assertEqual(self.stock(),0)
        self.assertEqual(self.validate(0,2),1)
        self.mark("Livré / posé")
        self.assertEqual(self.stock(),0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM audit_log WHERE action='Retour clos — marchandise réaffectée'").fetchone()[0],3)

    def test_group_receipt_is_atomic_and_retry_safe(self):
        import json
        self.db.execute("INSERT INTO products(id,activity,brand,model) VALUES('p2','PV','Solar','Panel')")
        self.db.execute("INSERT INTO route_stops(id,route_id,customer_id,product_id,quantity,status) VALUES('s2','r','c','p2',3,'Erreur machine')")
        self.mark()
        lines=[{"id":"s","quantity":1,"expectedReceived":0,"revision":0},{"id":"s2","quantity":2,"expectedReceived":0,"revision":0}]
        def validate(lines):
            self.db.execute(statement("validateReturnGroupSql"),(json.dumps(lines),"now","user","now","r","c"))
            return self.db.execute("SELECT changes()").fetchone()[0]
        invalid=[{**lines[0]},{**lines[1],"quantity":4}]
        self.assertEqual(validate(invalid),0)
        self.assertEqual(self.db.execute("SELECT SUM(received_qty) FROM return_entries").fetchone()[0],0)
        self.assertEqual(validate(lines),2)
        self.assertEqual(self.db.execute("SELECT SUM(received_qty) FROM return_entries").fetchone()[0],3)
        self.assertEqual(validate(lines),0)
        stale=[{**lines[0],"expectedReceived":1},{**lines[1],"expectedReceived":0,"quantity":1}]
        self.assertEqual(validate(stale),0)
        self.assertEqual(self.db.execute("SELECT SUM(received_qty) FROM return_entries").fetchone()[0],3)

    def test_same_client_can_have_multiple_products_only_in_same_route(self):
        self.db.execute("INSERT INTO products(id,activity,brand,model) VALUES('p2','PV','Solar','Panel')")
        self.db.execute("UPDATE route_stops SET route_date='2026-09-17' WHERE id='s'")
        self.db.execute("INSERT INTO route_stops(id,route_id,route_date,customer_id,product_id,quantity,status) VALUES('s2','r','2026-09-17','c','p2',3,'En camion')")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM route_stops WHERE customer_id='c' AND route_id='r'").fetchone()[0],2)
        self.db.execute("INSERT INTO routes(id,number,date,truck,driver) VALUES('r2','BS-2','2026-09-17','Truck 2','Driver 2')")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "CUSTOMER_ROUTE_DATE_CONFLICT"):
            self.db.execute("INSERT INTO route_stops(id,route_id,route_date,customer_id,product_id,quantity,status) VALUES('s3','r2','2026-09-17','c','p','1','En camion')")

if __name__ == "__main__":
    unittest.main()
