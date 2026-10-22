import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getAppAccess } from "@/app/admin-auth";
import { getDb } from "@/db";
import { appUsers, auditLog } from "@/db/schema";

export const dynamic="force-dynamic";
const normalizeEmail=(value:unknown)=>String(value??"").trim().toLocaleLowerCase("fr-FR");

export async function GET(){
 const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Non authentifié"},{status:401});
 const access=await getAppAccess(user);if(!access.isAdmin)return NextResponse.json({error:"Action réservée à l’administrateur"},{status:403});
 const rows=await getDb().select().from(appUsers).orderBy(desc(appUsers.createdAt));
 return NextResponse.json({rows});
}

export async function POST(req:NextRequest){
 const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Non authentifié"},{status:401});
 const access=await getAppAccess(user);if(!access.isAdmin)return NextResponse.json({error:"Action réservée à l’administrateur"},{status:403});
 const body=await req.json() as {action?:string;id?:string;email?:string;role?:string;scopeName?:string};
 const db=getDb();
 if(body.action==="delete"){
  if(!body.id)return NextResponse.json({error:"Utilisateur absent"},{status:400});
  await db.delete(appUsers).where(eq(appUsers.id,body.id));
  await db.insert(auditLog).values({id:crypto.randomUUID(),actorId:user.userId,actorEmail:user.email,action:"delete",entityType:"access_user",entityId:body.id,detailsJson:"{}"});
  return NextResponse.json({ok:true});
 }
 const email=normalizeEmail(body.email),role=String(body.role||""),scopeName=String(body.scopeName||"").trim();
 if(!/^\S+@\S+\.\S+$/.test(email))return NextResponse.json({error:"Adresse e-mail invalide"},{status:400});
 if(!["depot","telepro","regie"].includes(role))return NextResponse.json({error:"Rôle invalide"},{status:400});
 if((role==="telepro"||role==="regie")&&!scopeName)return NextResponse.json({error:"Indiquez le nom du télépro ou de la régie"},{status:400});
 const id=crypto.randomUUID(),now=new Date().toISOString();
 await db.insert(appUsers).values({id,email,role,scopeName:role==="depot"?null:scopeName,active:true}).onConflictDoUpdate({target:appUsers.email,set:{role,scopeName:role==="depot"?null:scopeName,active:true,updatedAt:now}});
 await db.insert(auditLog).values({id:crypto.randomUUID(),actorId:user.userId,actorEmail:user.email,action:"save",entityType:"access_user",entityId:id,detailsJson:JSON.stringify({email,role,scopeName})});
 return NextResponse.json({ok:true});
}
