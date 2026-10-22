type Product = {id:string;brand?:string;model?:string;archived?:boolean};
export class PackError extends Error {}
const normalize=(value:unknown)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/100\s+L\b/g,"100L").replace(/EXPENSION/g,"EXPANSION").replace(/POT A BOUT/g,"POT A BOUE").replace(/[^A-Z0-9]+/g," ").trim();
const key=(value:unknown)=>[...new Set(normalize(value).split(/\s+/))].sort().join(" ");
export const packComponents=["CIRCULATEUR","DISCONNECTEUR","SUPPORT VASE EXPANSION","VASE EXPANSION","BALLON TAMPON 100L","THERMOSTAT","BOUTON D’ARRET","POT A BOUT","GRAND RUBBERFOOT"];
export const isConsumablePack=(p?:Pick<Product,"brand"|"model">)=>!!p&&/\bPACK CONSOMMABLES?\b/.test(normalize(`${p.brand||""} ${p.model||""}`));
// Resolve only unambiguous references. Never pick the first of several models.
export function expandPackLines(lines:{productId:string;quantity:number}[],catalogue:Product[]){
 const result=new Map<string,number>();
 for(const line of lines){
  if(!Number.isSafeInteger(line.quantity)||line.quantity<=0)throw new PackError("La quantité doit être un nombre entier positif.");
  const product=catalogue.find(p=>p.id===line.productId);
  if(!product)throw new PackError("Produit introuvable dans le catalogue.");
  let ids=[product.id];
  if(isConsumablePack(product))ids=packComponents.map(label=>{
   const candidates=catalogue.filter(p=>!p.archived&&!isConsumablePack(p)&&[p.brand,p.model,`${p.brand||""} ${p.model||""}`].some(value=>key(value)===key(label)));
   if(candidates.length!==1)throw new PackError(`Pack consommable : ${label} ${candidates.length?"correspond à plusieurs références":"est introuvable parmi les produits actifs"}. Corrigez le catalogue ou ajoutez les composants séparément.`);
   return candidates[0].id;
  });
  if(new Set(ids).size!==ids.length)throw new PackError("La composition du pack contient une référence en double. Vérifiez le catalogue.");
  for(const id of ids){const quantity=(result.get(id)||0)+line.quantity;if(!Number.isSafeInteger(quantity))throw new PackError("Quantité trop importante.");result.set(id,quantity);}
 }
 return [...result].map(([productId,quantity])=>({productId,quantity}));
}
