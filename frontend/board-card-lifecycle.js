import {ApiError} from './session.js';
import {validUuid} from './data.js';

/** CP-BOARD-MENU01. Enable only after the guarded CAS backend is activated. */
export const BOARD_CARD_LIFECYCLE_ENABLED=true; // Database CAS/RBAC migration installed.

const moduleMarker=/^\[APSYNTRA:MODULE:[a-z0-9-]+:v\d+\]/i;
const reservedNames=new Set(['APSYNTRA QA']);
const validTime=value=>typeof value==='string'&&
 Number.isFinite(Date.parse(value))&&Date.parse(value)>0;
const denied=message=>{throw new ApiError(message,403);};
const sameLifecycleMetadata=(current,original)=>
 current?.name===original?.name&&
 String(current?.description??'')===String(original?.description??'')&&
 current?.status===original?.status;

export function isProtectedBoard(board){
 return !!board&&(reservedNames.has(String(board.name||'').trim())||
  moduleMarker.test(String(board.description||'')));
}
export function boardCardActionState(board,{enabled=BOARD_CARD_LIFECYCLE_ENABLED}={}){
 if(!board||!validUuid(board.id))return 'UNAVAILABLE';
 if(isProtectedBoard(board))return 'PROTECTED';
 if(enabled!==true)return 'DISABLED';
 return board.member_role==='owner'?'MANAGE':'DENIED';
}

export class BoardCardLifecycleClient{
 constructor(api,{enabled=BOARD_CARD_LIFECYCLE_ENABLED}={}){
  this.api=api;
  this.enabled=enabled;
  // Prevent overlapping writes for one board within this client instance.
  // The guard is acquired before asynchronous reads so duplicate clicks do
  // not create redundant context, permission, or board-shell requests.
  this.inFlightBoardIds=new Set();
 }
 async mutate(board,action,{name=null,description=null,confirmName=null}={}){
  if(this.enabled!==true)denied('Board lifecycle management is not activated.');
  if(!board||!validUuid(board.id)||!validTime(board.updated_at)||
    isProtectedBoard(board))denied('Board is protected or unavailable.');
  if(!['edit','trash','restore'].includes(action))throw new ApiError('Invalid board operation.');
  if(action==='edit'){
   if(board.status!=='active'&&board.status!=='archived')
    throw new ApiError('Only active or archived boards can be edited.');
   if(typeof name!=='string'||name.trim().length<1||name.trim().length>120||
      typeof description!=='string'||description.length>1200)
    throw new ApiError('Board name must be 1–120 characters and description at most 1200.');
   name=name.trim();
  }
  if(action==='trash'){
   if(!['active','archived'].includes(board.status)||
      typeof confirmName!=='string'||confirmName!==board.name)
    throw new ApiError('Enter the exact board name to confirm moving it to trash.');
  }
  if(action==='restore'&&!['archived','trashed'].includes(board.status))
   throw new ApiError('Only archived or trashed boards can be restored.');
  if(typeof this.api?.context!=='function'||typeof this.api.allowed!=='function'||
   typeof this.api.rpc!=='function'||typeof this.api.board!=='function')
   denied('Authoritative board API unavailable.');
  if(this.inFlightBoardIds.has(board.id))
   throw new ApiError('Board update already in progress. Wait for its result before retrying.',409);
  this.inFlightBoardIds.add(board.id);
  try{
   const context=await this.api.context();
   if(!validUuid(context?.user_id)||!validUuid(context?.workspace_id)||
    context.profile?.status!=='active')denied('Active signed workspace required.');
   if(!(await this.api.allowed(board.id,'manage')))
    denied('Board manager authorization required.');

   // Board.updated_at is a content-wide activity timestamp: ordinary cell
   // writes also advance it. Revalidate the actual lifecycle fields so those
   // unrelated writes do not create false metadata conflicts.
   const readCurrentRevision=async()=>{
    const snapshot=await this.api.board(board.id,{complete:false,includeItems:false});
    const latest=snapshot?.board;
    if(!latest||latest.id!==board.id||latest.workspace_id!==context.workspace_id||
      !validTime(latest.updated_at))
     denied('Latest signed board metadata could not be verified. Refresh and retry.');
    if(!sameLifecycleMetadata(latest,board))
     throw new ApiError(
      'Board details or lifecycle state changed since this action was opened. Refresh and review the latest board before continuing.',
      409,'BOARD_METADATA_CHANGED');
    return latest.updated_at;
   };

   let expectedUpdatedAt=await readCurrentRevision();
   const args={p_board_id:board.id,p_expected_updated_at:expectedUpdatedAt,
    p_action:action,p_name:action==='edit'?name:null,
    p_description:action==='edit'?description:null,
    p_confirm_name:action==='trash'?confirmName:null};
   let receipt;
   for(let attempt=0;attempt<2;attempt++){
    try{
     receipt=await this.api.rpc('wm_board_card_mutate',args);
     break;
    }catch(error){
     // A cell write can advance the global board timestamp between the shell
     // read and this RPC. Refresh once, but only retry if lifecycle metadata
     // itself is unchanged. Never retry an actual concurrent metadata edit.
     if(attempt!==0||error?.code!=='40001')throw error;
     expectedUpdatedAt=await readCurrentRevision();
     args.p_expected_updated_at=expectedUpdatedAt;
    }
   }
   const expected=action==='trash'?'trashed':action==='restore'?'active':board.status;
   if(!receipt||receipt.boardId!==board.id||receipt.action!==action||
     receipt.status!==expected||!validTime(receipt.updatedAt))
    denied('Board update receipt failed signed contract validation.');
   const afterward=await this.api.context();
   if(afterward.user_id!==context.user_id||
    afterward.workspace_id!==context.workspace_id||
    afterward.profile?.status!=='active')
    denied('Signed workspace changed during board mutation. Refresh to reconcile.');
   return receipt;
  }finally{
   this.inFlightBoardIds.delete(board.id);
  }
 }
 edit(board,{name,description}){return this.mutate(board,'edit',{name,description});}
 trash(board,confirmName){return this.mutate(board,'trash',{confirmName});}
 restore(board){return this.mutate(board,'restore');}
}
