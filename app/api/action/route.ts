import { NextRequest, NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { products, installers, customers, receipts, routes, routeStops, auditLog } from "@/db/schema";
import { and, count, eq, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";
const uid=()=>crypto.randomUUID();
const allowed = { product:products, installer:installers, customer:customers, receipt:receipts, route:routes, stop:routeStops } as const;
async function duplicateCustomer(db:any,data:any,excludeId?:string,dateOverride?:string){
  if(!data.routeId||!data.customerId||data.status==="Annulé") return null;
  const [target]=dateOverride?[{date:dateOverride}]:await db.select({date:routes.date}).from(routes).where(eq(routes.id,data.routeId));
  if(!target?.date) return null;
  const conditions=[eq(routeStops.customerId,data.customerId),eq(routes.date,target.date),ne(routeStops.status,"Annulé")];
  if(excludeId) conditions.push(ne(routeStops.id,excludeId));
  const [existing]=await db.select({number:routes.number}).from(routeStops).innerJoin(routes,eq(routeStops.routeId,routes.id)).where(and(...conditions)).limit(1);
  return existing||null;
}

export async function POST(req:NextRequest){
  const user=await getChatGPTUser(); if(!user) return NextResponse.json({error:"Non authentifié"},{status:401});
  try{
    const body=await req.json(); const {kind,action}=body as {kind:keyof typeof allowed,action:string};
    const table=allowed[kind]; if(!table) return NextResponse.json({error:"Type inconnu"},{status:400});
    const db=getDb(); let entityId=body.id || uid();
    if(action==="create"){
      let data:any={...body.data,id:entityId};
      if(kind==="installer"){ data.teamsJson=JSON.stringify(data.teams||[]); delete data.teams; }
      if(kind==="route"&&!data.number){
        const [result]=await db.select({value:count()}).from(routes);
        data.number=`BS-${String(Number(result?.value||0)+1).padStart(5,"0")}`;
      }
      if(kind==="stop"){
        const duplicate=await duplicateCustomer(db,data);
        if(duplicate)return NextResponse.json({error:`Ce client est déjà affecté au bon ${duplicate.number} pour cette date.`},{status:409});
        const [target]=await db.select({date:routes.date}).from(routes).where(eq(routes.id,data.routeId));
        data.routeDate=target?.date||null;
      }
      if(kind==="receipt"||kind==="route") data.createdBy=user.userId;
      await db.insert(table as any).values(data);
    } else if(action==="update"||action==="archive"){
      let data:any=action==="archive"?{archived:!!body.archived}:{...body.data};
      if(kind==="installer"&&data.teams){data.teamsJson=JSON.stringify(data.teams);delete data.teams;}
      if(kind==="stop"&&action==="update"){
        const [current]=await db.select().from(routeStops).where(eq(routeStops.id,entityId));
        const candidate={...current,...data},duplicate=await duplicateCustomer(db,candidate,entityId);
        if(duplicate)return NextResponse.json({error:`Ce client est déjà affecté au bon ${duplicate.number} pour cette date.`},{status:409});
        const [target]=await db.select({date:routes.date}).from(routes).where(eq(routes.id,candidate.routeId));
        data.routeDate=target?.date||null;
      }
      if(kind==="route"&&action==="update"&&data.date){
        const assigned=await db.select().from(routeStops).where(and(eq(routeStops.routeId,entityId),ne(routeStops.status,"Annulé")));
        for(const stop of assigned){
          const duplicate=await duplicateCustomer(db,stop,stop.id,data.date);
          if(duplicate)return NextResponse.json({error:`La date ne peut pas être modifiée : un client de ce bon est déjà affecté au bon ${duplicate.number} ce jour-là.`},{status:409});
        }
      }
      data.updatedAt=new Date().toISOString(); await db.update(table as any).set(data).where(eq((table as any).id,entityId));
      if(kind==="route"&&action==="update"&&data.date)await db.update(routeStops).set({routeDate:data.date,updatedAt:new Date().toISOString()}).where(eq(routeStops.routeId,entityId));
    } else return NextResponse.json({error:"Action inconnue"},{status:400});
    await db.insert(auditLog).values({id:uid(),actorId:user.userId,actorEmail:user.email,action,entityType:kind,entityId,detailsJson:JSON.stringify(body.data||{})});
    return NextResponse.json({ok:true,id:entityId});
  }catch(error){console.error(error);if(String(error).includes("uniq_stops_customer_route_date_active"))return NextResponse.json({error:"Ce client vient d’être affecté à un autre bon de sortie pour cette date."},{status:409});return NextResponse.json({error:"Enregistrement impossible. Vérifiez les champs puis réessayez."},{status:400});}
}
