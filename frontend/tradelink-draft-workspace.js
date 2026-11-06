/** CP-TL-03D / Phase 1 — Draft workspace, controlled dark launch.
 * This is a presentation layer over the EXISTING signed TradeLinkDomainClient.
 * No local persistence, fabricated domain records, second login, or write bypass.
 */
import {ApiError} from './session.js';
import {TRADELINK_BOARD_ID,isTradeLinkBoard} from './tradelink-board-items.js';
import {TradeLinkDomainClient,TL03_DOMAIN_READS_ENABLED,
 TL03_DOMAIN_WRITES_ENABLED,validateTradeLinkDraftEnvelope} from './tradelink-domain-client.js';

export const TL03_DRAFT_INTERFACE_ENABLED=true; // presentation only
const typeLabels=Object.freeze([
 ['esi','Electronic SI'],['packing','Packing List'],['delivery','Delivery Receipt'],
 ['payment','Payment AR'],['quotation','Quotation'],['po','PO to Suppliers']
]);
const currencies=['PHP','USD','EUR','GBP','JPY','CNY','SGD','AUD','SAR'];
const vatCodes=[['12','12%'],['zero','Zero-rated'],['exempt','Exempt'],
 ['15_tkm','15% TKM'],['15_ksa','15% KSA']];
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const disabled=()=>{throw new ApiError(
 'TradeLink Draft API is in dark launch; production persistence is disabled.',503);
};
export const tradeLinkDraftReady=()=>TL03_DOMAIN_READS_ENABLED&&TL03_DOMAIN_WRITES_ENABLED;
export function initialTradeLinkDraftView(documentType=null){
 // The route may request only one of the existing six source document types.
 // This is transient UI state, never browser or server persistence.
 const selected=typeLabels.some(([key])=>key===documentType)?documentType:null;
 return {status:'DARK_LAUNCH',rows:[],selected:null,busy:false,error:'',
  message:'',mode:'create',pendingCreateId:null,
  formValues:selected?{documentType:selected}:null};
}
export function parseTradeLinkDraftForm(fields,{lineId=()=>globalThis.crypto?.randomUUID?.()}={}){
 if(!fields||typeof fields.get!=='function')
  throw new ApiError('TradeLink Draft input is missing.',400);
 const value=k=>String(fields.get(k)??'').trim();
 const type=value('documentType');
 const physical=type==='packing'||type==='delivery';
 const priced=type==='esi'||type==='quotation'||type==='po';
 const draft={documentType:type,documentNumber:value('documentNumber')};
 const addText=(key,{required=false}={})=>{
  const text=value(key);
  if(text.length>5000||(required&&!text))
   throw new ApiError('Invalid or missing TradeLink '+key+'.',400);
  if(text)draft[key]=text;
 };
 for(const key of ['customerName','referenceNumber','remarks'])addText(key);
 const currency=value('currency'),vatType=value('vatType');
 if(currency){
  if(!currencies.includes(currency))throw new ApiError('Invalid TradeLink currency.',400);
  draft.currency=currency;
 }
 if(vatType&&!physical&&type!=='payment'){
  if(!vatCodes.some(([code])=>code===vatType))
   throw new ApiError('Invalid TradeLink VAT code.',400);
  draft.vatType=vatType;
 }
 const description=value('lineDescription'),quantity=value('lineQuantity'),
  unitPrice=physical?'':value('lineUnitPrice'),unit=value('lineUnit');
 if(physical||description||quantity||unitPrice||unit){
  if(!description||!quantity||(!physical&&!unitPrice))
   throw new ApiError('Line item requires description, quantity and unit price where applicable.',400);
  const q=Number(quantity),p=physical?0:Number(unitPrice);
  if(!Number.isFinite(q)||!Number.isFinite(p)||q<0||p<0||
     q>1000000000||p>1000000000||((physical||priced)&&q===0)||
     (priced&&p===0))
   throw new ApiError('Invalid Draft line quantity or unit price.',400);
  const id=value('lineId')||lineId();
  if(typeof id!=='string'||!id||id.length>120)
   throw new ApiError('Could not create a valid line-item identifier.',400);
  const item={id,kind:'item',description,quantity:q,unitPrice:p,
   ...(unit?{unit}:{})};
  if(type==='delivery'){
   const serial=value('lineSerialNumber');
   if(serial.length>120)throw new ApiError('Invalid serial or asset number.',400);
   if(serial)item.serialNumber=serial;
  }
  draft.items=[item];
 }
 if(physical){
  if(!draft.customerName||!draft.referenceNumber)
   throw new ApiError('Shipment Draft requires consignee/recipient and source reference.',400);
  if(type==='delivery'){
   addText('checkedBy',{required:true});
   addText('deliveredBy',{required:true});
   addText('receivedBy');
  }
 }
 if(type==='payment'){
  for(const key of ['paymentParticulars','receivedBy','verifiedBy','bankName','chequeNumber'])
   addText(key);
  let amount=0;
  for(const key of ['cashAmount','chequeAmount']){
   const raw=value(key);
   if(!raw)continue;
   if(!/^\d+(?:\.\d+)?$/.test(raw))
    throw new ApiError('Invalid payment amount.',400);
   const n=Number(raw);
   if(!Number.isFinite(n)||n<0||n>1000000000000)
    throw new ApiError('Invalid payment amount.',400);
   draft[key]=n;
   amount+=n;
  }
  if(!draft.customerName||!draft.paymentParticulars||!draft.receivedBy||
     !draft.verifiedBy||amount<=0)
   throw new ApiError('Payment Draft needs payor, particulars, a positive amount, receiver and verifier.',400);
  if((draft.chequeAmount??0)>0&&(!draft.bankName||!draft.chequeNumber))
   throw new ApiError('Cheque Draft needs bank name and cheque number.',400);
 }
 if(priced){
  // Local submission-readiness previews only: these named reviewers are
  // not authoritative identities and do not authorize workflow actions.
  if(!draft.customerName||!draft.items?.length)
   throw new ApiError('Commercial Draft needs a customer or supplier and a priced item.',400);
  if(type==='esi'){
   for(const key of ['customerTin','verifiedBy','approvedBy'])
    addText(key,{required:true});
  }else if(type==='quotation'){
   for(const key of ['customerEmail','customerPhone','validity',
    'deliveryCommitment','paymentTerms','approvedBy'])addText(key);
   if((!draft.customerEmail&&!draft.customerPhone)||
     !draft.validity||!draft.deliveryCommitment||
     !draft.paymentTerms||!draft.approvedBy)
    throw new ApiError('Quotation readiness needs client contact, validity, delivery, payment terms and an intended approver.',400);
   if(draft.customerEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.customerEmail))
    throw new ApiError('Invalid Quotation contact email.',400);
  }else if(type==='po'){
   for(const key of ['poNumber','targetDeliveryDate','paymentTerms',
    'verifiedBy','approvedBy'])addText(key);
   if(!draft.paymentTerms||!draft.verifiedBy||!draft.approvedBy||
      !draft.targetDeliveryDate)
    throw new ApiError('Supplier PO readiness needs delivery date, payment terms, reviewer and intended approver.',400);
   const date=draft.targetDeliveryDate;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||
      !Number.isFinite(Date.parse(date))||
      new Date(date).toISOString().slice(0,10)!==date)
    throw new ApiError('Invalid supplier PO delivery date.',400);
  }
 }
 return validateTradeLinkDraftEnvelope(draft);
}
export class TradeLinkDraftWorkspace{
 constructor({auth,api}={}){this.client=new TradeLinkDomainClient({auth,api});}
 async list(){
  if(!TL03_DOMAIN_READS_ENABLED)return {status:'DARK_LAUNCH',rows:[]};
  return {status:'AUTHORIZED_READ',rows:await this.client.list(50)};
 }
 async read(documentId){
  if(!TL03_DOMAIN_READS_ENABLED)disabled();
  return this.client.read(documentId);
 }
 async save({documentId,expectedRevision=0,draft}={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)disabled();
  const payload=validateTradeLinkDraftEnvelope(draft);
  const id=documentId||globalThis.crypto?.randomUUID?.();
  const operation=expectedRevision===0?'create':'update';
  return this.client.commit({documentId:id,expectedRevision,operation,draft:payload});
 }
 async changeState({documentId,revision,operation}={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)disabled();
  if(!['archive','restore'].includes(operation))
   throw new ApiError('Only archive and restore are supported for TradeLink Draft.',400);
  return this.client.commit({documentId,expectedRevision:revision,operation});
 }
}
const options=(arr,current)=>arr.map(([id,label])=>
 '<option value="'+escape(id)+'"'+(id===current?' selected':'')+'>'+
 escape(label)+'</option>').join('');
