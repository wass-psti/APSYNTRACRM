/** Material Request Hub: one authenticated transaction for public+private values.
 * Stable request ID allows an explicit retry to resolve uncertain RPC outcomes.
 * No custom production auth gate: existing item/board access and RPC enforce scope.
 */
import {ApiError} from './session.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP} from './material-sourcing-schema-plan.js';
import {authorizeMaterialSourcingItem,revalidateMaterialSourcingSession,
 readProtectedSourcingItem} from './material-sourcing-application.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deny=(message,status=409)=>{throw new ApiError(message,status)};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Only mounted-form memory, never persistent browser storage or a global draft.
const pendingForms=new WeakMap();
export function retainMaterialCreatePlan(form,plan,scope){
 const existing=pendingForms.get(form);
 if(existing){
  if(existing.scope!==scope||!eq(existing.plan,plan))
   deny('Retry the original material values in the same signed workspace before starting a different creation.');
  return existing.plan;
 }
 const retained=JSON.parse(JSON.stringify(plan));
 pendingForms.set(form,{scope,plan:retained});
 return retained;
}
export async function createMaterialSourcingAtomic({
 api,auth,workspaceId,requestId,plan
}={}){
 if(!UUID.test(workspaceId||'')||!UUID.test(requestId||'')||
 !plan||typeof plan.partNumber!=='string'||!plan.partNumber.trim()||
 !Array.isArray(plan.ordinary)||!Array.isArray(plan.protectedValues))
  deny('Invalid signed material creation request.',400);
 const scope={api,auth,workspaceId,boardId:MATERIAL_SOURCING_BOARD_ID,
  itemId:'00000000-0000-4000-8000-000000000000'};
 const actor=await authorizeMaterialSourcingItem({...scope,edit:true});
 const publicFields=plan.ordinary.map(field=>({name:field.name,value:field.value}));
 const protectedFields=Object.fromEntries(plan.protectedValues.map(field=>[field.name,field.value]));
 const response=await api.rpc('mrh_create_material_atomic',{
  p_request_id:requestId,p_part_number:plan.partNumber,
  p_public_fields:publicFields,p_private_fields:protectedFields
 });
 await revalidateMaterialSourcingSession(scope,actor);
 if(!UUID.test(response?.item_id||'')||response?.request_id!==requestId||
   typeof response?.created!=='boolean')
  deny('Material save response uncertain. Reload and inspect before retrying.');
 // Always check persisted server projection; a successful RPC alone is insufficient.
 api.invalidateBoardCache?.(MATERIAL_SOURCING_BOARD_ID,{invalidateContext:false});
 const detail=await api.board(MATERIAL_SOURCING_BOARD_ID);
 await revalidateMaterialSourcingSession(scope,actor);
 if(detail?.board?.workspace_id!==workspaceId||!detail.groups?.some(g=>
 g.id===MATERIAL_SOURCING_GROUP.id&&g.title===MATERIAL_SOURCING_GROUP.title)||
 !detail.items?.some(row=>row.id===response.item_id&&
 row.group_id===MATERIAL_SOURCING_GROUP.id&&row.title===plan.partNumber))
  deny('Material transaction committed but board reload is incomplete. Refresh.');
 for(const field of plan.ordinary){
  const value=(detail.values||[]).find(x=>x.item_id===response.item_id&&x.column_id===field.columnId);
  if(!value||!eq(value.value,field.value))
   deny('Material saved but public field reload is incomplete. Refresh.');
 }
 if(plan.protectedValues.length){
  const privateCells=await readProtectedSourcingItem({
   api,auth,workspaceId,boardId:MATERIAL_SOURCING_BOARD_ID,itemId:response.item_id
  });
  for(const field of plan.protectedValues){
   if(!privateCells[field.name]||!eq(privateCells[field.name].value,field.value))
    deny('Material saved but protected field reload is incomplete. Refresh.');
  }
 }
 return Object.freeze({itemId:response.item_id,partNumber:plan.partNumber,
  created:response.created,requestId});
}

// Staged until both additive RPCs and signed runtime acceptance are approved.
export const MATERIAL_SOURCING_DURABLE_CREATE_ENABLED=false;
export function materialCreationRecoveryKey(actor,workspaceId){
 if(!UUID.test(actor||'')||!UUID.test(workspaceId||''))deny('Signed recovery scope is unavailable.',403);
 return 'apsyntra.mrh.create.v1:'+actor+':'+workspaceId;
}
function recoveryScope({api,auth,workspaceId}){
 return {api,auth,workspaceId,boardId:MATERIAL_SOURCING_BOARD_ID,
  itemId:'00000000-0000-4000-8000-000000000000'};
}
/** Durable storage holds only an opaque UUID. Web Locks serialize same-origin
 * tabs; without Web Locks use per-tab session storage for reload recovery. */
