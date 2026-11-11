/** WS10 — strict creator eligibility and ownership-transfer contracts.
 * These are presentation/transport checks, not database authorization.
 * Keep OFF until the matching deployed signed RPCs, grants, audit and
 * full cross-workspace acceptance have been independently approved.
 */
import {validUuid} from './data.js';
import {ApiError} from './session.js';
export const WS10_CREATOR_POLICY_ACTIVE=false;
export const WS10_OWNERSHIP_TRANSFER_ACTIVE=false;
const MODULE_ID=/^[a-z][a-z0-9-]{1,63}$/;
const deny=(message,status=403)=>{throw new ApiError(message,status);};

export function creatorEligibilityFromSignedCatalog(catalog,{workspaceId,userId,adminReceipt=null}={}){
 if(!validUuid(workspaceId)||!validUuid(userId)||catalog?.status!=='SIGNED_MEMBER_DISCOVERY')return Object.freeze({eligible:false,reason:'Signed workspace membership cannot be verified.'});
 const rows=Array.isArray(catalog.rows)?catalog.rows:[];
 const active=rows.filter(r=>r.id===workspaceId&&r.active===true&&r.verifiedScope==='SIGNED_MEMBER_RPC');
 if(active.length!==1)return Object.freeze({eligible:false,reason:'Current signed workspace is not verified.'});
 const owner=active[0].relation==='owner';
 // IT admin is a dedicated server-issued capability, never platform_role
 // or a self-declared email / browser role.
 const itAdmin=adminReceipt?.schemaVersion===1&&adminReceipt.userId===userId&&
  adminReceipt.workspaceId===workspaceId&&adminReceipt.canCreateWorkspace===true&&
  adminReceipt.role==='it-admin'&&adminReceipt.source==='SIGNED_CREATOR_POLICY';
 return Object.freeze({eligible:owner||itAdmin===true,
  reason:owner?'Verified owner':itAdmin?'Verified IT Admin':
   'Only verified workspace owners or approved IT Admins can create workspaces.'});
}
export function workspaceCreatorUiAllowed({
 catalog,workspaceId,userId,adminReceipt=null,
 deployed=WS10_CREATOR_POLICY_ACTIVE
}={}){
 const eligibility=creatorEligibilityFromSignedCatalog(catalog,{workspaceId,userId,adminReceipt});
 return Object.freeze({allowed:deployed===true&&eligibility.eligible,
  reason:deployed!==true?'Restricted workspace creation requires a reviewed server-side role policy.':
   eligibility.reason});
}
/** Dedicated signed IT Admin capability receipt, not an unverified
 * platform-role label. The endpoint is disabled in production until review.
 */
export function normalizeCreatorAccessReceipt(raw,{userId,workspaceId}={}){
 if(raw?.schemaVersion!==1||raw.userId!==userId||
    raw.workspaceId!==workspaceId||!validUuid(userId)||!validUuid(workspaceId)||
    raw.source!=='SIGNED_CREATOR_POLICY'||
    !['it-admin','owner','none'].includes(raw.role)||
    typeof raw.canCreateWorkspace!=='boolean')return null;
 return Object.freeze({schemaVersion:1,userId,workspaceId,
  source:'SIGNED_CREATOR_POLICY',role:raw.role,
  canCreateWorkspace:raw.canCreateWorkspace});
}
export class CreatorAccessClient{
 constructor({auth,api,enabled=WS10_CREATOR_POLICY_ACTIVE}={}){
  this.auth=auth;this.api=api;this.enabled=enabled===true;
 }
 async read(){
  if(!this.enabled)deny('Workspace creator policy not activated.',503);
  if(typeof this.auth?.getVerifiedUser!=='function'||
     typeof this.api?.context!=='function'||
     typeof this.api?.rpc!=='function')deny('Signed creator policy unavailable.',503);
  const user=await this.auth.getVerifiedUser();
  const context=await this.api.context();
  if(!validUuid(user?.id)||this.auth.userId!==user.id||
     context?.user_id!==user.id||!validUuid(context?.workspace_id)||
     context?.profile?.status!=='active')deny('Signed creator policy context invalid.',403);
  let response;
  try{response=await this.api.rpc('wm_ws10_creator_access',{});}
  catch{deny('Creator policy not verified.',403);}
  const receipt=normalizeCreatorAccessReceipt(response,{
   userId:user.id,workspaceId:context.workspace_id});
  if(!receipt)deny('Creator access response invalid.',409);
  const current=await this.api.context();
  if(current?.user_id!==user.id||current?.workspace_id!==context.workspace_id)
   deny('Creator policy context changed.',409);
  return receipt;
 }
}
export function validateOwnershipTransfer(raw={}){
 const {kind,workspaceId,resourceId=null,targetUserId,requestId}=raw;
 if(!validUuid(workspaceId)||!validUuid(targetUserId)||!validUuid(requestId)||
    !['workspace','application'].includes(kind))return null;
 if(kind==='workspace'&&resourceId!==null)return null;
 if(kind==='application'&&(typeof resourceId!=='string'||!MODULE_ID.test(resourceId)))return null;
 return Object.freeze({
  kind,workspaceId,targetUserId,requestId,
  ...(kind==='application'?{resourceId}:{})
 });
}
export class OwnershipTransferClient{
 constructor({auth,api,enabled=WS10_OWNERSHIP_TRANSFER_ACTIVE}={}){
  this.auth=auth;this.api=api;this.enabled=enabled===true;
 }
 async transfer(raw){
  if(!this.enabled)deny('Ownership transfer requires verified server activation.',503);
  const request=validateOwnershipTransfer(raw);
  if(!request)deny('Invalid ownership transfer request.',400);
  if(typeof this.auth?.getVerifiedUser!=='function'||typeof this.api?.context!=='function'
    ||typeof this.api?.rpc!=='function')deny('Signed ownership transfer unavailable.',503);
  const actor=await this.auth.getVerifiedUser();
  const before=await this.api.context();
  if(!validUuid(actor?.id)||actor.id!==this.auth.userId||
     before?.user_id!==actor.id||before?.workspace_id!==request.workspaceId||
     before?.profile?.status!=='active')
   deny('Signed ownership identity changed.',403);
  const rpc=request.kind==='workspace'?'wm_ws10_transfer_workspace_owner':
   'wm_ws10_transfer_application_owner';
  const params={p_workspace_id:request.workspaceId,
   p_target_user_id:request.targetUserId,p_request_id:request.requestId};
  if(request.kind==='application')params.p_module_id=request.resourceId;
  let receipt;
  try{receipt=await this.api.rpc(rpc,params);}
  catch(err){if([401,403,404].includes(err?.status))deny('Ownership transfer denied.',403);
   deny('Ownership transfer outcome unconfirmed. Verify the owner before retrying.',409);}
  if(receipt?.schemaVersion!==1||receipt.workspaceId!==request.workspaceId||
    receipt.newOwnerId!==request.targetUserId||receipt.requestId!==request.requestId||
    receipt.resourceKind!==request.kind||
    (request.kind==='application'&&receipt.resourceId!==request.resourceId)||
    receipt.changed!==true)deny('Ownership transfer receipt unverified.',409);
  const after=await this.api.context();
  if(after?.user_id!==actor.id||after?.workspace_id!==request.workspaceId)
   deny('Ownership transfer result uncertain after workspace change.',409);
  return Object.freeze({workspaceId:request.workspaceId,newOwnerId:request.targetUserId,
   resourceKind:request.kind,resourceId:request.resourceId||null,changed:true});
 }
}
