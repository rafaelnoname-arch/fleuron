import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getAppAccess } from "@/app/admin-auth";
import { getDb } from "@/db";
import { auditLog, documents, receipts } from "@/db/schema";

export const dynamic = "force-dynamic";

type ReceiptLine = { id?: string; productId?: string; announcedQty?: number; countedQty?: number; unitPrice?: number };
const text = (value: unknown) => String(value ?? "").trim();

export async function POST(req: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const access=await getAppAccess(user);if(access.role==="denied"||access.external)return NextResponse.json({error:"Accès réservé à l’équipe dépôt"},{status:403});
  try {
    const body = await req.json() as {
      groupId?: string; blNumber?: string; date?: string; supplier?: string; carrier?: string;
      dueDate?: string; paymentStatus?: string; lines?: ReceiptLine[];
    };
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!text(body.date) || !text(body.supplier)) return NextResponse.json({ error: "La date et le fournisseur sont obligatoires." }, { status: 400 });
    if (!lines.length) return NextResponse.json({ error: "Ajoutez au moins un produit au BL." }, { status: 400 });
    if (lines.length > 100) return NextResponse.json({ error: "Un BL ne peut pas dépasser 100 lignes." }, { status: 400 });
    const productIds = lines.map(line => text(line.productId));
    if (productIds.some(id => !id)) return NextResponse.json({ error: "Chaque ligne doit avoir un produit." }, { status: 400 });
    if (new Set(productIds).size !== productIds.length) return NextResponse.json({ error: "Un même produit ne peut apparaître qu’une fois dans le BL." }, { status: 400 });
    for (const line of lines) {
      if (![line.announcedQty, line.countedQty, line.unitPrice].every(value => Number.isFinite(Number(value)) && Number(value) >= 0)) {
        return NextResponse.json({ error: "Les quantités et prix doivent être des nombres positifs." }, { status: 400 });
      }
    }

    const db = getDb();
    const groupId = text(body.groupId) || crypto.randomUUID();
    const existing = body.groupId
      ? await db.select().from(receipts).where(or(eq(receipts.groupId, groupId), and(isNull(receipts.groupId), eq(receipts.id, groupId))))
      : [];
    if (body.groupId && !existing.length) return NextResponse.json({ error: "Ce BL n’existe plus." }, { status: 404 });
    const existingIds = new Set(existing.map(row => row.id));
    const keptIds = new Set(lines.map(line => text(line.id)).filter(id => existingIds.has(id)));
    const removedIds = existing.filter(row => !keptIds.has(row.id)).map(row => row.id);
    const now = new Date().toISOString();
    const header = {
      groupId, blNumber: text(body.blNumber) || null, date: text(body.date), supplier: text(body.supplier),
      carrier: text(body.carrier) || null, dueDate: text(body.dueDate) || null,
      paymentStatus: body.paymentStatus === "Payé" ? "Payé" : "À payer", updatedAt: now,
    };
    const statements: any[] = [];
    if (removedIds.length) {
      const attached = await db.select().from(documents).where(and(eq(documents.entityType, "receipt"), inArray(documents.entityId, removedIds)));
      if (env.BUCKET) await Promise.all(attached.map(doc => env.BUCKET!.delete(doc.objectKey)));
      statements.push(db.delete(documents).where(and(eq(documents.entityType, "receipt"), inArray(documents.entityId, removedIds))));
      statements.push(db.delete(receipts).where(inArray(receipts.id, removedIds)));
    }
    for (const line of lines) {
      const lineData = {
        ...header, productId: text(line.productId), announcedQty: Number(line.announcedQty),
        countedQty: Number(line.countedQty), unitPrice: Number(line.unitPrice),
      };
      if (line.id && existingIds.has(line.id)) statements.push(db.update(receipts).set(lineData).where(eq(receipts.id, line.id)));
      else statements.push(db.insert(receipts).values({ id: crypto.randomUUID(), ...lineData, createdBy: user.userId }));
    }
    statements.push(db.insert(auditLog).values({
      id: crypto.randomUUID(), actorId: user.userId, actorEmail: user.email,
      action: body.groupId ? "update" : "create", entityType: "receipt_bl", entityId: groupId,
      detailsJson: JSON.stringify({ blNumber: header.blNumber, supplier: header.supplier, lines: lines.length, removedLines: removedIds.length }),
    }));
    await db.batch(statements as [typeof statements[number], ...typeof statements]);
    return NextResponse.json({ ok: true, groupId });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Le BL n’a pas pu être enregistré." }, { status: 500 });
  }
}
