/** WS11 — signed workspace invitation management client (disabled until verified backend).
 * Lists and revokes invitations only through a trusted workspace-scoped endpoint.
 * Email-bearing results must never be cached or shown to unauthorized users.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';

export const WS11_INVITATION_MANAGEMENT_ENABLED=false;
const STATES=new Set(['pending','accepted','revoked','expired','declined']);
const EMAIL=/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/u;
const deny=(message,status=403)=>{throw new ApiError(message,status);};
function verifiedDate(value){
 if(typeof value!=='string'||value.length>40||!/^\d{4}-\d\d-\d\dT/.test(value)||
    !Number.isFinite(Date.parse(value)))deny('Invalid signed invitation timestamp.',409);
 return value;
}
export function normalizeInvitationListing(raw,{workspaceId}={}){
 if(!validUuid(workspaceId)||raw?.schemaVersion!==1||
    raw?.workspaceId!==workspaceId||raw?.authorized!==true||
    !Array.isArray(raw.invitations)||raw.invitations.length>100)
  deny('Unverified workspace invitation listing.',409);
 const seen=new Set(),invitations=[];
 for(const item of raw.invitations){
  if(!validUuid(item?.id)||seen.has(item.id)||!STATES.has(item.state)||
     item.role!=='member'||typeof item.email!=='string'||
     item.email.length>254||!EMAIL.test(item.email)||
     item.email!==item.email.toLowerCase())
   deny('Invalid workspace invitation entry.',409);
  seen.add(item.id);
  invitations.push(Object.freeze({
   id:item.id,email:item.email,state:item.state,role:'member',
   issuedAt:verifiedDate(item.issuedAt),expiresAt:verifiedDate(item.expiresAt)
  }));
 }
 return Object.freeze({status:'SIGNED_MANAGER_LIST',workspaceId,
  invitations:Object.freeze(invitations)});
}
export function normalizeInvitationRevocation(raw,{workspaceId,invitationId}={}){
 if(!validUuid(workspaceId)||!validUuid(invitationId)||
   raw?.schemaVersion!==1||raw?.workspaceId!==workspaceId||
   raw?.invitationId!==invitationId||raw?.state!=='revoked')
  deny('Invitation revocation was not confirmed.',409);
 return Object.freeze({state:'revoked',workspaceId,invitationId});
}
export class WorkspaceInvitationManagementClient{
 constructor({auth,api,enabled=WS11_INVITATION_MANAGEMENT_ENABLED}={}){
  this.auth=auth;this.api=api;this.enabled=enabled===true;
 }
 async #signed(workspaceId){
  if(!this.enabled)deny('Workspace invitation management is pending activation.',503);
  if(!validUuid(workspaceId)||typeof this.auth?.getVerifiedUser!=='function'||
     typeof this.auth?.authorized!=='function'||typeof this.api?.context!=='function')
    deny('Signed invitation management is unavailable.',503);
  const user=await this.auth.getVerifiedUser(),ctx=await this.api.context();
  if(!validUuid(user?.id)||user.id!==this.auth.userId||
     ctx?.user_id!==user.id||ctx?.workspace_id!==workspaceId||
     ctx?.profile?.status!=='active')deny('Signed workspace changed.',403);
  return user.id;
 }
 async list(workspaceId){
  const actor=await this.#signed(workspaceId);
  let result;
  try{
   result=await this.auth.authorized('/functions/v1/ws02d-manage',{
    method:'POST',retryUnauthorized:false,
    body:{operation:'list',workspaceId}
   });
  }catch(error){
   if(error?.status===401)deny('Reauthenticate to view invitations.',401);
   if(error?.status===403||error?.status===404)deny('Invitation listing denied.',403);
   deny('Invitation status could not be verified.',409);
  }
  const listing=normalizeInvitationListing(result,{workspaceId});
  if(await this.#signed(workspaceId)!==actor)
   deny('Invitation list invalid after identity changed.',409);
  return listing;
 }
 async revoke({workspaceId,invitationId,requestId}={}){
  if(!validUuid(invitationId)||!validUuid(requestId))deny('Invalid revocation request.',400);
  const actor=await this.#signed(workspaceId);
  let receipt;
  try{
   receipt=await this.auth.authorized('/functions/v1/ws02d-manage',{
    method:'POST',retryUnauthorized:false,
    body:{operation:'revoke',workspaceId,invitationId,requestId}
   });
  }catch(error){
   if(error?.status===401)deny('Reauthenticate to revoke invitations.',401);
   if(error?.status===403||error?.status===404)deny('Invitation revocation denied.',403);
   deny('Revocation outcome unconfirmed; refresh before retrying.',409);
  }
  const verified=normalizeInvitationRevocation(receipt,{workspaceId,invitationId});
  if(await this.#signed(workspaceId)!==actor)
   deny('Revocation outcome unconfirmed after identity change.',409);
  return verified;
 }
}
