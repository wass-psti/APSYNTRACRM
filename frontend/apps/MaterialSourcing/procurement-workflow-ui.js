// Route-owned procurement workflow. All reads and writes use the approved signed contracts.
import {readProcurement,applyProcurementCommand,compareProcurementQuotes} from './procurement-contract.js';
import {readProcurementReferences} from './procurement-reference.js';
import {authorizeMaterialSourcingItem,revalidateMaterialSourcingSession} from '../../material-sourcing-application.js';
import {MATERIAL_SOURCING_BOARD_ID} from '../../material-sourcing-schema-plan.js';
import {OrderIntakeOperationalClient} from '../../order-intake-operational-client.js';

const LIMIT=25;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const currencies=['PHP','USD','EUR'];
const taxBases=['tax_exclusive','tax_inclusive','unspecified'];
const norm=value=>String(value??'').trim().toLowerCase();
const txt=value=>String(value??'').trim();
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
function localDate(){
 const date=new Date();
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
function requiredText(value,max,name){
 const text=txt(value);
 if(!text||text.length>max)throw Error('Enter a valid '+name+'.');
 return text;
}
function decimal(value,min,name){
 const raw=txt(value);
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(raw)||Number(raw)<min||Number(raw)>1000000000)throw Error('Invalid '+name+'. Use up to four decimal places.');
 return Number(raw);
}
function validDate(value){
 if(!datePattern.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('Enter a valid date.');
 return value;
}
export function rfqPayload(fields){
 const issued=validDate(fields.issued_on),due=validDate(fields.due_on);
 if(due<issued)throw Error('Due date must not precede issue date.');
 return {reference:requiredText(fields.reference,240,'RFQ reference'),issued_on:issued,due_on:due};
}
export function quotationPayload(fields,quoteId,sourceRecords=[]){
 if(!UUID.test(quoteId))throw Error('Quotation identity unavailable.');
 const supplier=requiredText(fields.supplier,240,'supplier name');
 const issued=validDate(fields.issued_on),valid=validDate(fields.valid_until);
 if(valid<issued)throw Error('Validity date must not precede issue date.');
 if(!currencies.includes(fields.currency)||!currencies.includes(fields.shipping_currency)||!taxBases.includes(fields.tax_basis))throw Error('Select valid currency and tax terms.');
 const sourceId=fields.supplier_source_id||null;
 if(sourceId&&!sourceRecords.some(row=>row.id===sourceId&&norm(row.supplier)===norm(supplier)))throw Error('Verify a matching supplier source or choose manual supplier.');
 const notes=String(fields.notes??'');
 if(notes.length>2000)throw Error('Quotation notes exceed 2000 characters.');
 return {quote_id:quoteId,supplier,supplier_source_id:sourceId,reference:requiredText(fields.reference,240,'quotation reference'),
  issued_on:issued,valid_until:valid,quantity:decimal(fields.quantity,0.0001,'quantity'),
  unit_price:decimal(fields.unit_price,0,'unit price'),currency:fields.currency,
  shipping_total:decimal(fields.shipping_total,0,'shipping total'),shipping_currency:fields.shipping_currency,
  tax_basis:fields.tax_basis,lead_weeks:decimal(fields.lead_weeks,0,'lead time'),notes};
}
export function matchingSupplierSources(records,supplier){
 const name=norm(supplier);
 return name?records.filter(row=>row.supplier&&norm(row.supplier)===name):[];
}
// Historical null archive state is eligible only for legacy operational records.
export function eligibleClientPo(row){
 return row?.record_kind==='native'?row.archived===false:
  row?.record_kind==='legacy'&&(row.archived===false||row.archived===null);
}
export function verifiedPoPayload(supplierId,selectedQuote,sourceRecords,clientId,clientRecords){
 if(!selectedQuote||!matchingSupplierSources(sourceRecords,selectedQuote.supplier).some(row=>row.id===supplierId))throw Error('Choose a verified supplier PO source for the selected quotation.');
 const client=clientId?clientRecords.find(row=>row.id===clientId&&eligibleClientPo(row)):null;
 if(clientId&&!client)throw Error('Verify the client PO reference first.');
 return {supplier_po_id:supplierId,client_po_id:client?.id??null,client_po_kind:client?.record_kind??null};
}
export async function lookupClientPo(scope,term){
 if(!scope.isCurrent())throw Error('Material view changed.');
 const query=requiredText(term,240,'client PO number or UUID');
 const client=new OrderIntakeOperationalClient(scope),actor=scope.auth.userId;
 const params=new URLSearchParams({workspace_id:'eq.'+scope.workspaceId,or:'(archived.eq.false,and(record_kind.eq.legacy,archived.is.null))',
  select:'id,workspace_id,record_kind,po_number,archived,revision,source_key',limit:'26',order:'id.asc'});
 params.set(UUID.test(query)?'id':'po_number','eq.'+query);
 const rows=await client.read(params);
 await revalidateMaterialSourcingSession(scope,actor);
 if(!scope.isCurrent())throw Error('Material view changed.');
 if(rows.length>25)throw Error('More than 25 matches. Search by exact source UUID.');
 if(rows.some(row=>!UUID.test(row.id)||!eligibleClientPo(row)||
  (UUID.test(query)?row.id!==query.toLowerCase():row.po_number!==query)))throw Error('Invalid client PO source.');
 return rows;
}

function node(doc,tag,value){
 const el=doc.createElement(tag);
 if(value!==undefined)el.textContent=value;
 return el;
}
function action(doc,label,handler){
 const el=node(doc,'button',label);el.type='button';el.className='secondary';
 el.addEventListener('click',handler);return el;
}
function field(doc,host,label,name,{value='',type='text',options=null,required=true,max=240}={}){
 const wrapper=node(doc,'label',label),control=node(doc,options?'select':type==='textarea'?'textarea':'input');
 control.name=name;control.setAttribute('aria-label',label);
 if(options){
  for(const [key,title] of options){const option=node(doc,'option',title);option.value=key;control.append(option);}
 }else if(type!=='textarea'){control.type=type;if(type==='number'){control.step='0.0001';control.min='0';control.max='1000000000';}}
 if(type==='text'||type==='textarea')control.maxLength=max;
 control.value=value;control.required=required;wrapper.append(control);host.append(wrapper);
 return control;
}
function table(doc,headers,rows){
 const wrap=node(doc,'div');wrap.className='ms-native-table-scroll';wrap.tabIndex=0;
 wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Procurement records');
 const t=node(doc,'table');t.className='ms-native-table';
 const header=t.createTHead().insertRow();
 for(const label of headers){const th=node(doc,'th',label);th.scope='col';header.append(th);}
 const body=t.createTBody();
 for(const values of rows){const row=body.insertRow();for(const value of values){const cell=row.insertCell();if(value?.nodeType)cell.append(value);else cell.textContent=value??'—';}}
 wrap.append(t);return wrap;
}
function quoteTable(doc,quotes,controls=null){
 return table(doc,['Supplier','Quotation','Revision','Quantity','Unit price','Shipping total','Tax basis','Lead (wks)','Issued','Valid until','Notes','Source UUID',...(controls?['Action']:[])],
  quotes.map(q=>[q.supplier,q.reference,String(q.revision),q.quantity,q.unit_price+' '+q.currency,q.shipping_total+' '+q.shipping_currency,
   q.tax_basis,q.lead_weeks,q.issued_on,q.valid_until,q.notes||'—',q.supplier_source_id||'—',...(controls?[controls(q)]:[])]));
}
function selectedQuote(snapshot){
 return snapshot.quotes.find(q=>q.id===snapshot.selection?.quote_id&&q.revision===snapshot.selection?.quote_revision);
}

export async function openProcurementWorkflow(button,{api,auth,workspaceId,isCurrent,canEdit}){
 const panel=button.closest('.ms-native-sourcing')?.querySelector('[data-ms-procurement-workflow]');
 if(!panel||!button.dataset.id||!isCurrent()||panel.dataset.busy==='true'||panel.dataset.pending==='true')return false;
 const doc=button.ownerDocument,host=node(doc,'div'),actor=auth.userId,itemId=button.dataset.id;
 const active=()=>host.isConnected&&panel.contains(host)&&isCurrent()&&auth.isSignedIn&&auth.userId===actor;
 const scope={api,auth,workspaceId,itemId,isCurrent:active};
 const status=node(doc,'p');status.setAttribute('role','status');
 const body=node(doc,'div'),editor=node(doc,'div'),history=node(doc,'div');
 const heading=node(doc,'h3','RFQ & procurement — '+(button.dataset.material||'Material'));heading.tabIndex=-1;
 let busy=false,pending=null,write=false,page=null,offset=0,currentRow=null,sources=null;
 const close=action(doc,'Close procurement',()=>{if(!busy&&!pending){panel.replaceChildren();panel.hidden=true;delete panel.dataset.pending;button.focus();}});
 host.append(heading,close,status,body,editor,history);
 panel.replaceChildren(host);panel.hidden=false;heading.focus();
 function setBusy(value){busy=value;panel.dataset.busy=String(value);close.disabled=value||Boolean(pending);
  for(const el of host.querySelectorAll('fieldset'))el.disabled=value||Boolean(pending);
  for(const el of body.querySelectorAll('button'))el.disabled=value||Boolean(pending);
  for(const el of history.querySelectorAll('button'))el.disabled=value||Boolean(pending);
  for(const el of editor.querySelectorAll('button'))el.disabled=value||Boolean(pending);
 }
 function message(value){if(active())status.textContent=value;}
 async function loadList(){
  page=await readProcurement(scope,{limit:LIMIT,offset});
  if(!active())return;
  if(currentRow){
   const latest=await readProcurement(scope,{rfqId:currentRow.rfq_id,limit:1});
   currentRow=latest.rows[0]||null;
  }
 }
 async function runRead(work){
  if(busy||pending||!active())return;
  setBusy(true);
  try{await work();}catch(error){message(error.message||'Procurement read unavailable. Retry.');}
  finally{if(active())setBusy(false);}
 }
 async function execute(){
  if(!pending||busy||!active())return;
  setBusy(true);message('Saving reviewed procurement command…');
  try{
   const result=await applyProcurementCommand(scope,pending);
   if(!active())return;
   pending=null;delete panel.dataset.pending;
   currentRow=result.row;
   // The command receipt already includes exact signed historical readback.
   editor.replaceChildren();history.replaceChildren();render();
   message('Verified revision '+result.row.revision+'.');
   try{await loadList();if(active())render();}
   catch{message('Revision '+result.row.revision+' verified; refresh the list to read the latest state.');}
  }catch(error){
   if(!active())return;
   if(!pending){message('Command receipt verified; reload the material before continuing.');return;}
   message((error.message||'Procurement outcome unavailable.')+' Operation '+pending.operationId+'. Retry the same command or refresh and review the server state.');
   editor.replaceChildren(node(doc,'p','The previous command may have committed. No new operation will be generated automatically.'));
   const retry=action(doc,'Retry same operation',()=>void execute());
   const reconcile=action(doc,'Refresh and abandon local retry',async()=>{
    if(busy||!pending||!active())return;
    if(!doc.defaultView.confirm('Discard only the local retry? This does not undo a server commit. Review the reloaded RFQ before entering another command.'))return;
    setBusy(true);
    try{
     const result=await readProcurement(scope,{rfqId:pending.rfqId,limit:1});
     if(!active())return;
     currentRow=result.rows[0]||null;
     await loadList();if(!active())return;
     pending=null;delete panel.dataset.pending;editor.replaceChildren();history.replaceChildren();render();
     message('Server state refreshed. Review the latest revision before continuing.');
    }catch(error){message(error.message||'Readback unavailable; retry retained.');}
    finally{if(active()){setBusy(false);if(pending){retry.disabled=false;reconcile.disabled=false;}}}
   });
   editor.append(retry,reconcile);
  }finally{
   if(active()){setBusy(false);if(pending)for(const el of editor.querySelectorAll('button'))el.disabled=false;}
  }
 }
 function submit(command,payload,row=null){
  if(!write||busy||pending||!active())return;
  pending={rfqId:row?.rfq_id||doc.defaultView.crypto.randomUUID(),operationId:doc.defaultView.crypto.randomUUID(),
   expectedRevision:row?.revision||0,command,payload};
  panel.dataset.pending='true';void execute();
 }
 function form(title,build,onSubmit){
  if(!active()||busy||pending)return;
  history.replaceChildren();
  const f=node(doc,'form'),fields=node(doc,'fieldset'),legend=node(doc,'legend',title);
  fields.className='ms-procurement-fields';fields.append(legend);f.append(fields);
  build(fields);
  const save=node(doc,'button','Save reviewed '+title.toLowerCase());save.type='submit';
  const cancel=action(doc,'Cancel form',()=>editor.replaceChildren());fields.append(save,cancel);
  f.addEventListener('submit',event=>{
   event.preventDefault();if(busy||pending||!active()||!f.reportValidity())return;
   try{onSubmit(Object.fromEntries(new doc.defaultView.FormData(f)));}
   catch(error){message(error.message);}
  });
  editor.replaceChildren(f);fields.querySelector('input,select,textarea')?.focus();
 }
 function rfqForm(){
  form('RFQ',fields=>{
   field(doc,fields,'RFQ reference','reference');field(doc,fields,'Issued on','issued_on',{type:'date',value:localDate()});
   field(doc,fields,'Due on','due_on',{type:'date'});
  },values=>submit('create',rfqPayload(values)));
 }
 async function loadSources(){
  sources=await readProcurementReferences(scope);
  return sources.records.filter(row=>row.supplier);
 }
 function quoteForm(row,quote=null){
  let sourceRows=[],sourceSelect;
  form(quote?'Quotation amendment':'Received quotation',fields=>{
   const supplier=field(doc,fields,'Supplier name','supplier',{value:quote?.supplier||''});
   sourceSelect=field(doc,fields,'Optional verified supplier source','supplier_source_id',{options:[['','Manual supplier (unverified identity)']],required:false});
   const lookup=action(doc,'Load supplier sources',async()=>{
    await runRead(async()=>{
     sourceRows=await loadSources();if(!active()||!sourceSelect.isConnected)return;
     const old=quote?.supplier_source_id||'';
     sourceSelect.replaceChildren();
     for(const [id,label] of [['','Manual supplier (unverified identity)'],...sourceRows.map(r=>[r.id,r.supplier+' — '+r.reference])]){
      const option=node(doc,'option',label);option.value=id;sourceSelect.append(option);
     }
     if(old&&sourceRows.some(r=>r.id===old))sourceSelect.value=old;
     message('Signed supplier sources loaded. Choose a source or retain a manual supplier.');
    });
   });
   fields.append(lookup);
   sourceSelect.addEventListener('change',()=>{const match=sourceRows.find(r=>r.id===sourceSelect.value);if(match)supplier.value=match.supplier;});
   field(doc,fields,'Quotation reference','reference',{value:quote?.reference||''});
   field(doc,fields,'Issued on','issued_on',{type:'date',value:quote?.issued_on||localDate()});
   field(doc,fields,'Valid until','valid_until',{type:'date',value:quote?.valid_until||''});
   for(const [label,name,defaultValue] of [['Quantity','quantity','1'],['Unit price','unit_price',''],['Shipping total','shipping_total','0'],['Lead time (weeks)','lead_weeks','0']])
    field(doc,fields,label,name,{type:'number',value:quote?.[name]??defaultValue});
   for(const [label,name,opts,defaultValue] of [['Currency','currency',currencies,'PHP'],['Shipping currency','shipping_currency',currencies,'PHP'],['Tax basis','tax_basis',taxBases,'unspecified']])
    field(doc,fields,label,name,{options:opts.map(x=>[x,x.replaceAll('_',' ')]),value:quote?.[name]||defaultValue});
   field(doc,fields,'Notes','notes',{type:'textarea',value:quote?.notes||'',max:2000,required:false});
   if(quote?.supplier_source_id){
    const placeholder=node(doc,'option','Previously verified source — reload to retain');placeholder.value=quote.supplier_source_id;sourceSelect.append(placeholder);sourceSelect.value=quote.supplier_source_id;
   }
  },values=>submit(quote?'amend_quote':'add_quote',quotationPayload(values,quote?.id||doc.defaultView.crypto.randomUUID(),sourceRows),row));
 }
 function selectionForm(row,quote){
  form('Quotation selection',fields=>{
   fields.append(node(doc,'p','Select '+quote.supplier+' · '+quote.reference+' · quotation revision '+quote.revision+'. Existing pricing will not change.'));
   field(doc,fields,'Selection reason','reason',{type:'textarea',max:2000});
  },values=>submit('select_quote',{quote_id:quote.id,reason:requiredText(values.reason,2000,'selection reason')},row));
 }
 function linkForm(row){
  const chosen=selectedQuote(row.snapshot);let sourceRows=[],clientRows=[];
  form('Verified PO references',fields=>{
   fields.append(node(doc,'p','Selected supplier: '+chosen.supplier+'. Link existing records only; no PO issuance.'));
   const supplierSelect=field(doc,fields,'Supplier PO source','supplier_po_id',{options:[['','Load and choose source']]});
   fields.append(action(doc,'Load matching supplier PO records',()=>void runRead(async()=>{
    sourceRows=matchingSupplierSources(await loadSources(),chosen.supplier);
    if(!active()||!supplierSelect.isConnected)return;
    supplierSelect.replaceChildren(node(doc,'option','Choose a source'));
    supplierSelect.options[0].value='';
    for(const r of sourceRows){const option=node(doc,'option',r.reference+' — '+r.id);option.value=r.id;supplierSelect.append(option);}
    if(sourceRows.some(r=>r.id===row.snapshot.supplier_po_id))supplierSelect.value=row.snapshot.supplier_po_id;
    message(sourceRows.length+' matching signed supplier PO records.');
   })));
   const term=field(doc,fields,'Client PO number or UUID (optional lookup)','client_search',{required:false});
   const clientSelect=field(doc,fields,'Optional verified client PO','client_po_id',{options:[['','No client PO']],required:false});
   if(row.snapshot.client_po_id){
    const option=node(doc,'option','Existing client PO — verify again to retain');option.value=row.snapshot.client_po_id;clientSelect.append(option);clientSelect.value=row.snapshot.client_po_id;term.value=row.snapshot.client_po_id;
   }
   fields.append(action(doc,'Find client PO',()=>void runRead(async()=>{
    clientRows=await lookupClientPo(scope,term.value);
    if(!active()||!clientSelect.isConnected)return;
    clientSelect.replaceChildren(node(doc,'option','No client PO'));clientSelect.options[0].value='';
    for(const r of clientRows){const option=node(doc,'option',(r.po_number||'Unnumbered')+' — '+r.record_kind+' — '+r.id);option.value=r.id;clientSelect.append(option);}
    if(clientRows.length===1)clientSelect.value=clientRows[0].id;
    message(clientRows.length+' matching signed client PO records.');
   })));
  },values=>submit('link_po',verifiedPoPayload(values.supplier_po_id,chosen,sourceRows,values.client_po_id,clientRows),row));
 }
 function transition(row,command){
  form(command==='cancel'?'RFQ cancellation':'RFQ reopening',fields=>{
   fields.append(node(doc,'p',command==='cancel'?'Cancel this RFQ? Historical quotations remain.':'Reopen this RFQ? Current selection and PO links are cleared; historical revisions remain.'));
  },()=>submit(command,{},row));
 }
 function renderHistory(row,before=null,append=false){
  return runRead(async()=>{
   const result=await readProcurement(scope,{rfqId:row.rfq_id,beforeRevision:before,limit:LIMIT});
   if(!active())return;
   if(!append)history.replaceChildren(node(doc,'h4','Immutable RFQ history'));
   history.querySelector('[data-ms-history-more]')?.remove();
   for(const revision of result.rows){
    const details=node(doc,'details'),s=revision.snapshot;
    details.append(node(doc,'summary','Revision '+revision.revision+' · '+revision.command+' · '+revision.created_at),
     node(doc,'p',s.reference+' · '+s.status+' · '+s.issued_on+' to '+s.due_on),
     node(doc,'p','Selection: '+(selectedQuote(s)?.supplier||'—')+' · Reason: '+(s.selection?.reason||'—')),
     node(doc,'p','Supplier PO source: '+(s.supplier_po_id||'—')+' · Client PO: '+(s.client_po_id||'—')),
     quoteTable(doc,s.quotes));
    history.append(details);
   }
   if(result.has_more){const more=action(doc,'Load older revisions',()=>void renderHistory(row,result.rows.at(-1).revision,true));more.dataset.msHistoryMore='true';history.append(more);}
  });
 }
 function render(){
  if(!active())return;
  body.replaceChildren();
  const toolbar=node(doc,'div');toolbar.className='ms-native-header-actions';
  toolbar.append(action(doc,'Refresh RFQs',()=>void runRead(async()=>{offset=0;await loadList();editor.replaceChildren();history.replaceChildren();render();message('RFQs refreshed.');})));
  if(write)toolbar.append(action(doc,'Create RFQ',rfqForm));
  body.append(toolbar);
  if(!page?.rows.length)body.append(node(doc,'p','No RFQs on this material in the loaded page.'));
  else body.append(table(doc,['RFQ','Status','Revision','Quotation count','Action'],page.rows.map(row=>[
   row.snapshot.reference,row.snapshot.status,String(row.revision),String(row.snapshot.quotes.length),
   action(doc,'Open '+row.snapshot.reference,()=>{if(busy||pending)return;currentRow=row;editor.replaceChildren();history.replaceChildren();render();})
  ])));
  if(offset>0)body.append(action(doc,'Previous RFQs',()=>void runRead(async()=>{offset=Math.max(0,offset-LIMIT);await loadList();render();})));
  if(page?.has_more)body.append(action(doc,'Next RFQs',()=>void runRead(async()=>{offset+=LIMIT;await loadList();render();})));
  if(!currentRow)return;
  const row=currentRow,s=row.snapshot,selected=selectedQuote(s);
  body.append(node(doc,'h4',s.reference+' · '+s.status+' · revision '+row.revision),
   node(doc,'p','Issued '+s.issued_on+' · Due '+s.due_on),
   node(doc,'p','Selected quotation: '+(selected?selected.supplier+' — '+selected.reference+' (rev '+selected.revision+')':'None')+' · Reason: '+(s.selection?.reason||'—')),
   node(doc,'p','Supplier PO source: '+(s.supplier_po_id||'—')+' · Client PO source: '+(s.client_po_id||'—')));
  body.append(quoteTable(doc,s.quotes,write&&s.status==='open'?q=>{
   const actions=node(doc,'div');
   actions.append(action(doc,'Amend',()=>quoteForm(row,q)),action(doc,'Select',()=>selectionForm(row,q)));return actions;
  }:null));
  const dateHost=node(doc,'div'),comparison=node(doc,'div');
  const asOf=field(doc,dateHost,'Compare on date','comparison_date',{type:'date',value:localDate()});
  function compare(){
   comparison.replaceChildren();
   try{
    const result=compareProcurementQuotes(s.quotes,{asOf:validDate(asOf.value)});
    if(!result.comparable)comparison.append(node(doc,'p',result.reason));
    else comparison.append(table(doc,['Supplier','Comparable quoted total ('+result.currency+')'],result.totals.map(t=>[s.quotes.find(q=>q.id===t.id)?.supplier,t.quotedTotal])));
   }catch(error){comparison.append(node(doc,'p',error.message));}
  }
  asOf.addEventListener('change',compare);compare();body.append(dateHost,comparison);
  body.append(node(doc,'p','Comparison uses matching quantity, currency, shipping currency, tax basis and validity. No FX conversion, automatic selection or existing price overwrite.'));
  const actions=node(doc,'div');actions.className='ms-native-header-actions';
  actions.append(action(doc,'View RFQ history',()=>void renderHistory(row)));
  if(write){
   if(s.status==='open')actions.append(action(doc,'Add received quotation',()=>quoteForm(row)));
   if(['selected','po_linked'].includes(s.status))actions.append(action(doc,'Link verified PO references',()=>linkForm(row)));
   if(['open','selected'].includes(s.status))actions.append(action(doc,'Cancel RFQ',()=>transition(row,'cancel')));
   if(['selected','po_linked','cancelled'].includes(s.status))actions.append(action(doc,'Reopen RFQ',()=>transition(row,'reopen')));
  }
  body.append(actions);
 }
 await runRead(async()=>{
  await loadList();
  if(canEdit){
   try{await authorizeMaterialSourcingItem({...scope,boardId:MATERIAL_SOURCING_BOARD_ID,edit:true});write=true;}
   catch{write=false;}
  }
  if(active()){render();message(write?'Signed procurement workflow ready.':'Signed procurement history loaded (read only).');}
 });
 return true;
}
