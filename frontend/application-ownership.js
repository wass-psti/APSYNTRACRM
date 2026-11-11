/** WS03 app ownership: a deliberately separate, default-off domain contract.
 * App ownership is NOT the global module_role_assignments "ADMIN" role.
 * Each application must adopt a reviewed workspace-scoped source of truth
 * and transactional transfer/revocation before its capability is enabled.
 */
import {validUuid} from './data.js';
import {ApiError} from './session.js';

export const WS03_APP_OWNER_TRANSFER_ENABLED=false;
export const APP_OWNER_SUPPORTED_MODULES=Object.freeze([
 'time-tracker','fueltrack-plus','tradelink','toolbox-issues',
 'fund-released-tracker','fueltrans','order-intake',
 'tool-traceability','material-request-hub','aps-aims',
 'employee-eval','charter-navigator'
]);
const allowed=new Set(APP_OWNER_SUPPORTED_MODULES);
const denied=Object.freeze({status:'UNAVAILABLE',apps:[],canTransfer:false});
const fail=(reason,status=403)=>{throw new ApiError(reason,status);};

/** The browser can display only workspace-bound, actor-signed app ownership
 * descriptions returned by a reviewed backend. Legacy generic ADMIN is not
 * inferred to mean "app owner".
 */
export function normalizeAppOwnerCapabilities(raw,{userId,workspaceId}={}){
 if(!validUuid(userId)||!validUuid(workspaceId)||
    raw?.schemaVersion!==1||raw.actorId!==userId||
    raw.workspaceId!==workspaceId||raw.authorized!==true||
    !Array.isArray(raw.apps)||raw.apps.length>APP_OWNER_SUPPORTED_MODULES.length)
  return denied;
 const seen=new Set(),apps=[];
 for(const row of raw.apps){
  if(!allowed.has(row?.moduleId)||seen.has(row.moduleId)||
     !validUuid(row.ownerUserId)||typeof row.canTransfer!=='boolean'||
     ![null,'owner','it_admin'].includes(row.transferAuthority??null)||
     (row.canTransfer!==Boolean(row.transferAuthority)))
   return denied;
  seen.add(row.moduleId);
  apps.push(Object.freeze({
   moduleId:row.moduleId,ownerUserId:row.ownerUserId,
   canTransfer:row.canTransfer,
   transferAuthority:row.transferAuthority??null
  }));
 }
 return Object.freeze({status:'SIGNED_APP_OWNER_CAPABILITIES',
  workspaceId,actorId:userId,apps:Object.freeze(apps),
  canTransfer:apps.some(x=>x.canTransfer)});
}

export function validateAppOwnerTransfer({
 workspaceId,moduleId,expectedOwnerId,targetUserId,requestId
}={}){
 if(!validUuid(workspaceId)||!allowed.has(moduleId)||
    !validUuid(expectedOwnerId)||!validUuid(targetUserId)||
    !validUuid(requestId)||expectedOwnerId===targetUserId)return null;
 return Object.freeze({workspaceId,moduleId,expectedOwnerId,targetUserId,requestId});
}
export class AppOwnerTransferClient{
 constructor({auth,api,enabled=WS03_APP_OWNER_TRANSFER_ENABLED}={}){
  this.auth=auth;this.api=api;this.enabled=enabled===true;
 }
 async #actor(workspaceId){
  if(typeof this.auth?.getVerifiedUser!=='function'||
     typeof this.auth?.authorized!=='function'||
     typeof this.api?.context!=='function')
   fail('Signed application ownership service unavailable.',503);
  const u=await this.auth.getVerifiedUser(),ctx=await this.api.context();
  if(!validUuid(u?.id)||u.id!==this.auth.userId||
     ctx?.user_id!==u.id||ctx?.workspace_id!==workspaceId||
     ctx?.profile?.status!=='active')
   fail('Signed application workspace changed.',403);
  return u.id;
 }
 async #call(workspaceId,operation,request){
  if(!this.enabled)fail('Application owner transfer is not activated.',503);
  const actor=await this.#actor(workspaceId);
  const raw=await this.auth.authorized('/functions/v1/ws03-app-ownership',{
   method:'POST',retryUnauthorized:false,body:{operation,request}
  });
  const after=await this.#actor(workspaceId);
  if(after!==actor)fail('Signed application actor changed.',409);
  return {raw,actor};
 }
 async readCapabilities(workspaceId){
  if(!validUuid(workspaceId))fail('Invalid workspace.',400);
  const {raw,actor}=await this.#call(workspaceId,'capabilities',{workspaceId});
  return normalizeAppOwnerCapabilities(raw,{userId:actor,workspaceId});
 }
 async transfer(raw,capabilities){
  const request=validateAppOwnerTransfer(raw);
  if(!request)fail('Invalid application ownership request.',400);
  if(capabilities?.status!=='SIGNED_APP_OWNER_CAPABILITIES'||
     capabilities.workspaceId!==request.workspaceId||
     !capabilities.apps.some(app=>app.moduleId===request.moduleId&&
      app.ownerUserId===request.expectedOwnerId&&app.canTransfer))
   fail('Application ownership authorization not verified.',403);
  const {raw:receipt,actor}=await this.#call(request.workspaceId,'transfer',request);
  if(receipt?.schemaVersion!==1||receipt.actorId!==actor||
     receipt.workspaceId!==request.workspaceId||
     receipt.moduleId!==request.moduleId||
     receipt.requestId!==request.requestId||
     receipt.targetUserId!==request.targetUserId||
     receipt.committed!==true)
   fail('Application ownership transfer receipt unconfirmed.',409);
  return Object.freeze({state:'COMMITTED',
   workspaceId:request.workspaceId,moduleId:request.moduleId,
   requestId:request.requestId,targetUserId:request.targetUserId});
 }
 async verify(raw){
  const request=validateAppOwnerTransfer(raw);
  if(!request)fail('Invalid application transfer verification.',400);
  const {raw:receipt,actor}=await this.#call(request.workspaceId,'verify',request);
  if(receipt?.schemaVersion!==1||receipt.actorId!==actor||
     receipt.workspaceId!==request.workspaceId||
     receipt.moduleId!==request.moduleId||
     receipt.requestId!==request.requestId||
     receipt.currentOwnerId!==request.targetUserId||
     receipt.verified!==true)
   fail('Application owner change not independently verified.',409);
  return Object.freeze({verified:true,workspaceId:request.workspaceId,
   moduleId:request.moduleId,targetUserId:request.targetUserId});
 }
}
