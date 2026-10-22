import { expandPackLines, isConsumablePack, PackError } from "@/lib/consumable-pack";
import { NextRequest, NextResponse } from "next/server";
import { normalizeSav, validateCustomer, savStatuses } from "@/lib/depot-domain";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getAppAccess } from "@/app/admin-auth";
import { getDb } from "@/db";
import { products, installers, customers, receipts, routes, routeStops, documents, auditLog, returnEntries, sequenceCounters } from "@/db/schema";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
const uid=()=>crypto.randomUUID();
const allowed = { product:products, installer:installers, customer:customers, receipt:receipts, route:routes, stop:routeStops } as const;
const normalizeCustomerName=(value:any)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr-FR").replace(/\s+/g," ").trim();
async function nextCustomerNumber(db:any){
  await db.insert(sequenceCounters).values({name:"customer",value:0}).onConflictDoNothing();
  const [sequence]=await db.update(sequenceCounters).set({value:sql`${sequenceCounters.value}+1`}).where(eq(sequenceCounters.name,"customer")).returning({value:sequenceCounters.value});
  return `FLC-${String(sequence.value).padStart(6,"0")}`;
}
async function resolveStopCustomer(db:any,data:any,allowCreate:boolean){
  const typed=String(data.customerName||"").trim();delete data.customerName;
  const newCustomer=Object.fromEntries(["firstName","lastName","phone","address","postalCode","city"].map(key=>{const field="new"+key[0].toUpperCase()+key.slice(1),value=data[field];delete data[field];return [key,value]}));
  if(data.customerId)return null;
  if(!typed)return "Saisissez le nom du client.";
  const needle=normalizeCustomerName(typed),rows=await db.select({id:customers.id,firstName:customers.firstName,lastName:customers.lastName,number:customers.number}).from(customers).where(eq(customers.archived,false));
  const matches=rows.filter((row:any)=>{const first=normalizeCustomerName(row.firstName),last=normalizeCustomerName(row.lastName),number=normalizeCustomerName(row.number);return needle===normalizeCustomerName(`${first} ${last}`)||needle===normalizeCustomerName(`${last} ${first}`)||needle===last||needle===number});
  if(matches.length>1)return "Plusieurs clients portent ce nom. Saisissez le prénom et le nom complets, ou le numéro client.";
  if(matches.length===1){data.customerId=matches[0].id;return null;}
  if(!allowCreate)return "Ce nom ne correspond à aucun client. Créez d’abord sa fiche ou choisissez un nom proposé.";
  const validation=validateCustomer(newCustomer);if(validation)return validation;
  const id=uid();
  await db.insert(customers).values({id,number:await nextCustomerNumber(db),...newCustomer});
  data.customerId=id;return null;
}
async function duplicateCustomer(db:any,data:any,excludeId?:string,dateOverride?:string){
  if(!data.routeId||!data.customerId||data.status==="Annulé") return null;
  const [target]=dateOverride?[{date:dateOverride}]:await db.select({date:routes.date}).from(routes).where(eq(routes.id,data.routeId));
  if(!target?.date) return null;
  const conditions=[eq(routeStops.customerId,data.customerId),eq(routes.date,target.date),ne(routeStops.status,"Annulé"),ne(routeStops.routeId,data.routeId)];
  if(excludeId) conditions.push(ne(routeStops.id,excludeId));
  const [existing]=await db.select({number:routes.number}).from(routeStops).innerJoin(routes,eq(routeStops.routeId,routes.id)).where(and(...conditions)).limit(1);
  return existing||null;
}
async function assignCustomerPoseur(db:any,customerId?:string,routeId?:string){
  if(!customerId||!routeId)return;
  const [route]=await db.select({installerId:routes.installerId,teamId:routes.teamId}).from(routes).where(eq(routes.id,routeId));
  if(route?.installerId)await db.update(customers).set({assignedInstallerId:route.installerId,assignedTeamId:route.teamId,updatedAt:new Date().toISOString()}).where(eq(customers.id,customerId));
}

