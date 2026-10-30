/** CP-A12 Phase A: signed board foundation operations.
 * Uses ONLY the existing Work Management RPCs; no backend/service-role bypass.
 * Provisioning is never automatic on login or page load.
 */
import {BOARD_MODULES,boardDescription,boardColumns} from './board-manifest.js';
function assert(ok,message){if(!ok)throw new Error(message);}
const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function inspectFoundation(api,{boards,context}={}){
 assert(context?.profile?.status==='active'&&validId.test(context.workspace_id||'')&&api.auth?.userId===context.user_id,
 'Signed workspace context required');
 const visible=boards??await api.boards('active');
 assert(Array.isArray(visible),'Live board list required');
 const out=[];
 for(const module of BOARD_MODULES){
  const matches=visible.filter(x=>x.name===module.name);
  if(matches.length!==1){
   out.push({module,status:matches.length?'duplicate':'missing',boardId:null,
     note:matches.length?'Multiple accessible boards share this name':'No accessible dedicated board'});continue;
  }
  const b=matches[0];
  try{
   assert(validId.test(b.id),'Invalid board ID');
   const detail=await api.board(b.id);
   assert(detail?.board?.id===b.id,'Board identity mismatch');
   assert(detail.board.workspace_id===context.workspace_id,'Wrong active workspace');
   assert(detail.board.status==='active'&&!detail.board.archived_at&&!detail.board.trashed_at,'Inactive board');
   const columns=Array.isArray(detail.columns)?detail.columns:[];
   const expected=boardColumns(module);
   const missing=expected.filter(x=>!columns.some(c=>c.name===x.name&&c.data_type===x.data_type));
   const marker=String(detail.board.description||'').startsWith('[APSYNTRA:MODULE:'+module.key+':v1]');
   const allowed=await api.allowed(b.id,'view');
   assert(allowed,'Server denied board view');
   const problems=[...(marker?[]:['Registry marker absent']),...(missing.length?[missing.length+' expected typed columns missing']:[])];
   out.push({module,boardId:b.id,status:problems.length?'mismatch':'ready',note:problems.join('; ')||'Live details and typed columns verified',
     columns:columns.length,items:Array.isArray(detail.items)?detail.items.length:0});
  }catch(err){
   out.push({module,boardId:b.id,status:'denied',note:'Board detail or authorization check failed'});
  }
 }
 return out;
}
export function summarizeFoundation(rows){
 const ready=rows.filter(r=>r.status==='ready').length;
 return {ready,total:BOARD_MODULES.length,missing:rows.filter(r=>r.status==='missing').length,
  blocked:rows.filter(r=>!['ready','missing'].includes(r.status)).length};
}
export async function provisionMissingBoards(api,{context,onProgress=()=>{},confirm=false}={}){
 assert(confirm===true,'Provisioning requires explicit authorization');
 assert(context?.profile?.status==='active'&&api.auth?.userId===context.user_id,'Authenticated workspace required');
 assert(context.profile.platform_role==='admin_general_manager','Platform administrator role required to provision twelve dedicated boards');
 const originalContext=await api.context();
 assert(originalContext.user_id===context.user_id&&originalContext.workspace_id===context.workspace_id,
 'Workspace changed; abort');
 const results=[];
 for(const module of BOARD_MODULES){
  // Read from authoritative service immediately before each creation.
  const current=await api.boards('active');
  const matches=current.filter(b=>b.name===module.name);
  if(matches.length===1){
   const entry={key:module.key,action:'existing',id:matches[0].id};results.push(entry);onProgress(entry);continue;
  }
  if(matches.length>1)throw Error('Duplicate board titles detected for '+module.name+'; administrator must reconcile');
  const id=await api.createConfiguredBoard(module.name,boardDescription(module),boardColumns(module));
  assert(validId.test(id),'Configured board creation did not return UUID for '+module.name);
  const detail=await api.board(id);
  assert(detail?.board?.id===id&&detail.board.workspace_id===context.workspace_id,
   'Created board identity/workspace mismatch: '+module.name);
  const entry={key:module.key,action:'created',id};results.push(entry);onProgress(entry);
 }
 return results;
}
