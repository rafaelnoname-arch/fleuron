import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getAppAccess } from "@/app/admin-auth";
import { getDb } from "@/db";
import { products, installers, customers, receipts, routes, routeStops, documents, auditLog, returnEntries } from "@/db/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    const db = getDb(),access=await getAppAccess(user);
    if(access.role==="denied")return NextResponse.json({error:"Accès non autorisé"},{status:403});
    if(access.external){
      if(!access.scopeName)return NextResponse.json({error:"Périmètre d’accès non configuré"},{status:403});
      const customerWhere=access.role==="telepro"?eq(customers.telepro,access.scopeName):eq(customers.regie,access.scopeName);
      const [p,c]=await Promise.all([db.select().from(products),db.select().from(customers).where(customerWhere)]),customerIds=c.map(x=>x.id);
      const d=customerIds.length?await db.select().from(documents).where(and(eq(documents.entityType,"customer"),inArray(documents.entityId,customerIds))).orderBy(desc(documents.createdAt)):[];
      return NextResponse.json({products:p,installers:[],customers:c,receipts:[],routes:[],stops:[],documents:d,audit:[],returns:[],user,access});
    }
    const [p,i,c,r,t,s,d,a,returns] = await Promise.all([
      db.select().from(products), db.select().from(installers), db.select().from(customers),
      db.select().from(receipts).orderBy(desc(receipts.date)), db.select().from(routes).orderBy(desc(routes.date)),
      db.select().from(routeStops), db.select().from(documents).orderBy(desc(documents.createdAt)),
      db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(25),
      db.select().from(returnEntries).where(isNull(returnEntries.cancelledAt)).orderBy(desc(returnEntries.createdAt)),
    ]);
    return NextResponse.json({ products:p, installers:i.map(x=>({...x,teams:JSON.parse(x.teamsJson||"[]")})), customers:c, receipts:r, routes:t, stops:s, documents:d, audit:a, returns:returns.map(entry=>({...entry,orphaned:!s.some(stop=>stop.id===entry.stopId),customerId:s.find(stop=>stop.id===entry.stopId)?.customerId||`deleted-${entry.customerName}`})), user, access });
  } catch (error) {
    console.error(error); return NextResponse.json({ error:"La base de données est momentanément indisponible." },{status:503});
  }
}