async function withCreationRecovery(options,run){
 const {auth,workspaceId}=options,actor=auth?.userId;
 const key=materialCreationRecoveryKey(actor,workspaceId);
 const locks=options.locks===undefined?globalThis.navigator?.locks:options.locks;
 let storage;
 try{
  storage=options.storage===undefined?
   (locks?.request?globalThis.localStorage:globalThis.sessionStorage):options.storage;
  if(!storage)throw Error('unavailable');
 }catch{deny('Creation recovery storage is unavailable. No material was submitted.');}
 const access=()=>{
  let id;
  try{id=storage.getItem(key);}catch{deny('Creation recovery storage is unavailable.');}
  if(id!==null&&!UUID.test(id))deny('Saved creation identifier is invalid. Contact support before resubmitting.');
  return id;
 };
 const save=id=>{
  const current=access();
  if(!UUID.test(id)||(current&&current!==id))deny('Another material save needs recovery first.');
  try{storage.setItem(key,id);}catch{deny('Creation recovery storage could not be saved. No material was submitted.');}
  if(access()!==id)deny('Creation recovery identifier could not be verified.');
 };
 const clear=id=>{
  if(access()===id)storage.removeItem(key);
 };
 const task=async()=>{
  const scope=recoveryScope(options);
  if(auth.userId!==actor)deny('Sourcing session changed.',403);
  const verified=await authorizeMaterialSourcingItem({...scope,edit:true});
  if(verified!==actor)deny('Sourcing session changed.',403);
  return run({scope,actor,access,save,clear});
 };
 return locks?.request?locks.request(key,task):task();
}
async function readCreationReceipt(scope,actor,requestId){
 const {api,workspaceId}=scope;
 const result=await api.rpc('mrh_material_create_receipt',{p_request_id:requestId});
 await revalidateMaterialSourcingSession(scope,actor);
 if(result?.request_id!==requestId||
    !['committed','unresolved'].includes(result?.status)||
    (result.status==='committed'&&!UUID.test(result.item_id||''))||
    (result.status==='unresolved'&&Object.hasOwn(result,'item_id')))
  deny('Creation recovery receipt could not be verified.');
 if(result.status==='unresolved')return {status:'unresolved',requestId};
 api.invalidateBoardCache?.(MATERIAL_SOURCING_BOARD_ID,{invalidateContext:false});
 const detail=await api.board(MATERIAL_SOURCING_BOARD_ID);
 await revalidateMaterialSourcingSession(scope,actor);
 if(detail?.board?.id!==MATERIAL_SOURCING_BOARD_ID||detail.board.workspace_id!==workspaceId)
  deny('Recovered material board could not be verified.');
 const row=detail.items?.find(item=>item.id===result.item_id);
 const available=!!row&&!row.archived_at&&row.group_id===MATERIAL_SOURCING_GROUP.id;
 // A committed receipt proves the prior transaction, not that original values
 // are unchanged. Do not expose or persist its original commercial payload.
 return {status:'committed',requestId,itemId:result.item_id,
  partNumber:available?row.title:null,available,recovered:true};
}
export async function recoverMaterialCreation(options){
 return withCreationRecovery(options,async({scope,actor,access,clear})=>{
  const requestId=access();
  if(!requestId)return {status:'none'};
  const receipt=await readCreationReceipt(scope,actor,requestId);
  if(receipt.status==='committed')clear(requestId);
  return receipt;
 });
}
export async function createMaterialWithRecovery(options){
 const {form,formRequestId,newRequestId,onRequestId,plan}=options;
 return withCreationRecovery(options,async({scope,actor,access,save,clear})=>{
  const pending=access();
  if(pending&&pending!==formRequestId)
   deny('A previous save needs recovery. Select Recover previous save before resubmitting.');
  const requestId=pending||formRequestId||newRequestId;
  save(requestId);
  onRequestId?.(requestId);
  if(pending||formRequestId){
   const receipt=await readCreationReceipt(scope,actor,requestId);
   if(receipt.status==='committed'){clear(requestId);return receipt;}
  }
  const retained=retainMaterialCreatePlan(form,plan,actor+':'+scope.workspaceId);
  const created=await createMaterialSourcingAtomic({...options,requestId,plan:retained});
  clear(requestId);
  return created;
 });
}
