import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getAppAccess } from "@/app/admin-auth";
import { getDb } from "@/db";
import { auditLog, customers } from "@/db/schema";

export const dynamic = "force-dynamic";

type ImportedCustomer = {
  number?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  email?: unknown;
  address?: unknown;
  postalCode?: unknown;
  city?: unknown;
  occupancyStatus?: unknown;
  productType?: unknown;
  taxReferenceIncome?: unknown;
  taxNoticeReference?: unknown;
  taxNumber?: unknown;
  householdSize?: unknown;
  area?: unknown;
  preca?: unknown;
  heatingType?: unknown;
  hotWaterSystem?: unknown;
  boilerLocation?: unknown;
  phase?: unknown;
  delegator?: unknown;
  telepro?: unknown;
  regie?: unknown;
  status?: unknown;
  comment?: unknown;
};

const clean = (value: unknown) => String(value ?? "").trim();
const key = (value: unknown) => clean(value).toLocaleLowerCase("fr-FR").replace(/[\s().+-]/g, "");
const cleanEmail = (value: unknown) => clean(value).toLocaleLowerCase("fr-FR");
const allowedPreca = new Set(["Bleu", "Jaune", "Rose", "Violet", "Non applicable"]);
const allowedPhase = new Set(["Monophasé", "Triphasé"]);
const allowedOccupancy = new Set(["Propriétaire", "Locataire"]);
const allowedHotWater = new Set(["Ballon", "Chaudière"]);
const allowedProductTypes = new Set(["ITE", "PV", "PAC"]);
const allowedStatuses = [
  "Devis à envoyer",
  "Devis envoyé",
  "Devis signé",
  "Installation à programmer",
  "Installation programmée",
  "Installation annulée",
  "Installation en cours",
  "Installation terminée",
  "SAV à programmer",
  "SAV envoyé au poseur",
  "SAV en cours de traitement",
];

