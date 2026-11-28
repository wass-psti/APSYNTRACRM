import {MATERIAL_SOURCING_GROUP as group} from '../../material-sourcing-schema-plan.js';
import {BATCH_LIMIT,PUBLIC_BATCH_FIELDS,PRIVATE_BATCH_FIELDS,loadBatchMaterials,
 reviewBatchOperation,executeBatchOperation} from './batch-operations.js';

export async function openMaterialBatch({api,auth,workspaceId,isCurrent,onComplete=async()=>{}}){
 const actor=auth.userId,active=()=>isCurrent()&&auth.userId===actor;
 const scope={api,auth,workspaceId,isCurrent:active};
 const detail=await loadBatchMaterials(scope);
 if(!active())return;
 const dialog=document.createElement('dialog');
 dialog.className='panel ms-native-batch-dialog';
 dialog.setAttribute('aria-label','Material batch operations');
 dialog.innerHTML='<h2>Material batch operations</h2><p>Select up to '+BATCH_LIMIT+' materials. Each item is a separate verified transaction. A failed or uncertain item stops further writes.</p>'+
 '<label>Operation <select data-action-choice><option value="edit">Edit field</option><option value="archive">Archive</option><option value="restore">Restore</option></select></label>'+
 '<div data-edit><label>Field <select data-field></select></label> <label>New value <input data-value type="text" maxlength="2000"></label><p>One field per batch. Blank ordinary values clear that field. Commercial values must satisfy their existing validation.</p></div>'+
 '<fieldset data-targets><legend>Select materials</legend><div data-items></div></fieldset>'+
 '<button type="button" data-review>Review selected materials</button><p role="status" aria-live="polite" data-status></p><div data-preview></div>'+
 '<button type="button" class="primary" data-commit disabled>Apply reviewed batch</button> <button type="button" data-close>Close</button>';
 const el=s=>dialog.querySelector(s);
 const status=message=>{el('[data-status]').textContent=message;};
 const items=detail.items.filter(i=>i.group_id===group.id);
 let review=null,busy=false,finished=false;
 for(const [value,name] of [...Object.entries(PUBLIC_BATCH_FIELDS),...PRIVATE_BATCH_FIELDS.map(f=>[f,f])]){
  const option=document.createElement('option');option.value=value;option.textContent=name;el('[data-field]').append(option);
 }
 const reset=()=>{review=null;el('[data-preview]').replaceChildren();el('[data-commit]').disabled=true;};
 const showItems=()=>{
  reset();const action=el('[data-action-choice]').value,target=el('[data-items]');
  el('[data-edit]').hidden=action!=='edit';target.replaceChildren();
  for(const item of items.filter(i=>Boolean(i.archived_at)===(action==='restore'))){
   const label=document.createElement('label'),check=document.createElement('input');
   check.type='checkbox';check.value=item.id;label.append(check,document.createTextNode(' '+item.title+' '));
   const line=document.createElement('div');line.append(label);target.append(line);
  }
 };
 const setBusy=value=>{
  busy=value;
  for(const selector of ['[data-action-choice]','[data-field]','[data-value]','[data-targets]','[data-review]'])
   el(selector).disabled=value||finished;
  el('[data-close]').disabled=value;
  el('[data-commit]').disabled=value||finished||!review||review.rows.every(r=>r.noChange);
 };
 el('[data-action-choice]').addEventListener('change',showItems);
 for(const selector of ['[data-field]','[data-value]','[data-items]'])
  el(selector).addEventListener(selector==='[data-value]'?'input':'change',reset);
 el('[data-review]').addEventListener('click',async()=>{
  reset();setBusy(true);
  try{
   review=await reviewBatchOperation({...scope,action:el('[data-action-choice]').value,
    itemIds:[...el('[data-items]').querySelectorAll('input:checked')].map(x=>x.value),
    field:el('[data-field]').value,value:el('[data-value]').value});
   const list=document.createElement('ul');
   for(const row of review.rows){
    const li=document.createElement('li');
    const changes=[...row.publicChanges.map(c=>c.key+': '+String(c.expectedValue??'—')+' → '+String(c.value??'—')),
     ...row.privateChanges.map(c=>c.fieldName+': new value '+String(c.value)+' (expected revision '+String(c.expectedRevision??'none')+')')];
    li.textContent=row.title+' · '+(row.noChange?'No change':changes.length?changes.join('; '):row.action);
    list.append(li);
   }
   el('[data-preview]').append(list);status('Review '+review.rows.length+' selected materials before applying.');
  }catch(error){reset();status(error.message);}
  finally{setBusy(false);}
 });
 el('[data-commit]').addEventListener('click',async()=>{
  if(busy||finished||!review||!active())return;
  if(!window.confirm('Apply '+review.action+' to '+review.rows.length+' reviewed materials? Each item commits separately.'))return;
  setBusy(true);finished=true;
  try{
   const result=await executeBatchOperation({...scope,review,onProgress:p=>status(p.completed+' of '+p.total+' processed.')});
   reset();const list=document.createElement('ul');
   for(const row of result.results){const li=document.createElement('li');li.textContent=row.title+' · '+row.state+(row.reason?' — '+row.reason:'');list.append(li);}
   el('[data-preview]').append(list);
   status(result.complete?'Batch complete. Review the verified results.':'Batch stopped; '+result.remaining+' rows not attempted. Reopen the board and reconcile the affected item before retrying.');
   try{await onComplete(result);}catch{status('Batch finished or stopped. Refresh the board and inspect the results before another batch.');}
  }catch(error){status('Batch requires reconciliation. '+error.message);}
  finally{setBusy(false);}
 });
 el('[data-close]').addEventListener('click',()=>{if(!busy)dialog.close();});
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 const closed=new Promise(resolve=>dialog.addEventListener('close',resolve,{once:true}));
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 showItems();document.body.append(dialog);dialog.showModal();
 await closed;
}
