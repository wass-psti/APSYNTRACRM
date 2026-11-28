// Reuse the signed CRM item lifecycle RPC. No deletion or new role policy.
import {ApiError} from '../../session.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP} from '../../material-sourcing-schema-plan.js';
import {authorizeMaterialSourcingViewer,revalidateMaterialSourcingSession,isMaterialSourcingBoard} from '../../material-sourcing-application.js';

export function findLifecycleMaterial(detail,workspaceId,itemId){
 if(!isMaterialSourcingBoard(detail?.board)||detail.board.workspace_id!==workspaceId||
    !detail.groups?.some(g=>g.id===MATERIAL_SOURCING_GROUP.id&&g.title===MATERIAL_SOURCING_GROUP.title))
  throw new ApiError('Material board or Main group changed. Refresh.',409);
 const row=detail.items?.find(i=>i.id===itemId&&i.group_id===MATERIAL_SOURCING_GROUP.id&&
  (!i.board_id||i.board_id===MATERIAL_SOURCING_BOARD_ID));
 if(!row)throw new ApiError('Material is not in the loaded Main group. Refresh and locate it first.',409);
 return row;
}

export async function setMaterialArchived({api,auth,workspaceId,itemId,archived,isCurrent=()=>true}){
 const boardId=MATERIAL_SOURCING_BOARD_ID,scope={api,auth,workspaceId,boardId,itemId};
 if(typeof archived!=='boolean')throw new ApiError('Invalid material lifecycle action.',400);
 const actor=await authorizeMaterialSourcingViewer(scope);
 if(await api.allowed(boardId,'edit')!==true)throw new ApiError('Board edit access denied.',403);
 const fresh=async()=>{
  api.invalidateBoardCache?.(boardId,{invalidateContext:false});
  const detail=await api.board(boardId);
  await revalidateMaterialSourcingSession(scope,actor);
  return findLifecycleMaterial(detail,workspaceId,itemId);
 };
 const before=await fresh();
 if(!isCurrent())throw new ApiError('Material view changed. Reopen the material.',409);
 if(Boolean(before.archived_at)===archived)return {itemId,archived,changed:false};
 // The existing server RPC rechecks edit access and locks the board.
 // Never automatically retry an uncertain mutation.
 try{
  await api.rpc('wm_set_board_item_archived',{p_item_id:itemId,p_archived:archived});
 }catch{
  throw new ApiError('Material lifecycle result uncertain. Refresh and check its current state before retrying.',409);
 }
 let after;
 try{after=await fresh();}
 catch{throw new ApiError('Lifecycle request returned; readback is unavailable. Refresh and locate the material before retrying.',409);}
 if(Boolean(after.archived_at)!==archived)
  throw new ApiError('Lifecycle state could not be verified. Refresh before retrying.',409);
 return {itemId,archived,changed:true};
}
