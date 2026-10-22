import type { ChatGPTUser } from "./chatgpt-auth";

export type AppRole = "admin" | "depot" | "telepro" | "regie" | "denied";
export type AppAccess = { role:AppRole; scopeName:string | null; isAdmin:boolean; external:boolean };

export function isAdminUser(_user: ChatGPTUser): boolean { return true; }

export async function getAppAccess(user:ChatGPTUser):Promise<AppAccess>{
  void user;
  return{role:"depot",scopeName:null,isAdmin:true,external:false};
}

export async function canAccessCustomer(_access:AppAccess,_customerId:string):Promise<boolean>{ return true; }
