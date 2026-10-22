import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getAppAccess } from "@/app/admin-auth";
import { syncReturnsSql, validateReturnSql, auditReturnSql, validateReturnGroupSql, auditReturnGroupSql, cleanupOrphanReturnsSql, auditCleanupReturnsSql } from "@/lib/returns-sql";

export const dynamic="force-dynamic";
export async function POST(req:NextRequest) {
 const user=await getChatGPTUser();
 if(!user)return NextResponse.json({error:"Non authentifié"},{status:401});
 const access=await getAppAccess(user);if(access.role==="denied"||access.external)return NextResponse.json({error:"Accès réservé à l’équipe dépôt"},{status:403});
 try {
  const body=await req.json() as {action?:string;ids?:string[];id?:string;expectedReceived?:number;quantity?:number;revision?:number;routeId?:string;customerId?:string;lines?:{id:string;quantity:number;expectedReceived:number;revision:number}[]};
  const db=env.DB;
  if(!db)throw Error("DB unavailable");
  if(body.action==="sync") {
   await db.prepare(syncReturnsSql).run();
   return NextResponse.json({ok:true});
  }
  if(body.action==="cleanupOrphans") {
   const ids=body.ids;
   if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=="string"||!id))return NextResponse.json({error:"Sélection de retours invalide."},{status:400});
   const payload=JSON.stringify([...new Set(ids)]);
   const result=await db.batch([
    db.prepare(cleanupOrphanReturnsSql).bind(payload),
    db.prepare(auditCleanupReturnsSql).bind(crypto.randomUUID(),user.userId,user.email||"",payload)
   ]);
   return NextResponse.json({ok:true,deleted:result[0].meta.changes});
  }
  if(body.action==="validateGroup") {
   const lines=body.lines;
   if(!body.routeId||!body.customerId||!Array.isArray(lines)||!lines.length||lines.length>200||new Set(lines.map(l=>l.id)).size!==lines.length||lines.some(l=>typeof l.id!=="string"||!Number.isSafeInteger(l.quantity)||l.quantity<=0||!Number.isSafeInteger(l.expectedReceived)||l.expectedReceived<0||!Number.isSafeInteger(l.revision)||l.revision<0))
    return NextResponse.json({error:"Vérifiez les quantités réellement reçues."},{status:400});
   const now=new Date().toISOString(),payload=JSON.stringify(lines);
   const result=await db.batch([
    db.prepare(validateReturnGroupSql).bind(payload,now,user.email||user.userId,now,body.routeId,body.customerId),
    db.prepare(auditReturnGroupSql).bind(crypto.randomUUID(),user.userId,user.email||"",body.routeId,JSON.stringify({customerId:body.customerId,lines}))
   ]);
   if(result[0].meta.changes!==lines.length)return NextResponse.json({error:"Le bon a changé. Aucune quantité n’a été validée : actualisez et vérifiez les lignes."},{status:409});
   return NextResponse.json({ok:true});
  }
  if(body.action!=="validate"||typeof body.id!=="string"||!Number.isSafeInteger(body.expectedReceived)||body.expectedReceived!<0||!Number.isSafeInteger(body.quantity)||body.quantity!<=0||!Number.isSafeInteger(body.revision)||body.revision!<0)
   return NextResponse.json({error:"Indiquez une quantité entière positive réellement reçue."},{status:400});
  const total=body.expectedReceived!+body.quantity!,now=new Date().toISOString();
  if(!Number.isSafeInteger(total))return NextResponse.json({error:"Quantité invalide."},{status:400});
  const result=await db.batch([
   db.prepare(validateReturnSql).bind(total,now,user.email||user.userId,now,body.id,body.expectedReceived!,total,total,body.revision!),
   db.prepare(auditReturnSql).bind(crypto.randomUUID(),user.userId,user.email||"",body.id,JSON.stringify({receivedNow:body.quantity,receivedTotal:total}))
  ]);
  if(!result[0].meta.changes)return NextResponse.json({error:"Ce bon a changé ou la quantité dépasse le restant à recevoir. Actualisez avant de valider à nouveau."},{status:409});
  return NextResponse.json({ok:true,receivedQty:total});
 }catch(error){console.error(error);return NextResponse.json({error:"La réception n’a pas pu être validée. Réessayez après actualisation."},{status:503});}
}
