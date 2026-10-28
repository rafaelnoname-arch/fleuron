import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { documents, auditLog } from "@/db/schema";

export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
  const user=await getChatGPTUser(); if(!user)return NextResponse.json({error:"Non authentifié"},{status:401});
  try{
    const form=await req.formData(); const file=form.get("file"); if(!(file instanceof File)||file.size>15_000_000)return NextResponse.json({error:"Fichier absent ou supérieur à 15 Mo"},{status:400});
    const id=crypto.randomUUID(), entityType=String(form.get("entityType")||""),entityId=String(form.get("entityId")||""),category=String(form.get("category")||"Pièce jointe");
    const objectKey=`${entityType}/${entityId}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
    await env.BUCKET.put(objectKey,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||"application/octet-stream"}});
    const db=getDb(); await db.insert(documents).values({id,entityType,entityId,category,filename:file.name,contentType:file.type||"application/octet-stream",objectKey,uploadedBy:user.userId});
    await db.insert(auditLog).values({id:crypto.randomUUID(),actorId:user.userId,actorEmail:user.email,action:"upload",entityType,entityId,detailsJson:JSON.stringify({filename:file.name,category})});
    return NextResponse.json({ok:true,id});
  }catch(error){console.error(error);return NextResponse.json({error:"Téléversement impossible"},{status:500});}
}
