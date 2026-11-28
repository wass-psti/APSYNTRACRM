// Each selected material uses the same certified per-item edit/lifecycle contract.
import {planMaterialSourcingPublicChanges,saveMaterialSourcingAtomic} from '../../material-sourcing-public-edit.js';
import {authorizeMaterialSourcingViewer,authorizeMaterialSourcingItem,revalidateMaterialSourcingSession,
 readProtectedSourcingItem,planProtectedSourcingChanges} from '../../material-sourcing-application.js';
import {MATERIAL_SOURCING_BOARD_ID as boardId,MATERIAL_SOURCING_GROUP as group} from '../../material-sourcing-schema-plan.js';
import {findLifecycleMaterial,setMaterialArchived} from './lifecycle.js';
import {validUuid} from '../../data.js';

export const BATCH_LIMIT=50;
export const PUBLIC_BATCH_FIELDS=Object.freeze({source:'Source type',brand:'Brand',description:'Material description',
 quantity:'Quantity',lead:'Leadtime (weeks)',due:'Date required',rfq:'RFQ Ref No'});
export const PRIVATE_BATCH_FIELDS=Object.freeze(['Buying Price','Currency','Shipping Cost','Shipping Cost Currency','Vendor Details']);
const fail=message=>{throw Error(message);};
const ensure=(current,auth,actor)=>{if(!current()||auth.userId!==actor)fail('Material view or session changed.');};
export async function loadBatchMaterials({api,auth,workspaceId,isCurrent=()=>true}){
 const actor=auth.userId,scope={api,auth,workspaceId,boardId,itemId:'00000000-0000-4000-8000-000000000000'};
 await authorizeMaterialSourcingViewer(scope);
 if(await api.allowed(boardId,'edit')!==true)fail('Board edit access denied.');
 api.invalidateBoardCache?.(boardId,{invalidateContext:false});
 const detail=await api.board(boardId,{complete:true});
 await revalidateMaterialSourcingSession(scope,actor);ensure(isCurrent,auth,actor);
 if(detail?.board?.id!==boardId||detail.board.workspace_id!==workspaceId||detail.board.name!=='Material Request Hub'||
    detail.board.status!=='active'||!detail.groups?.some(g=>g.id===group.id&&g.title===group.title)||
    !Array.isArray(detail.items)||detail.pagination?.has_more===true||detail.pagination?.loaded===false)
  fail('Complete signed Main group records are required.');
 return detail;
}
export async function reviewBatchOperation({api,auth,workspaceId,itemIds,action,field,value,isCurrent=()=>true}){
 if(!['edit','archive','restore'].includes(action)||!Array.isArray(itemIds)||!itemIds.length||itemIds.length>BATCH_LIMIT||
    new Set(itemIds).size!==itemIds.length||itemIds.some(id=>!validUuid(id)))fail('Select 1–'+BATCH_LIMIT+' distinct materials.');
 const actor=auth.userId,detail=await loadBatchMaterials({api,auth,workspaceId,isCurrent});
 const rows=[];
 for(const itemId of itemIds){
  ensure(isCurrent,auth,actor);
  const item=findLifecycleMaterial(detail,workspaceId,itemId);
  if(Boolean(item.archived_at)!==(action==='restore'))fail('Selected material lifecycle state changed. Review again.');
  let publicChanges=[],privateChanges=[];
  if(action==='edit'){
   if(Object.hasOwn(PUBLIC_BATCH_FIELDS,field))
    publicChanges=planMaterialSourcingPublicChanges(detail,itemId,{[field]:value});
   else if(PRIVATE_BATCH_FIELDS.includes(field)){
    const scope={api,auth,workspaceId,boardId,itemId,edit:true};
    await authorizeMaterialSourcingItem(scope);
    const cells=await readProtectedSourcingItem(scope);
    privateChanges=planProtectedSourcingChanges(cells,{[field]:value});
   }else fail('Select a supported material field.');
  }
  rows.push({itemId,title:item.title,action,publicChanges,privateChanges,
   noChange:action==='edit'&&!publicChanges.length&&!privateChanges.length});
 }
 ensure(isCurrent,auth,actor);
 return {workspaceId,actor,action,rows};
}
export async function executeBatchOperation({api,auth,workspaceId,review,isCurrent=()=>true,onProgress=()=>{}}){
 const actor=auth.userId;
 if(review?.actor!==actor||review.workspaceId!==workspaceId||
    !Array.isArray(review.rows)||!review.rows.length||review.rows.length>BATCH_LIMIT)
  fail('Reviewed batch no longer belongs to this signed workspace.');
 const results=[];
 for(const row of review.rows){
  try{
   ensure(isCurrent,auth,actor);
   if(row.action!==review.action)fail('Invalid reviewed batch action.');
   if(row.noChange){results.push({itemId:row.itemId,title:row.title,state:'unchanged'});continue;}
   if(row.action==='edit'){
    await saveMaterialSourcingAtomic({api,auth,workspaceId,boardId,itemId:row.itemId,
     publicChanges:row.publicChanges,privateChanges:row.privateChanges});
   }else if(['archive','restore'].includes(row.action)){
    await setMaterialArchived({api,auth,workspaceId,itemId:row.itemId,archived:row.action==='archive',isCurrent});
   }else fail('Unsupported batch action.');
   results.push({itemId:row.itemId,title:row.title,state:'verified'});
  }catch(error){
   results.push({itemId:row.itemId,title:row.title,state:'needs reconciliation',reason:error.message});
   // No automatic retry or further writes after an uncertain result.
   return {results,remaining:review.rows.length-results.length,complete:false};
  }
  try{onProgress({completed:results.length,total:review.rows.length});}catch{}
 }
 return {results,remaining:0,complete:true};
}
