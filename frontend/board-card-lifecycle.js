import {ApiError} from './session.js';
import {validUuid} from './data.js';

/** CP-BOARD-MENU01. Enable only after the guarded CAS backend is activated. */
export const BOARD_CARD_LIFECYCLE_ENABLED=true; // Database CAS/RBAC migration installed.

const moduleMarker=/^\[APSYNTRA:MODULE:[a-z0-9-]+:v\d+\]/i;
const reservedNames=new Set(['APSYNTRA QA']);
const validTime=value=>typeof value==='string'&&
 Number.isFinite(Date.parse(value))&&Date.parse(value)>0;
const denied=message=>{throw new ApiError(message,403);};

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
   typeof this.api.rpc!=='function')denied('Authoritative board API unavailable.');
  const context=await this.api.context();
  if(!validUuid(context?.user_id)||!validUuid(context?.workspace_id)||
    context.profile?.status!=='active')denied('Active signed workspace required.');
  if(!(await this.api.allowed(board.id,'manage')))
   denied('Board manager authorization required.');
  const args={p_board_id:board.id,p_expected_updated_at:board.updated_at,
   p_action:action,p_name:action==='edit'?name:null,
   p_description:action==='edit'?description:null,
   p_confirm_name:action==='trash'?confirmName:null};
  const receipt=await this.api.rpc('wm_board_card_mutate',args);
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
 }
 edit(board,{name,description}){return this.mutate(board,'edit',{name,description});}
 trash(board,confirmName){return this.mutate(board,'trash',{confirmName});}
 restore(board){return this.mutate(board,'restore');}
}
