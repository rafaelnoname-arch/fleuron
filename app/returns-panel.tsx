"use client";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {FileText,PackageCheck,Trash2} from "lucide-react";
import {normalizeTeamText} from "@/lib/depot-domain";
export type ReturnEntry={id:string;orphaned?:boolean;stopId:string;customerId:string;routeId:string;routeNumber:string;customerName:string;productName:string;team:string;reason:string;quantity:number;receivedQty:number;revision:number;createdAt:string;validatedAt?:string;validatedBy?:string};
type Group={id:string;rows:ReturnEntry[]};
const escapeHtml=(s:unknown)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const date=(s?:string)=>s?new Date(s).toLocaleString("fr-FR"):"—";
export function groupReturns(rows:ReturnEntry[]):Group[]{
 const groups=new Map<string,ReturnEntry[]>();
 for(const row of rows){const id=JSON.stringify([row.routeId,row.customerId||row.customerName]);groups.set(id,[...(groups.get(id)||[]),row]);}
 return [...groups].map(([id,rows])=>({id,rows}));
}
function previewReturn(rows:ReturnEntry[]){
 const w=window.open("","_blank");if(!w)return;
 const r=rows[0],esc=escapeHtml,remaining=rows.reduce((n,r)=>n+r.quantity-r.receivedQty,0),received=rows.reduce((n,r)=>n+r.receivedQty,0);
 const status=remaining?(received?"Réception partielle":"En attente de réception"):"Réception validée";
 w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bon de retour — ${esc(r.customerName)}</title><style>body{font:14px Arial;color:#17212b;max-width:1000px;margin:auto;padding:35px}header{border-bottom:2px solid #72245f}table{width:100%;border-collapse:collapse;margin:30px 0}th,td{border:1px solid #bbb;padding:10px;text-align:left}small{color:#555}.actions{position:sticky;top:0;background:white;padding:12px 0;text-align:right}.actions button{background:#72245f;color:white;border:0;border-radius:8px;padding:12px;cursor:pointer}@media print{.actions{display:none}body{padding:10px}}</style></head><body><div class="actions"><button onclick="window.print()">Imprimer / enregistrer en PDF</button></div><header><h1>Fleuron Industries</h1><h2>Bon d’entrée — retour dépôt</h2><p>Bon de sortie : ${esc(r.routeNumber)} · Client : <b>${esc(r.customerName)}</b></p></header><p>Équipe / camion : ${esc(normalizeTeamText(r.team))}</p><table><thead><tr><th>Matériel</th><th>Motif</th><th>Attendu</th><th>Réceptionné</th><th>Encore dehors</th></tr></thead><tbody>${rows.map(line=>`<tr><td>${esc(line.productName)}</td><td>${esc(line.reason)}</td><td>${line.quantity}</td><td>${line.receivedQty}</td><td>${line.quantity-line.receivedQty}</td></tr>`).join("")}</tbody></table><p><b>${status}</b></p>${rows.filter(line=>line.validatedAt).map(line=>`<p><small>${esc(line.productName)} : dernière réception le ${esc(date(line.validatedAt))} par ${esc(line.validatedBy)}</small></p>`).join("")}<p>Seules les quantités validées comme reçues sont réintégrées au stock.</p><p style="margin-top:60px">Responsable dépôt : ____________________<br><br>Équipe / chauffeur : ____________________</p></body></html>`);
 w.document.close();w.focus();
}
export function ReturnsPanel({rows,refresh}:{rows:ReturnEntry[];refresh:(silent?:boolean)=>Promise<unknown>}){
 const [filter,setFilter]=useState("pending"),[cleaning,setCleaning]=useState(false),[cleanupError,setCleanupError]=useState("");
 const orphaned=rows.filter(r=>r.orphaned&&r.receivedQty===r.quantity);
 const cleanup=async()=>{
  if(cleaning||!orphaned.length||!window.confirm(`Supprimer les ${orphaned.length} ligne(s) de retour déjà réceptionnées dont la ligne de tournée n’existe plus ? Le stock disponible reste inchangé.`))return;
  setCleaning(true);setCleanupError("");
  try{
   for(let offset=0;offset<orphaned.length;offset+=500){
    const response=await fetch("/api/returns",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cleanupOrphans",ids:orphaned.slice(offset,offset+500).map(r=>r.id)})});
    const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error||"Nettoyage impossible.");
   }
   await refresh(true);
  }catch(error){setCleanupError(error instanceof Error?error.message:"Nettoyage impossible.");await refresh(true)}finally{setCleaning(false)}
 };
 const groups=groupReturns(rows),pending=groups.filter(g=>g.rows.some(r=>r.receivedQty<r.quantity));
 const shown=filter==="pending"?pending:groups;
 return <section className="panel return-panel"><header><h3>Bons d’entrée — retours dépôt</h3><span>{rows.reduce((n,r)=>n+r.quantity-r.receivedQty,0)} unité(s) encore dehors</span></header><p className="return-explanation">Un bon par client et par tournée. Validez uniquement les marchandises physiquement reçues au dépôt ; indiquez 0 pour un matériel encore dans le camion.</p><div className="segments">{orphaned.length>0&&<button type="button" className="orphan-cleanup" disabled={cleaning} onClick={cleanup}><Trash2/>{cleaning?"Suppression…":`Supprimer les anciens retours sans tournée (${orphaned.length})`}</button>}<button className={filter==="pending"?"active":""} onClick={()=>setFilter("pending")}>En attente / partiels ({pending.length})</button><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>Tous les bons ({groups.length})</button></div>{cleanupError&&<p role="alert" className="form-error">{cleanupError}</p>}<div className="return-list">{shown.map(g=><ReturnCard key={g.id+g.rows.map(r=>`${r.id}:${r.receivedQty}:${r.revision}`).join("|")} rows={g.rows} refresh={refresh}/>)}{!shown.length&&<p>Aucun retour {filter==="pending"?"en attente":"enregistré"}.</p>}</div></section>
}
function ReturnCard({rows,refresh}:{rows:ReturnEntry[];refresh:(silent?:boolean)=>Promise<unknown>}){
 const r=rows[0],remaining=rows.reduce((n,r)=>n+r.quantity-r.receivedQty,0),received=rows.reduce((n,r)=>n+r.receivedQty,0);
 const [quantities,setQuantities]=useState<Record<string,string>>(()=>Object.fromEntries(rows.map(r=>[r.id,String(r.quantity-r.receivedQty)]))),[busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState(false);
 const validate=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy||done)return;
  const lines=rows.map(r=>({id:r.id,quantity:Number(quantities[r.id]),expectedReceived:r.receivedQty,revision:r.revision})).filter(r=>r.quantity>0);
  if(!lines.length){setError("Indiquez au moins une quantité reçue.");return;}
  if(!window.confirm(`Confirmer la réception physique pour ${r.customerName} :\n${lines.map(l=>`${rows.find(r=>r.id===l.id)?.productName} : ${l.quantity}`).join("\n")}\nCes quantités seront remises en stock.`))return;
  setBusy(true);setError("");
  try{const response=await fetch("/api/returns",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"validateGroup",routeId:r.routeId,customerId:r.customerId,lines})});const json=await response.json() as {error?:string};if(!response.ok)throw Error(json.error);setDone(true);await refresh(true);}
  catch(e){setError(e instanceof Error?e.message:"Validation impossible.");}
  finally{setBusy(false);}
 };
 return <article className="return-card"><header><div><small>{r.routeNumber} · Bon de retour client</small><h4>{r.customerName}</h4><span>{normalizeTeamText(r.team)}</span></div><b className={remaining?"status warn":"status ok"}>{remaining?(received?"Réception partielle":"En attente de réception"):"Réception validée"}</b></header><form onSubmit={validate}><div className="table-wrap"><table className="return-products"><thead><tr><th>Matériel / motif</th><th>Attendu</th><th>Déjà reçu</th><th>Encore dehors</th>{remaining>0&&<th>Reçu maintenant</th>}</tr></thead><tbody>{rows.map(line=><tr key={line.id}><td><b>{line.productName}</b><small>{line.reason}</small>{line.validatedAt&&<small>{date(line.validatedAt)} · {line.validatedBy}</small>}</td><td>{line.quantity}</td><td>{line.receivedQty}</td><td>{line.quantity-line.receivedQty}</td>{remaining>0&&<td>{line.quantity>line.receivedQty?<input aria-label={`Quantité reçue de ${line.productName} pour ${r.customerName}`} type="number" min="0" max={line.quantity-line.receivedQty} step="1" required value={quantities[line.id]} disabled={busy||done} onChange={e=>setQuantities(q=>({...q,[line.id]:e.target.value}))}/>:"Validé"}</td>}</tr>)}</tbody></table></div><footer><Button type="button" variant="outline" onClick={()=>previewReturn(rows)}><FileText/> Visualiser le bon de retour</Button>{remaining>0&&<Button className="gold" disabled={busy||done} type="submit"><PackageCheck/>{done?"Réception enregistrée":busy?"Validation…":"Valider la réception au dépôt"}</Button>}</footer></form>{error&&<p role="alert" className="form-error">{error}</p>}</article>
}
