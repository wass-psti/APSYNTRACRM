import {ApiError} from '../../session.js';
import {validUuid} from '../../data.js';
import {isProtectedBoard} from '../services/card-lifecycle.js';

const conflict=(message)=>new ApiError(message,409);
export function eligibleTrashBoard(board){
 return !!board&&validUuid(board.id)&&board.status==='trashed'&&!isProtectedBoard(board);
}
/**
 * The existing SQL RPC authoritatively checks manage access, trashed state,
 * and absence of storage references. This client never deletes Storage files.
 */
export class BoardTrashPermanentDeleteClient{
 constructor(api){this.api=api;this.inFlight=new Set();}
 async delete(board){
  if(!eligibleTrashBoard(board))throw new ApiError('Only unprotected trashed boards can be permanently deleted.',403);
  if(this.inFlight.has(board.id))throw conflict('Board deletion is already in progress.');
  if(!this.api?.context||!this.api?.board||!this.api?.allowed||!this.api?.rpc)
   throw new ApiError('Signed board deletion API unavailable.',503);
  this.inFlight.add(board.id);
  try{
   const ctx=await this.api.context();
   if(!validUuid(ctx?.user_id)||!validUuid(ctx?.workspace_id)||ctx.profile?.status!=='active')
    throw new ApiError('Active signed workspace required.',403);
   if(!await this.api.allowed(board.id,'manage'))
    throw new ApiError('Board management permission required.',403);
   const current=(await this.api.board(board.id,{complete:false,includeItems:false}))?.board;
   if(!eligibleTrashBoard(current)||current.id!==board.id||current.workspace_id!==ctx.workspace_id||
      current.name!==board.name||current.status!==board.status||
      (board.updated_at&&current.updated_at!==board.updated_at))
    throw conflict('Board changed or is no longer in this workspace. Refresh Trash before deleting.');
   const recheck=await this.api.context();
   if(recheck?.user_id!==ctx.user_id||recheck?.workspace_id!==ctx.workspace_id||
      recheck.profile?.status!=='active')
    throw conflict('Signed workspace changed. Reopen Trash before deleting.');
   // No client-side success on an ambiguous network failure. Never auto-retry.
   await this.api.rpc('wm_delete_board_permanently',{p_board_id:board.id});
   return {boardId:board.id};
  }finally{this.inFlight.delete(board.id);}
 }
 async deleteMany(boards,{onDeleted}={}){
  if(!Array.isArray(boards)||boards.length<1||boards.length>50||
     new Set(boards.map(board=>board?.id)).size!==boards.length||
     !boards.every(eligibleTrashBoard))
   throw new ApiError('Select between 1 and 50 distinct, unprotected trashed boards.',400);
  const deleted=[];
  for(const board of boards){
   try{
    await this.delete(board);
    deleted.push(board.id);
    onDeleted?.(board.id);
   }catch(error){
    // Deliberately stop at the first error; the caller must reconcile the
    // authoritative trash list before attempting any further deletions.
    const failure=new ApiError(
     deleted.length+' of '+boards.length+' boards deleted before deletion stopped at "'+
      board.name+'": '+(error?.message||'Unknown result')+
      '. Refresh Trash and review remaining boards before retrying.',
     409,'BOARD_DELETE_PARTIAL_OR_UNCERTAIN');
    failure.deletedIds=deleted;
    failure.cause=error;
    throw failure;
   }
  }
  return {deletedIds:deleted};
 }
}