export async function POST(req: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const access=await getAppAccess(user);
  if(access.role==="denied"||access.external)return NextResponse.json({error:"Import réservé à l’équipe dépôt."},{status:403});

  try {
    const body = (await req.json()) as { records?: ImportedCustomer[]; duplicateMode?: "skip" | "update" };
    const records = Array.isArray(body.records) ? body.records : [];
    const duplicateMode = body.duplicateMode === "update" ? "update" : "skip";
    if (!records.length) return NextResponse.json({ error: "Le fichier ne contient aucun client." }, { status: 400 });
    if (records.length > 5000) return NextResponse.json({ error: "L’import est limité à 5 000 lignes par fichier." }, { status: 400 });

    const db = getDb();
    const existing = await db.select().from(customers);
    const byNumber = new Map(existing.filter(x => clean(x.number)).map(x => [key(x.number), x]));
    const byEmail = new Map(existing.filter(x => clean(x.email)).map(x => [cleanEmail(x.email), x]));
    const byPhone = new Map(existing.filter(x => clean(x.phone)).map(x => [key(x.phone), x]));
    const inserts: (typeof customers.$inferInsert)[] = [];
    const updates: { id: string; data: Partial<typeof customers.$inferInsert> }[] = [];
    const errors: { line: number; message: string }[] = [];
    let skipped = 0;

    for (let index = 0; index < records.length; index++) {
      const raw = records[index];
      const firstName = clean(raw.firstName);
      const lastName = clean(raw.lastName);
      if (!firstName || !lastName) {
        errors.push({ line: index + 2, message: "Prénom ou nom manquant" });
        continue;
      }

      const number = clean(raw.number);
      const email = cleanEmail(raw.email);
      const phone = clean(raw.phone);
      const matches: (typeof existing)[number][] = [];
      const numberMatch = number ? byNumber.get(key(number)) : undefined;
      const emailMatch = email ? byEmail.get(email) : undefined;
      const phoneMatch = phone ? byPhone.get(key(phone)) : undefined;
      if (numberMatch) matches.push(numberMatch);
      if (emailMatch) matches.push(emailMatch);
      if (phoneMatch) matches.push(phoneMatch);
      const matchIds = new Set(matches.map(x => x.id));
      if (matchIds.size > 1) {
        errors.push({ line: index + 2, message: "Les identifiants correspondent à plusieurs clients existants" });
        continue;
      }

      const areaText = clean(raw.area).replace(",", ".");
      const area = areaText ? Number(areaText) : null;
      if (areaText && (!Number.isFinite(area) || Number(area) < 0)) {
        errors.push({ line: index + 2, message: "Surface habitable invalide" });
        continue;
      }
      const incomeText = clean(raw.taxReferenceIncome).replace(/\s/g, "").replace(",", ".");
      const taxReferenceIncome = incomeText ? Number(incomeText) : null;
      if (incomeText && (!Number.isFinite(taxReferenceIncome) || Number(taxReferenceIncome) < 0)) {
        errors.push({ line: index + 2, message: "Revenu fiscal de référence invalide" });
        continue;
      }
      const householdText = clean(raw.householdSize);
      const householdSize = householdText ? Number(householdText) : null;
      if (householdText && (!Number.isInteger(householdSize) || Number(householdSize) < 1)) {
        errors.push({ line: index + 2, message: "Nombre de personnes dans le foyer invalide" });
        continue;
      }

      const precaText = clean(raw.preca);
      const phaseText = clean(raw.phase);
      const occupancyText = clean(raw.occupancyStatus);
      const productTypeText = clean(raw.productType).toLocaleUpperCase("fr-FR");
      const hotWaterText = clean(raw.hotWaterSystem);
      const statusText = clean(raw.status);
      const status = allowedStatuses.find(value => value.toLocaleLowerCase("fr-FR") === statusText.toLocaleLowerCase("fr-FR")) ?? null;
      const data = {
        number: number || null,
        firstName,
        lastName,
        phone: phone || null,
        email: email || null,
        address: clean(raw.address) || null,
        postalCode: clean(raw.postalCode) || null,
        city: clean(raw.city) || null,
        occupancyStatus: allowedOccupancy.has(occupancyText) ? occupancyText : null,
        productType: allowedProductTypes.has(productTypeText) ? productTypeText : null,
        taxReferenceIncome,
        taxNoticeReference: clean(raw.taxNoticeReference) || null,
        taxNumber: clean(raw.taxNumber) || null,
        householdSize,
        area,
        preca: allowedPreca.has(precaText) ? precaText : null,
        heatingType: clean(raw.heatingType) || null,
        hotWaterSystem: allowedHotWater.has(hotWaterText) ? hotWaterText : null,
        boilerLocation: clean(raw.boilerLocation) || null,
        phase: allowedPhase.has(phaseText) ? phaseText : null,
        delegator: clean(raw.delegator) || null,
        telepro: clean(raw.telepro) || null,
        regie: clean(raw.regie) || null,
        status,
        comment: clean(raw.comment) || null,
      };
      const match = matches[0];
      if (match) {
        if (duplicateMode === "skip") {
          skipped++;
          continue;
        }
        updates.push({ id: match.id, data: { ...data, updatedAt: new Date().toISOString() } });
        Object.assign(match, data);
        if (number) byNumber.set(key(number), match);
        if (email) byEmail.set(email, match);
        if (phone) byPhone.set(key(phone), match);
      } else {
        const created = { id: crypto.randomUUID(), ...data };
        inserts.push(created);
        if (number) byNumber.set(key(number), created as (typeof existing)[number]);
        if (email) byEmail.set(email, created as (typeof existing)[number]);
        if (phone) byPhone.set(key(phone), created as (typeof existing)[number]);
      }
    }

    for (let i = 0; i < inserts.length; i += 50) await db.insert(customers).values(inserts.slice(i, i + 50));
    for (let i = 0; i < updates.length; i += 50) {
      const statements = updates.slice(i, i + 50).map(item => db.update(customers).set(item.data).where(eq(customers.id, item.id)));
      await db.batch(statements as [typeof statements[number], ...typeof statements]);
    }

    await db.insert(auditLog).values({
      id: crypto.randomUUID(), actorId: user.userId, actorEmail: user.email,
      action: "import", entityType: "customer", entityId: null,
      detailsJson: JSON.stringify({ inserted: inserts.length, updated: updates.length, skipped, errors: errors.length }),
    });

    return NextResponse.json({ ok: true, inserted: inserts.length, updated: updates.length, skipped, errors });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "L’import n’a pas pu être terminé. Vérifiez le fichier puis réessayez." }, { status: 500 });
  }
}
