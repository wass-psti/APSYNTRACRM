/** CP-TT-GROUP01 — protected TimeTracker groups.
 * Read-only view hiding is immediately safe. Actual DB deletion is default-OFF
 * until the narrowly scoped, independently approved signed SQL RPC is live.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';

const PREFIX='apsyntra.tt.empty-group-hide.v1';
export const MANAGED_TT_GROUP_DELETE_ENABLED=false;
const deny=(message,status=403)=>{throw new ApiError(message,status);};
export function isManagedTimeTrackerBoard(board){
 return validUuid(board?.id)&&validUuid(board?.workspace_id)&&
  board.status==='active'&&board.name==='TimeTracker Attendance'&&
  String(board.description||'').startsWith('[APSYNTRA:MODULE:timetracker:v1]');
}
export function canSafelyHideEmptyTimeTrackerGroup(board,group,allGroups,items){
 return isManagedTimeTrackerBoard(board)&&validUuid(group?.id)&&
  group.board_id===board.id&&Number.isInteger(group.position)&&group.position>0&&
  Array.isArray(allGroups)&&allGroups.length>1&&
  allGroups.some(g=>g.id===group.id)&&Array.isArray(items)&&
  !items.some(i=>i.group_id===group.id);
}
function key(context,boardId){
 if(!validUuid(context?.user_id)||!validUuid(context?.workspace_id)||!validUuid(boardId))
  deny('Signed view preference context is unavailable.');
 return [PREFIX,context.user_id,context.workspace_id,boardId].join(':');
}
export function readHiddenEmptyGroups(context,boardId,storage=globalThis.localStorage){
 try{
  const raw=storage?.getItem(key(context,boardId));
  if(!raw||raw.length>5000)return new Set();
  const ids=JSON.parse(raw);
  return new Set(Array.isArray(ids)?ids.filter(validUuid).slice(0,100):[]);
 }catch{return new Set();}
}
export function hideEmptyTimeTrackerGroup(context,boardId,groupId,storage=globalThis.localStorage){
 if(!validUuid(groupId)||!storage?.setItem)
  deny('Group preference storage unavailable.',400);
 const next=readHiddenEmptyGroups(context,boardId,storage);
 next.add(groupId);
 if(next.size>100)deny('Too many hidden groups.',400);
 const storageKey=key(context,boardId);
 try{storage.setItem(storageKey,JSON.stringify([...next]));}
 catch{deny('This browser cannot preserve the view preference.',409);}
 return next;
}
export function restoreHiddenTimeTrackerGroups(context,boardId,storage=globalThis.localStorage){
 if(!storage?.removeItem)deny('Group preference storage unavailable.',400);
 const storageKey=key(context,boardId);
 try{storage.removeItem(storageKey);}
 catch{deny('Could not restore the hidden-group view.',409);}
}
/** Never run unless the production function and grants were separately accepted. */
export async function deleteEmptyManagedTimeTrackerGroup({
 auth,api,board,group,allGroups,items,confirmation,
 enabled=MANAGED_TT_GROUP_DELETE_ENABLED
}={}){
 if(enabled!==true)deny('Signed managed-group deletion is awaiting a separate production activation.');
 if(!canSafelyHideEmptyTimeTrackerGroup(board,group,allGroups,items))
  deny('Only an empty, nonprimary TimeTracker group is eligible.',409);
 if(typeof confirmation!=='string'||confirmation!=='DELETE '+group.title)
  deny('Exact group-name confirmation is required.',400);
 if(!auth?.getVerifiedUser||!api?.context||!api?.allowed||!api?.board||
    !api?.rpc||!api?.boardEvents)deny('Signed group mutation client is unavailable.');
 const actor=await auth.getVerifiedUser(),ctx=await api.context();
 if(!validUuid(actor?.id)||actor.id!==auth.userId||ctx.user_id!==actor.id||
    ctx.profile?.status!=='active'||ctx.workspace_id!==board.workspace_id)
  deny('Signed identity or workspace changed.');
 if(await api.allowed(board.id,'manage')!==true)
  deny('Board manager authorization is required.');
 const fresh=await api.board(board.id);
 const currentGroup=fresh?.groups?.find(g=>g.id===group.id);
 if(!isManagedTimeTrackerBoard(fresh?.board)||
    fresh.board.id!==board.id||fresh.board.workspace_id!==ctx.workspace_id||
    !currentGroup||currentGroup.title!==group.title||
    currentGroup.updated_at!==group.updated_at||
    !canSafelyHideEmptyTimeTrackerGroup(fresh.board,currentGroup,
     fresh.groups,fresh.items))
  deny('Group was modified or is no longer empty. Refresh first.',409);
 // The new server RPC repeats all authorization and emptiness checks while
 // holding the board lock; the client precheck is never trusted for safety.
 const receipt=await api.rpc('wm_managed_board_delete_empty_group',{
  p_board_id:board.id,p_group_id:group.id,
  p_expected_updated_at:group.updated_at,
  p_confirmation_title:group.title
 });
 if(receipt?.boardId!==board.id||receipt?.groupId!==group.id||
    receipt?.action!=='delete_empty'||receipt?.deleted!==true)
  deny('Group-deletion receipt uncertain. Reconcile before retrying.',409);
 const after=await api.board(board.id);
 if(after?.groups?.some(g=>g.id===group.id))
  deny('Group still appears after deletion. Do not automatically retry.',409);
 let audit='UNVERIFIED';
 try{
  const events=await api.boardEvents(board.id,200);
  if(Array.isArray(events)&&events.some(e=>e.entity_id===group.id&&
     e.event_type==='group.deleted_empty'&&e.actor_id===actor.id))audit='VERIFIED';
 }catch{/* An audit-read outage does not reverse committed deletion. */}
 return {status:'DELETED',audit};
}
