/** BIMP-03: reusable, signed board-import wizard for ordinary APSYNTRA boards. */
import {ApiError} from './session.js';
import {canManuallyEditBoard} from './board-inline-items.js';
import {parseImportFile} from './board-import-parse.js';
import {normalizeImportFailure} from './board-import-errors.js';
import {choiceCreationPreview,provisionImportChoiceColumn} from './board-import-choice-setup.js';
import {detectMondayCheckboxMarkers} from './monday-import-compat.js';
import {importMappingReadiness,skipPendingImportChoice,
 matchConfiguredImportChoice,reassignImportItemMapping} from './board-import-readiness.js';
import {availableImportColumns,initialImportMappings,CREATABLE_IMPORT_TYPES,
 buildImportPlan} from './board-import-core.js';
import {executeBoardImportBatched,IMPORT_BATCH_SIZE,importBatchSize} from './board-import-batches.js';
import {readImportRecovery,clearImportRecovery,sealImportRecovery,
 importDigest,verifyImportRecovery} from './board-import-durable.js';
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
  behavior:'add-new',matchColumnId:'item',allowColumns:manage,manage,busy:false,
  complete:null,error:'',notice:'',confirmed:false,plan:null,uncertain:false,renderedStep:0,
  omittedRowsConfirmed:false,formulaWarningsConfirmed:false,importProgress:null,
  extendedReferences:api.extendedRefsSupported===true,
  resumeCheckpoint:null,recoveryMarker:readImportRecovery({userId:actor.id,boardId}),
  recoveryMode:false,recoverySourceDigest:null,recoveryOffset:0,
  originalReceipt:null,executionPlan:null};
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
 const readiness=()=>importMappingReadiness(state.mappings,state.allowColumns);
 const group=()=>state.group==='create'?
  {action:'create',name:state.groupName}:
  {action:'existing',groupId:state.group};
 const recoverSheet=()=>state.recoveryMode?{...sheet(),
  rows:sheet().rows.slice(state.recoveryOffset),
  rowNumbers:sheet().rowNumbers?.slice(state.recoveryOffset),
  omittedRowsConfirmed:true,formulaWarningsConfirmed:true}:sheet();
 const computePlan=()=>{
  if(readiness().pendingChoices.length)
   throw new Error('Finish or explicitly skip each pending Status/Dropdown setup before proceeding.');
  return buildImportPlan({sheet:{...recoverSheet(),omittedRowsConfirmed:state.omittedRowsConfirmed,
   formulaWarningsConfirmed:state.formulaWarningsConfirmed},detail,mappings:state.mappings,
   group:group(),matches:{behavior:state.behavior,matchColumnId:state.matchColumnId},
   allowColumns:state.allowColumns,extendedReferences:state.extendedReferences});
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
   '<h2>or drag and drop your file</h2><p>CSV and XLSX supported · Maximum 8 MB · 20,000 source rows (adaptive verified batches, up to '+IMPORT_BATCH_SIZE+' rows)</p>'+
   (state.recoveryMarker?'<p>Previous import: '+state.recoveryMarker.completed+
    ' of '+state.recoveryMarker.rows+' rows verified. Select the same workbook to continue.</p>'+
    '<button type="button" class="secondary" data-imp="clear-recovery">Discard recovery marker</button>':'')+
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
  const formulaAcknowledgement=formulaWarnings.length?
   '<button type=\"button\" class=\"secondary\" data-imp-confirm-formulas>'+
   (state.formulaWarningsConfirmed?'Confirmed: import unavailable formula results as blank':
    'Confirm blank values for '+formulaWarnings.length+' uncached formula cells')+'</button>':'';
  const omittedRows=s.omittedRows||[];
  const omittedRowsAcknowledgement=omittedRows.length?
   '<div class=\"aps-import-resolve\" role=\"group\" aria-label=\"Worksheet summary rows\">'+
   '<p>'+omittedRows.length+' non-record summary/footer row'+(omittedRows.length===1?'':'s')+
   ' have no Item title and cannot become board items. Source rows: '+omittedRows.join(', ')+'.</p>'+
   '<button type=\"button\" class=\"secondary\" data-imp-confirm-omitted>'+
   (state.omittedRowsConfirmed?'Confirmed: exclude these summary rows':'Confirm exclusion of summary rows')+'</button></div>':'';
  const groupChoices=choice('create','New group',state.group==='create')+
   (detail.groups||[]).map(g=>choice(g.id,g.title,state.group===g.id)).join('');
  const header='<div class="aps-import-map-grid aps-import-map-heading"><span>'+
   esc(state.file.name)+'</span><span>Board columns</span></div>';
  const mapping=state.mappings.map((m,i)=>{
   const opts=[choice('skip',"Don't import column",m.action==='skip'),
    choice('item','Item (main title)',m.action==='item'),
    ...columns.map(c=>choice('existing:'+c.id,c.name+' · '+c.type+(c.visible===false?' · hidden':''),
     m.action==='existing'&&m.columnId===c.id))];
   if(state.manage&&!state.recoveryMode){
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
     type:m.choiceType,name:m.name,detail,existingColumnId:m.existingColumnId});}
    catch(err){error=String(err.message||err);}
    choiceSetup='<div class="aps-import-choice-config" role="group" aria-label="Choice column approval">'+
     '<p>Configured '+esc(m.choiceType)+
     '. This is a separate audited schema operation before record import.</p>'+
     (m.existingColumnId?'<p>Existing column: <strong>'+esc(m.name||m.source)+'</strong></p>':
      '<label>New column name<input name="imp-choice-name-'+i+
      '" data-imp-choice-name="'+i+'" maxlength="80" value="'+esc(m.name||m.source)+'"></label>')+
     (proposed?'<p>Labels ('+proposed.labels.length+'): '+
      proposed.labels.map(esc).join(' · ')+'</p>'+
      (m.existingColumnId?
       '<p>'+proposed.added.length+' missing Status label(s) will be added and '+proposed.reactivated.length+' inactive label(s) will be reactivated. Existing IDs and saved values are preserved; this configuration remains if you cancel import.</p>':
       '<p>This creates the configured board column now. It remains available if you cancel the later record import.</p>')+
      '<button type="button" class="secondary" data-imp-choice-create="'+i+'">'+
       (m.existingColumnId?'Add missing Status labels':'Create configured '+esc(m.choiceType)+' column')+'</button>':
      '<p class="aps-import-error" role="alert">'+esc(error)+'</p>')+
     '</div>';
   }
   return '<div class="aps-import-map-grid aps-import-map-row" data-imp-map-row="'+i+'"><div><b>'+
    esc(m.source)+'</b><small>Detected: '+esc(suggest)+'</small><small>Example: '+
    (m.action==='skip'&&m.conflict?'Value omitted for incompatible source':
     esc(s.rows.find(r=>String(r[i]??'').trim())?.[i]??'—').slice(0,100))+
    '</small></div>'+
    '<div><label class="sr-only" for="imp-map-'+i+'">Map '+esc(m.source)+'</label>'+
    '<select id="imp-map-'+i+'" data-imp-map="'+i+'">'+opts.join('')+'</select>'+
    (m.action==='skip'&&m.conflict?
     '<p class="aps-import-notice" role="status">A same-name board column exists ('+
      esc(m.conflict.destinationTypes.join(', '))+'), but its data is '+
      (m.conflict.reason==='ambiguous'?'ambiguous':'not fully compatible')+
      (m.conflict.row?' at worksheet row '+esc(m.conflict.row):'')+
      '. Select a compatible destination or explicitly exclude this source; no data will be silently discarded.</p>':'')+
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
  const gate=readiness(),choicePending=gate.pendingChoices,pendingSkips=gate.pendingSkips;
  const skippedChoices=state.mappings.filter(m=>m.action==='skip'&&
   (m.type==='status'||m.type==='dropdown'));
  return '<section class="aps-import-config"><h2>Map your file columns to this board</h2>'+
   '<p>Existing compatible columns are reused. Item is required and cannot be duplicated.</p>'+
   sourceInfo+formulaWarningInfo+formulaAcknowledgement+omittedRowsAcknowledgement+
   '<div class="aps-import-controls">'+(state.file.sheets.length>1?'<label>Worksheet<select name="imp-sheet" data-imp-sheet>'+state.file.sheets.map((x,i)=>choice(i,x.name,i===state.sheet)).join('')+'</select></label>':'')+'<label>Add items to<select name="imp-group" data-imp-group>'+groupChoices+
   '</select></label>'+(state.group==='create'?'<label>New group name<input name="imp-group-name" maxlength="120" data-imp-group-name value="'+esc(state.groupName)+'"></label>':'')+
   '<label>Unmapped columns<select name="imp-default" data-imp-default>'+choice('skip',"Don't import",true)+
   (state.manage?choice('create','Create columns on import',false):'')+'</select></label></div>'+
   '<div class="aps-import-mapping">'+header+mapping+'</div>'+
   (mondayCheckboxSources.length?
    '<p role="status" class="aps-import-checkbox-note">monday.com checkbox pattern detected in '+
    mondayCheckboxSources.map(m=>esc(m.source)).join(', ')+
    ': "v" will import as checked (true), and empty cells as unchecked (false).'+
    ' Generic blank cells in other columns remain empty.</p>':'')+
   (pendingSkips.length?'<div class="aps-import-resolve" role="region" aria-label="Unmapped column decisions">'+
    '<h3>'+pendingSkips.length+' unmapped source column'+(pendingSkips.length===1?' needs':'s need')+' a decision</h3>'+
    '<p>Choose an existing board column above, or confirm that the source values should be excluded. Nothing is silently discarded.</p>'+
    pendingSkips.map(({index,source,type})=>'<div class="aps-import-resolve-row"><strong>'+esc(source)+' ('+esc(type)+')</strong>'+
     '<button type="button" class="secondary" data-imp-confirm-skip="'+index+'">Confirm exclude</button></div>').join('')+
    '</div>':'')+
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
   (newCols.length?'<div class="aps-import-permission" role="status">'+
    '<h3>'+newCols.length+' proposed column'+(newCols.length===1?'':'s')+'</h3>'+
    '<p>'+newCols.map(m=>esc(m.name||m.source)+' ('+esc(m.columnType||m.type)+')').join(' · ')+'</p>'+
    '<p>These columns will be created together with the imported records when you confirm Import Now.</p>'+
    '</div>':'')+'</section>';
 }
 function matchStep(){
  const cols=availableImportColumns(detail).filter(c=>
   ['text','email','url','dropdown','status'].includes(c.type)&&
   state.mappings.some(m=>m.action==='existing'&&m.columnId===c.id));
  let result=null,validation='';
  try{result=state.busy?state.executionPlan||state.plan:computePlan();
   if(!state.busy)state.plan=result;
  }catch(error){validation=String(error.message||error);if(!state.busy)state.plan=null;}
  const radio=(id,title,description)=>'<label class="aps-import-match '+(state.behavior===id?'selected':'')+'">'+
   '<input type="radio" name="imp-behavior" value="'+id+'"'+(state.behavior===id?' checked':'')+' />'+
   '<span><strong>'+esc(title)+'</strong><small>'+esc(description)+'</small></span></label>';
  const matchSelect='<label>Matched by<select name="imp-match" data-imp-match>'+
   choice('item','Item title',state.matchColumnId==='item')+
   cols.map(c=>choice(c.id,c.name,state.matchColumnId===c.id)).join('')+'</select></label>';
  return '<section class="aps-import-match-screen"><h2>'+
   (state.recoveryMode?'Review remaining rows':'Set duplicate behavior')+'</h2>'+
   (state.recoveryMode?'<p>Previously verified '+state.recoveryMarker.completed+
    ' of '+state.recoveryMarker.rows+' rows. Only remaining rows can be submitted.</p>':'')+
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
    '<p>'+(result.preview.rowCount>importBatchSize(result,{extendedReferences:state.extendedReferences})?
     'This workbook will be imported in '+Math.ceil(result.preview.rowCount/importBatchSize(result,{extendedReferences:state.extendedReferences}))+
     ' sequential batches of up to '+importBatchSize(result,{extendedReferences:state.extendedReferences})+' records. Each batch is atomic and independently verified; earlier batches remain committed if a later batch fails.':
     'The server will atomically validate and commit this import against the current board revision.')+'</p>'+
    '<label class="aps-import-final-check"><input type="checkbox" name="imp-confirm" data-imp-confirm'+
    (state.confirmed?' checked':'')+' /> I have reviewed the mapping and the selected duplicate behavior.</label>'+
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
   (state.importProgress?'<p class="aps-import-notice" role="status">Verified '+
    state.importProgress.completed+' of '+state.importProgress.rows+' rows across '+
    state.importProgress.batch+' of '+state.importProgress.total+' batches.</p>':'')+
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
     (readiness().pendingSkips.length?'>Resolve '+readiness().pendingSkips.length+' unmapped columns':'>Next: Handle matches')+'</button>'):'')+
   (state.step===3?(state.uncertain?
    '<button class="secondary" data-imp="close">Close and verify the board</button>':
    (state.resumeCheckpoint?
     '<button class="primary" data-imp="resume"'+(state.busy?' disabled':'')+
     '>Resume after '+state.resumeCheckpoint.completed+' verified rows</button>':
     state.importProgress?.completed?
      '<button class="secondary" data-imp="close">Close and reconcile imported rows</button>':
      '<button class="primary" data-imp="import"'+
      (!state.plan||!state.confirmed||state.busy?' disabled':'')+'>'+
      (state.busy?'Importing…':state.recoveryMode?'Verify and resume remaining rows':'Import Now')+'</button>')):'')+
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
   const marker=state.recoveryMarker;
   const candidate=marker?.worksheetIndex;
   if(marker){
    if(!Number.isInteger(candidate)||!parsed.sheets[candidate]||
       await importDigest(parsed.sheets[candidate])!==marker.sourceDigest)
     throw new ApiError('This workbook differs from the previous import. Reselect the original source or explicitly discard the recovery marker.',409);
   }
   state.file=parsed;state.sheet=marker?candidate:0;
   state.recoveryMode=!!marker;
   state.recoverySourceDigest=marker?.sourceDigest||null;
   state.recoveryOffset=marker?.completed||0;
   state.originalReceipt=marker?.receipt||null;
   state.omittedRowsConfirmed=!!marker;state.formulaWarningsConfirmed=!!marker;
   if(marker){
    state.group=marker.groupId;state.behavior=marker.behavior;
    state.matchColumnId=marker.matchColumnId;
    state.notice='Source verified. Review the remaining '+
     (marker.rows-marker.completed)+' rows and mapping before continuing.';
   }
   state.mappings=initialImportMappings(parsed.sheets[state.sheet],detail,{
    canCreate:state.manage&&!marker,extendedReferences:state.extendedReferences});
   state.allowColumns=state.manage&&!marker;
   state.groupName=('Imported '+parsed.name.replace(/\.(xlsx|csv)$/i,'')).slice(0,120);
   state.step=2;state.allowColumns=state.manage&&!marker;
  }catch(error){
   if(/Workbook contains no populated worksheets to import\./.test(String(error?.message||''))){
    state.notice='This workbook contains no importable item rows. No records or columns were changed. Select a workbook with populated items to continue.';
   }else state.error=normalizeImportFailure(error,'file-read').message;
  }finally{state.busy=false;render();}
 }
 function adjustMapping(index,value){
  const m=state.mappings[index];
  if(!m)return;
  state.confirmed=false;state.notice='';state.error='';
  if(value==='item'){
   state.mappings=reassignImportItemMapping(state.mappings,index);
  }else if(value==='create')state.mappings[index]={...m,action:'create',
   name:m.name||m.source,columnType:CREATABLE_IMPORT_TYPES.includes(m.type)?m.type:'unsupported'};
  else if(value==='setup:status'||value==='setup:dropdown')
   state.mappings[index]={...m,action:'configure',
    name:m.name||m.source,choiceType:value.slice(6)};
  else if(value==='skip')state.mappings[index]={...m,action:'skip',requiresDecision:false};
  else if(value.startsWith('existing:'))state.mappings[index]={...m,
   action:'existing',columnId:value.slice(9),requiresDecision:false};
  state.allowColumns=state.manage&&!state.recoveryMode;
 }
 function focusChoice(index){
  const target=overlay.querySelector('[data-imp-map-row="'+index+'"]');
  target?.scrollIntoView?.({block:'center',behavior:'auto'});
  target?.querySelector('[data-imp-map]')?.focus?.({preventScroll:true});
 }
 async function createChoice(index){
  if(state.busy||state.uncertain||!state.manage)return;
  const mapping=state.mappings[index];
  if(!mapping||mapping.action!=='configure')return;
  state.busy=true;state.error='';state.notice='';render();
  try{
   const result=await provisionImportChoiceColumn({api,auth,boardId,
    detail,sheet:sheet(),source:mapping.source,
    type:mapping.choiceType,name:mapping.name||mapping.source,
    existingColumnId:mapping.existingColumnId});
   detail=result.detail;
   state.mappings=matchConfiguredImportChoice(state.mappings,index,result.columnId);
   state.allowColumns=state.manage;state.confirmed=false;
   state.notice=result.existing?'Existing Status labels updated. Review the mappings before importing.':
    'Configured '+mapping.choiceType+' column created. Review the remaining ordinary columns before importing.';
  }catch(error){
   const failure=normalizeImportFailure(error,'schema-write');
   state.error=failure.message;
   if(failure.uncertain)state.uncertain=true;
  }finally{state.busy=false;render();}
 }
 async function doImport(resume=false){
  if(state.busy||state.uncertain||!state.confirmed||!state.plan||
     (resume&&!state.resumeCheckpoint)||
     (!resume&&state.importProgress?.completed))return;
  state.busy=true;state.error='';render();
  let phase='preflight';
  try{
   const plan=resume?state.executionPlan:computePlan();
   if(!resume)state.executionPlan=plan;
   const recovering=state.recoveryMode;
   if(recovering&&!resume){
    await verifyImportRecovery({marker:state.recoveryMarker,fullSheet:sheet(),
     worksheetIndex:state.sheet,detail,mappings:state.mappings,group:group(),
     matches:{behavior:state.behavior,matchColumnId:state.matchColumnId},
     userId:actor.id,workspaceId:ctx.workspace_id,
     extendedReferences:state.extendedReferences});
   }
   phase='record-write';
   const startingOffset=recovering?state.recoveryOffset:0;
   const earlierReceipt=recovering?state.originalReceipt:null;
   const receipt=await executeBoardImportBatched({api,auth,detail,
    sheet:{...recoverSheet(),omittedRowsConfirmed:state.omittedRowsConfirmed,
     formulaWarningsConfirmed:state.formulaWarningsConfirmed},
    mappings:state.mappings,group:group(),
    matches:{behavior:state.behavior,matchColumnId:state.matchColumnId},
    allowColumns:state.allowColumns,extendedReferences:state.extendedReferences,
    approvedPlan:plan,
    resumeFrom:resume?state.resumeCheckpoint:null,
    onCheckpoint:async checkpoint=>{
     state.recoveryMarker=await sealImportRecovery({checkpoint,
      fullSheet:sheet(),worksheetIndex:state.sheet,userId:actor.id,
      matches:{behavior:state.behavior,matchColumnId:state.matchColumnId},
      extendedReferences:state.extendedReferences,
      completedOffset:startingOffset,sourceDigest:state.recoverySourceDigest,
      priorReceipt:earlierReceipt});
    },
    onProgress:progress=>{
     state.importProgress={...progress,completed:progress.completed+startingOffset,
      rows:sheet().rows.length};state.resumeCheckpoint=null;render();
    }});
   clearImportRecovery({userId:actor.id,boardId});state.recoveryMarker=null;
   state.resumeCheckpoint=null;
   const totalReceipt=earlierReceipt?Object.fromEntries(
    ['created','updated','skipped','columnsCreated','groupsCreated'].map(k=>
     [k,(earlierReceipt[k]||0)+(receipt[k]||0)])):receipt;
   state.complete=totalReceipt;state.step=4;
   try{await onComplete(totalReceipt);}catch{
    state.error='Import committed, but the board refresh failed. Refresh the board before starting another import.';
   }
  }catch(error){
   const failure=normalizeImportFailure(error,phase);
   state.uncertain=failure.uncertain;
   if(failure.uncertain){
    clearImportRecovery({userId:actor.id,boardId});state.recoveryMarker=null;
   }
   state.resumeCheckpoint=error?.importBatchResume||null;
   const progress=error?.importBatchProgress;
   state.error=progress?
    ('Import stopped after '+progress.completed+' of '+progress.totalRows+
     ' rows were verified. '+(progress.outcomeUncertain?
      'The most recent batch may also have committed; do not resubmit before reconciling the board. ':
      'Previously verified batches remain committed. ')+failure.message):failure.message;
  }finally{state.busy=false;render();}
 }
 overlay.addEventListener('click',event=>{
  if(event.target===overlay){close();return;}
  const button=event.target.closest('[data-imp]');if(!button||state.busy)return;
  const action=button.dataset.imp;
  if(action==='close'){close();return;}
  if(action==='clear-recovery'){
   clearImportRecovery({userId:actor.id,boardId});
   state.recoveryMarker=null;state.recoveryMode=false;
   state.notice='Recovery marker discarded. Re-upload to start a new import.';
   render();return;
  }
  if(action==='browse'){overlay.querySelector('#aps-import-file-input')?.click();return;}
  if(action==='back'){state.step--;state.error='';state.notice='';state.confirmed=false;render();return;}
  if(action==='review-choice'){
   const pending=readiness().pendingChoices[0];
   if(pending)focusChoice(pending.index);
   return;
  }
  if(action==='next'){
   state.error='';
   const gate=readiness();
   if(gate.pendingSkips.length){state.error='Map or explicitly confirm exclusion for every unmapped source column.';render();overlay.querySelector('[data-imp-confirm-skip]')?.focus();return;}
   if((sheet().omittedRows||[]).length&&!state.omittedRowsConfirmed){state.error='Confirm exclusion of worksheet summary/footer rows before continuing.';render();overlay.querySelector('[data-imp-confirm-omitted]')?.focus();return;}
   if((sheet().formulaWarnings||[]).length&&!state.formulaWarningsConfirmed){state.error='Confirm that formula cells without cached results will import as blank.';render();overlay.querySelector('[data-imp-confirm-formulas]')?.focus();return;}
   if(gate.pendingChoices.length){focusChoice(gate.pendingChoices[0].index);return;}
   try{
    if(gate.awaitingColumnApproval)
     throw new Error('Choose Allow or Decline for the proposed ordinary columns.');
    computePlan();state.step=3;state.confirmed=false;
   }catch(error){state.error=String(error.message||error);}
   render();return;
  }
  if(action==='import')void doImport();
  if(action==='resume')void doImport(true);
 });
 overlay.addEventListener('click',event=>{
  if(state.busy||state.uncertain)return;
  const button=event.target.closest('[data-imp-choice-create], [data-imp-review-choice], [data-imp-skip-choice], [data-imp-confirm-skip], [data-imp-confirm-formulas], [data-imp-confirm-omitted]');
  if(!button)return;
  if(button.dataset.impChoiceCreate!=null){
   void createChoice(Number(button.dataset.impChoiceCreate));return;
  }
  if(button.dataset.impReviewChoice!=null){
   focusChoice(Number(button.dataset.impReviewChoice));return;
  }
  if(button.dataset.impConfirmFormulas!=null){state.formulaWarningsConfirmed=true;state.confirmed=false;state.error='';state.notice='Confirmed: uncached formula cells will import as blank.';render();return;}
  if(button.dataset.impConfirmOmitted!=null){state.omittedRowsConfirmed=true;state.confirmed=false;state.error='';state.notice='Confirmed: summary/footer rows will be excluded.';render();return;}
  if(button.dataset.impConfirmSkip!=null){
   const index=Number(button.dataset.impConfirmSkip),mapping=state.mappings[index];
   if(mapping?.action==='skip'&&mapping.requiresDecision===true){
    state.mappings=state.mappings.map((m,i)=>i===index?{...m,requiresDecision:false}:m);
    state.confirmed=false;state.error='';state.notice='Confirmed exclusion of '+mapping.source+' values.';render();
   }
   return;
  }
  if(button.dataset.impSkipChoice!=null){
   const index=Number(button.dataset.impSkipChoice);
   const source=state.mappings[index]?.source;
   state.mappings=skipPendingImportChoice(state.mappings,index);
   state.confirmed=false;state.error='';
   state.notice='Excluded '+source+' values from this import. The remaining approved ordinary columns are unchanged.';
   render();
  }
 });
 overlay.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='aps-import-file-input'){if(el.files?.[0])void readFile(el.files[0]);return;}
  if(el.dataset.impSheet!=null){state.sheet=Number(el.value);state.mappings=initialImportMappings(sheet(),detail,{canCreate:state.manage,
    extendedReferences:state.extendedReferences});state.allowColumns=state.manage;state.omittedRowsConfirmed=false;state.formulaWarningsConfirmed=false;state.confirmed=false;state.error='';render();return;}
  if(el.dataset.impChoiceName!=null){
   const index=Number(el.dataset.impChoiceName);
   state.mappings[index].name=el.value.trim();
   state.confirmed=false;render();return;
  }
  if(el.dataset.impMap!=null){adjustMapping(Number(el.dataset.impMap),el.value);render();return;}
  if(el.dataset.impGroup!=null){state.group=el.value;state.confirmed=false;render();return;}
  if(el.dataset.impDefault!=null&&el.value==='create'){
   state.mappings=state.mappings.map(m=>m.action==='skip'&&CREATABLE_IMPORT_TYPES.includes(m.type)?
    {...m,action:'create',name:m.source,columnType:m.type}:m);
   state.allowColumns=state.manage;render();return;
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
   state.confirmed=false;return;
  }
  if(el.dataset.impName!=null){
   state.mappings[Number(el.dataset.impName)].name=el.value;
   state.allowColumns=state.manage;state.confirmed=false;return;
  }
  if(el.dataset.impType!=null){
   state.mappings[Number(el.dataset.impType)].columnType=el.value;
   state.allowColumns=state.manage;state.confirmed=false;
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
