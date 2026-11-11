/** WS03 — workspace creation entitlement, signed server-only authority.
 * The legacy "any verified employee can create" policy is superseded.
 * UI cannot infer IT Admin or organizational owner from a display label,
 * ownership of a personal workspace, or profile.platform_role alone.
 * Production activation requires a reviewed server-side create RPC guard.
 */
import {validUuid} from './data.js';
import {ApiError} from './session.js';

export const WS03_RESTRICTED_CREATION_ENABLED=false;
export const WS03_OWNERSHIP_TRANSFER_ENABLED=false;
const unauthorized=Object.freeze({
 status:'UNAVAILABLE',allowed:false,basis:null,
 message:'Only an authorized IT Administrator or organizational workspace owner can create a workspace.'
});
const deny=(reason,status=403)=>{throw new ApiError(reason,status);};

export function normalizeWorkspaceCreatorAuthority(raw,{userId,workspaceId}={}){
 if(!validUuid(userId)||!validUuid(workspaceId)||
    raw?.schemaVersion!==1||raw.userId!==userId||
    raw.workspaceId!==workspaceId||typeof raw.allowed!=='boolean')
  return unauthorized;
 if(raw.allowed===true&&!['it_admin','organization_owner'].includes(raw.basis))
  return unauthorized;
 if(raw.allowed===false&&raw.basis!==null)return unauthorized;
 return Object.freeze({
  status:'SIGNED_CREATION_AUTHORITY',allowed:raw.allowed,
  basis:raw.allowed?raw.basis:null,message:raw.allowed?
   'Your account is authorized to create and own new organizational workspaces.':
   unauthorized.message
 });
}

export function canCreateOrganizationalWorkspace(authority,{
 enabled=WS03_RESTRICTED_CREATION_ENABLED
}={}){
 return enabled===true&&authority?.status==='SIGNED_CREATION_AUTHORITY'&&
  authority.allowed===true&&['it_admin','organization_owner'].includes(authority.basis);
}

/** Only a live, signed, owner-authorized server directory can enumerate
 * eligible transfer targets. Never present stale or workspace-foreign users.
 */
export function normalizeOwnerTransferCandidates(raw,{userId,workspaceId}={}){
 const fallback=Object.freeze({status:'UNAVAILABLE',members:[],currentOwnerId:null});
 if(!validUuid(userId)||!validUuid(workspaceId)||raw?.schemaVersion!==1||
    raw.actorId!==userId||raw.workspaceId!==workspaceId||
    raw.authorized!==true||!validUuid(raw.currentOwnerId)||
    !Array.isArray(raw.members)||raw.members.length>100)return fallback;
 const seen=new Set(),members=[];
 for(const row of raw.members){
  if(!validUuid(row?.id)||seen.has(row.id)||row.id===raw.currentOwnerId||
     typeof row.name!=='string'||row.name.trim().length<1||
     row.name.length>120||/[\u0000-\u001f\u007f<>]/.test(row.name)||
     row.verified!==true)return fallback;
  seen.add(row.id);
  members.push(Object.freeze({id:row.id,name:row.name.trim()}));
 }
 return Object.freeze({status:'VERIFIED_TRANSFER_CANDIDATES',
  workspaceId,actorId:userId,currentOwnerId:raw.currentOwnerId,
  members:Object.freeze(members)});
}

export function validateOwnershipTransfer({
 workspaceId,resourceKind='workspace',resourceId=null,
 targetUserId,requestId,expectedOwnerId
}={}){
 if(!validUuid(workspaceId)||!validUuid(targetUserId)||
    !validUuid(expectedOwnerId)||!validUuid(requestId)||
    targetUserId===expectedOwnerId||
    resourceKind!=='workspace')return null;
 if(resourceKind==='workspace'&&resourceId!==null)return null;
 // Board and module ownership require dedicated domain-specific APIs.
 return Object.freeze({workspaceId,resourceKind,
  ...(resourceKind==='board'?{resourceId}:{}),
  targetUserId,requestId,expectedOwnerId});
}

export class WorkspaceAuthorityClient{
 constructor({auth,api,enabled=WS03_RESTRICTED_CREATION_ENABLED,
  transferEnabled=WS03_OWNERSHIP_TRANSFER_ENABLED}={}){
  this.auth=auth;this.api=api;this.enabled=enabled===true;
  this.transferEnabled=transferEnabled===true;
 }
 async #actor(){
  if(typeof this.auth?.getVerifiedUser!=='function'||
     typeof this.api?.context!=='function'||typeof this.api?.rpc!=='function')
   deny('Signed workspace authority service unavailable.',503);
  const user=await this.auth.getVerifiedUser();
  const context=await this.api.context();
  if(!validUuid(user?.id)||user.id!==this.auth.userId||
     context?.user_id!==user.id||!validUuid(context?.workspace_id)||
     context?.profile?.status!=='active')
   deny('Signed workspace authority changed.',403);
  return Object.freeze({userId:user.id,workspaceId:context.workspace_id});
 }
 async readCreatorAuthority(){
  if(!this.enabled)return unauthorized;
  const actor=await this.#actor();
  const raw=await this.api.rpc('wm_ws03_creator_eligibility',{});
  const receipt=normalizeWorkspaceCreatorAuthority(raw,actor);
  const after=await this.#actor();
  if(after.userId!==actor.userId||after.workspaceId!==actor.workspaceId)
   return unauthorized;
  return receipt;
 }
 async readTransferCandidates(workspaceId){
  if(!this.transferEnabled)deny('Ownership transfer is not activated.',503);
  if(!validUuid(workspaceId))deny('Invalid workspace ID.',400);
  const actor=await this.#actor();
  if(actor.workspaceId!==workspaceId)deny('Inactive workspace.',403);
  const raw=await this.api.rpc('wm_ws03_transfer_candidates',{
   p_workspace_id:workspaceId
  });
  const receipt=normalizeOwnerTransferCandidates(raw,actor);
  const after=await this.#actor();
  if(after.userId!==actor.userId||after.workspaceId!==actor.workspaceId)
   deny('Signed workspace changed.',409);
  return receipt;
 }
 async transferOwnership(raw){
  if(!this.transferEnabled)
   deny('Owner transfers are not yet activated.',503);
  const request=validateOwnershipTransfer(raw);
  if(!request)deny('Invalid ownership transfer request.',400);
  const actor=await this.#actor();
  if(actor.workspaceId!==request.workspaceId)
   deny('The active workspace changed.',403);
  const response=await this.api.rpc('wm_ws03_transfer_ownership',{
   p_workspace_id:request.workspaceId,
   p_resource_kind:request.resourceKind,
   p_resource_id:request.resourceId||null,
   p_target_user_id:request.targetUserId,
   p_expected_owner_id:request.expectedOwnerId,
   p_request_id:request.requestId
  });
  const after=await this.#actor();
  if(after.userId!==actor.userId||after.workspaceId!==actor.workspaceId||
     response?.schemaVersion!==1||response.workspaceId!==request.workspaceId||
     response.targetUserId!==request.targetUserId||
     response.resourceKind!==request.resourceKind||response.transferred!==true)
   deny('Ownership transfer cannot be confirmed.',409);
  return Object.freeze({transferred:true,workspaceId:request.workspaceId,
   resourceKind:request.resourceKind,targetUserId:request.targetUserId});
 }
}
