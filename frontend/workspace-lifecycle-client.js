/** CP-WS-01B — typed signed workspace lifecycle adapter.
 * Injected into the signed UI; creation requires server-side authorization,
 * verified caller identity/session, and a production-enabled creation flag.
 * Discovery and switching stay gated. Never trust arbitrary workspace headers/JWT metadata.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
import {normalizeServerWorkspaceCatalog,validateWorkspaceProposal,
 WS01_DISCOVERY_ENABLED,WS01_CREATION_ENABLED,WS01_SWITCHING_ENABLED
} from './workspace-ui.js?v=ws01-controls-20261106';

const fail=(message,status=403)=>{throw new ApiError(message,status);};

/** Configuration remains disabled in the deployed browser until a separate,
 * audited production grant and signed-user acceptance are completed. */
export const WS01_CONFIGURATION_ENABLED=false;
const validRevision=value=>Number.isSafeInteger(value)&&value>=1;
export function normalizeWorkspaceConfigurationReadReceipt(receipt,target){
 if(receipt?.schemaVersion!==1||!validUuid(target)||
  receipt.workspaceId!==target||typeof receipt.name!=='string'||
  receipt.name!==receipt.name.trim()||receipt.name.length<2||
  receipt.name.length>80||!['open','closed'].includes(receipt.privacy)||
  !validRevision(receipt.revision)||typeof receipt.canEdit!=='boolean')
  fail('Invalid signed workspace configuration receipt.',409);
 return Object.freeze({workspaceId:target,name:receipt.name,
  privacy:receipt.privacy,revision:receipt.revision,canEdit:receipt.canEdit});
}
export function normalizeWorkspaceConfigurationUpdateReceipt(receipt,target,proposal,expectedRevision){
 const expectedNext=expectedRevision+1;
 if(receipt?.schemaVersion!==1||!validUuid(target)||
  receipt.workspaceId!==target||receipt.name!==proposal?.name||
  receipt.privacy!==proposal?.privacy||typeof receipt.updated!=='boolean'||
  !validRevision(expectedRevision)||
  !validRevision(receipt.revision)||
  receipt.revision!==(receipt.updated?expectedNext:expectedRevision))
  fail('Invalid signed workspace configuration update receipt.',409);
 return Object.freeze({workspaceId:target,name:proposal.name,
  privacy:proposal.privacy,revision:receipt.revision,updated:receipt.updated});
}

export function normalizeWorkspaceCreationReceipt(receipt,privacy){
 if(receipt?.schemaVersion!==1||!validUuid(receipt.workspaceId)||
  receipt.relation!=='owner'||receipt.privacy!==privacy||
  typeof receipt.idempotent!=='boolean'||receipt.active!==false)
  fail('Invalid server workspace creation receipt.',409);
 return Object.freeze({
  workspaceId:receipt.workspaceId,relation:'owner',privacy,
  idempotent:receipt.idempotent,active:false
 });
}
export function normalizeWorkspaceSelectionReceipt(receipt,target,expected){
 if(receipt?.schemaVersion!==1||!validUuid(target)||!validUuid(expected)||
  receipt.workspaceId!==target||receipt.previousWorkspaceId!==expected||
  typeof receipt.switched!=='boolean'||(target===expected&&receipt.switched)||
  (target!==expected&&!receipt.switched))
  fail('Invalid authoritative workspace switch receipt.',409);
 return Object.freeze({workspaceId:target,previousWorkspaceId:expected,
  switched:receipt.switched});
}
export class WorkspaceLifecycleClient{
 constructor({auth,api}={}){this.auth=auth;this.api=api;}
 async signed(){
  if(typeof this.auth?.getVerifiedUser!=='function'||
   typeof this.api?.context!=='function'||typeof this.api?.rpc!=='function')
   fail('Signed workspace API unavailable.');
  const user=await this.auth.getVerifiedUser(),ctx=await this.api.context();
  if(!validUuid(user?.id)||user.id!==this.auth.userId||
    ctx?.user_id!==user.id||!validUuid(ctx?.workspace_id)||
    ctx?.profile?.status!=='active')
   fail('Signed workspace identity changed.');
  return Object.freeze({actorId:user.id,workspaceId:ctx.workspace_id});
 }
 async stable(previous){
  const again=await this.signed();
  if(again.actorId!==previous.actorId||again.workspaceId!==previous.workspaceId)
   fail('Signed workspace changed during request.');
 }
 async discover(){
  if(!WS01_DISCOVERY_ENABLED)fail('Workspace discovery is not activated.',503);
  const signed=await this.signed();
  const raw=await this.api.rpc('wm_ws01_list',{});
  const result=normalizeServerWorkspaceCatalog(raw,{
   userId:signed.actorId,workspaceId:signed.workspaceId});
  if(result.status!=='SIGNED_MEMBER_DISCOVERY')
   fail('Invalid signed workspace discovery result.',409);
  await this.stable(signed);
  return result;
 }
 async create({name,privacy,requestId}={}){
  if(!WS01_CREATION_ENABLED)fail('Workspace creation is not activated.',503);
  const proposal=validateWorkspaceProposal({name,privacy});
  if(!proposal.valid||!validUuid(requestId))fail('Invalid workspace request.',400);
  const signed=await this.signed();
  const raw=await this.api.rpc('wm_ws01_create',{
   p_name:proposal.name,p_privacy:proposal.privacy,p_request_id:requestId});
  const receipt=normalizeWorkspaceCreationReceipt(raw,proposal.privacy);
  await this.stable(signed); // creation never silently changes the workspace
  return receipt;
 }

