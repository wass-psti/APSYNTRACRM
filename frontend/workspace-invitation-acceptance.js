/** CP-WS-02D/D — one-time recipient link handoff and signed acceptance.
 * Deployment is deliberately disabled until the matching private backend and
 * genuine signed email verification are live. Bearer secrets are kept only
 * in volatile memory, scrubbed from history and never displayed or logged.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
export const WS02D_ACCEPTANCE_ENABLED=false;
const TOKEN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/;
const deny=(message,status)=>{throw new ApiError(message,status)};

export function captureInvitationLink(location,history){
 const hash=String(location?.hash||'');
 if(!hash.startsWith('#/invitations/accept/'))return null;
 const raw=hash.slice('#/invitations/accept/'.length);
 // If history replacement fails, DO NOT keep a token in memory while it is
 // exposed in the location bar, referrer or a subsequent navigation.
 try{
  if(typeof history?.replaceState!=='function')return {status:'invalid',token:null};
  history.replaceState(history.state??null,'',
   String(location.pathname||'/')+String(location.search||'')+'#/invitations/accept');
 }catch{return {status:'invalid',token:null};}
 return TOKEN.test(raw)?Object.freeze({status:'ready',token:raw}):
  Object.freeze({status:'invalid',token:null});
}

export function renderInvitationAcceptance({pending,enabled=false,busy=false,status=''}={}){
 const actionable=enabled===true&&pending?.status==='ready'&&busy!==true;
 const message=status==='accepted'? 'Invitation accepted. Your membership has been recorded; your active workspace has not changed.':
  status==='unconfirmed'?'The acceptance outcome could not be verified. Do not retry until your administrator reconciles the invitation.':
  pending?.status==='invalid'?'This invitation link is invalid or unavailable. Request a new invitation.':
  pending?.status!=='ready'?'No invitation token is available in this session. Reopen the original email link.':
  enabled?'Confirm acceptance to request server-verified workspace membership.':
  'Invitation acceptance has not been activated on the trusted server. No membership changes were made.';
 return '<section class="ws02d-acceptance" aria-labelledby="ws02d-accept-title">'+
  '<p class="ws02d-accept-eyebrow">Workspace invitation</p>'+
  '<h1 id="ws02d-accept-title">Review invitation</h1>'+
  '<p class="ws02d-accept-message" role="status" aria-live="polite">'+message+'</p>'+
  '<p class="ws02d-accept-note">A valid invitation requires a verified, matching recipient email and an active signed session. Workspace membership is never granted merely by opening a link.</p>'+
  '<div class="ws02d-accept-actions"><button type="button" class="primary" data-action="ws02d-accept-invitation"'+
  (actionable?'':' disabled')+'>'+(busy?'Verifying…':'Accept invitation')+'</button>'+
  '<a href="#/overview" class="secondary">Return to Overview</a></div></section>';
}

export class WorkspaceInvitationAcceptanceClient{
 constructor({auth,api,enabled=WS02D_ACCEPTANCE_ENABLED}={}){
  this.auth=auth;this.api=api;this.enabled=enabled===true;
 }
 async accept(token){
  if(!this.enabled)deny('Recipient invitation acceptance is not activated.',503);
  if(typeof token!=='string'||!TOKEN.test(token))deny('Invalid invitation token.',400);
  if(typeof this.auth?.getVerifiedUser!=='function'||
     typeof this.auth?.authorized!=='function'||typeof this.api?.context!=='function')
   deny('Signed recipient context unavailable.',503);
  const user=await this.auth.getVerifiedUser();
  const context=await this.api.context();
  if(!validUuid(user?.id)||user.id!==this.auth.userId||
     context?.user_id!==user.id||context?.profile?.status!=='active'||
     !validUuid(context?.workspace_id))
   deny('Signed recipient identity unavailable.',403);
  let receipt;
  try{
   receipt=await this.auth.authorized('/functions/v1/ws02d-accept',{
    method:'POST',retryUnauthorized:false,body:{token}
   });
  }catch(error){
   if(error?.status===401)deny('Your session expired; sign in again.',401);
   if(error?.status===400||error?.status===403||error?.status===404)
    deny('Invitation denied, expired, already used or does not match your verified account.',403);
   deny('Invitation acceptance outcome is unconfirmed. Do not retry automatically.',409);
  }
  if(receipt?.state!=='accepted'||receipt?.role!=='member'||
     receipt?.switched!==false||!validUuid(receipt.workspaceId))
   deny('Invitation acceptance receipt was invalid.',409);
  try{
   const after=await this.auth.getVerifiedUser();
   if(after?.id!==user.id)throw Error('Identity changed');
  }catch{deny('Signed recipient changed before confirmation.',409);}
  return Object.freeze({state:'accepted',workspaceId:receipt.workspaceId,
   role:'member',switched:false});
 }
}
