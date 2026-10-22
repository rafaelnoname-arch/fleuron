import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canAccessCustomer, getAppAccess } from "@/app/admin-auth";
import { getDb } from "@/db";
import { documents, auditLog } from "@/db/schema";

export const dynamic="force-dynamic";
const categories:Record<string,string[]>={receipt:["BL de commande","BL transporteur","Facture"],installer:["Attestation URSSAF","Attestation fiscale","Décennale","Certification RGE","BL sortie consommables","Autre"],route:["Bon signé","BL sortie consommables","Autre"],product:["Fiche technique","Photo","Autre"],customer:["Pièce client","Pièce poseur","Photo","Autre"]};
export async function POST(req:NextRequest){
  const user=await getChatGPTUser(); if(!user)return NextResponse.json({error:"Non authentifié"},{status:401});
  try{
    const form=await req.formData(); const file=form.get("file"); if(!(file instanceof File)||file.size>15_000_000)return NextResponse.json({error:"Fichier absent ou supérieur à 15 Mo"},{status:400});
    const id=crypto.randomUUID(), entityType=String(form.get("entityType")||""),entityId=String(form.get("entityId")||""),category=String(form.get("category")||"Pièce jointe");
    if(!entityId||!categories[entityType]?.includes(category))return NextResponse.json({error:"Le type de document sélectionné n’est pas autorisé pour cette rubrique."},{status:400});
    const access=await getAppAccess(user);
    if(access.role==="denied")return NextResponse.json({error:"Accès non autorisé"},{status:403});
    if(access.external&&(entityType!=="customer"||!await canAccessCustomer(access,entityId)))return NextResponse.json({error:"Vous ne pouvez ajouter des documents qu’à vos propres clients."},{status:403});
    const objectKey=`${entityType}/${entityId}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
    await env.BUCKET!.put(objectKey,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||"application/octet-stream"}});
    const db=getDb(); await db.insert(documents).values({id,entityType,entityId,category,filename:file.name,contentType:file.type||"application/octet-stream",objectKey,uploadedBy:user.userId});
    await db.insert(auditLog).values({id:crypto.randomUUID(),actorId:user.userId,actorEmail:user.email,action:"upload",entityType,entityId,detailsJson:JSON.stringify({filename:file.name,category})});
    return NextResponse.json({ok:true,id});
  }catch(error){console.error(error);return NextResponse.json({error:"Téléversement impossible"},{status:500});}
}
