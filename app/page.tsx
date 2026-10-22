import { requireChatGPTUser } from "./chatgpt-auth";
import { getAppAccess } from "./admin-auth";
import DepotApp from "./depot-app";
export const dynamic="force-dynamic";
export default async function Home(){ const user=await requireChatGPTUser("/"),access=await getAppAccess(user);if(access.role==="denied")return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,fontFamily:"Arial,sans-serif",background:"#f7f5f7"}}><section style={{maxWidth:520,padding:32,border:"1px solid #eadfe8",borderRadius:18,background:"white"}}><h1>Accès non autorisé</h1><p>Le compte <b>{user.email}</b> n’a pas encore reçu de droit d’accès à Fleuron Industries.</p><p>Demandez à l’administrateur de vous ajouter comme équipe dépôt, télépro ou régie.</p><a href="/signout-with-chatgpt?return_to=/">Changer de compte</a></section></main>;return <DepotApp initialUser={{displayName:user.displayName,email:user.email,...access}}/>; }
