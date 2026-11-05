/** CP-BOARD-BULK02: default-disabled typed client for pending atomic SQL.
 * No legacy mutation loops or optimistic "best effort" bulk writes.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
import {isProtectedBoard} from './board-card-lifecycle.js';
import {moduleByBoardName} from './board-manifest.js';

export const BOARD_BULK02_ENABLED=false; // Requires new production migration and real signed acceptance.
const reject=(reason,status=403)=>{throw new ApiError(reason,status);};
const uncertain=()=>{
 const error=new ApiError('Atomic bulk mutation receipt is uncertain. Do not retry blindly. Refresh the board and inspect activity before choosing another action.',409);
 error.bulkOutcomeUncertain=true;
 throw error;
};
const validTimestamp=value=>typeof value==='string'&&!Number.isNaN(Date.parse(value));
const supported=new Set(['status','archive','restore']);
export function canBulkEditBoard(board){
 return validUuid(board?.id)&&board?.status==='active'&&!isProtectedBoard(board)&&
  !moduleByBoardName(board.name);
}
export class BoardBulkClient{
 constructor(api,{enabled=BOARD_BULK02_ENABLED}={}){
  this.api=api;this.enabled=enabled;
 }
 async signed(board,level){
  if(!this.enabled)reject('Atomic board mutations are awaiting production activation.');
  if(!validUuid(board?.id)||!validUuid(board?.workspace_id)||board?.status!=='active')
   reject('This board is unavailable for structural changes.');
  if(!this.api?.context||!this.api?.allowed||!this.api?.rpc)
   reject('Centralized signed board API unavailable.');
  const ctx=await this.api.context();
  if(ctx?.workspace_id!==board.workspace_id||ctx.profile?.status!=='active')
   reject('Current signed workspace does not match the board.');
  if(!await this.api.allowed(board.id,level))
   reject('The assigned platform and board role does not permit this action.');
  return ctx;
 }
 async apply(board,action,items,{status=null}={}){
  if(!canBulkEditBoard(board))reject('Protected and application-owned boards cannot use generic bulk writes.');
  if(!supported.has(action)||!Array.isArray(items)||items.length<1||items.length>50)
   reject('Atomic bulk action requires 1–50 selected records.',400);
  const seen=new Set();
  const rows=items.map(item=>{
   if(!validUuid(item?.id)||!validTimestamp(item?.updated_at)||
      item.board_id!==board.id||seen.has(item.id))
    reject('One or more selected records are stale, duplicated or outside this board.',400);
   seen.add(item.id);
   const row={id:item.id,expected_updated_at:item.updated_at};
   if(action==='status'){
    if(typeof status!=='string'||!/^[A-Za-z0-9_.:-]{1,100}$/.test(status))
     reject('Choose a valid board status label.',400);
    row.status=status;
   }
   return row;
  });
  const ctx=await this.signed(board,'edit');
  let reply;
  try{
   reply=await this.api.rpc('wm_board_bulk_mutate',{
    p_board_id:board.id,p_action:action,p_rows:rows
   });
  }catch(error){
   const status=Number(error?.status);
   if(!Number.isInteger(status)||status<400||status>=500)uncertain();
   throw error;
  }
  if(reply?.boardId!==board.id||reply?.action!==action||reply?.applied!==rows.length||
      !Array.isArray(reply.items)||reply.items.length!==rows.length||
      new Set(reply.items.map(x=>x?.id)).size!==rows.length||
      reply.items.some(x=>!seen.has(x?.id)||!validTimestamp(x?.updatedAt)))
   uncertain();
  let after;
  try{after=await this.api.context();}catch{uncertain();}
  if(after?.user_id!==ctx.user_id||after?.workspace_id!==ctx.workspace_id)
   uncertain();
  return reply;
 }
 async group(board,group,action,{title=null}={}){
  if(!['rename','delete_empty'].includes(action))reject('Unsupported group action.',400);
  if(action==='delete_empty'&&!canBulkEditBoard(board))
   reject('Application-managed group deletion is prohibited.');
  if(!validUuid(group?.id)||group?.board_id!==board?.id||
     !validTimestamp(group?.updated_at))reject('Group revision or board relationship missing.',400);
  if(action==='rename'&&(typeof title!=='string'||title.trim().length<1||title.trim().length>120))
   reject('Group title must contain 1–120 characters.',400);
  const ctx=await this.signed(board,action==='delete_empty'?'manage':'edit');
  let reply;
  try{
   reply=await this.api.rpc('wm_board_group_cas',{
    p_board_id:board.id,p_group_id:group.id,
    p_expected_updated_at:group.updated_at,
    p_action:action,p_title:action==='rename'?title.trim():null
   });
  }catch(error){
   const status=Number(error?.status);
   if(!Number.isInteger(status)||status<400||status>=500)uncertain();
   throw error;
  }
  if(reply?.boardId!==board.id||reply?.groupId!==group.id||reply?.action!==action||
   (action==='rename'&&!validTimestamp(reply.updatedAt))||
   (action==='delete_empty'&&reply.updatedAt!==null))
   uncertain();
  let after;
  try{after=await this.api.context();}catch{uncertain();}
  if(after?.user_id!==ctx.user_id||after?.workspace_id!==ctx.workspace_id)
   uncertain();
  return reply;
 }
}
