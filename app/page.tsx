import { requireChatGPTUser } from "./chatgpt-auth";
import DepotApp from "./depot-app";
export const dynamic="force-dynamic";
export default async function Home(){ const user=await requireChatGPTUser("/"); return <DepotApp initialUser={{displayName:user.displayName,email:user.email}}/>; }