 async readConfiguration(workspaceId){
  if(!WS01_CONFIGURATION_ENABLED)fail('Workspace configuration is not activated.',503);
  if(!validUuid(workspaceId))fail('Invalid workspace target.',400);
  const signed=await this.signed();
  const raw=await this.api.rpc('wm_ws01_config_read',{p_workspace_id:workspaceId});
  const receipt=normalizeWorkspaceConfigurationReadReceipt(raw,workspaceId);
  await this.stable(signed);
  return receipt;
 }
 async updateConfiguration({workspaceId,name,privacy,expectedRevision}={}){
  if(!WS01_CONFIGURATION_ENABLED)fail('Workspace configuration is not activated.',503);
  if(!validUuid(workspaceId)||!validRevision(expectedRevision))
   fail('Invalid workspace revision.',400);
  const proposal=validateWorkspaceProposal({name,privacy});
  if(!proposal.valid)fail('Invalid workspace configuration.',400);
  const signed=await this.signed();
  const raw=await this.api.rpc('wm_ws01_config_update',{
   p_workspace_id:workspaceId,p_name:proposal.name,p_privacy:proposal.privacy,
   p_expected_revision:expectedRevision
  });
  const receipt=normalizeWorkspaceConfigurationUpdateReceipt(
   raw,workspaceId,proposal,expectedRevision);
  await this.stable(signed);
  return receipt;
 }
 async select(targetWorkspaceId,expectedWorkspaceId){
  if(!WS01_SWITCHING_ENABLED)fail('Workspace switching is not activated.',503);
  if(!validUuid(targetWorkspaceId)||!validUuid(expectedWorkspaceId))
   fail('Invalid target workspace.',400);
  const signed=await this.signed();
  if(signed.workspaceId!==expectedWorkspaceId)
   fail('Stale workspace context.',409);
  const raw=await this.api.rpc('wm_ws01_select',{
   p_workspace_id:targetWorkspaceId,
   p_expected_workspace_id:expectedWorkspaceId});
  const receipt=normalizeWorkspaceSelectionReceipt(
   raw,targetWorkspaceId,expectedWorkspaceId);
  // A successful RPC is not enough. Re-read the server-authoritative context.
  const after=await this.signed();
  if(after.actorId!==signed.actorId||
     after.workspaceId!==targetWorkspaceId)
   fail('Authoritative workspace switch was not observed.',409);
  return receipt;
 }
}
