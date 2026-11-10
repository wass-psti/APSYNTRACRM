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
