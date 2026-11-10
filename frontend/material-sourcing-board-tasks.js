/** Material Request Hub authoritative work_board_items task contract.
 * Non-production candidate backend must be present; no legacy task fallback.
 * Only signed, module-ADMIN item scope is accepted; no local task storage.
 */
import {ApiError} from './session.js';
import {MATERIAL_SOURCING_BOARD_ID} from './material-sourcing-schema-plan.js';
import {authorizeMaterialSourcingItem} from './material-sourcing-application.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses=Object.freeze(['not_started','working_on_it','done']);
const safeText=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const guard=options=>{
 if(options?.boardId!==MATERIAL_SOURCING_BOARD_ID||!UUID.test(options.itemId||'')||
    !UUID.test(options.workspaceId||''))throw new ApiError('Invalid Material Sourcing item context.',403);
};
function normalizeTask(raw){
 if(!raw||!UUID.test(raw.id||'')||typeof raw.title!=='string'||!raw.title.trim()||
  raw.title.length>240||!statuses.includes(raw.status)||
  !Number.isSafeInteger(raw.revision)||raw.revision<1)
  throw new ApiError('Invalid authoritative Material Sourcing task receipt.',502);
 return Object.freeze({id:raw.id,title:raw.title,status:raw.status,revision:raw.revision});
}
export async function readMaterialBoardItemTasks(options){
 guard(options);
 await authorizeMaterialSourcingItem(options);
 const payload=await options.api.rpc('mrh_board_item_tasks_read',{
  p_board_id:options.boardId,p_item_id:options.itemId
 });
 await authorizeMaterialSourcingItem(options);
 if(!payload||!Array.isArray(payload.tasks)||payload.tasks.length>100)
  throw new ApiError('Invalid signed Material Sourcing tasks response.',502);
 const ids=new Set();
 return Object.freeze(payload.tasks.map(raw=>{
  const item=normalizeTask(raw);
  if(ids.has(item.id))throw new ApiError('Duplicate task identifier.',502);
  ids.add(item.id);return item;
 }));
}
export async function saveMaterialBoardItemTask(options,{id=null,title,status='not_started',revision=null}={}){
 guard(options);
 if(id!==null&&!UUID.test(id)||id===null&&revision!==null||
  id!==null&&(!Number.isSafeInteger(revision)||revision<1))
  throw new ApiError('Task revision or identity unavailable; reload before saving.',409);
 const name=String(title??'').trim();
 if(!name||name.length>240||!statuses.includes(status))
  throw new ApiError('Enter a task name and valid status.',400);
 await authorizeMaterialSourcingItem({...options,edit:true});
 const result=await options.api.rpc('mrh_board_item_tasks_write',{
  p_board_id:options.boardId,p_item_id:options.itemId,p_task_id:id,
  p_title:name,p_status:status,p_expected_revision:revision
 });
 await authorizeMaterialSourcingItem({...options,edit:true});
 const saved=normalizeTask(result);
 if(id!==null&&(saved.id!==id||saved.revision!==revision+1)||
    id===null&&saved.revision!==1)
  throw new ApiError('Task write receipt uncertain. Reload before retrying.',409);
 return saved;
}
export function renderMaterialBoardItemTasks(tasks,{editable=false}={}){
 const choose=(status)=>statuses.map(s=>'<option value="'+s+'"'+(s===status?' selected':'')+'>'+
  ({not_started:'Not started',working_on_it:'Working on it',done:'Done'}[s])+'</option>').join('');
 return '<section class="mrh-item-tasks-active" aria-label="Verified Material Sourcing item tasks">'+
  '<h3>Tasks</h3><p class="muted">Tasks are stored against this authenticated APSYNTRA board item.</p>'+
  (tasks.length?'<ul>'+tasks.map(t=>
   '<li><form data-mrh-board-task data-task-id="'+safeText(t.id)+'" data-revision="'+t.revision+'">'+
   '<label>Task<input name="title" value="'+safeText(t.title)+'" maxlength="240" required'+(editable?'':' disabled')+'></label>'+
   '<label>Status<select name="status"'+(editable?'':' disabled')+'>'+choose(t.status)+'</select></label>'+
   (editable?'<button type="submit" class="secondary">Update</button>':'')+
   '</form></li>').join('')+'</ul>':'<p role="status">No persisted tasks for this item.</p>')+
  (editable?'<form data-mrh-board-task data-task-id="" data-revision="">'+
   '<label>New task<input name="title" maxlength="240" required placeholder="Task name"></label>'+
   '<label>Status<select name="status">'+choose('not_started')+'</select></label>'+
   '<button type="submit" class="primary">Add task</button></form>':'')+
  '<p role="status" aria-live="polite" data-mrh-task-status></p></section>';
}
