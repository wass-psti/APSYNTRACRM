/** Item-only view mode for new ordinary boards.
 * The marker is persisted in the already authorized board UI settings' items tab.
 * It is display metadata, never an authorization decision.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
import {canManuallyEditBoard} from './board-inline-items.js';
import {moduleByBoardName} from './board-manifest.js';
export const ITEM_ONLY_MODE='item_only_v1';
export const newOrdinaryTabs=()=>[
 {key:'items',label:'Board items',visible:true},
 {key:'issues',label:'APSYNTRA Issues',visible:true}
];
export function isItemOnlyBoard(detail,settings){
 const b=detail?.board;
 return settings?.status==='VERIFIED_READ'&&settings.schemaMode===ITEM_ONLY_MODE&&
  validUuid(b?.id)&&!moduleByBoardName(b.name);
}
/** Reversible display migration, preserves all physical columns, values and item rows. */
export async function enableItemOnlyBoard({api,structure,auth,boardId,strictEmpty=false}={}){
 if(!validUuid(boardId)||!api?.board||!api?.context||!api?.allowed||
    !structure?.read||!structure?.save||!auth?.getVerifiedUser)
  throw new ApiError('Signed board configuration clients required.',403);
 const actor=await auth.getVerifiedUser(),ctx=await api.context();
 if(!validUuid(actor?.id)||actor.id!==ctx.user_id||actor.id!==auth.userId)
  throw new ApiError('Signed identity changed.',403);
 const detail=await api.board(boardId);
 if(!canManuallyEditBoard(detail?.board,true)||
   detail.board.workspace_id!==ctx.workspace_id||
   !await api.allowed(boardId,'manage'))
  throw new ApiError('Only authorized ordinary-board managers may change this layout.',403);
 if(strictEmpty&&((detail.items||[]).length||(detail.columns||[]).length))
  throw new ApiError('New board already contains records or columns; no automatic migration was attempted.',409);
 const settings=await structure.read(boardId);
 if(isItemOnlyBoard(detail,settings))return settings;
 if(settings.revision>0&&strictEmpty)
  throw new ApiError('Board settings changed during creation. Review them before proceeding.',409);
 const tabs=settings.tabs?.length?settings.tabs:newOrdinaryTabs();
 return structure.save(detail,{...settings,primaryLabel:'Item',
  schemaMode:ITEM_ONLY_MODE,tabs,columnLabels:settings.columnLabels||{}});
}
/** Use the existing board creation RPC; a failed second write never creates a duplicate board. */
export async function createItemOnlyBoard({api,structure,auth,name,description=''}={}){
 if(typeof name!=='string'||!name.trim()||name.trim().length>120)
  throw new ApiError('Board name must contain 1–120 characters.',400);
 const actor=await auth.getVerifiedUser(),ctx=await api.context();
 if(!validUuid(actor?.id)||actor.id!==ctx.user_id||ctx.profile?.status!=='active')
  throw new ApiError('Current signed workspace access required.',403);
 const id=await api.createBoard(name.trim(),String(description).slice(0,1200));
 if(!validUuid(id))throw new ApiError('Board creation receipt uncertain. Refresh boards before retrying.',409);
 try{
  await enableItemOnlyBoard({api,structure,auth,boardId:id,strictEmpty:true});
 }catch{
  throw new ApiError('Board was created, but Item-only settings were not verified. Do not retry creation. Find the board in My Boards and use Manage Columns to enable Item-only layout.',409);
 }
 return id;
}
