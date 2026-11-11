/** BIMP-03: reusable, signed board-import wizard for ordinary APSYNTRA boards. */
import {ApiError} from './session.js';
import {canManuallyEditBoard} from './board-inline-items.js';
import {parseImportFile} from './board-import-parse.js';
import {choiceCreationPreview,provisionImportChoiceColumn} from './board-import-choice-setup.js';
import {detectMondayCheckboxMarkers} from './monday-import-compat.js';
import {importMappingReadiness,skipPendingImportChoice,
 matchConfiguredImportChoice} from './board-import-readiness.js';
import {availableImportColumns,initialImportMappings,CREATABLE_IMPORT_TYPES,
 buildImportPlan,executeBoardImport} from './board-import-core.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const choice=(id,label,selected)=>'<option value="'+esc(id)+'"'+(selected?' selected':'')+'>'+esc(label)+'</option>';
const stepLabels=['Upload','Map columns','Handle matches'];
export async function openBoardImportWizard({api,auth,boardId,onComplete=async()=>{}}={}){
 if(!api?.board||!api?.allowed||!api?.context||!auth?.getVerifiedUser)
  throw new ApiError('Signed board-import clients unavailable.',403);
 let [actor,ctx,detail,edit,manage]=await Promise.all([
  auth.getVerifiedUser(),api.context(),api.board(boardId),
  api.allowed(boardId,'edit'),api.allowed(boardId,'manage')]);
 if(actor?.id!==auth.userId||ctx.user_id!==actor.id||ctx.workspace_id!==detail.board.workspace_id||
    ctx.profile?.status!=='active'||!edit||!canManuallyEditBoard(detail.board,true))
  throw new ApiError('Only signed ordinary-board editors can import records.',403);
 const state={step:1,file:null,sheet:0,mappings:[],group:'create',groupName:'Imported items',
  behavior:'add-new',matchColumnId:'item',canCreateColumns:manage,manage,busy:false,
  complete:null,error:'',notice:'',confirmed:false,plan:null,uncertain:false,renderedStep:0,choiceConsent:{}};
 const overlay=document.createElement('div');
 overlay.className='aps-import-overlay';
 overlay.setAttribute('role','presentation');
 const previousFocus=document.activeElement;
 const close=()=>{
  if(state.busy)return;
  overlay.remove();previousFocus?.focus?.();
 };
 const sheet=()=>state.file?.sheets[state.sheet];
 const missing=()=>state.mappings.filter(m=>m.action==='create');
 const readiness=()=>importMappingReadiness(state.mappings,state.canCreateColumns);
 const proposalSignature=mappings=>JSON.stringify(mappings.filter(m=>m.action==='create')
  .map(m=>[m.source,m.name||m.source,m.columnType||m.type]));
 const group=()=>state.group==='create'?
  {action:'create',name:state.groupName}:
  {action:'existing',groupId:state.group};
 const computePlan=()=>{
  if(readiness().pendingChoices.length)
   throw new Error('Finish or explicitly skip each pending Status/Dropdown setup before proceeding.');
  return buildImportPlan({sheet:sheet(),detail,mappings:state.mappings,
   group:group(),matches:{behavior:state.behavior,matchColumnId:state.matchColumnId},
   allowColumns:state.canCreateColumns});
 };
 function top(){
  return '<header class="aps-import-head"><strong>Import file</strong>'+
   '<nav class="aps-import-steps" aria-label="Import progress">'+stepLabels.map((s,i)=>
    '<span class="'+(i+1===state.step?'active':i+1<state.step?'done':'')+'">'+
    '<b>'+(i+1<state.step?'✓':i+1)+'</b>'+esc(s)+'</span>').join('')+'</nav>'+
   '<button type="button" data-imp="close" aria-label="Close import" class="aps-import-close">×</button></header>';
 }
 function upload(){
  return '<div class="aps-import-center"><div class="aps-import-drop" data-imp-drop>'+
   '<input type="file" id="aps-import-file-input" accept=".csv,.xlsx" hidden />'+
   '<button type="button" class="primary" data-imp="browse">Browse</button>'+
   '<h2>or drag and drop your file</h2><p>CSV and XLSX supported · Maximum 8 MB · 5,000 rows</p>'+
   '</div></div>';
 }
 function mapStep(){
  const s=sheet(),columns=availableImportColumns(detail);
  const sourceRange=s.rowNumbers?.length?
   ' · Excel rows '+s.rowNumbers[0]+'–'+s.rowNumbers.at(-1):'';
  const skipped=s.omittedRows?.length?
   ' · excluded report/summary rows: '+s.omittedRows.join(', '):'';
  const sourceInfo=s.worksheet?
   '<p class="aps-import-source-info" role="status">Source: '+esc(s.worksheet)+
   sourceRange+skipped+' · '+s.rows.length+' importable records</p>':'';
  const formulaWarnings=s.formulaWarnings||[];
  const formulaWarningInfo=formulaWarnings.length?
   '<p class="aps-import-formula-note" role="status"><strong>'+formulaWarnings.length+
   ' formula cell'+(formulaWarnings.length===1?' has':'s have')+
   ' no cached result and will be imported as blank.</strong> APSYNTRA does not calculate Excel formulas. Review: '+
   formulaWarnings.slice(0,5).map(w=>esc(w.cell)+(w.column?' ('+esc(w.column)+')':'')).join(', ')+
   (formulaWarnings.length>5?' and '+(formulaWarnings.length-5)+' more.':'.')+'</p>':'';
  const groupChoices=choice('create','New group',state.group==='create')+
   (detail.groups||[]).map(g=>choice(g.id,g.title,state.group===g.id)).join('');
  const header='<div class="aps-import-map-grid aps-import-map-heading"><span>'+
   esc(state.file.name)+'</span><span>Board columns</span></div>';
  const mapping=state.mappings.map((m,i)=>{
   const opts=[choice('skip',"Don't import column",m.action==='skip'),
    choice('item','Item (main title)',m.action==='item'),
    ...columns.map(c=>choice('existing:'+c.id,c.name+' · '+c.type,
     m.action==='existing'&&m.columnId===c.id))];
   if(state.manage){
    if(CREATABLE_IMPORT_TYPES.includes(m.type)||m.action==='create')
     opts.push(choice('create','Create new column…',m.action==='create'));
    opts.push(choice('setup:status','Configure new Status…',
     m.action==='configure'&&m.choiceType==='status'));
    opts.push(choice('setup:dropdown','Configure new Dropdown…',
     m.action==='configure'&&m.choiceType==='dropdown'));
   }
   const suggest=m.type||'text';
   let choiceSetup='';
   if(m.action==='configure'){
    let proposed=null,error='';
    try{proposed=choiceCreationPreview({sheet:s,source:m.source,
     type:m.choiceType,name:m.name,detail});}
    catch(err){error=String(err.message||err);}
    choiceSetup='<div class="aps-import-choice-config" role="group" aria-label="Choice column approval">'+
     '<p>Configured '+esc(m.choiceType)+
     '. This is a separate audited schema operation before record import.</p>'+
     '<label>New column name<input name="imp-choice-name-'+i+
     '" data-imp-choice-name="'+i+'" maxlength="80" value="'+esc(m.name||m.source)+'"></label>'+
     (proposed?'<p>Labels ('+proposed.labels.length+'): '+
      proposed.labels.map(esc).join(' · ')+'</p>'+
      '<label class="aps-import-choice-consent"><input type="checkbox" name="imp-choice-consent-'+i+
      '" data-imp-choice-consent="'+i+'"'+(state.choiceConsent[i]?' checked':'')+
      ' /> Create this column now. It will remain if I cancel or the later import fails.</label>'+
      '<button type="button" class="secondary" data-imp-choice-create="'+i+'"'+
      (!state.choiceConsent[i]?' disabled':'')+'>Create configured '+esc(m.choiceType)+' column</button>':
      '<p class="aps-import-error" role="alert">'+esc(error)+'</p>')+
     '</div>';
   }
   return '<div class="aps-import-map-grid aps-import-map-row" data-imp-map-row="'+i+'"><div><b>'+
    esc(m.source)+'</b><small>Detected: '+esc(suggest)+'</small><small>Example: '+
    esc(s.rows.find(r=>String(r[i]??'').trim())?.[i]??'—').slice(0,100)+'</small></div>'+
    '<div><label class="sr-only" for="imp-map-'+i+'">Map '+esc(m.source)+'</label>'+
    '<select id="imp-map-'+i+'" data-imp-map="'+i+'">'+opts.join('')+'</select>'+
    (m.action==='create'?'<div class="aps-import-proposed">'+
     '<label>New column name<input name="imp-column-name-'+i+'" data-imp-name="'+i+'" maxlength="80" value="'+esc(m.name||m.source)+'"></label>'+
     '<label>Column type<select name="imp-column-type-'+i+'" data-imp-type="'+i+'">'+
      CREATABLE_IMPORT_TYPES.map(t=>choice(t,t,t===(m.columnType||m.type))).join('')+
     choice('unsupported','Select a compatible type…',!CREATABLE_IMPORT_TYPES.includes(m.columnType||m.type))+
     '</select></label></div>':'')+choiceSetup+'</div></div>';
  }).join('');
  const newCols=missing();
  const mondayCheckboxSources=state.mappings.filter(m=>{
   const column=m.action==='existing'?columns.find(c=>c.id===m.columnId):null;
   return (m.action==='create'?m.columnType:column?.type)==='checkbox'&&
    detectMondayCheckboxMarkers(s,m.source);
  });
  const gate=readiness(),choicePending=gate.pendingChoices;
  const skippedChoices=state.mappings.filter(m=>m.action==='skip'&&
   (m.type==='status'||m.type==='dropdown'));
  return '<section class="aps-import-config"><h2>Map your file columns to this board</h2>'+
   '<p>Existing compatible columns are reused. Item is required and cannot be duplicated.</p>'+
   sourceInfo+formulaWarningInfo+
   '<div class="aps-import-controls">'+(state.file.sheets.length>1?'<label>Worksheet<select name="imp-sheet" data-imp-sheet>'+state.file.sheets.map((x,i)=>choice(i,x.name,i===state.sheet)).join('')+'</select></label>':'')+'<label>Add items to<select name="imp-group" data-imp-group>'+groupChoices+
   '</select></label>'+(state.group==='create'?'<label>New group name<input name="imp-group-name" maxlength="120" data-imp-group-name value="'+esc(state.groupName)+'"></label>':'')+
   '<label>Unmapped columns<select name="imp-default" data-imp-default>'+choice('skip',"Don't import",true)+
   (state.manage?choice('create','Create new columns',false):'')+'</select></label></div>'+
   '<div class="aps-import-mapping">'+header+mapping+'</div>'+
   (mondayCheckboxSources.length?
    '<p role="status" class="aps-import-checkbox-note">monday.com checkbox pattern detected in '+
    mondayCheckboxSources.map(m=>esc(m.source)).join(', ')+
    ': "v" will import as checked (true), and empty cells as unchecked (false).'+
    ' Generic blank cells in other columns remain empty.</p>':'')+
   (choicePending.length?'<div class="aps-import-resolve" role="region" aria-label="Required choice-column decisions">'+
    '<h3>'+choicePending.length+' Status/Dropdown decision'+(choicePending.length===1?'':'s')+
    ' required before continuing</h3>'+
    '<p>These choice columns are separate from the '+newCols.length+
    ' ordinary proposed column'+(newCols.length===1?'':'s')+
    '. Configure their source labels with board-manager approval, map to a compatible existing column, or explicitly exclude their data.</p>'+
    choicePending.map(({index,source,type})=>
     '<div class="aps-import-resolve-row"><strong>'+esc(source)+' ('+esc(type)+')</strong>'+
     '<div class="aps-import-choice">'+
     '<button type="button" class="primary" data-imp-review-choice="'+index+'">Review '+esc(source)+' setup</button>'+
     '<button type="button" class="secondary" data-imp-skip-choice="'+index+'">Skip '+esc(source)+' values (do not import)</button>'+
     '</div></div>').join('')+
    '<p>No records have been imported. Approved ordinary columns are not created until you click Import Now.</p>'+
    '</div>':'')+
   (skippedChoices.length?'<p class="aps-import-excluded" role="status">Not importing values from: '+
    skippedChoices.map(m=>esc(m.source)).join(', ')+
    '. You can restore these mappings before importing.</p>':'')+
   (newCols.length?'<div class="aps-import-permission" role="group" aria-label="Proposed columns">'+
    '<h3>'+newCols.length+' proposed column'+(newCols.length===1?'':'s')+'</h3>'+
    '<p>These columns will be created only when you confirm the final import. No board changes have been made yet.</p>'+
    '<p>'+newCols.map(m=>esc(m.name||m.source)+' ('+esc(m.columnType||m.type)+')').join(' · ')+'</p>'+
    '<button type="button" class="secondary" data-imp="decline-columns">Skip proposed columns</button>'+
    '</div>':'')+'</section>';
 }
 function matchStep(){
  const cols=availableImportColumns(detail).filter(c=>
   ['text','email','url','dropdown','status'].includes(c.type)&&
   state.mappings.some(m=>m.action==='existing'&&m.columnId===c.id));
  let result=null,validation='';
  try{result=computePlan();state.plan=result;}catch(error){validation=String(error.message||error);state.plan=null;}
  const radio=(id,title,description)=>'<label class="aps-import-match '+(state.behavior===id?'selected':'')+'">'+
   '<input type="radio" name="imp-behavior" value="'+id+'"'+(state.behavior===id?' checked':'')+' />'+
   '<span><strong>'+esc(title)+'</strong><small>'+esc(description)+'</small></span></label>';
  const matchSelect='<label>Matched by<select name="imp-match" data-imp-match>'+
   choice('item','Item title',state.matchColumnId==='item')+
   cols.map(c=>choice(c.id,c.name,state.matchColumnId===c.id)).join('')+'</select></label>';
  return '<section class="aps-import-match-screen"><h2>Set duplicate behavior</h2>'+
   '<p>Choose how rows in this file match records in the destination Group.</p>'+
   radio('add-new','Add as new items','Create every row; existing records are never changed.')+
   radio('skip','Skip','Do not import rows matching an existing record.')+
   radio('update','Update','Update matching items only; preserve empty destination cells.')+
   (state.behavior==='add-new'?'':matchSelect)+
   (validation?'<p class="aps-import-error" role="alert">'+esc(validation)+'</p>':'')+
   (result?'<div class="aps-import-summary"><h3>Import preview</h3><p>'+
    result.preview.newItems+' new · '+result.preview.updatedItems+' updates · '+
    result.preview.skippedItems+' skipped · '+result.preview.newColumns+
    ' new columns · '+result.preview.rowCount+' rows</p>'+
    (readiness().skipped.length?'<p>Excluded source columns: '+
     readiness().skipped.map(esc).join(', ')+'. Their values will not be imported.</p>':'')+
    '<p>The server will atomically validate and commit this import against the current board revision.</p>'+
    (result.payload.newColumns.length?'<p><strong>Columns to create:</strong> '+
     result.payload.newColumns.map(c=>esc(c.name)+' ('+esc(c.type)+')').join(' · ')+
     '. These additions are part of this same atomic import.</p>':'')+
    (result.payload.group.action==='create'?'<p><strong>New group:</strong> '+
     esc(result.payload.group.name)+'. It will be created with the imported records.</p>':'')+
    '<label class="aps-import-final-check"><input type="checkbox" name="imp-confirm" data-imp-confirm'+
    (state.confirmed?' checked':'')+' /> I reviewed the destination, mappings, and duplicate behavior'+
    (result.payload.newColumns.length?' and approve creating the listed columns':'')+
    (result.payload.group.action==='create'?' and creating the listed group':'')+
    ' as part of this import.</label>'+
    '</div>':'')+'</section>';
 }
 function resultStep(){
  const r=state.complete;
  return '<section class="aps-import-success" role="status"><h2>Import committed</h2>'+
   '<p>'+r.created+' created · '+r.updated+' updated · '+r.skipped+
   ' skipped · '+r.columnsCreated+' columns created · '+r.groupsCreated+
   ' groups created.</p><p>Refresh and audit verification are available on your board.</p></section>';
 }
 function render(){
  const active=overlay.contains(document.activeElement)?document.activeElement:null;
  const focusId=active?.id,focusName=active?.getAttribute('name'),focusValue=active?.value;
  const previousScroll=overlay.querySelector('.aps-import-body')?.scrollTop||0;
  const sameStep=state.renderedStep===state.step;
  if(!overlay.isConnected)document.body.append(overlay);
  overlay.innerHTML='<div class="aps-import-dialog" role="dialog" aria-modal="true" '+
   'aria-label="Import board data">'+top()+
   '<main class="aps-import-body" tabindex="-1">'+(state.step===1?upload():state.step===2?mapStep():
   state.step===3?matchStep():resultStep())+
   (state.notice?'<p class="aps-import-notice" role="status">'+esc(state.notice)+'</p>':'')+
   (state.error?'<p class="aps-import-error" role="alert">'+esc(state.error)+'</p>':'')+
   '</main><footer class="aps-import-footer">'+
   (state.step>1&&state.step<4?'<button class="secondary" data-imp="back"'+
    (state.busy?' disabled':'')+'>Back</button>':'<span></span>')+
   '<span class="aps-import-fill"></span>'+
   (state.step===2?(state.uncertain?
     '<button class="secondary" data-imp="close">Close and verify board</button>':
     readiness().pendingChoices.length?
     '<button class="primary" data-imp="review-choice"'+(state.busy?' disabled':'')+
     '>Review '+readiness().pendingChoices.length+' Status/Dropdown setup'+
     (readiness().pendingChoices.length===1?'':'s')+'</button>':
     '<button class="primary" data-imp="next"'+(state.busy?' disabled':'')+
     '>Next: Handle matches</button>'):'')+
   (state.step===3?(state.uncertain?
    '<button class="secondary" data-imp="close">Close and verify the board</button>':
    '<button class="primary" data-imp="import"'+
    (!state.plan||!state.confirmed||state.busy?' disabled':'')+'>'+
    (state.busy?'Importing…':'Import Now')+'</button>'):'')+
   (state.step===4?'<button class="primary" data-imp="close">Done</button>':'')+
   '</footer></div>';
  const body=overlay.querySelector('.aps-import-body');
  body.scrollTop=sameStep?previousScroll:0;
  if(!sameStep)body.focus({preventScroll:true});
  else if(active){
   const controls=[...overlay.querySelectorAll('input,select,button')];
   const focused=controls.find(el=>focusId&&el.id===focusId)||
    controls.find(el=>focusName&&el.name===focusName&&el.value===focusValue)||
    controls.find(el=>focusName&&el.name===focusName);
   focused?.focus({preventScroll:true});
  }
  state.renderedStep=state.step;
 }
 async function readFile(file){
  if(state.busy)return;
  state.busy=true;state.error='';state.notice='';render();
  try{
   const parsed=await parseImportFile(file);
   if(!overlay.isConnected)return;
   state.file=parsed;state.sheet=0;
   state.mappings=initialImportMappings(parsed.sheets[0],detail,{canCreate:state.manage});
   state.groupName=('Imported '+parsed.name.replace(/\.(xlsx|csv)$/i,'')).slice(0,120);
   state.step=2;state.canCreateColumns=state.manage;state.choiceConsent={};
  }catch(error){state.error=String(error.message||error);}
  finally{state.busy=false;render();}
 }
 function adjustMapping(index,value){
  const m=state.mappings[index];
  if(!m)return;
  const before=proposalSignature(state.mappings);
  state.confirmed=false;state.choiceConsent={};state.notice='';state.error='';
  if(value==='item'){
   state.mappings=state.mappings.map((a,i)=>i!==index&&a.action==='item'?
    {...a,action:'skip'}:a);
   state.mappings[index]={...m,action:'item'};
  }else if(value==='create')state.mappings[index]={...m,action:'create',
   name:m.name||m.source,columnType:CREATABLE_IMPORT_TYPES.includes(m.type)?m.type:'unsupported'};
  else if(value==='setup:status'||value==='setup:dropdown')
   state.mappings[index]={...m,action:'configure',
    name:m.name||m.source,choiceType:value.slice(6)};
  else if(value==='skip')state.mappings[index]={...m,action:'skip'};
  else if(value.startsWith('existing:'))state.mappings[index]={...m,
   action:'existing',columnId:value.slice(9)};
  // Unrelated, already-approved ordinary columns retain their consent.
  if(proposalSignature(state.mappings)!==before)state.canCreateColumns=state.manage;
 }
 function focusChoice(index){
  const target=overlay.querySelector('[data-imp-map-row="'+index+'"]');
  target?.scrollIntoView?.({block:'center',behavior:'auto'});
  (target?.querySelector('[data-imp-choice-consent]')||
   target?.querySelector('[data-imp-map]'))?.focus?.({preventScroll:true});
 }
 async function createChoice(index){
  if(state.busy||state.uncertain||!state.manage||!state.choiceConsent[index])return;
  const mapping=state.mappings[index];
  if(!mapping||mapping.action!=='configure')return;
  state.busy=true;state.error='';state.notice='';render();
  try{
   const result=await provisionImportChoiceColumn({api,auth,boardId,
    detail,sheet:sheet(),source:mapping.source,
    type:mapping.choiceType,name:mapping.name||mapping.source});
   detail=result.detail;
   state.mappings=matchConfiguredImportChoice(state.mappings,index,result.columnId);
   state.canCreateColumns=state.manage;state.choiceConsent={};state.confirmed=false;
   state.notice='Configured '+mapping.choiceType+' column created. Review and approve the remaining ordinary columns before importing.';
  }catch(error){
   state.error=String(error.message||error);
   if(error?.schemaOutcomeUncertain===true)state.uncertain=true;
  }finally{state.busy=false;render();}
 }
 async function doImport(){
  if(state.busy||state.uncertain||!state.confirmed||!state.plan)return;
  state.busy=true;state.error='';render();
  try{
   const plan=computePlan();
   const receipt=await executeBoardImport({api,auth,plan});
   state.complete=receipt;state.step=4;
   try{await onComplete(receipt);}catch{
    state.error='Import committed, but the board refresh failed. Refresh the board before starting another import.';
   }
  }catch(error){
   state.uncertain=error?.importOutcomeUncertain===true;
   state.error=String(error.message||error);
  }finally{state.busy=false;render();}
 }
 overlay.addEventListener('click',event=>{
  if(event.target===overlay){close();return;}
  const button=event.target.closest('[data-imp]');if(!button||state.busy)return;
  const action=button.dataset.imp;
  if(action==='close'){close();return;}
  if(action==='browse'){overlay.querySelector('#aps-import-file-input')?.click();return;}
  if(action==='back'){state.step--;state.error='';state.notice='';state.confirmed=false;render();return;}
  if(action==='review-choice'){
   const pending=readiness().pendingChoices[0];
   if(pending)focusChoice(pending.index);
   return;
  }
if(action==='decline-columns'){
   state.mappings=state.mappings.map(m=>m.action==='create'?{...m,action:'skip'}:m);
   state.canCreateColumns=false;render();return;
  }
  if(action==='next'){
   state.error='';
   const gate=readiness();
   if(gate.pendingChoices.length){focusChoice(gate.pendingChoices[0].index);return;}
   try{
computePlan();state.step=3;state.confirmed=false;
   }catch(error){state.error=String(error.message||error);}
   render();return;
  }
  if(action==='import')void doImport();
 });
 overlay.addEventListener('click',event=>{
  if(state.busy||state.uncertain)return;
  const button=event.target.closest('[data-imp-choice-create], [data-imp-review-choice], [data-imp-skip-choice]');
  if(!button)return;
  if(button.dataset.impChoiceCreate!=null){
   void createChoice(Number(button.dataset.impChoiceCreate));return;
  }
  if(button.dataset.impReviewChoice!=null){
   focusChoice(Number(button.dataset.impReviewChoice));return;
  }
  if(button.dataset.impSkipChoice!=null){
   const index=Number(button.dataset.impSkipChoice);
   const source=state.mappings[index]?.source;
   state.mappings=skipPendingImportChoice(state.mappings,index);
   state.choiceConsent={};state.confirmed=false;state.error='';
   state.notice='Excluded '+source+' values from this import. The remaining approved ordinary columns are unchanged.';
   render();
  }
 });
 overlay.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='aps-import-file-input'){if(el.files?.[0])void readFile(el.files[0]);return;}
  if(el.dataset.impSheet!=null){state.sheet=Number(el.value);state.mappings=initialImportMappings(sheet(),detail,{canCreate:state.manage});state.canCreateColumns=state.manage;state.choiceConsent={};state.confirmed=false;state.error='';render();return;}
  if(el.dataset.impChoiceConsent!=null){
   state.choiceConsent[Number(el.dataset.impChoiceConsent)]=el.checked;
   render();return;
  }
  if(el.dataset.impChoiceName!=null){
   const index=Number(el.dataset.impChoiceName);
   state.mappings[index].name=el.value.trim();
   state.choiceConsent={};state.confirmed=false;render();return;
  }
  if(el.dataset.impMap!=null){adjustMapping(Number(el.dataset.impMap),el.value);render();return;}
  if(el.dataset.impGroup!=null){state.group=el.value;state.confirmed=false;render();return;}
  if(el.dataset.impDefault!=null&&el.value==='create'){
   state.mappings=state.mappings.map(m=>m.action==='skip'&&CREATABLE_IMPORT_TYPES.includes(m.type)?
    {...m,action:'create',name:m.source,columnType:m.type}:m);
   state.canCreateColumns=state.manage;state.choiceConsent={};render();return;
  }
  if(el.name==='imp-behavior'){state.behavior=el.value;state.confirmed=false;render();return;}
  if(el.dataset.impMatch!=null){state.matchColumnId=el.value;state.confirmed=false;render();return;}
  if(el.dataset.impConfirm!=null){state.confirmed=el.checked;render();}
 });
 overlay.addEventListener('input',event=>{
  const el=event.target;
  if(el.dataset.impGroupName!=null){state.groupName=el.value;state.confirmed=false;return;}
  if(el.dataset.impChoiceName!=null){
   state.mappings[Number(el.dataset.impChoiceName)].name=el.value;
   state.choiceConsent={};state.confirmed=false;return;
  }
  if(el.dataset.impName!=null){
   state.mappings[Number(el.dataset.impName)].name=el.value;
   state.canCreateColumns=state.manage;state.choiceConsent={};state.confirmed=false;return;
  }
  if(el.dataset.impType!=null){
   state.mappings[Number(el.dataset.impType)].columnType=el.value;
   state.canCreateColumns=state.manage;state.confirmed=false;
  }
 });
 overlay.addEventListener('dragover',event=>{
  if(event.target.closest('[data-imp-drop]'))event.preventDefault();
 });
 overlay.addEventListener('drop',event=>{
  if(!event.target.closest('[data-imp-drop]'))return;
  event.preventDefault();if(event.dataTransfer?.files?.[0])void readFile(event.dataTransfer.files[0]);
 });
 const escHandler=event=>{
  if(event.key==='Escape'){event.preventDefault();close();}
  if(event.key==='Tab'){
   const focusable=[...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]):not([hidden]),select:not([disabled])')];
   if(!focusable.length)return;
   if(event.shiftKey&&document.activeElement===focusable[0]){event.preventDefault();focusable.at(-1).focus();}
   else if(!event.shiftKey&&document.activeElement===focusable.at(-1)){event.preventDefault();focusable[0].focus();}
  }
 };
 overlay.addEventListener('keydown',escHandler);
 render();overlay.querySelector('.aps-import-close')?.focus();
}
