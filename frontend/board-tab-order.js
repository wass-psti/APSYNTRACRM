/** CP-TT-BOARD-UX02: signed manager-only, server-authoritative view ordering.
 * Reuses existing CAS-protected board configuration; no new grants or RPCs.
 */
import {ApiError} from './session.js';
import {isManagedTimeTrackerBoard} from './managed-time-tracker-groups.js';

export function moveTabInOrder(keys,source,target){
 if(!Array.isArray(keys)||new Set(keys).size!==keys.length||
    !keys.includes(source)||!keys.includes(target)||source===target)return [...(keys||[])];
 const from=keys.indexOf(source),to=keys.indexOf(target);
 const result=[...keys];result.splice(from,1);result.splice(to,0,source);
 return result;
}

export async function reorderManagedTimeTrackerTabs({
 auth,api,structure,board,settings,context,from,to
}={}){
 if(!isManagedTimeTrackerBoard(board)||settings?.status!=='VERIFIED_READ'||
    settings.boardId!==board.id||!Array.isArray(settings.tabs))
  throw new ApiError('Protected board view configuration is unavailable.',403);
 if(context?.workspace_id!==board.workspace_id||context?.user_id!==auth?.userId||
    !auth?.getVerifiedUser)
  throw new ApiError('Signed workspace context changed.',403);
 const actor=await auth.getVerifiedUser();
 if(actor?.id!==context.user_id||!api?.allowed||!structure?.read||!structure?.save)
  throw new ApiError('Signed board manager session required.',403);
 if(await api.allowed(board.id,'manage')!==true)
  throw new ApiError('Only authorized board managers can reorder shared views.',403);
 const fresh=await structure.read(board.id);
 if(fresh?.status!=='VERIFIED_READ'||fresh.boardId!==board.id||
    fresh.revision!==settings.revision)
  throw new ApiError('Board view order changed. Refresh before trying again.',409);
 // An unconfigured board can have no saved tabs. Preserve any existing
 // labels and visibility while including the supported TimeTracker views.
 const defaults=[
  {key:'items',label:'Board items',visible:true},
  {key:'issues',label:'APSYNTRA Issues',visible:true},
  {key:'attendance',label:'TimeTracker attendance',visible:true}
 ];
 const tabs=[...fresh.tabs,...defaults.filter(tab=>!fresh.tabs.some(t=>t.key===tab.key))];
 const keys=tabs.map(tab=>tab.key);
 if(!keys.includes(from)||!keys.includes(to)||from===to)
  throw new ApiError('Choose two distinct available views.',400);
 const nextKeys=moveTabInOrder(keys,from,to);
 const byKey=new Map(tabs.map(tab=>[tab.key,tab]));
 return structure.save({board},{...fresh,tabs:nextKeys.map(key=>byKey.get(key))});
}
