// Explicit review and confirmation. Re-select the same file after interruption.
import {parseImportFile} from '../../board/import/import-parse.js';
import {authorizeMaterialSourcingItem} from '../../material-sourcing-application.js';
import {MATERIAL_SOURCING_BOARD_ID as boardId} from '../../material-sourcing-schema-plan.js';
import {IMPORT_HEADERS,IMPORT_LIMIT,reviewMaterialImport,importReviewDigest,executeMaterialImport,
 importRecoveryKey,readMaterialImportRecovery} from './bulk-import.js';
export async function openMaterialImport({api,auth,workspaceId,isCurrent,onComplete=async()=>{}}){
 const actor=auth.userId,active=()=>isCurrent()&&auth.userId===actor;
 const scope={api,auth,workspaceId,boardId,itemId:'00000000-0000-4000-8000-000000000000',edit:true};
 await authorizeMaterialSourcingItem(scope);
 if(!active())return;
 const locks=globalThis.navigator?.locks;
 const storage=locks?.request?globalThis.localStorage:globalThis.sessionStorage;
 const key=importRecoveryKey(actor,workspaceId);
 const dialog=document.createElement('dialog');
 dialog.className='panel';
 dialog.style.cssText='width:min(900px,94vw);max-height:85vh;overflow:auto;';
 dialog.setAttribute('aria-label','Bulk material import');
 dialog.innerHTML='<h2>Bulk material import</h2><p>CSV/XLSX · one material per row · up to '+IMPORT_LIMIT+' rows. Each material is saved atomically; a workbook may partially complete.</p>'+
 '<p>Existing part numbers (including archived materials) and repeated part numbers in the file are skipped. Invalid rows are rejected. No existing material is overwritten.</p>'+
 '<button type="button" data-template>Download CSV template</button> <label>Choose workbook <input type="file" accept=".csv,.xlsx" data-file></label>'+
 '<label>Worksheet <select data-sheet disabled></select></label><button type="button" data-review disabled>Preview import</button>'+
 '<p role="status" aria-live="polite" data-status></p><div data-preview></div>'+
 '<button type="button" class="primary" data-commit disabled>Import reviewed new materials</button> <button type="button" data-close>Close</button>';
 const el=s=>dialog.querySelector(s);
 const status=message=>{el('[data-status]').textContent=message;};
 let workbook=null,review=null,digest=null,busy=false,marker=null;
 const setBusy=value=>{busy=value;for(const selector of ['[data-file]','[data-sheet]','[data-review]','[data-close]'])el(selector).disabled=value||
  ((selector==='[data-sheet]'||selector==='[data-review]')&&!workbook);
  el('[data-commit]').disabled=value||!review||(!marker&&!review.some(r=>r.state==='ready'));};
 const reset=()=>{review=null;digest=null;el('[data-preview]').replaceChildren();el('[data-commit]').disabled=true;};
 const showReview=()=>{
  const target=el('[data-preview]');target.replaceChildren();
  const counts=document.createElement('p');
  counts.textContent=['ready','skipped','rejected'].map(state=>state+': '+review.filter(r=>r.state===state).length).join(' · ');
  target.append(counts);
  if(marker){const p=document.createElement('p');p.textContent='Recovery: '+marker.rows.filter(r=>r.itemId).length+' of '+marker.rows.length+' previously verified. The original selected rows will be reconciled using their saved request IDs.';target.append(p);}
  const table=document.createElement('table'),header=table.createTHead().insertRow();
  for(const name of ['Row','Part number','Disposition','Reviewed field values']){const th=document.createElement('th');th.textContent=name;header.append(th);}
  const body=table.createTBody();
  for(const r of review){
   const tr=body.insertRow(),planned=marker?.rows.some(x=>x.index===r.index);
   const fields=r.plan?[...r.plan.ordinary,...r.plan.protectedValues].map(x=>x.name+': '+x.value).join(' · '):'';
   for(const value of [r.sourceRow,r.partNumber,planned?'Recovery row':r.state+(r.reason?' — '+r.reason:''),fields])tr.insertCell().textContent=String(value);
  }
  target.append(table);
 };
 el('[data-template]').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([Object.keys(IMPORT_HEADERS).join(',')+'\r\n'],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='material-sourcing-import-template.csv';a.click();URL.revokeObjectURL(url);
 });
 el('[data-file]').addEventListener('change',async()=>{
  reset();workbook=null;setBusy(true);
  try{
   workbook=await parseImportFile(el('[data-file]').files[0]);
   el('[data-sheet]').replaceChildren(...workbook.sheets.map((sheet,index)=>{
    const option=document.createElement('option');option.value=String(index);option.textContent=sheet.name||'Worksheet '+(index+1);return option;
   }));
   status('Select the worksheet and preview all rows.');
  }catch(error){status(error.message);}
  finally{setBusy(false);}
 });
 el('[data-sheet]').addEventListener('change',reset);
 el('[data-review]').addEventListener('click',async()=>{
  reset();setBusy(true);
  try{
   if(!active())throw Error('Material view changed. Reopen import.');
   api.invalidateBoardCache?.(boardId,{invalidateContext:false});
   const detail=await api.board(boardId,{complete:true});
   await authorizeMaterialSourcingItem(scope);
   if(!active())throw Error('Material view changed. Reopen import.');
   review=reviewMaterialImport(workbook.sheets[Number(el('[data-sheet]').value)],detail,workspaceId);
   digest=await importReviewDigest(review);
   marker=readMaterialImportRecovery(storage,key);
   if(marker&&marker.digest!==digest)throw Error('Pending import found. Choose the original reviewed worksheet.');
   showReview();
   status(marker?'Review the recovery rows, then resume.':'Review all rows. Import commits only ready rows; skipped/rejected rows are not written.');
   el('[data-commit]').textContent=marker?'Resume reviewed import':'Import reviewed new materials';
  }catch(error){reset();status(error.message);}
  finally{setBusy(false);}
 });
 el('[data-commit]').addEventListener('click',async()=>{
  if(busy||!review||!active())return;
  const count=marker?.rows.length??review.filter(r=>r.state==='ready').length;
  if(!window.confirm('Process '+count+' reviewed material rows? Each material is a separate atomic transaction.'))return;
  setBusy(true);
  try{
   const results=await executeMaterialImport({api,auth,workspaceId,review,approvedDigest:digest,storage,locks,isCurrent:active,
    onProgress:p=>status(p.completed+' of '+p.total+' material receipts verified.')});
   reset();marker=null;
   const list=document.createElement('ul');
   for(const result of results){const li=document.createElement('li');li.textContent='Source row '+result.sourceRow+' · '+result.state+' receipt · '+result.itemId;list.append(li);}
   el('[data-preview]').append(list);
   status(results.length+' material receipts verified. Import complete. Recovered receipts establish prior creation, not unchanged current values.');
   // Keep result visible; do not submit again if refresh fails.
   try{await onComplete(results);}catch{status(results.length+' receipts verified. Refresh the board to see the results.');}
  }catch(error){
   reset();status('Import stopped. Some rows may have committed. Re-select the same worksheet and preview to reconcile saved receipts. '+error.message);
  }finally{setBusy(false);}
 });
 el('[data-close]').addEventListener('click',()=>{if(!busy)dialog.close();});
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 const closed=new Promise(resolve=>dialog.addEventListener('close',resolve,{once:true}));
 document.body.append(dialog);dialog.showModal();
 try{marker=readMaterialImportRecovery(storage,key);if(marker)status('An interrupted import exists. Select the original worksheet to resume.');}
 catch(error){status(error.message);}
 await closed;
}
