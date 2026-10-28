import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { products, installers, customers, receipts, routes, routeStops, documents, auditLog } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    const db = getDb();
    const [p,i,c,r,t,s,d,a] = await Promise.all([
      db.select().from(products), db.select().from(installers), db.select().from(customers),
      db.select().from(receipts).orderBy(desc(receipts.date)), db.select().from(routes).orderBy(desc(routes.date)),
      db.select().from(routeStops), db.select().from(documents).orderBy(desc(documents.createdAt)),
      db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(25),
    ]);
    return NextResponse.json({ products:p, installers:i.map(x=>({...x,teams:JSON.parse(x.teamsJson||"[]")})), customers:c, receipts:r, routes:t, stops:s, documents:d, audit:a, user });
  } catch (error) {
    console.error(error); return NextResponse.json({ error:"La base de données est momentanément indisponible." },{status:503});
  }
}