export async function POST(req:NextRequest){
  const user=await getChatGPTUser(); if(!user) return NextResponse.json({error:"Non authentifié"},{status:401});
  try{
    const body=await req.json() as any; const {kind,action}=body as {kind:keyof typeof allowed,action:string};
    const table=allowed[kind]; if(!table) return NextResponse.json({error:"Type inconnu"},{status:400});
    const db=getDb(),access=await getAppAccess(user); let entityId=body.id || uid(); let deletedStop:any=null;
    if(access.role==="denied")return NextResponse.json({error:"Accès non autorisé."},{status:403});
    if(access.external&&kind!=="customer")return NextResponse.json({error:"Votre accès est limité aux fiches de vos propres clients."},{status:403});
    if(action==="delete"&&(kind==="route"||kind==="stop")){
      const returns=await db.select().from(returnEntries).where(kind==="route"?eq(returnEntries.routeId,entityId):eq(returnEntries.stopId,entityId));
      if(returns.some(r=>!r.cancelledAt&&r.receivedQty<r.quantity))return NextResponse.json({error:"Retour en attente : validez la réception physique avant de supprimer ce bon ou ce client."},{status:409});
    }
    if(action==="delete"&&kind==="stop"){
      [deletedStop]=await db.select().from(routeStops).where(eq(routeStops.id,entityId));
      if(!deletedStop)return NextResponse.json({error:"Ligne déjà supprimée."},{status:404});
    }
    if(action==="setSav"){
      if(kind!=="customer"||access.external)return NextResponse.json({error:"Action réservée au suivi SAV du dépôt."},{status:403});
      const status=normalizeSav(body.status);
      if(!savStatuses.includes(status))return NextResponse.json({error:"Statut SAV invalide."},{status:400});
      const [current]=await db.select().from(customers).where(eq(customers.id,entityId));
      if(!current)return NextResponse.json({error:"Client introuvable."},{status:404});
      const now=new Date().toISOString();
      await db.batch([
        db.update(customers).set({status,updatedAt:now}).where(eq(customers.id,entityId)),
        db.update(routeStops).set({savStatus:status,updatedAt:now}).where(and(eq(routeStops.customerId,entityId),ne(routeStops.savStatus,"Aucun"),ne(routeStops.savStatus,"SAV traité"))),
        db.insert(auditLog).values({id:uid(),actorId:user.userId,actorEmail:user.email,action:"Statut SAV modifié",entityType:"customer",entityId,detailsJson:JSON.stringify({previousStatus:current.status,status})})
      ]);
      return NextResponse.json({ok:true,id:entityId});
    }
    if(action==="deleteMany"){
      if(kind!=="customer")return NextResponse.json({error:"Suppression groupée non disponible pour ce type."},{status:400});
      const rawIds:unknown[]=Array.isArray(body.ids)?body.ids:[];
      const ids:string[]=Array.from(new Set<string>(rawIds.map(id=>String(id)).filter(Boolean))).slice(0,500);
      if(!ids.length)return NextResponse.json({error:"Aucun client sélectionné."},{status:400});
      const attached=await db.select().from(documents).where(and(eq(documents.entityType,"customer"),inArray(documents.entityId,ids)));
      await db.batch([db.delete(documents).where(and(eq(documents.entityType,"customer"),inArray(documents.entityId,ids))),db.delete(customers).where(inArray(customers.id,ids)),db.insert(auditLog).values({id:uid(),actorId:user.userId,actorEmail:user.email,action:"deleteMany",entityType:"customer",entityId:null,detailsJson:JSON.stringify({ids,count:ids.length})})]);
      if(env.BUCKET)await Promise.all(attached.map(doc=>env.BUCKET!.delete(doc.objectKey)));
      return NextResponse.json({ok:true,deleted:ids.length});
    }else if(action==="create"){
      let data:any={...body.data,id:entityId};
      if(kind==="installer"){ data.teamsJson=JSON.stringify(data.teams||[]); delete data.teams; }
      if(kind==="customer"){
        const validation=validateCustomer(data);if(validation)return NextResponse.json({error:validation},{status:400});
        delete data.number;
        if(access.external){
          if(!access.scopeName)return NextResponse.json({error:"Périmètre d’accès non configuré."},{status:403});
          delete data.telepro; delete data.regie;
          if(access.role==="telepro")data.telepro=access.scopeName;
          if(access.role==="regie")data.regie=access.scopeName;
        }
        data.number=await nextCustomerNumber(db);
      }
      if(kind==="route"&&!data.number){
        const existingNumbers=await db.select({number:routes.number}).from(routes);
        const next=Math.max(0,...existingNumbers.map(row=>Number(String(row.number).match(/(\d+)$/)?.[1]||0)))+1;
        data.number=`BS-${String(next).padStart(5,"0")}`;
      }
      if(kind==="stop"){
        const usesProductLines=Object.prototype.hasOwnProperty.call(data,"products");
        let rawLines=Array.isArray(data.products)?data.products:[];
        if(usesProductLines&&!rawLines.length)return NextResponse.json({error:"Ajoutez au moins un produit avec une quantité valide."},{status:400});
        if(rawLines.length){
          const valid=rawLines.every((line:any)=>String(line.productId||"")&&Number.isInteger(Number(line.quantity))&&Number(line.quantity)>0);
          if(!valid)return NextResponse.json({error:"Ajoutez au moins un produit avec une quantité valide."},{status:400});
          if(new Set(rawLines.map((line:any)=>String(line.productId))).size!==rawLines.length)return NextResponse.json({error:"Un même produit ne peut apparaître qu’une fois pour ce client."},{status:400});
        }
        rawLines=expandPackLines((usesProductLines?rawLines:[{productId:data.productId,quantity:data.quantity??1}]).map((line:any)=>({productId:String(line.productId||""),quantity:Number(line.quantity)})),await db.select().from(products));
        const customerError=await resolveStopCustomer(db,data,true);
        if(customerError)return NextResponse.json({error:customerError},{status:409});
        const duplicate=await duplicateCustomer(db,data);
        if(duplicate)return NextResponse.json({error:`Ce client est déjà affecté au bon ${duplicate.number} pour cette date.`},{status:409});
        const [target]=await db.select({date:routes.date}).from(routes).where(eq(routes.id,data.routeId));
        data.routeDate=target?.date||null;
        if(rawLines.length){
          const lines=rawLines.map((line:any)=>({productId:String(line.productId||""),quantity:Number(line.quantity)})).filter((line:any)=>line.productId&&Number.isInteger(line.quantity)&&line.quantity>0);
          if(!lines.length||lines.length!==rawLines.length)return NextResponse.json({error:"Ajoutez au moins un produit avec une quantité valide."},{status:400});
          if(new Set(lines.map((line:any)=>line.productId)).size!==lines.length)return NextResponse.json({error:"Un même produit ne peut apparaître qu’une fois pour ce client."},{status:400});
          delete data.products;
          const values=lines.map((line:any,index:number)=>({...data,id:index===0?entityId:uid(),productId:line.productId,quantity:line.quantity}));
          await db.insert(routeStops).values(values);
          if(data.status!=="Annulé")await assignCustomerPoseur(db,data.customerId,data.routeId);
          await db.insert(auditLog).values({id:uid(),actorId:user.userId,actorEmail:user.email,action,entityType:kind,entityId,detailsJson:JSON.stringify({...body.data,products:lines})});
          return NextResponse.json({ok:true,id:entityId,created:values.length});
        }
      }
      if(kind==="receipt"||kind==="route") data.createdBy=user.userId;
      await db.insert(table as any).values(data);
      if(kind==="stop"&&data.status!=="Annulé")await assignCustomerPoseur(db,data.customerId,data.routeId);
    } else if(action==="delete"){
      if(kind==="route"){
        const attached=await db.select().from(documents).where(and(eq(documents.entityType,"route"),eq(documents.entityId,entityId)));
        await db.batch([db.delete(documents).where(and(eq(documents.entityType,"route"),eq(documents.entityId,entityId))),db.delete(routeStops).where(eq(routeStops.routeId,entityId)),db.delete(routes).where(eq(routes.id,entityId))]);
        if(env.BUCKET)await Promise.all(attached.map(doc=>env.BUCKET!.delete(doc.objectKey)));
      }else if(kind==="receipt"&&body.groupId){
        const groupId=String(body.groupId),groupLines=await db.select({id:receipts.id}).from(receipts).where(or(eq(receipts.groupId,groupId),and(isNull(receipts.groupId),eq(receipts.id,groupId)))),entityIds=[groupId,...groupLines.map(row=>row.id)];
        const attached=await db.select().from(documents).where(and(eq(documents.entityType,"receipt"),inArray(documents.entityId,entityIds)));
        if(env.BUCKET)await Promise.all(attached.map(doc=>env.BUCKET!.delete(doc.objectKey)));
        await db.delete(documents).where(and(eq(documents.entityType,"receipt"),inArray(documents.entityId,entityIds)));
        await db.delete(receipts).where(or(eq(receipts.groupId,groupId),and(isNull(receipts.groupId),eq(receipts.id,groupId))));
        entityId=groupId;
      }else{
        if(kind==="receipt"){
          const attached=await db.select().from(documents).where(and(eq(documents.entityType,"receipt"),eq(documents.entityId,entityId)));
          if(env.BUCKET)await Promise.all(attached.map(doc=>env.BUCKET!.delete(doc.objectKey)));
          await db.delete(documents).where(and(eq(documents.entityType,"receipt"),eq(documents.entityId,entityId)));
        }
        if(kind==="customer"){
          const attached=await db.select().from(documents).where(and(eq(documents.entityType,"customer"),eq(documents.entityId,entityId)));
          if(env.BUCKET)await Promise.all(attached.map(doc=>env.BUCKET!.delete(doc.objectKey)));
          await db.delete(documents).where(and(eq(documents.entityType,"customer"),eq(documents.entityId,entityId)));
        }
        await db.delete(table as any).where(eq((table as any).id,entityId));
      }
    } else if(action==="update"||action==="archive"){
      let data:any=action==="archive"?{archived:!!body.archived}:{...body.data};
      if(kind==="customer"&&access.external){
        const [current]=await db.select().from(customers).where(eq(customers.id,entityId)).limit(1);
        const owns=access.role==="telepro"?current?.telepro===access.scopeName:current?.regie===access.scopeName;
        if(!owns)return NextResponse.json({error:"Cette fiche client ne fait pas partie de votre périmètre."},{status:403});
        data.telepro=current.telepro;data.regie=current.regie;delete data.archived;
      }
      if(kind==="customer"&&action==="update"){
        const [current]=await db.select().from(customers).where(eq(customers.id,entityId));
        if(!current)return NextResponse.json({error:"Client introuvable."},{status:404});
        if(["firstName","lastName","phone","address","postalCode","city"].some(key=>Object.prototype.hasOwnProperty.call(data,key))){
          const validation=validateCustomer({...current,...data});if(validation)return NextResponse.json({error:validation},{status:400});
        }
      }
      if(kind==="installer"&&data.teams){data.teamsJson=JSON.stringify(data.teams);delete data.teams;}
      if(kind==="stop"&&action==="update"){
        const [current]=await db.select().from(routeStops).where(eq(routeStops.id,entityId));
        if(!current)return NextResponse.json({error:"Ligne introuvable."},{status:404});
        if(Object.prototype.hasOwnProperty.call(data,"customerName")||Object.prototype.hasOwnProperty.call(data,"customerId")){
          const customerError=await resolveStopCustomer(db,data,false);
          if(customerError)return NextResponse.json({error:customerError},{status:409});
        }
        if(data.savStatus&&data.savStatus!=="Aucun")data.savStatus=normalizeSav(data.savStatus);
        const candidate={...current,...data},duplicate=await duplicateCustomer(db,candidate,entityId);
        if(duplicate)return NextResponse.json({error:`Ce client est déjà affecté au bon ${duplicate.number} pour cette date.`},{status:409});
        const [target]=await db.select({date:routes.date}).from(routes).where(eq(routes.id,candidate.routeId));
        data.routeDate=target?.date||null;
        if(Object.prototype.hasOwnProperty.call(data,"quantity")||Object.prototype.hasOwnProperty.call(data,"productId")){
          const catalogue=await db.select().from(products);
          const lines=expandPackLines([{productId:candidate.productId,quantity:Number(candidate.quantity)}],catalogue);
          if(isConsumablePack(catalogue.find(p=>p.id===candidate.productId))){
            const now=new Date().toISOString(),base={...candidate,routeDate:data.routeDate,updatedAt:now};
            await db.batch([
              db.update(routeStops).set({...data,...lines[0],updatedAt:now}).where(eq(routeStops.id,entityId)),
              db.insert(routeStops).values(lines.slice(1).map(line=>({...base,...line,id:uid()}))),
              db.insert(auditLog).values({id:uid(),actorId:user.userId,actorEmail:user.email,action:"Pack détaillé en composants",entityType:kind,entityId,detailsJson:JSON.stringify({previous:current,lines})})
            ]);
            if(candidate.status!=="Annulé")await assignCustomerPoseur(db,candidate.customerId,candidate.routeId);
            return NextResponse.json({ok:true,id:entityId,created:lines.length});
          }
        }
      }
      if(kind==="route"&&action==="update"&&data.date){
        const assigned=await db.select().from(routeStops).where(and(eq(routeStops.routeId,entityId),ne(routeStops.status,"Annulé")));
        for(const stop of assigned){
          const duplicate=await duplicateCustomer(db,stop,stop.id,data.date);
          if(duplicate)return NextResponse.json({error:`La date ne peut pas être modifiée : un client de ce bon est déjà affecté au bon ${duplicate.number} ce jour-là.`},{status:409});
        }
      }
      data.updatedAt=new Date().toISOString();
      if(kind==="stop"&&data.savStatus&&data.savStatus!=="Aucun"){
        const [stop]=await db.select().from(routeStops).where(eq(routeStops.id,entityId));
        await db.batch([db.update(routeStops).set(data).where(eq(routeStops.id,entityId)),db.update(customers).set({status:data.savStatus,updatedAt:data.updatedAt}).where(eq(customers.id,data.customerId||stop.customerId))]);
      }else await db.update(table as any).set(data).where(eq((table as any).id,entityId));
      if(kind==="stop"){
        const [saved]=await db.select().from(routeStops).where(eq(routeStops.id,entityId));
        if(saved&&saved.status!=="Annulé")await assignCustomerPoseur(db,saved.customerId,saved.routeId);
      }
      if(kind==="route"&&action==="update"&&data.date)await db.update(routeStops).set({routeDate:data.date,updatedAt:new Date().toISOString()}).where(eq(routeStops.routeId,entityId));
      if(kind==="route"&&action==="update"&&(data.installerId||data.teamId)){
        const assigned=await db.select({customerId:routeStops.customerId,status:routeStops.status}).from(routeStops).where(eq(routeStops.routeId,entityId));
        for(const stop of assigned)if(stop.status!=="Annulé")await assignCustomerPoseur(db,stop.customerId,entityId);
      }
    } else return NextResponse.json({error:"Action inconnue"},{status:400});
    await db.insert(auditLog).values({id:uid(),actorId:user.userId,actorEmail:user.email,action,entityType:kind,entityId,detailsJson:JSON.stringify(deletedStop||body.data||{})});
    return NextResponse.json({ok:true,id:entityId});
  }catch(error){if(error instanceof PackError)return NextResponse.json({error:error.message},{status:400});console.error(error);if(String(error).includes("RETURN_LOCKED"))return NextResponse.json({error:"Un bon de retour existe pour cette ligne : son client, son produit et sa quantité restent liés au retour. Vous pouvez corriger le statut ou remettre la marchandise en camion."},{status:409});if(String(error).includes("RETURN_PENDING"))return NextResponse.json({error:"La marchandise est encore dehors : validez son retour physique avant suppression."},{status:409});if(String(error).includes("CUSTOMER_ROUTE_DATE_CONFLICT")||String(error).includes("uniq_stops_customer_route_date_active"))return NextResponse.json({error:"Ce client vient d’être affecté à un autre bon de sortie pour cette date."},{status:409});return NextResponse.json({error:"Enregistrement impossible. Vérifiez les champs puis réessayez."},{status:400});}
}
