/** WS10 — restricted workspace creation and ownership-transfer contracts.
 * Workspace creator eligibility comes ONLY from a verified actor-bound server
 * authorization receipt. No platform-role label or Main Workspace ownership
 * shown in the browser grants the right to create workspaces.
 * Both live transport toggles remain OFF pending a reviewed backend cutover.
 */
import {validUuid} from './data.js';
import {ApiError} from './session.js';
import {normalizeWorkspaceCreationReceipt} from './workspace-lifecycle-client.js';
import {WS01_CREATION_ENABLED} from './workspace-ui.js';

export const WS10_CREATION_AUTH_ENABLED=false;
export const WS10_OWNERSHIP_TRANSFER_ENABLED=false;
const MODULE=/^[a-z][a-z0-9_-]{1,63}$/;
const fail=(message,status=403)=>{throw new ApiError(message,status);};
const denied=Object.freeze({status:'UNAVAILABLE',canCreate:false,
 canTransfer:false,workspaceId:null,reason:'No signed creator authorization available.'});

export function normalizeWorkspaceCreatorReadiness(raw,{actorId,workspaceId}={}){
 if(!validUuid(actorId)||!validUuid(workspaceId)||raw?.schemaVersion!==1||
    raw.actorId!==actorId||raw.workspaceId!==workspaceId||
    raw.status!=='SIGNED_CREATOR_POLICY'||
    typeof raw.canCreate!=='boolean'||typeof raw.canTransfer!=='boolean'||
    !Number.isSafeInteger(raw.revision)||raw.revision<1)
  return denied;
 return Object.freeze({status:'SIGNED_CREATOR_POLICY',workspaceId,
  canCreate:raw.canCreate,canTransfer:raw.canTransfer,
  revision:raw.revision,reason:raw.canCreate?
  'Creation permitted by signed owner/IT administrator policy.':
  'Only designated IT administrators or approved workspace owners can create workspaces.'});
}
export function validateOwnershipTransfer(raw){
 const {workspaceId,targetUserId,requestId,expectedRevision,
  resourceKind='workspace',moduleKey=null}=raw||{};
 if(!validUuid(workspaceId)||!validUuid(targetUserId)||
    !validUuid(requestId)||!Number.isSafeInteger(expectedRevision)||
    expectedRevision<1||!['workspace','application'].includes(resourceKind))
  return null;
 if(resourceKind==='application'&&
    (typeof moduleKey!=='string'||!MODULE.test(moduleKey)))
  return null;
 if(resourceKind==='workspace'&&moduleKey!==null)return null;
 return Object.freeze({workspaceId,targetUserId,requestId,expectedRevision,
  resourceKind,...(resourceKind==='application'?{moduleKey}:{})});
}

/** Authoritative signed identity and workspace are reread around requests.
 * This intentionally does not rely on a spoofable frontend role string.
 */
export class WorkspaceOwnerGovernanceClient{
 constructor({auth,api,creationEnabled=WS10_CREATION_AUTH_ENABLED,
  transferEnabled=WS10_OWNERSHIP_TRANSFER_ENABLED}={}){
  this.auth=auth;this.api=api;
  this.creationEnabled=creationEnabled===true;
  this.transferEnabled=transferEnabled===true;
 }
 async #identity(){
  if(typeof this.auth?.getVerifiedUser!=='function'||
     typeof this.api?.context!=='function'||typeof this.api?.rpc!=='function')
   fail('Signed owner governance transport unavailable.',503);
  const user=await this.auth.getVerifiedUser();
  const ctx=await this.api.context();
  if(!validUuid(user?.id)||user.id!==this.auth.userId||
     ctx?.user_id!==user.id||!validUuid(ctx?.workspace_id)||
     ctx?.profile?.status!=='active')
   fail('Signed account or workspace identity is invalid.',403);
  return Object.freeze({actorId:user.id,workspaceId:ctx.workspace_id});
 }
 async readiness(){
  if(!this.creationEnabled)return denied;
  const original=await this.#identity();
  let raw;
  try{raw=await this.api.rpc('wm_ws10_creator_readiness',{});}
  catch{return denied;}
  const result=normalizeWorkspaceCreatorReadiness(raw,original);
  const after=await this.#identity();
  if(after.actorId!==original.actorId||after.workspaceId!==original.workspaceId)
   return denied;
  return result;
 }
 async create({name,privacy,requestId}={}){
  if(!this.creationEnabled||!WS01_CREATION_ENABLED)
   fail('Restricted workspace creation is not activated.',503);
  // Authorization is rechecked by the trusted RPC; the client receipt is
  // only a UI gate. Never call legacy wm_ws01_create directly.
  const original=await this.#identity();
  const permit=await this.readiness();
  if(permit.status!=='SIGNED_CREATOR_POLICY'||!permit.canCreate)
   fail('Workspace creator permission not granted.',403);
  if(typeof name!=='string'||name.trim().length<2||name.trim().length>80||
     !['closed','open'].includes(privacy)||!validUuid(requestId))
   fail('Invalid workspace creation parameters.',400);
  let raw;
  try{raw=await this.api.rpc('wm_ws10_create_restricted',{
   p_name:name.trim(),p_privacy:privacy,p_request_id:requestId
  });}
  catch{fail('Workspace creation was not confirmed. Check membership before retrying.',409);}
  const receipt=normalizeWorkspaceCreationReceipt(raw,privacy);
  const after=await this.#identity();
  if(after.actorId!==original.actorId||after.workspaceId!==original.workspaceId)
   fail('Workspace creation context changed; refresh before continuing.',409);
  return receipt;
 }
 async transferOwnership(raw){
  if(!this.transferEnabled)fail('Ownership transfers are not activated.',503);
  const target=validateOwnershipTransfer(raw);
  if(!target)fail('Invalid ownership transfer request.',400);
  const actor=await this.#identity();
  if(actor.workspaceId!==target.workspaceId||actor.actorId===target.targetUserId)
   fail('Transfer requires a different authorized workspace member.',403);
  let receipt;
  try{receipt=await this.api.rpc('wm_ws10_transfer_ownership',{
   p_target_user_id:target.targetUserId,
   p_resource_kind:target.resourceKind,
   p_resource_id:target.resourceKind==='workspace'?target.workspaceId:target.moduleKey,
   p_expected_revision:target.expectedRevision,
   p_request_id:target.requestId
  });}
  catch{fail('Ownership transfer is unconfirmed; refresh before retrying.',409);}
  if(receipt?.state!=='transferred'||receipt.workspaceId!==target.workspaceId||
     receipt.requestId!==target.requestId||
     receipt.newOwnerId!==target.targetUserId)
   fail('Ownership transfer receipt failed verification.',409);
  const after=await this.#identity();
  if(after.actorId!==actor.actorId||after.workspaceId!==actor.workspaceId)
   fail('Ownership transfer session changed.',409);
  return Object.freeze({state:'transferred',workspaceId:target.workspaceId,
   newOwnerId:target.targetUserId,resourceKind:target.resourceKind});
 }
}
