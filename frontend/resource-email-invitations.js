/** BS05 — email-bound, resource-scoped invitation contract.
 * Default OFF: no invitation data, emails or Supabase writes until a reviewed
 * server adapter, verified external account admission and resource reads exist.
 * Ordinary board access and application-level roles are NOT interchangeable.
 */
import {validUuid} from './data.js';
import {ApiError} from './session.js';

export const RESOURCE_EMAIL_INVITES_ENABLED=false;
export const RESOURCE_INVITE_ROLE='viewer';
const EMAIL=/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/u;
const MODULE_KEY=/^[a-z][a-z0-9_-]{1,63}$/;
const error=(message,status=400)=>{throw new ApiError(message,status);};

export function normalizeRecipientEmail(value){
 if(typeof value!=='string')return null;
 const email=value.trim().toLowerCase();
 // Email addresses are identifiers, not arbitrary header or HTML content.
 if(email.length<3||email.length>254||!EMAIL.test(email)||
    /[\u0000-\u001f\u007f]/.test(email))return null;
 const [local,domain,...extra]=email.split('@');
 if(extra.length||!local||local.length>64||!domain||
    domain.split('.').some(part=>!part||part.length>63||part.startsWith('-')||part.endsWith('-')))
  return null;
 return email;
}

/** Client validation, never an authorization decision. */
export function validateResourceInviteRequest(raw={}){
 const {workspaceId,resourceKind='board',boardId=null,moduleKey=null,
  email,role='viewer',requestId}=raw;
 const address=normalizeRecipientEmail(email);
 if(!validUuid(workspaceId)||!validUuid(requestId)||!address||
    role!==RESOURCE_INVITE_ROLE||
    !['board','application'].includes(resourceKind))
  return null;
 if(resourceKind==='board'&&!validUuid(boardId))return null;
 if(resourceKind==='application'&&
    (typeof moduleKey!=='string'||!MODULE_KEY.test(moduleKey)||moduleKey.length>64))
  return null;
 return Object.freeze({
  workspaceId,resourceKind,
  ...(resourceKind==='board'?{boardId}:{moduleKey}),
  email:address,role:RESOURCE_INVITE_ROLE,requestId
 });
}

export function resourceEmailInviteReadiness({
 board,workspaceId,manage=false,moduleKey=null,
 enabled=RESOURCE_EMAIL_INVITES_ENABLED,approvedPolicy=false
}={}){
 if(!validUuid(workspaceId)||!validUuid(board?.id)||
    board.workspace_id!==workspaceId||
    board.status!=='active'||!!board.archived_at||!!board.trashed_at)
  return Object.freeze({allowed:false,reason:'This board cannot be shared.'});
 if(manage!==true)
  return Object.freeze({allowed:false,reason:'Only authorized board managers can invite people.'});
 if(moduleKey)
  return Object.freeze({allowed:false,reason:'Application invitations require a separate role and data-access review.'});
 if(enabled!==true)
  return Object.freeze({allowed:false,reason:'Email invitations are not yet activated.'});
 if(approvedPolicy!==true)
  return Object.freeze({allowed:false,reason:'A verified server sharing policy is required.'});
 // A live server endpoint must re-check exact-board manage scope, session,
 // privacy policy and role on every request. Never interpret this as a grant.
 return Object.freeze({allowed:true,reason:'The server will verify access before sending.'});
}

export function normalizeResourceInviteReceipt(raw,request){
 if(!validUuid(raw?.invitationId)||
    !['delivery-submitted','already-issued'].includes(raw?.state)||
    raw.resourceKind!==request.resourceKind||
    raw.email!==request.email)
  error('The invitation response could not be verified.',409);
 return Object.freeze({invitationId:raw.invitationId,state:raw.state});
}

/** Staged signed transport. No admin key in the browser. No automatic retry:
 * a network failure after committing the request has an uncertain outcome.
 */
export class ResourceEmailInvitationClient{
 constructor({auth,api,enabled=RESOURCE_EMAIL_INVITES_ENABLED}={}){
  this.auth=auth;this.api=api;this.enabled=enabled===true;
 }
 async send(raw){
  if(!this.enabled)error('Email invitations are not yet activated.',503);
  const request=validateResourceInviteRequest(raw);
  if(!request)error('Invalid recipient or sharing request.',400);
  if(typeof this.auth?.getVerifiedUser!=='function'||
     typeof this.auth?.authorized!=='function'||
     typeof this.api?.context!=='function')
   error('Signed invitation transport is unavailable.',503);
  const user=await this.auth.getVerifiedUser();
  const context=await this.api.context();
  if(!validUuid(user?.id)||user.id!==this.auth.userId||
     context?.user_id!==user.id||
     context?.workspace_id!==request.workspaceId||
     context?.profile?.status!=='active')
   error('Signed invitation identity or workspace changed.',403);
  let response;
  try{
   response=await this.auth.authorized('/functions/v1/resource-email-invite',{
    method:'POST',retryUnauthorized:false,body:request
   });
  }catch(err){
   if(err?.status===401)error('Please sign in again before inviting.',401);
   if([403,404].includes(err?.status))error('The server denied the invitation.',403);
   if([400,422].includes(err?.status))error('The invitation request was rejected.',400);
   if(err?.status===429)error('Invitation rate limit reached.',429);
   error('Invitation outcome is unconfirmed; check invitations before retrying.',409);
  }
  const receipt=normalizeResourceInviteReceipt(response,request);
  const current=await this.api.context();
  if(current?.user_id!==user.id||current?.workspace_id!==request.workspaceId)
   error('Invitation outcome is unconfirmed after the workspace changed.',409);
  return receipt;
 }
}
