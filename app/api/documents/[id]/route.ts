import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";
export const dynamic="force-dynamic";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  if(!await getChatGPTUser())return new NextResponse("Non authentifié",{status:401});
  const {id}=await params; const [doc]=await getDb().select().from(documents).where(eq(documents.id,id)); if(!doc)return new NextResponse("Introuvable",{status:404});
  const obj=await env.BUCKET.get(doc.objectKey); if(!obj)return new NextResponse("Introuvable",{status:404});
  const disposition=new URL(req.url).searchParams.get("download")==="1"?"attachment":"inline";
  return new NextResponse(obj.body,{headers:{"Content-Type":doc.contentType,"Content-Disposition":`${disposition}; filename="${doc.filename.replace(/"/g,"")}"`}});
}
