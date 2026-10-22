type Row = Record<string, any>;
export const savStatuses = ["SAV à programmer", "SAV envoyé au poseur", "SAV en cours de traitement", "SAV traité"];
export const normalizeSav = (value: unknown) => {
  const text = String(value || "").trim();
  if (/^sav à traiter$/i.test(text)) return savStatuses[0];
  return savStatuses.find(status => status.toLocaleLowerCase("fr") === text.toLocaleLowerCase("fr")) || (/\bsav\b/i.test(text) ? text : "");
};
export function numberedTeamName(value: string, index = 0): string {
  const name = String(value || "").trim();
  const match = name.match(/^[ÉE]quipe\s+([A-Z]|\d+)(?:\s*[–—-]\s*[ÉE]quipe\s+[A-Z\d]+)?$/i);
  if (!match) return name || `Équipe ${index + 1}`;
  return `Équipe ${/^\d+$/.test(match[1]) ? Number(match[1]) : match[1].toUpperCase().charCodeAt(0) - 64}`;
}
export function normalizeTeamText(value: string): string {
  return String(value || "").replace(/[ÉE]quipe\s+([A-Z])\b/gi, (_, letter) => `Équipe ${letter.toUpperCase().charCodeAt(0) - 64}`)
    .replace(/(Équipe\s+\d+)(?:\s*[–—/\-]\s*\1)+/g, "$1");
}

export function sortProducts<T extends Row>(products: T[]): T[] {
  const compare = (a: unknown, b: unknown) => String(a || "").localeCompare(String(b || ""), "fr", {sensitivity:"base", numeric:true});
  return products.slice().sort((a,b) => compare(a.activity,b.activity) || compare(`${a.brand} ${a.model}`,`${b.brand} ${b.model}`));
}
export function groupClientStops<T extends Row>(stops: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const stop of stops) groups.set(stop.customerId, [...(groups.get(stop.customerId) || []), stop]);
  return [...groups.values()].flat();
}
export function buildSavRows(data: {customers: Row[]; stops: Row[]; products: Row[]}): Row[] {
  const result: Row[] = [];
  for (const customer of data.customers) {
    const stops = data.stops.filter(s => s.customerId === customer.id && s.status !== "Annulé");
    const flagged = stops.filter(s => normalizeSav(s.savStatus));
    const status = normalizeSav(customer.status) || normalizeSav(flagged.find(s => normalizeSav(s.savStatus) !== "SAV traité")?.savStatus) || normalizeSav(flagged[0]?.savStatus);
    if (!status) continue;
    const related = stops.slice().sort((a,b) => String(b.plannedAt || b.routeDate || "").localeCompare(String(a.plannedAt || a.routeDate || "")));
    const latest = related[0];
    const productIds = [...new Set([customer.materialProductId, ...related.map(s => s.productId)].filter(Boolean))];
    const productNames = productIds.map(id => {const p = data.products.find(p => p.id === id); return p ? `${p.brand} ${p.model}` : "Produit archivé";});
    result.push({...latest, id:`sav-${customer.id}`, customerId:customer.id, installerId:customer.assignedInstallerId || latest?.installerId, savStatus:status, productNames, stopIds:flagged.map(s => s.id)});
  }
  return result;
}
export function validateCustomer(data: Row): string | null {
  const required = {lastName:"nom",firstName:"prénom",phone:"téléphone",address:"adresse",city:"ville",postalCode:"code postal"};
  const missing = Object.entries(required).filter(([key]) => !String(data[key] || "").trim()).map(([,label]) => label);
  if (missing.length) return `Champs obligatoires : ${missing.join(", ")}.`;
  if (!/^\d{5}$/.test(String(data.postalCode).trim())) return "Le code postal doit contenir 5 chiffres.";
  return null;
}
