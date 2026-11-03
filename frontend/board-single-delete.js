/** Explicit single-item permanent removal through the established signed RPC.
 * The legacy server RPC is NOT CAS-aware. Never claim atomic stale-write protection.
 * Multi-item deletion is intentionally out of scope until a signed batch CAS contract exists.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
import {canManuallyEditBoard} from './board-inline-items.js';

function deny(message,status=403){throw new ApiError(message,status);}
/** Resolve a selection to authoritative, active ordinary-board rows.
 * This is a chooser, NOT a multi-record deletion or mutation permission grant.
 */
export function selectedDeleteCandidates(board,items,selectedIds){
 if(!canManuallyEditBoard(board,true)||!Array.isArray(items)||
    !(selectedIds instanceof Set)||selectedIds.size===0)
  deny('Select an active ordinary-board item first.',400);
 if(selectedIds.size>2000)deny('Too many selected items; narrow the selection.',400);
 const lookup=new Map(items.filter(i=>i&&validUuid(i.id)&&i.board_id===board.id)
  .map(item=>[item.id,item]));
 const selected=[];
 for(const id of selectedIds){
  const item=lookup.get(id);
  if(!item||item.archived_at||typeof item.title!=='string'||!item.title||
     typeof item.updated_at!=='string'||!Number.isFinite(Date.parse(item.updated_at)))
   deny('Selected items changed. Refresh before deletion.',409);
  selected.push(item);
 }
 return selected;
}
export async function deleteOneAuthorizedItem({api,auth,board,item,confirmTitle}={}){
 if(!canManuallyEditBoard(board,true)||!validUuid(item?.id)||
    item.board_id!==board.id||item.archived_at||
    typeof item.title!=='string'||!item.title||
    typeof item.updated_at!=='string'||!Number.isFinite(Date.parse(item.updated_at)))
  deny('Only active items in authorized ordinary boards can be deleted.');
 if(confirmTitle!==item.title)deny('The item name confirmation did not match.',400);
 if(!api?.context||!api?.allowed||!api?.board||!api?.deleteBoardItem||
    !auth?.getVerifiedUser)deny('Signed board API is unavailable.');
 const actor=await auth.getVerifiedUser(),ctx=await api.context();
 if(!validUuid(actor?.id)||actor.id!==auth.userId||
    actor.id!==ctx.user_id||ctx.workspace_id!==board.workspace_id||
    ctx.profile?.status!=='active')deny('Signed identity or workspace changed.');
 if(await api.allowed(board.id,'edit')!==true)
  deny('The current board role cannot delete items.');
 const fresh=await api.board(board.id);
 if(fresh?.board?.id!==board.id||fresh.board.workspace_id!==ctx.workspace_id||
    !canManuallyEditBoard(fresh.board,true))deny('Board scope changed.');
 const current=fresh.items?.find(x=>x.id===item.id);
 if(!current||current.board_id!==board.id||current.archived_at||
    current.updated_at!==item.updated_at||current.title!==item.title)
  deny('The item changed. Refresh before deleting it.',409);
 // The existing server RPC independently verifies role, locks the board, rejects
 // file-backed items and writes item.deleted in the audit. It lacks revision CAS;
 // front-end prechecks cannot close a simultaneous-update race.
 await api.deleteBoardItem(item.id);
 const latest=await api.board(board.id);
 if(latest.items?.some(x=>x.id===item.id))
  throw new ApiError('Delete receipt uncertain; do not retry before reconciling the board.',409);
 let audit='UNVERIFIED';
 try{
  const events=await api.boardEvents(board.id,200);
  if(Array.isArray(events)&&events.some(e=>e.entity_id===item.id&&
     e.event_type==='item.deleted'&&e.actor_id===actor.id))audit='VERIFIED';
 }catch{/* Successful deletion is not reversed by an audit-read outage. */}
 return {status:'DELETED',audit,boardId:board.id};
}
