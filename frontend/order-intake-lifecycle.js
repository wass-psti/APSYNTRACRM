import {ORDER_INTAKE_STATUSES} from './order-intake-native.js';

const terminal=new Set(['Closed','Cancelled']);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function lifecycleActions(row){
 const native=row?.record_kind==='native'&&Number.isSafeInteger(row.revision)&&row.revision>0;
 return {status:Boolean(native&&row.archived===false&&!terminal.has(row.status)),
  archive:Boolean(native&&row.archived===false),restore:Boolean(native&&row.archived===true)};
}
export function lifecycleControls(row,{card=false}={}){
 const actions=lifecycleActions(row);
 const button=(action,label)=>'<button type="button" class="secondary" data-oi-action="'+action+'" data-oi-id="'+esc(row.id)+'">'+label+'</button>';
 return '<div class="oi-lifecycle-controls">'+(actions.status?button('status','Change status'):'')+
  (!card&&actions.archive?button('archive','Archive order'):'')+
  (actions.restore?button('restore','Restore order'):'')+'</div>';
}
export function lifecycleFields(row,action,target){
 if(action==='status')return '<label>New status<select name="status" required>'+ORDER_INTAKE_STATUSES.filter(status=>status!==row.status)
  .map(status=>'<option value="'+esc(status)+'"'+(status===target?' selected':'')+'>'+esc(status)+'</option>').join('')+'</select></label>'+
  '<p>Purchase order: '+esc(row.po_number)+' · Current status: '+esc(row.status)+'</p>';
 return '<p>'+esc(row.po_number)+(action==='archive'?' will be archived. The record and its activity will be retained.':' will return to the active registry with its existing status.')+'</p>';
}
function expected(row,action,target){
 return {revision:row.revision+1,status:action==='status'?target:row.status,archived:action==='archive'};
}
function matches(actual,row,wanted){
 return actual?.record_kind==='native'&&actual.id===row.id&&actual.workspace_id===row.workspace_id&&
  actual.revision===wanted.revision&&actual.status===wanted.status&&actual.archived===wanted.archived;
}
// Commit-first: no guessed card movement, no automatic mutation replay.
export async function saveLifecycle({client,row,action,target,isCurrent=()=>true}){
 if(!isCurrent())throw new Error('Order Intake context changed. Reopen the record.');
 if(!['status','archive','restore'].includes(action)||!lifecycleActions(row)[action])throw new Error('This lifecycle action is unavailable for the record.');
 if(action==='status'&&(!ORDER_INTAKE_STATUSES.includes(target)||target===row.status))throw new Error('Select a different valid status.');
 const wanted=expected(row,action,target);
 let mutationError;
 try{
  if(action==='status')await client.updateStatus(row.id,row.revision,target);
  else if(action==='archive')await client.archive(row.id,row.revision);
  else await client.restore(row.id,row.revision);
 }catch(error){mutationError=error;}
 if(!isCurrent())throw new Error('Order context changed; verify the current record before retrying.');
 const actual=await client.detail(row.id,{includeArchived:true}).catch(()=>null);
 if(!isCurrent())throw new Error('Order context changed; verify the current record before retrying.');
 if(matches(actual,row,wanted))return actual;
 if(mutationError)throw mutationError;
 throw new Error('Lifecycle save outcome could not be confirmed. Refresh the record before retrying.');
}
export function renderOrderActivity(activity){
 if(!activity)return '';
 if(activity.error)return '<p role="alert">Activity unavailable: '+esc(activity.error)+'</p>';
 const rows=activity.rows||[];
 return '<section class="oi-panel"><h3>Order activity</h3>'+
  (activity.hasMore?'<p>Showing latest 50 activity entries.</p>':'')+
  (rows.length?'<ol class="oi-activity">'+rows.map(row=>'<li><strong>'+esc(row.type)+'</strong><p>'+esc(row.message)+'</p><time>'+esc(row.created_at)+'</time></li>').join('')+'</ol>':'<p>No recorded activity.</p>')+'</section>';
}

// Delegated drag handling is shared by the CRM host and browser acceptance.
export function bindWorkflowDrag(root,{enabled,findRow,onDrop}){
 let id=null;
 function reset(){id=null;root.querySelectorAll('.oi-drop-target').forEach(node=>node.classList.remove('oi-drop-target'));}
 root.addEventListener('dragstart',event=>{
  const card=event.target.closest?.('[data-oi-drag]');
  if(!card||!enabled()||!lifecycleActions(findRow(card.dataset.oiDrag)).status)return;
  id=card.dataset.oiDrag;
  event.dataTransfer?.setData('text/plain',id);
  if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
 });
 root.addEventListener('dragover',event=>{
  const stage=event.target.closest?.('[data-oi-stage]');
  if(!id||!enabled()||!stage||!ORDER_INTAKE_STATUSES.includes(stage.dataset.oiStage))return;
  event.preventDefault();stage.classList.add('oi-drop-target');
 });
 root.addEventListener('dragleave',event=>{
  const stage=event.target.closest?.('[data-oi-stage]');
  if(stage&&(!event.relatedTarget?.nodeType||!stage.contains(event.relatedTarget)))stage.classList.remove('oi-drop-target');
 });
 root.addEventListener('dragend',reset);
 root.addEventListener('drop',event=>{
  const stage=event.target.closest?.('[data-oi-stage]'),row=id&&findRow(id);
  const target=stage?.dataset.oiStage;
  if(id&&enabled()&&stage)event.preventDefault();
  reset();
  if(enabled()&&lifecycleActions(row).status&&row.status!==target&&ORDER_INTAKE_STATUSES.includes(target))onDrop(row.id,target);
 });
 return reset;
}