function field(label,name,val='',attrs=''){
 return '<label class="tl-draft-field"><span>'+escape(label)+'</span>'+
  '<input name="'+escape(name)+'" value="'+escape(val)+'" '+attrs+'></label>';
}
function renderCommercialReadiness(type,fieldValue,data){
 const input=(label,name,attrs='maxlength="5000" required')=>
  field(label,name,fieldValue(name,data[name]||''),attrs);
 const note='<p class="muted">Readiness is local only. Reviewer and approver names do not assign roles, grant approval, or submit a workflow.</p>';
 if(type==='esi')return '<fieldset class="tl-draft-lines"><legend>Electronic SI readiness · preview only</legend>'+
  input('Client tax identity / TIN','customerTin')+
  input('Intended finance verifier','verifiedBy')+
  input('Intended management approver','approvedBy')+'</fieldset>'+note;
 if(type==='quotation')return '<fieldset class="tl-draft-lines"><legend>Quotation readiness · preview only</legend>'+
  input('Client email (or phone)','customerEmail','type="email" maxlength="5000"')+
  input('Client phone (or email)','customerPhone','maxlength="5000"')+
  input('Offer validity','validity')+
  input('Delivery commitment','deliveryCommitment')+
  input('Payment terms','paymentTerms')+
  input('Intended approver','approvedBy')+'</fieldset>'+note;
 if(type==='po')return '<fieldset class="tl-draft-lines"><legend>Supplier PO readiness · preview only</legend>'+
  input('Supplier PO number (optional)','poNumber','maxlength="5000"')+
  input('Target delivery date','targetDeliveryDate','type="date" required')+
  input('Payment terms','paymentTerms')+
  input('Intended Account Manager reviewer','verifiedBy')+
  input('Intended final approver','approvedBy')+'</fieldset>'+note;
 return '';
}
function renderEditor(row,mode,canManage,formValues=null){
 const editing=mode==='edit'&&row?.workflow_state==='draft'&&
  row.content&&typeof row.content==='object'&&
  (!Array.isArray(row.content.items)||row.content.items.length<=1);
 const data=editing?row.content:{};
 const fieldValue=(name,fallback='')=>formValues&&Object.hasOwn(formValues,name)?formValues[name]:fallback;
 const line=Array.isArray(data.items)?data.items[0]||{}:{};
 const writeEnabled=editing||mode==='create';
 const live=TL03_DOMAIN_WRITES_ENABLED&&canManage&&writeEnabled;
 const type=editing?data.documentType:fieldValue('documentType','quotation');
 const physical=type==='packing'||type==='delivery';
 const payment=type==='payment';
 const priced=type==='esi'||type==='quotation'||type==='po';
 const commonPartyLabel=type==='packing'?'Consignee':type==='delivery'?'Recipient / consignee':
  payment?'Payor':type==='po'?'Supplier':type==='esi'?'Invoice client':
  type==='quotation'?'Prospective client':'Customer / supplier';
 return '<section class="tl-draft-panel" aria-labelledby="tl-draft-editor-title">'+
  '<div class="tl-panel-heading"><div><p class="tl-eyebrow">Source-aligned Draft editor</p>'+
  '<h3 id="tl-draft-editor-title">'+(editing?'Edit authorized Draft':'Prepare a Draft')+'</h3></div>'+
  (editing?'<button type="button" class="secondary" data-action="tradelink-draft-new">New Draft</button>':'')+'</div>'+
  (mode==='edit'&&!editing?'<p role="alert">This record cannot be edited with the bounded Phase 1 editor.</p>':'')+
  '<p class="muted">Fields are a local, unsaved preparation form. Preview validation does not create a server record.</p>'+
  '<form data-tradelink-draft-form>'+
   '<div class="tl-draft-form-grid"><label class="tl-draft-field"><span>Document module</span>'+
    '<select name="documentType" '+(editing?'disabled':'')+'>'+options(typeLabels,type)+'</select></label>'+
    (editing?'<input type="hidden" name="documentType" value="'+escape(type)+'">':'')+
    field('Document number','documentNumber',fieldValue('documentNumber',data.documentNumber||''),'required maxlength="120" pattern="[A-Za-z0-9][A-Za-z0-9._ /-]*"')+
    field(commonPartyLabel,'customerName',fieldValue('customerName',data.customerName||''),
     'maxlength="5000"'+(physical||payment||priced?' required':''))+
    field(physical?'Source reference':'Reference','referenceNumber',
     fieldValue('referenceNumber',data.referenceNumber||''),
     'maxlength="5000"'+(physical?' required':''))+
    '<label class="tl-draft-field"><span>Currency</span><select name="currency">'+
     options(currencies.map(v=>[v,v]),fieldValue('currency',data.currency||'PHP'))+'</select></label>'+
    (physical||payment?'':'<label class="tl-draft-field"><span>VAT</span><select name="vatType">'+
     options(vatCodes,fieldValue('vatType',data.vatType||'12'))+'</select></label>')+
   '</div>'+
   (payment?
    '<fieldset class="tl-draft-lines"><legend>Received payment · local readiness only</legend>'+
     field('Payment particulars','paymentParticulars',fieldValue('paymentParticulars',data.paymentParticulars||''),
      'maxlength="5000" required')+
     field('Cash amount','cashAmount',fieldValue('cashAmount',data.cashAmount??''),
      'type="number" min="0" max="1000000000000" step="any"')+
     field('Cheque amount','chequeAmount',fieldValue('chequeAmount',data.chequeAmount??''),
      'type="number" min="0" max="1000000000000" step="any"')+
     field('Bank name (for cheque)','bankName',fieldValue('bankName',data.bankName||''),'maxlength="5000"')+
     field('Cheque number (for cheque)','chequeNumber',fieldValue('chequeNumber',data.chequeNumber||''),'maxlength="5000"')+
     field('Received by','receivedBy',fieldValue('receivedBy',data.receivedBy||''),'maxlength="5000" required')+
     field('Verified by','verifiedBy',fieldValue('verifiedBy',data.verifiedBy||''),'maxlength="5000" required')+
    '</fieldset>'+
    '<p class="muted">Payment amounts are unsaved estimates. This form does not receive or verify funds.</p>':
    '<fieldset class="tl-draft-lines"><legend>'+
     (physical?'Physical shipment item (required for local readiness)':
      priced?'Priced line item (required for local readiness)':'Single line item (optional)')+
     '</legend>'+
    field('Description','lineDescription',fieldValue('lineDescription',line.description||''),
     'maxlength="2000"'+(physical||priced?' required':''))+
    field('Quantity','lineQuantity',fieldValue('lineQuantity',line.quantity??''),
     'type="number" min="0" max="1000000000" step="any"'+(physical||priced?' required':''))+
    (physical?'':field('Unit price','lineUnitPrice',fieldValue('lineUnitPrice',line.unitPrice??''),
     'type="number" min="0" max="1000000000" step="any"'+(priced?' required':'')))+
    field('Unit','lineUnit',fieldValue('lineUnit',line.unit||''),'maxlength="120"')+
    (type==='delivery'?field('Serial / asset number (optional)','lineSerialNumber',
     fieldValue('lineSerialNumber',line.serialNumber||''),'maxlength="120"'):'')+
    (editing&&line.id?'<input type="hidden" name="lineId" value="'+escape(line.id)+'">':'')+
    '</fieldset>'+
    (type==='delivery'?
     '<fieldset class="tl-draft-lines"><legend>Delivery responsibility · preview only</legend>'+
      field('QC assignee','checkedBy',fieldValue('checkedBy',data.checkedBy||''),
       'maxlength="5000" required')+
      field('Logistics assignee','deliveredBy',fieldValue('deliveredBy',data.deliveredBy||''),
       'maxlength="5000" required')+
      field('Received by (optional)','receivedBy',fieldValue('receivedBy',data.receivedBy||''),
       'maxlength="5000"')+
     '</fieldset>':'')+
    (physical?'<p class="muted">Shipment items are not priced here. This preview records no delivery or inventory movement.</p>':''))+
   renderCommercialReadiness(type,fieldValue,data)+
   '<label class="tl-draft-field"><span>Remarks</span>'+
    '<textarea name="remarks" maxlength="5000" rows="3">'+escape(fieldValue('remarks',data.remarks||''))+'</textarea></label>'+
   '<div class="tl-draft-actions">'+
    '<button type="button" class="secondary" data-action="tradelink-draft-preview">Validate locally</button>'+
    '<button type="submit" class="primary"'+(live?'':' disabled title="Production Draft writes are not activated"')+
     '>'+(editing?'Save revision':'Create Draft')+'</button>'+
   '</div><p data-tradelink-draft-preview-status role="status" aria-live="polite">'+
    'Not saved. Domain write activation is pending.</p>'+
  '</form></section>';
}
export function renderTradeLinkDraftWorkspace({detail,workspaceId,view=initialTradeLinkDraftView(),canManage=false}={}){
 if(!isTradeLinkBoard(detail?.board)||detail.board.id!==TRADELINK_BOARD_ID||
   detail.board.workspace_id!==workspaceId)
  return '<section role="alert" class="tl-draft-panel">Signed TradeLink workspace unavailable.</section>';
 const rows=TL03_DOMAIN_READS_ENABLED&&canManage&&view.status==='AUTHORIZED_READ'&&Array.isArray(view.rows)?view.rows:[];
 const selected=TL03_DOMAIN_READS_ENABLED&&canManage&&view.mode==='edit'&&view.selected?.documentId?
   view.selected:null;
 return '<div class="tl-draft-workspace">'+
  '<section class="tl-draft-panel"><div class="tl-panel-heading">'+
   '<div><p class="tl-eyebrow">CP-TL-03D / Phase 1</p><h2>Draft workspace</h2></div>'+
   '<span class="tl-draft-badge">Controlled dark launch</span></div>'+
   '<p class="muted">Draft UI is staged. Domain reads: <strong>'+
    (TL03_DOMAIN_READS_ENABLED?'enabled':'not activated')+'</strong>. Writes: <strong>'+
    (TL03_DOMAIN_WRITES_ENABLED?'enabled':'not activated')+
   '</strong>. Existing APSYNTRA signed authorization remains mandatory.</p>'+
   '<p class="tl-draft-boundary" role="note">No local draft storage, synthetic saved documents, independent login, attachments, workflow approvals or PDF export. A validated preview is not a saved record.</p>'+
   '<div class="tl-panel-heading"><h3>Authoritative Draft records</h3>'+
    '<button type="button" class="secondary" data-action="tradelink-draft-refresh"'+
      (!TL03_DOMAIN_READS_ENABLED||view.busy?' disabled':'')+'>Refresh</button></div>'+
   (view.error?'<p role="alert">'+escape(view.error)+'</p>':'')+
   (view.message?'<p role="status">'+escape(view.message)+'</p>':'')+
   (rows.length?'<div class="tl-records-scroll"><table class="tl-records-table">'+
     '<thead><tr><th>Document</th><th>Module</th><th>Revision</th><th>State</th><th>Actions</th></tr></thead><tbody>'+
    rows.map(row=>'<tr><td>'+escape(row.documentNumber)+'</td><td>'+escape(row.documentType)+
     '</td><td>'+escape(row.revision)+'</td><td>'+escape(row.workflowState)+
     (row.archived?' · Archived':'')+'</td><td>'+
     '<button type="button" class="secondary" data-action="tradelink-draft-open" data-id="'+escape(row.documentId)+'">Read</button> '+
     '<button type="button" class="secondary" data-action="tradelink-draft-archive" data-id="'+escape(row.documentId)+'"'+
      (!canManage||!TL03_DOMAIN_WRITES_ENABLED||row.archived||row.workflowState!=='draft'?' disabled':'')+'>Archive</button> '+
     '<button type="button" class="secondary" data-action="tradelink-draft-restore" data-id="'+escape(row.documentId)+'"'+
      (!canManage||!TL03_DOMAIN_WRITES_ENABLED||!row.archived||row.workflowState!=='draft'?' disabled':'')+'>Restore</button>'+
     '</td></tr>').join('')+'</tbody></table></div>':
    '<p class="muted">No persisted TradeLink Draft records are displayed. The signed document-list endpoint remains off during this dark launch.</p>')+
  '</section>'+renderEditor(selected?.record,view.mode,canManage,
   view.mode==='edit'&&!selected?null:view.formValues)+'</div>';
}
