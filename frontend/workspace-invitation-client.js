/** CP-WS-02D/C — staged signed invitation transport, default-off.
 * Never include mail tokens, provider secrets, role assignments or service keys.
 * The eventual trusted HTTP endpoint independently verifies live GoTrue session,
 * authoritative workspace scope, inviter rights and delivery readiness.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';

export const WS02D_INVITE_CLIENT_ENABLED=false;
const EMAIL=/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const deny=(message,status=403)=>{throw new ApiError(message,status)};

export function normalizeInvitationDeliveryReceipt(raw){
 if(!validUuid(raw?.invitationId)||
  !['delivery-submitted','already-issued'].includes(raw?.state))
  deny('The server did not confirm an invitation receipt.',409);
 return Object.freeze({invitationId:raw.invitationId,state:raw.state});
}

export class WorkspaceInvitationClient{
 constructor({auth,api,enabled=WS02D_INVITE_CLIENT_ENABLED}={}){
  this.auth=auth;this.api=api;this.enabled=enabled===true;
 }
 async signed(workspaceId){
  if(typeof this.auth?.getVerifiedUser!=='function'||
     typeof this.auth?.authorized!=='function'||
     typeof this.api?.context!=='function')deny('Signed invitation transport unavailable.',503);
  const user=await this.auth.getVerifiedUser();
  const context=await this.api.context();
  if(!validUuid(user?.id)||user.id!==this.auth.userId||
     context?.user_id!==user.id||context?.workspace_id!==workspaceId||
     context?.profile?.status!=='active')
   deny('The signed workspace identity changed.',403);
  return user.id;
 }
 async send({workspaceId,requestId,email,role='member',message=''}={}){
  if(!this.enabled)deny('Workspace invitation sending is not activated.',503);
  const recipient=typeof email==='string'?email.trim().toLowerCase():'';
  const cleanMessage=typeof message==='string'?message.trim():'';
  if(!validUuid(workspaceId)||!validUuid(requestId)||
     recipient.length>254||!EMAIL.test(recipient)||role!=='member'||
     cleanMessage.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cleanMessage))
   deny('Invalid invitation request. Only the Member role is available.',400);
  const actor=await this.signed(workspaceId);
  let raw;
  try{
   raw=await this.auth.authorized('/functions/v1/ws02d-invite',{
    method:'POST',retryUnauthorized:false,
    body:{workspaceId,requestId,email:recipient,role:'member',message:cleanMessage}
   });
  }catch(error){
   // A network timeout may follow a server commit. Never retry automatically.
   const status=Number.isInteger(error?.status)?error.status:0;
   if(status===401)deny('Your session must be verified again before inviting.',401);
   if(status===403||status===404)deny('The server denied invitation issuance.',403);
   if(status===400||status===422)deny('The server rejected the invitation request.',400);
   if(status===429)deny('Invitation limits were reached. Try again later.',429);
   deny('Invitation outcome is unconfirmed. Do not submit another request until reconciled.',409);
  }
  const receipt=normalizeInvitationDeliveryReceipt(raw);
  try{
   if(await this.signed(workspaceId)!==actor)throw Error('Actor changed');
  }catch{
   deny('Invitation outcome cannot be confirmed after a session or workspace change.',409);
  }
  return receipt;
 }
}
