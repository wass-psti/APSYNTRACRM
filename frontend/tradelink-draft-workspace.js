/** Signed TradeLink Draft operations using the existing DomainClient.
 * No local persistence, fabricated records, second login, or write bypass.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
import {calculateTradeLinkAmounts,formatTradeLinkAmount,TRADELINK_CURRENCIES,TRADELINK_VAT_CODES} from './tradelink-finance.js';
import {TRADELINK_BOARD_ID,isTradeLinkBoard} from './tradelink-board-items.js';
import {TL03_ATTACHMENTS_ENABLED,normalizeTradeLinkAttachmentList}
 from './tradelink-attachments.js';
import {TradeLinkDomainClient,TL03_DOMAIN_READS_ENABLED,
 TL03_DOMAIN_WRITES_ENABLED,TL03_WORKFLOW_SUBMIT_ENABLED,
 TL03_WORKFLOW_REVIEW_ENABLED,TL03_WORKFLOW_DECISION_ENABLED,
 TL03_WORKFLOW_OPERATIONAL_ENABLED,TL03_DUAL_REVIEW_ENABLED,
 validateTradeLinkDraftEnvelope,
 normalizeTradeLinkDomainRow} from './tradelink-domain-client.js';

export const TL03_DRAFT_INTERFACE_ENABLED=true; // presentation only
const typeLabels=Object.freeze([
 ['esi','Electronic SI'],['packing','Packing List'],['delivery','Delivery Receipt'],
 ['payment','Payment AR'],['quotation','Quotation'],['po','PO to Suppliers']
]);
const currencies=TRADELINK_CURRENCIES;
export const TRADELINK_DOCUMENT_STATUS_OPTIONS=Object.freeze([
 ['for-approval','For Approval'],['approved','Approved'],['submitted','Submitted'],
 ['under-negotiation','Under Negotiation'],['expired','Expired'],['on-hold','On-hold'],
 ['won','Won'],['lost','Lost'],['cancelled','Cancelled'],['delivered','Delivered'],
 ['closed','Closed'],['draft','Draft']
]);
const currencyUnit=v=>currencies.includes(String(v))?String(v):'—';
const vatCodes=[['12','12%'],['zero','Zero-rated'],['exempt','Exempt'],
 ['15_tkm','15% TKM'],['15_ksa','15% KSA']];
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const disabled=()=>{throw new ApiError(
 'TradeLink Draft API is in dark launch; production persistence is disabled.',503);
};
export const tradeLinkDraftReady=()=>TL03_DOMAIN_READS_ENABLED&&TL03_DOMAIN_WRITES_ENABLED;
// A deep link carries an identifier only. The editor ALWAYS re-fetches the
// signed list and exact record before enabling a revisioned write.
export function tradeLinkDraftEditHref(documentId){
 return validUuid(documentId)?'#/boards/'+TRADELINK_BOARD_ID+
  '/tradelink/drafts/edit/'+documentId:'';
}

export function initialTradeLinkDraftView(documentType=null){
 // The route may request only one of the existing six source document types.
 // This is transient UI state, never browser or server persistence.
 const selected=typeLabels.some(([key])=>key===documentType)?documentType:null;
 return {status:'READ_PENDING',rows:[],selected:null,documentPreview:null,busy:false,error:'',
  message:'',draftNotice:'',mode:'create',editRequestId:null,pendingCreateId:null,pendingCreateDraft:null,lineDrafts:null,unsavedChanges:false,
  listFilters:initialTradeLinkDraftListFilters(),listPage:null,
  formValues:selected?{documentType:selected}:null};
}
/**
 * Discard ALL prior module inputs, including sensitive financial and reviewer
 * fields. This is in-memory UI state only; no browser or server persistence.
 */
export function resetTradeLinkDraftForm(view=initialTradeLinkDraftView(),documentType=null){
 const requested=documentType??view?.formValues?.documentType??'quotation';
 const safeType=typeLabels.some(([id])=>id===requested)?requested:'quotation';
 return {...view,mode:'create',selected:null,documentPreview:null,pendingCreateId:null,pendingCreateDraft:null,lineDrafts:null,error:'',message:'',
  draftNotice:'Unsaved local fields cleared. Nothing saved or transmitted.',unsavedChanges:false,
  formValues:{documentType:safeType}};
}
/** A visible authorized Draft editor has local changes not yet committed.
 * Conservatively warn even when the user reverts a field; there is no
 * persisted dirty flag, client cache or additional backend operation.
 */
export function tradeLinkDraftHasUnsavedChanges(view){
 return view?.unsavedChanges===true&&
  (view.mode==='create'||(view.mode==='edit'&&validUuid(view.selected?.documentId)));
}
/** Expose only program-defined local validation messages, not field values. */
export function tradeLinkDraftValidationMessage(error){
 return error instanceof ApiError&&error.status===400?
  error.message:'Invalid Draft input.';
}
/** Deliberately sanitize server failures: no SQL details or private record data. */
export function tradeLinkDraftSaveFailureMessage(error,{committed=false}={}){
 if(committed)return 'Document saved, but Board and All Documents could not be verified. Refresh the signed listing before editing or retrying.';
 const code=String(error?.code||''),status=Number(error?.status);
 if(status===401||status===403||code==='42501')
  return 'Saving is not authorized for this session or workspace. Nothing was confirmed. Sign in again or ask your administrator.';
 if(status===409||code==='40001'||code==='23505')
  return 'Draft number or revision conflicts with an existing saved record. Refresh All Documents before editing or creating another Draft.';
 if(code==='REQUEST_TIMEOUT'||status===0)
  return 'Save confirmation was interrupted. Retry unchanged inputs to reuse the same document ID, or refresh All Documents before changing the Draft.';
 return 'Save could not be confirmed. Retry unchanged inputs to reuse the same document ID, or refresh All Documents before changing the Draft.';
}
export function parseTradeLinkDraftForm(fields,{
 lineId=()=>globalThis.crypto?.randomUUID?.(),purpose='readiness'
}={}){
 if(!fields||typeof fields.get!=='function')
  throw new ApiError('TradeLink Draft input is missing.',400);
 const value=k=>String(fields.get(k)??'').trim();
 const type=value('documentType');
 // The signed Draft-write API permits incomplete quotation content. The
 // separate submission workflow enforces commercial readiness. Preserve
 // full validation for Preview and all existing non-quotation modules.
 const incompleteQuotationSave=type==='quotation'&&purpose==='save';
 const physical=type==='packing'||type==='delivery';
 const priced=type==='esi'||type==='quotation'||type==='po';
 const draft={documentType:type,documentNumber:value('documentNumber')};
 const addText=(key,{required=false}={})=>{
  const text=value(key);
  if(text.length>5000||(required&&!text))
   throw new ApiError('Invalid or missing TradeLink '+key+'.',400);
  if(text)draft[key]=text;
 };
 for(const key of ['customerName','referenceNumber','remarks',
  'verifiedBy','verifiedByEmail','approvedBy','approvedByEmail'])addText(key);
 for(const emailKey of ['verifiedByEmail','approvedByEmail']){
  const email=draft[emailKey];
  if(email&&(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
   throw new ApiError('Invalid assigned TradeLink account email.',400);
 }
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
 if(priced){
  const method=value('discountType'),rawDiscount=value('discountValue');
  const rawRate=value('exchangeRate');
  const amount=v=>/^\d+(?:\.\d+)?$/.test(v)&&Number.isFinite(Number(v))&&
   Number(v)>=0&&Number(v)<=1000000000000;
  if(method){
   if(!['percentage','fixed'].includes(method))
    throw new ApiError('Invalid TradeLink discount method.',400);
   draft.discountType=method;
  }
  if(rawDiscount){
   if(!amount(rawDiscount)||(method==='percentage'&&Number(rawDiscount)>100))
    throw new ApiError('Invalid TradeLink discount value.',400);
   draft.discountValue=Number(rawDiscount);
  }
  if(rawRate&&draft.currency!=='PHP'){
   if(!amount(rawRate)||Number(rawRate)===0)
    throw new ApiError('Invalid TradeLink PHP exchange rate.',400);
   draft.exchangeRate=Number(rawRate);
  }
 }
 const lineValues=name=>{
  const raw=typeof fields.getAll==='function'?fields.getAll(name):[fields.get(name)];
  return raw.map(v=>String(v??'').trim());
 };
 const descriptions=lineValues('lineDescription'),quantities=lineValues('lineQuantity'),
  prices=lineValues('lineUnitPrice'),units=lineValues('lineUnit'),
  ids=lineValues('lineId'),serials=lineValues('lineSerialNumber'),kinds=lineValues('lineKind');
 const count=Math.max(descriptions.length,quantities.length,prices.length,
  units.length,ids.length,serials.length,kinds.length);
 const anyLine=[...descriptions,...quantities,...prices,...units,...ids,...serials]
  .some(Boolean);
 if((physical||priced)&&!incompleteQuotationSave||anyLine){
  if(count<1||count>100)throw new ApiError('Invalid Draft line-item count.',400);
  draft.items=[];
  for(let index=0;index<count;index++){
   const description=descriptions[index]||'',quantity=quantities[index]||'',
    unitPrice=physical?'':prices[index]||'',unit=units[index]||'';
   const kind=kinds[index]||'item';
   if(!['item','note'].includes(kind))
    throw new ApiError('Invalid Draft line kind.',400);
   if(!description||description.length>2000||(kind==='item'&&
      (!quantity||(!physical&&!unitPrice))))
    throw new ApiError('Line item requires description, quantity and unit price where applicable.',400);
   if(kind==='note'&&(quantity||unitPrice||unit))
    throw new ApiError('A document note cannot contain quantity, price or unit.',400);
   const q=Number(quantity),price=physical?0:Number(unitPrice);
   if(kind==='item'&&(!Number.isFinite(q)||!Number.isFinite(price)||q<0||price<0||
      q>1000000000||price>1000000000||((physical||priced)&&q===0)||
      (priced&&price===0)))
    throw new ApiError('Invalid Draft line quantity or unit price.',400);
   const id=ids[index]||lineId(index);
   if(typeof id!=='string'||!id||id.length>120)
    throw new ApiError('Could not create a valid line-item identifier.',400);
   const item=kind==='note'?{id,kind:'note',description}:
    {id,kind:'item',description,quantity:q,unitPrice:price,
     ...(unit?{unit}:{})};
   if(type==='delivery'&&kind==='item'){
    const serial=serials[index]||'';
    if(serial.length>120)throw new ApiError('Invalid serial or asset number.',400);
    if(serial)item.serialNumber=serial;
   }
   draft.items.push(item);
  }
 }
 if(physical){
  if(!draft.customerName||!draft.referenceNumber)
   throw new ApiError('Shipment Draft requires consignee/recipient and source reference.',400);
  if(type==='packing'){
   addText('verifiedBy',{required:true});
   addText('approvedBy',{required:true});
  }
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
 if(type==='packing'){
  for(const emailKey of ['verifiedBy','approvedBy']){
   const email=String(draft[emailKey]||'').trim();
   if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ApiError('Enter a valid assigned TradeLink reviewer email.',400);
  }
 }
 if(priced){
  // Local submission-readiness previews only: these named reviewers are
  // not authoritative identities and do not authorize workflow actions.
  if(!incompleteQuotationSave&&(!draft.customerName||!draft.items?.length))
   throw new ApiError('Commercial Draft needs a customer or supplier and a priced item.',400);
  if(type==='esi'){
   for(const key of ['customerTin','verifiedBy','approvedBy'])
    addText(key,{required:true});
  }else if(type==='quotation'){
   for(const key of ['customerEmail','customerPhone','validity',
    'deliveryCommitment','paymentTerms','approvedBy'])addText(key);
   if(!incompleteQuotationSave&&((!draft.customerEmail&&!draft.customerPhone)||
     !draft.validity||!draft.deliveryCommitment||
     !draft.paymentTerms||!draft.approvedBy))
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
 return validateTradeLinkDraftEnvelope(validateTradeLinkModuleAccountAssignments(draft));
}
/**
 * Keep the exact payload (including line ID) for ambiguous create retries.
 * A changed form must never reuse an uncertain document ID: this avoids
 * inconsistent retries and duplicate authoritative Board projections.
 */
export function prepareTradeLinkDraftCommand(view,fields,{
 documentId=()=>globalThis.crypto?.randomUUID?.(),
 lineId=()=>globalThis.crypto?.randomUUID?.()
}={}){
 const selected=view?.mode==='edit'?view.selected:null;
 if(view?.mode==='edit'&&(!selected||!validUuid(selected.documentId)||
    selected.record?.id!==selected.documentId||
    !validUuid(selected.record?.board_item_id)))
  throw new ApiError('The saved Draft must be loaded and verified before editing.',409);
 const expectedRevision=selected?.record?.revision??0;
 if(!Number.isSafeInteger(expectedRevision)||
    (selected?expectedRevision<1:expectedRevision!==0))
  throw new ApiError('Invalid saved Draft revision.',409);
 const pending=view?.pendingCreateDraft;
 const draft=parseTradeLinkDraftForm(fields,{
  lineId:index=>pending?.items?.[index]?.id||lineId(index),
  purpose:'save'
 });
 const id=selected?.documentId||view?.pendingCreateId||documentId();
 if(!selected&&pending&&JSON.stringify(pending)!==JSON.stringify(draft))
  throw new ApiError('A previous save may have succeeded. Refresh All Documents before changing this Draft.',409);
 return {documentId:id,expectedRevision,draft,
  pendingCreateDraft:selected?null:pending||draft};
}
/** Reconcile a saved record against the authoritative signed bounded list.
 * A signed 50-row list is not guaranteed to contain every record. An exact
 * signed read and matching Board item are already checked by the caller;
 * preserve that verified record in the current All Documents window rather
 * than presenting a successful commit as failed solely due to pagination.
 */
export function reconcileTradeLinkSavedListing(list,record,receipt){
 if(list?.status!=='AUTHORIZED_READ'||!Array.isArray(list.rows)||
    !record||record.id!==receipt?.documentId||
    record.board_item_id!==receipt?.boardItemId||
    record.revision!==receipt?.revision||
    !['draft','for-approval','revision-required'].includes(record.workflow_state)||
    record.archived_at!==null||
    typeof record.document_number!=='string'||
    typeof record.updated_at!=='string'||
    !Number.isFinite(Date.parse(record.updated_at)))
  throw new ApiError('Signed TradeLink document listing reconciliation failed.',409);
 const summary={documentId:record.id,boardItemId:record.board_item_id,
  documentNumber:record.document_number,documentType:record.document_type,
  workflowState:record.workflow_state,revision:record.revision,
  archived:false,updatedAt:record.updated_at};
 const existing=list.rows.find(row=>row.documentId===record.id);
 if(existing&&(existing.boardItemId!==record.board_item_id||
    existing.documentType!==record.document_type||
    existing.documentNumber!==record.document_number))
  throw new ApiError('Signed TradeLink document listing conflicts with saved record.',409);
 return {...list,rows:[summary,...list.rows.filter(row=>
   row.documentId!==record.id)].slice(0,50)};
}

export class TradeLinkDraftWorkspace{
 constructor({auth,api}={}){this.client=new TradeLinkDomainClient({auth,api});}
 async list(){
  if(!TL03_DOMAIN_READS_ENABLED)return {status:'DARK_LAUNCH',rows:[]};
  return {status:'AUTHORIZED_READ',rows:await this.client.list(50)};
 }
 async searchPage({filters=initialTradeLinkDraftListFilters(),cursor=null}={}){
  if(!TL03_DOMAIN_READS_ENABLED)disabled();
  const f=normalizeTradeLinkDraftListFilters(filters);
  const page=await this.client.searchPage({
   query:f.query,documentType:f.documentType,workflowState:f.workflowState,
   archiveMode:f.archiveMode,cursor,limit:50});
  return {status:'AUTHORIZED_READ',rows:page.rows,
   listPage:{server:true,hasMore:page.hasMore,nextCursor:page.nextCursor,
    cursor,history:[],pageIndex:0,appliedFilters:f}};
 }
 async read(documentId){
  if(!TL03_DOMAIN_READS_ENABLED)disabled();
  return this.client.read(documentId);
 }
 async assignedDocuments(limit=50){
  if(!TL03_DUAL_REVIEW_ENABLED)disabled();
  return this.client.assignedDocuments(limit);
 }
 async reviewStages(documentId){
  if(!TL03_DUAL_REVIEW_ENABLED)disabled();
  return this.client.reviewStages({documentId});
 }
 async readAssigned(documentId){
  if(!TL03_DUAL_REVIEW_ENABLED)disabled();
  return this.client.readAssigned(documentId);
 }
 async recordReviewStage(input={}){
  if(!TL03_DUAL_REVIEW_ENABLED)disabled();
  return this.client.recordReviewStage(input);
 }
 async updateStatus(input={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)disabled();
  return this.client.updateStatus(input);
 }
 async submit({documentId,expectedRevision,documentType,fromState='draft'}={}){
  if(!TL03_WORKFLOW_SUBMIT_ENABLED)disabled();
  return this.client.submit({documentId,expectedRevision,documentType,fromState});
 }
 async review({documentId,expectedRevision,action,fromState,reason}={}){
  if(!TL03_WORKFLOW_REVIEW_ENABLED)disabled();
  return this.client.review({documentId,expectedRevision,action,fromState,reason});
 }
 async history(documentId,limit=25){
  if(!TL03_WORKFLOW_REVIEW_ENABLED)disabled();
  return this.client.history(documentId,limit);
 }
 async decide({documentId,expectedRevision,action,fromState,reason}={}){
  if(!TL03_WORKFLOW_DECISION_ENABLED)disabled();
  return this.client.decide({
   documentId,expectedRevision,action,fromState,reason});
 }
 async operate({documentId,expectedRevision,documentType,action,fromState,reason}={}){
  if(!TL03_WORKFLOW_OPERATIONAL_ENABLED)disabled();
  return this.client.operate({
   documentId,expectedRevision,documentType,action,fromState,reason});
 }
 async save({documentId,expectedRevision=0,draft,initialState='for-approval'}={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)disabled();
  const payload=validateTradeLinkDraftEnvelope(applyQuotationApprovalHierarchy(draft));
  const id=documentId||globalThis.crypto?.randomUUID?.();
  const operation=expectedRevision===0?'create':'update';
  return this.client.commit({documentId:id,expectedRevision,operation,
   draft:payload,initialState});
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
function moneyField(label,name,val,currency,attrs){
 return '<label class="tl-draft-field"><span>'+escape(label)+
  ' (<span data-tradelink-draft-money-currency>'+escape(currency)+'</span>)</span>'+
  '<input name="'+escape(name)+'" value="'+escape(val)+'" '+attrs+'></label>';
}
/** Explicit UI nomination lists. These emails are account identifiers,
 * not signed authorization or verified directory/role membership. */
export const TRADELINK_MODULE_ACCOUNT_OPTIONS=Object.freeze({
 esi:Object.freeze({
  verifiedBy:Object.freeze(['msenagan@watchdogautomation.com.ph','jtorino@watchdogautomation.com.ph','dcabanas@watchdogautomation.com.ph']),
  approvedBy:Object.freeze(['asenagan@watchdogautomation.com.ph','dsenagan@watchdogautomation.com.ph','amsenagan@watchdogautomation.com.ph'])
 }),
 delivery:Object.freeze({
  checkedBy:Object.freeze(['dsenagan@watchdogautomation.com.ph','asenagan@watchdogautomation.com.ph','amsenagan@watchdogautomation.com.ph']),
  deliveredBy:Object.freeze(['rogang@watchdogautomation.com.ph','jnunez@watchdogautomation.com.ph','ppajulas@watchdogautomation.com.ph','dcabanas@watchdogautomation.com.ph','asenagan@watchdogautomation.com.ph'])
 }),
 payment:Object.freeze({
  receivedBy:Object.freeze(['msenagan@watchdogautomation.com.ph']),
  verifiedBy:Object.freeze(['asenagan@watchdogautomation.com.ph'])
 }),
 po:Object.freeze({
  verifiedBy:Object.freeze(['asenagan@watchdogautomation.com.ph','aacsenagan@watchdogautomation.com.ph','cerama@watchdogautomation.com.ph','ppajulas@watchdogautomation.com.ph','dsenagan@watchdogautomation.com.ph']),
  approvedBy:Object.freeze(['asenagan@watchdogautomation.com.ph','dsenagan@watchdogautomation.com.ph','amsenagan@watchdogautomation.com.ph'])
 })
});
export function validateTradeLinkModuleAccountAssignments(draft){
 const allowed=TRADELINK_MODULE_ACCOUNT_OPTIONS[draft?.documentType];
 if(!allowed)return draft;
 for(const [field,options] of Object.entries(allowed)){
  const value=String(draft[field]??'').trim().toLowerCase();
  if(!options.includes(value))
   throw new ApiError('Select a listed TradeLink '+field+' account.',400);
  draft[field]=value;
 }
 return draft;
}
function referencePersonField(label,name,value,people,placeholder,{required=false}={}){
 const current=String(value??'').trim();
 const known=people.includes(current);
 return '<div class="tl-reference-assignment-field"><label for="tl-ref-person-'+escape(name)+'">'+escape(label)+'</label>'+
  '<select id="tl-ref-person-'+escape(name)+'" name="'+escape(name)+'"'+(required?' required':'')+'>'+
   '<option value="">'+escape(placeholder)+'</option>'+
   (current&&!known?'<option value="'+escape(current)+'" selected disabled>'+escape(current)+' (previously saved; select an authorized account)</option>':'')+
   people.map(person=>'<option value="'+escape(person)+'"'+(person===current?' selected':'')+'>'+escape(person)+'</option>').join('')+
  '</select></div>';
}
/** Review controls are enabled only for the saved document's assigned account.
 * The timestamp itself is always returned by the signed server operation. */
function referenceAssignedPdfStage(field,value,label,stage,{
 actorEmail='',documentSaved=false,documentId='',workflowState='draft',reviewedAt=null
}={}){
 const account=String(value??'').trim().toLowerCase();
 const actor=String(actorEmail||'').trim().toLowerCase();
 const canRecord=TL03_DUAL_REVIEW_ENABLED&&documentSaved&&
  workflowState==='for-approval'&&validUuid(documentId)&&account!==''&&
  account===actor&&!reviewedAt;
 const message=account?'Assigned account: '+account+'.':
  'Select an account to assign responsibility for '+label+'.';
 const shown=reviewedAt&&Number.isFinite(Date.parse(reviewedAt))?
  new Date(reviewedAt).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'}):'';
 return '<div class="tl-reference-pdf-stage" data-tl-pdf-stage="'+escape(field)+'">'+
  '<p class="tl-reference-assigned-account" data-tl-pdf-assignee aria-live="polite">'+escape(message)+'</p>'+
  '<label for="tl-pdf-time-'+escape(field)+'">Review Date &amp; Time</label>'+
  '<div class="tl-reference-approval-timestamp">'+
  '<input id="tl-pdf-time-'+escape(field)+'" disabled value="'+escape(shown)+'" placeholder="'+
   (reviewedAt?'':'Not yet validated')+'" aria-label="'+escape(label)+' timestamp">'+
  '<button type="button" '+(canRecord?'':'disabled aria-disabled="true"')+
   ' data-tl-pdf-time-control data-tl-review-stage="'+escape(stage)+'" '+
   'data-action="tradelink-document-review-stage" data-stage="'+escape(stage)+'" '+
   'data-id="'+escape(documentId)+'"'+
   ' title="'+escape(canRecord?'Record your signed validation time':
    reviewedAt?'This review is already recorded':
    'Only the assigned account can validate a saved For Approval document')+'"'+
   (account?'':' hidden')+'>Use Time Now</button></div>'+
  '<small>'+(reviewedAt?'Signed validation recorded by the assigned account.':
   'The server records the signed account and actual validation time.')+'</small>'+
  '</div>';
}
function referenceCreator(actorName){
 return '<div class="tl-reference-approval-creator"><span aria-hidden="true">♙</span><div>'+
  '<strong>Created By</strong> <span class="tl-reference-approval-chip">Auto-captured on save</span>'+
  '<p>'+(actorName?escape(actorName):'Current authenticated user')+'</p>'+
  '<small>Signed server identity and timestamp are captured on successful save.</small>'+
  '</div></div>';
}
function renderReferenceModuleWorkflow(type,fieldValue,data,actorName,reviewContext={}){
 const {actorEmail='',documentSaved=false,documentId='',workflowState='draft',reviewStages=null}=reviewContext;
 const value=name=>fieldValue(name,data[name]||'');
 const stage=(field,stageName,label)=>referenceAssignedPdfStage(field,value(field),label,stageName,{
  actorEmail,documentSaved,documentId,workflowState,
  reviewedAt:reviewStages?.[stageName]?.recordedAt||null
 });
 const person=(label,name,placeholder,required=false,stageName='primary')=>
  referencePersonField(label,name,value(name),TRADELINK_MODULE_ACCOUNT_OPTIONS[type][name],placeholder,{required})+
  stage(name,stageName,label);
 const help='<p class="tl-reference-workflow-disclaimer">Assigned reviewers are validated against their existing signed TradeLink accounts. Assignments do not grant roles or board permissions.</p>';
 const group=(title,content)=>'<div class="tl-reference-approval-stage">'+
  '<h5>'+title+'</h5>'+content+'</div>';
 if(type==='packing')return '<section class="tl-reference-approval tl-reference-module-approval" aria-label="Packing List verification and approval">'+
  '<h4>Verification &amp; Approval Workflow</h4>'+referenceCreator(actorName)+
  group('Primary Reviewer',field('Primary reviewer email','verifiedBy',value('verifiedBy'),
   'type="email" maxlength="254" required')+stage('verifiedBy','primary','Primary reviewer'))+
  group('Secondary Reviewer',field('Secondary reviewer email','approvedBy',value('approvedBy'),
   'type="email" maxlength="254" required')+stage('approvedBy','secondary','Secondary reviewer'))+
  help+'</section>';
 if(type==='esi')return '<section class="tl-reference-approval tl-reference-module-approval" aria-label="Electronic SI verification and approval">'+
  '<h4>Verification &amp; Approval Workflow</h4>'+referenceCreator(actorName)+
  group('Verified By (Finance Team)',
   person('Finance team member','verifiedBy','Select finance team member...',true,'primary'))+
  group('Approved By (Management)',
   person('Management approver','approvedBy','Select management member...',true,'secondary'))+
  help+'</section>';
 if(type==='delivery')return '<section class="tl-reference-approval tl-reference-module-approval" aria-label="Delivery tracking">'+
  '<h4>Delivery Tracking</h4>'+referenceCreator(actorName)+
  group('Checked By (Quality Control)',
   person('QC personnel','checkedBy','Select QC personnel...',true,'primary'))+
  group('Delivered By (Logistics)',
   person('Logistics personnel','deliveredBy','Select logistics personnel...',true,'secondary'))+
  '<div class="tl-reference-assignment-field"><label for="tl-ref-delivery-received">Received By (optional)</label>'+
  '<input id="tl-ref-delivery-received" name="receivedBy" maxlength="5000" value="'+escape(value('receivedBy'))+'" placeholder="Recipient acknowledgement"></div>'+
  help+'</section>';
 if(type==='payment')return '<section class="tl-reference-approval tl-reference-module-approval" aria-label="Payment acknowledgement">'+
  '<h4>Payment Acknowledgement</h4>'+referenceCreator(actorName)+
  group('Payment Received By (Finance)',
   person('Finance team member','receivedBy','Select finance team member...',true,'primary'))+
  group('Verified By (Administration)',
   person('Administrator','verifiedBy','Select admin...',true,'secondary'))+
  help+'</section>';
 if(type==='po')return '<section class="tl-reference-approval tl-reference-module-approval" aria-label="Supplier purchase order verification and approval">'+
  '<h4>Verification &amp; Approval Workflow</h4>'+referenceCreator(actorName)+
  group('Reviewed By (Account Manager)',
   referencePersonField('Account Manager','verifiedBy',
    value('verifiedBy')||'aacsenagan@watchdogautomation.com.ph',
    TRADELINK_MODULE_ACCOUNT_OPTIONS.po.verifiedBy,'Select account manager...',{required:true})+
   '<small>Suggested default reviewer: aacsenagan@watchdogautomation.com.ph. This selection is editable.</small>'+
   stage('verifiedBy','primary','Account Manager review'))+
  group('Approved By (Management)',
   person('Management approver','approvedBy','Select management member...',true,'secondary'))+
  help+'</section>';
 return '';
}

/** Fixed Quotation routing policy. The backend must separately enforce this policy
 * before review/approval transitions can be treated as activated. */
export const QUOTATION_APPROVAL_HIERARCHY=Object.freeze({
 primary:Object.freeze({label:'Sales Supervisor',email:'aacsenagan@watchdogautomation.com.ph'}),
 secondaryOptions:Object.freeze([
  'asenagan@watchdogautomation.com.ph',
  'dsenagan@watchdogautomation.com.ph',
  'amsenagan@watchdogautomation.com.ph'
 ])
});
/** Canonicalize the fixed first-stage reviewer, and reject unauthorized second-stage
 * nominees at the signed Draft-save boundary. Actual review and approval
 * authorization continues to be enforced by the backend. */
export function applyQuotationApprovalHierarchy(draft){
 if(draft?.documentType!=='quotation')return draft;
 const email=String(draft.approvedByEmail||QUOTATION_APPROVAL_HIERARCHY.secondaryOptions[0]).trim().toLowerCase();
 if(!QUOTATION_APPROVAL_HIERARCHY.secondaryOptions.includes(email))
  throw new ApiError('Select an authorized Quotation management approver.',400);
 return {...draft,verifiedBy:QUOTATION_APPROVAL_HIERARCHY.primary.label,
  verifiedByEmail:QUOTATION_APPROVAL_HIERARCHY.primary.email,
  approvedBy:'Management',approvedByEmail:email};
}
/** Presentation-only eligibility. A matching email never authorizes an RPC:
 * server-enforced stage membership, document status and audit must also pass. */
export function quotationReviewControlEligibility({
 actorEmail='',secondaryEmail='',documentSaved=false,workflowState='draft',
 primaryRecordedAt=null,secondaryRecordedAt=null
}={}){
 const actor=String(actorEmail||'').trim().toLowerCase();
 const selected=String(secondaryEmail||'').trim().toLowerCase();
 const primaryAssigned=actor!==''&&actor===QUOTATION_APPROVAL_HIERARCHY.primary.email;
 const secondaryAssigned=actor!==''&&actor===selected&&
  QUOTATION_APPROVAL_HIERARCHY.secondaryOptions.includes(selected);
 const pending=documentSaved&&workflowState==='for-approval'&&TL03_DUAL_REVIEW_ENABLED;
 return {
  primaryAssigned,secondaryAssigned,
  primaryEnabled:pending&&primaryAssigned&&!primaryRecordedAt,
  secondaryEnabled:pending&&secondaryAssigned&&!secondaryRecordedAt,
  primaryReason:!primaryAssigned?'Available only to the assigned Sales Supervisor.':
   !documentSaved?'Save the document before recording validation.':
   workflowState!=='for-approval'?'The document must be For Approval.':
   primaryRecordedAt?'Primary validation is already recorded.':'Record your signed validation.',
  secondaryReason:!secondaryAssigned?'Available only to the selected Management reviewer.':
   !documentSaved?'Save the document before recording validation.':
   workflowState!=='for-approval'?'The document must be For Approval.':
   secondaryRecordedAt?'Secondary validation is already recorded.':'Record your signed validation.'
 };
}
/** Quotation has a fixed primary Sales Supervisor and an editable existing
 * management reviewer assignment. Each reviewer records an independent server event. */
function renderQuotationVerification(fieldValue,data,actorName='',reviewContext={}){
 const {actorEmail='',documentSaved=false,documentId='',workflowState='draft',reviewStages=null}=reviewContext;
 const {primary,secondaryOptions}=QUOTATION_APPROVAL_HIERARCHY;
 const selected=fieldValue('approvedByEmail',data.approvedByEmail||secondaryOptions[0]);
 const safeSelected=secondaryOptions.includes(selected)?selected:secondaryOptions[0];
 const eligibility=quotationReviewControlEligibility({actorEmail,secondaryEmail:safeSelected,
  documentSaved,workflowState,primaryRecordedAt:reviewStages?.primary?.recordedAt,
  secondaryRecordedAt:reviewStages?.secondary?.recordedAt});
 return '<section class="tl-reference-approval" aria-labelledby="tl-quotation-approval-heading">'+
  '<h4 id="tl-quotation-approval-heading">Verification &amp; Approval Workflow</h4>'+
  '<div class="tl-reference-approval-creator"><span aria-hidden="true">♙</span><div><strong>Created By</strong> '+
   '<span class="tl-reference-approval-chip">Auto-captured on save</span><p>'+
   (actorName?escape(actorName):'Current authenticated user')+
   '</p><small>Identity and time are recorded by the signed server on successful save.</small></div></div>'+
  '<div class="tl-reference-approval-stage">'+
   '<label for="tl-quote-reviewer-email">Primary approver — Sales Supervisor</label>'+
   '<input id="tl-quote-reviewer-email" name="verifiedByEmail" value="'+escape(primary.email)+'" '+
    'type="email" maxlength="254" readonly required aria-describedby="tl-quote-primary-note">'+
   '<input type="hidden" name="verifiedBy" value="'+escape(primary.label)+'">'+
   '<small id="tl-quote-primary-note">Permanent first-stage reviewer. Only this assigned signed account can validate.</small>'+
   referenceAssignedPdfStage('verifiedByEmail',primary.email,'Sales Supervisor review','primary',{
    actorEmail,documentSaved,documentId,workflowState,
    reviewedAt:reviewStages?.primary?.recordedAt||null})+
  '</div>'+
  '<div class="tl-reference-approval-stage">'+
   '<label for="tl-quote-approver-email">Secondary approver — Management</label>'+
   '<select id="tl-quote-approver-email" name="approvedByEmail" required aria-describedby="tl-quote-secondary-note">'+
    secondaryOptions.map(email=>'<option value="'+escape(email)+'"'+
     (email===safeSelected?' selected':'')+'>'+escape(email)+'</option>').join('')+
   '</select><input type="hidden" name="approvedBy" value="Management">'+
   '<small id="tl-quote-secondary-note">This existing management assignment does not grant roles or permissions.</small>'+
   referenceAssignedPdfStage('approvedByEmail',safeSelected,'Management review','secondary',{
    actorEmail,documentSaved,documentId,workflowState,
    reviewedAt:reviewStages?.secondary?.recordedAt||null})+
  '</div></section>';
}
/** One unsaved priced line; reuse the authoritative source calculation formula. */
export function calculateTradeLinkDraftLocalAmounts(fields){
 if(!fields||typeof fields.get!=='function')return null;
 const value=name=>String(fields.get(name)??'').trim();
 if(!['esi','quotation','po'].includes(value('documentType')))return null;
 const rows=name=>(typeof fields.getAll==='function'?
  fields.getAll(name):[fields.get(name)]).map(v=>String(v??'').trim());
 const quantities=rows('lineQuantity'),prices=rows('lineUnitPrice'),
  kinds=rows('lineKind');
 const count=Math.max(quantities.length,prices.length);
 const currency=value('currency'),vatType=value('vatType');
 if(count<1||count>100||!currencies.includes(currency)||
    !TRADELINK_VAT_CODES.includes(vatType))return null;
 const items=[];
 for(let i=0;i<count;i++){
  if(kinds[i]==='note')continue;
  const q=quantities[i]||'',p=prices[i]||'';
  if(!/^\d+(?:\.\d+)?$/.test(q)||!/^\d+(?:\.\d+)?$/.test(p))return null;
  const quantity=Number(q),unitPrice=Number(p);
  if(!Number.isFinite(quantity)||!Number.isFinite(unitPrice)||
    quantity<=0||unitPrice<=0||quantity>1000000000||unitPrice>1000000000)
   return null;
  items.push({kind:'item',quantity,unitPrice});
 }
 if(!items.length)return null;
 const method=value('discountType')||'percentage';
 if(!['percentage','fixed'].includes(method))return null;
 const rawDiscount=value('discountValue'),rawRate=value('exchangeRate');
 const decimal=v=>/^\d+(?:\.\d+)?$/.test(v)&&Number.isFinite(Number(v))&&
  Number(v)>=0&&Number(v)<=1000000000000;
 if(rawDiscount&&!decimal(rawDiscount))return null;
 const discountValue=rawDiscount?Number(rawDiscount):0;
 if(method==='percentage'&&discountValue>100)return null;
 // A non-PHP amount remains denominated in its selected currency. A PHP
 // equivalent is NEVER synthesized without a user-entered conversion rate.
 const needsRate=currency!=='PHP';
 if(needsRate&&rawRate&&(!decimal(rawRate)||Number(rawRate)===0))return null;
 const hasRate=needsRate&&rawRate!=='';
 const exchangeRate=hasRate?Number(rawRate):0;
 const result=calculateTradeLinkAmounts({
  items,currency,vatType,
  discountType:method,discountValue,exchangeRate
 });
 if(['subtotal','discount','taxable','vat','total'].some(key=>
  !Number.isFinite(result[key])))return null;
 if((!needsRate||hasRate)&&!Number.isFinite(result.phpEquivalent))return null;
 return {currency,subtotal:result.subtotal,discount:result.discount,
  taxable:result.taxable,vat:result.vat,total:result.total,
  phpEquivalent:needsRate&&!hasRate?null:result.phpEquivalent};
}
/** Pure DOM text updates inside the existing signed Draft form; no API/write. */
export function updateTradeLinkDraftLocalAmounts(form){
 const panel=form?.querySelector?.('[data-tradelink-draft-finance]');
 if(!panel)return null;
 const fields={
  get:key=>form.querySelector('[name="'+key+'"]')?.value??'',
  getAll:key=>(typeof form.querySelectorAll==='function'?
   [...form.querySelectorAll('[name="'+key+'"]')].map(el=>el.value):
   [form.querySelector('[name="'+key+'"]')?.value??''])
 };
 const result=calculateTradeLinkDraftLocalAmounts(fields);
 const currency=panel.querySelector('[data-tradelink-draft-amount-currency]');
 if(currency)currency.textContent=result?.currency||'—';
 const unit=currencyUnit(fields.get('currency'));
 const fxBase=panel.querySelector('[data-tradelink-draft-fx-base]');
 if(fxBase)fxBase.textContent=unit;
 const exchange=panel.querySelector('[data-tradelink-draft-exchange]');
 if(exchange)exchange.hidden=unit==='PHP';
 const vatLabel=panel.querySelector('[data-tradelink-draft-vat-rate]');
 if(vatLabel)vatLabel.textContent=fields.get('vatType')==='12'?'12%':
  fields.get('vatType')==='zero'?'0%':fields.get('vatType')==='exempt'?'Exempt':
  fields.get('vatType').startsWith('15_')?'15%':'—';
 for(const name of ['subtotal','discount','taxable','vat','total']){
  const label=panel.querySelector('[data-tradelink-draft-denomination="'+name+'"]');
  if(label)label.textContent=unit;
 }
 for(const name of ['subtotal','discount','taxable','vat','total','phpEquivalent']){
  const target=panel.querySelector('[data-tradelink-draft-amount="'+name+'"]');
  if(target)target.textContent=result&&result[name]!==null?
   formatTradeLinkAmount(result[name]):'—';
 }
 const status=panel.querySelector('[data-tradelink-draft-finance-status]');
 if(status)status.textContent=!result?
  'Enter valid positive quantity, price, discount, currency and VAT to preview amounts.':
  result.currency!=='PHP'&&result.phpEquivalent===null?
   'Selected-currency estimate only. Enter a positive PHP exchange rate for conversion. Nothing saved.':
   'Unsaved estimate only. Validate the Draft separately; nothing was transmitted.';
 return result;
}
/**
 * Refresh the currency code inside both payment amount and priced unit-price labels.
 * Uses textContent only; no markup injection or external data.
 */
export function updateTradeLinkDraftInputCurrencyLabels(form){
 if(!form?.querySelectorAll||!form?.querySelector)return;
 const unit=currencyUnit(form.querySelector('[name="currency"]')?.value);
 for(const label of form.querySelectorAll('[data-tradelink-draft-money-currency]'))
  label.textContent=unit;
}
function renderTradeLinkDraftLocalAmounts(type,fieldValue,data,line,lines=[line]){
 const defaults={documentType:type,lineQuantity:line.quantity??'',
  lineUnitPrice:line.unitPrice??'',currency:data.currency||'PHP',
  vatType:data.vatType||'12',discountType:data.discountType||'percentage',
  discountValue:data.discountValue??'',exchangeRate:data.exchangeRate??''};
 const value=key=>fieldValue(key,defaults[key]??'');
 const initial=calculateTradeLinkDraftLocalAmounts({get:value,
  getAll:name=>name==='lineQuantity'?
    (lines.length>1?lines.map(x=>String(x.quantity??'')):[value('lineQuantity')]):
   name==='lineUnitPrice'?
    (lines.length>1?lines.map(x=>String(x.unitPrice??'')):[value('lineUnitPrice')]):
   name==='lineKind'?lines.map(x=>x.kind||'item'):[]});
 const unit=currencyUnit(value('currency'));
 const display=key=>initial&&initial[key]!==null?formatTradeLinkAmount(initial[key]):'—';
 return '<section class="tl-draft-finance tl-reference-totals" data-tradelink-draft-finance '+
  'aria-label="Document totals · unsaved preview">'+
  '<div class="tl-reference-totals-right">'+
   '<dl class="tl-draft-finance-results">'+
    '<div class="tl-ref-total-subtotal"><dt>Subtotal:</dt><dd data-tradelink-draft-amount="subtotal">'+display('subtotal')+'</dd></div>'+
    '<div class="tl-ref-total-discount"><dt><label for="tl-reference-discount-input">Discount:</label></dt><dd class="tl-ref-total-discount-fields">'+
     '<select name="discountType" aria-label="Discount method" aria-describedby="tl-draft-discount-help">'+
      options([['percentage','Percentage (%)'],['fixed','Fixed amount']],value('discountType'))+'</select>'+
     '<input id="tl-reference-discount-input" name="discountValue" value="'+escape(value('discountValue'))+'" '+
      'type="number" min="0" max="1000000000000" step="any" aria-describedby="tl-draft-discount-help">'+
     '<output data-tradelink-draft-amount="discount">'+display('discount')+'</output></dd></div>'+
    '<div class="tl-ref-total-taxable"><dt>Subtotal After Discount:</dt><dd data-tradelink-draft-amount="taxable">'+display('taxable')+'</dd></div>'+
    '<div class="tl-ref-total-vat"><dt><label for="tl-reference-vat">VAT (<span data-tradelink-draft-vat-rate>'+escape(value('vatType'))+'</span>):</label></dt><dd>'+
     '<select id="tl-reference-vat" name="vatType" aria-label="VAT treatment">'+
      options(vatCodes,value('vatType'))+'</select>'+
     '<output data-tradelink-draft-amount="vat">'+display('vat')+'</output></dd></div>'+
    '<div class="tl-ref-total-grand"><dt>TOTAL:</dt><dd data-tradelink-draft-amount="total">'+display('total')+'</dd></div>'+
   '</dl>'+
   '<div class="tl-reference-totals-exchange" data-tradelink-draft-exchange'+
     (unit==='PHP'?' hidden':'')+'>'+
    '<label for="tl-reference-fx">PHP conversion rate (PHP per 1 '+
     '<span data-tradelink-draft-fx-base>'+escape(unit)+'</span>)</label>'+
    '<input id="tl-reference-fx" name="exchangeRate" value="'+escape(value('exchangeRate'))+'" '+
     'type="number" min="0" max="1000000000000" step="any" aria-describedby="tl-draft-fx-help">'+
    '<small id="tl-draft-fx-help">Enter a rate manually; no exchange-rate lookup occurs.</small>'+
    '<div class="tl-ref-total-php"><span>PHP equivalent (PHP)</span>'+
     '<output data-tradelink-draft-amount="phpEquivalent">'+display('phpEquivalent')+'</output></div>'+
   '</div>'+
   '<p class="tl-reference-totals-help" id="tl-draft-discount-help">Percentage: 0–100; fixed discount in the selected currency.</p>'+
   '<p class="tl-reference-totals-status" data-tradelink-draft-finance-status role="status" aria-live="polite" aria-atomic="true">'+
    (initial?'Unsaved calculation preview.':'Complete quantities and prices to preview totals.')+'</p>'+
   '<span class="tl-reference-totals-sr">Currency: <span data-tradelink-draft-amount-currency>'+escape(unit)+'</span> '+
    '<span data-tradelink-draft-denomination="subtotal">'+escape(unit)+'</span>'+
    '<span data-tradelink-draft-denomination="discount">'+escape(unit)+'</span>'+
    '<span data-tradelink-draft-denomination="taxable">'+escape(unit)+'</span>'+
    '<span data-tradelink-draft-denomination="vat">'+escape(unit)+'</span>'+
    '<span data-tradelink-draft-denomination="total">'+escape(unit)+'</span></span>'+
  '</div></section>';
}

/** Explicitly bounded, source-module-specific, unsaved document summary fields. */
const commercialSummaryRows=Object.freeze([
 ['localSubtotal','Local subtotal estimate'],
 ['localDiscount','Local discount estimate'],
 ['localVat','Local VAT estimate'],
 ['localTotal','Local total estimate'],
 ['localPhpEquivalent','PHP equivalent (requires explicit FX for non-PHP)']
]);
const localSummaryRows=Object.freeze({
 esi:[['customerTin','Client tax identity / TIN'],
  ['lineDescription','Invoiced item'],['lineQuantity','Quantity'],
  ['lineUnitPrice','Unit price'],['verifiedBy','Intended finance verifier'],
  ['approvedBy','Intended management approver'],...commercialSummaryRows],
 packing:[['referenceNumber','Source reference'],['lineDescription','Physical item'],
  ['lineQuantity','Quantity'],['lineUnit','Unit'],
  ['verifiedBy','Primary reviewer'],['approvedBy','Secondary reviewer']],
 delivery:[['referenceNumber','Source reference'],['lineDescription','Delivered item'],
  ['lineQuantity','Quantity'],['lineUnit','Unit'],
  ['lineSerialNumber','Serial / asset number'],['checkedBy','QC assignee'],
  ['deliveredBy','Logistics assignee'],['receivedBy','Recipient acknowledgement']],
 payment:[['paymentParticulars','Payment particulars'],['cashAmount','Cash amount'],
  ['chequeAmount','Cheque amount'],['bankName','Cheque bank'],
  ['chequeNumber','Cheque number'],['receivedBy','Received by'],
  ['verifiedBy','Verified by']],
 quotation:[['customerEmail','Client email'],['customerPhone','Client phone'],
  ['lineDescription','Priced item'],['lineQuantity','Quantity'],
  ['lineUnitPrice','Unit price'],['validity','Offer validity'],
  ['deliveryCommitment','Delivery commitment'],['paymentTerms','Payment terms'],
  ['approvedBy','Intended approver'],...commercialSummaryRows],
 po:[['poNumber','Supplier PO reference'],['targetDeliveryDate','Target delivery date'],
  ['lineDescription','Purchased item'],['lineQuantity','Quantity'],
  ['lineUnitPrice','Unit price'],['paymentTerms','Payment terms'],
  ['verifiedBy','Intended Account Manager reviewer'],
  ['approvedBy','Intended final approver'],...commercialSummaryRows]
});
const commonSummaryRows=Object.freeze([
 ['documentNumber','Document number'],['customerName','Customer / supplier / recipient'],
 ['currency','Currency']
]);
export function tradeLinkDraftLocalSummaryValues(draft){
 if(!draft||!Object.hasOwn(localSummaryRows,draft.documentType))return null;
 const item=Array.isArray(draft.items)?draft.items[0]||{}:{};
 const unit=currencyUnit(draft.currency);
 const money=name=>typeof draft[name]==='number'?
  formatTradeLinkAmount(draft[name])+' '+unit:'';
 const fields={
  ...draft,lineDescription:item.description??'',lineQuantity:item.quantity??'',
  lineUnit:item.unit??'',lineSerialNumber:item.serialNumber??'',
  lineUnitPrice:typeof item.unitPrice==='number'?
   formatTradeLinkAmount(item.unitPrice)+' '+unit:'',
  cashAmount:money('cashAmount'),chequeAmount:money('chequeAmount')
 };
 const amount=calculateTradeLinkDraftLocalAmounts({
  get:name=>name==='lineQuantity'?item.quantity??'':
   name==='lineUnitPrice'?item.unitPrice??'':draft[name]??'',
  getAll:name=>name==='lineQuantity'?draft.items?.map(x=>x.quantity)??[]:
   name==='lineUnitPrice'?draft.items?.map(x=>x.unitPrice)??[]:[]
 });
 const priced=['esi','quotation','po'].includes(draft.documentType);
 fields.localSubtotal=priced&&amount?formatTradeLinkAmount(amount.subtotal)+' '+amount.currency:'';
 fields.localDiscount=priced&&amount?formatTradeLinkAmount(amount.discount)+' '+amount.currency:'';
 fields.localVat=priced&&amount?formatTradeLinkAmount(amount.vat)+' '+amount.currency:'';
 fields.localTotal=priced&&amount?formatTradeLinkAmount(amount.total)+' '+amount.currency:'';
 fields.localPhpEquivalent=priced&&amount&&amount.phpEquivalent!==null?
  formatTradeLinkAmount(amount.phpEquivalent)+' PHP':'';
 const rows=[...commonSummaryRows,...localSummaryRows[draft.documentType]];
 return Object.fromEntries(rows.map(([key])=>[key,String(fields[key]??'').trim()||'—']));
}
/** No HTML construction from user input, browser storage, RPC, or document writes. */
export function updateTradeLinkDraftLocalSummary(form,draft=null){
 const panel=form?.querySelector?.('[data-tradelink-draft-summary]');
 if(!panel)return null;
 const nodes=panel.querySelectorAll('[data-tradelink-draft-summary-value]');
 const module=panel.dataset?.documentType;
 const values=draft&&draft.documentType===module?
  tradeLinkDraftLocalSummaryValues(draft):null;
 for(const node of nodes){
  const name=node.dataset?.tradelinkDraftSummaryValue;
  node.textContent=values?.[name]??'';
 }
 panel.hidden=!values;
 return values;
}
function renderTradeLinkDraftLocalSummary(type){
 const rows=localSummaryRows[type];
 if(!rows)return '';
 return '<section class="tl-draft-summary" data-tradelink-draft-summary '+
  'data-document-type="'+escape(type)+'" hidden '+
  'aria-labelledby="tl-draft-local-summary-title">'+
  '<h4 id="tl-draft-local-summary-title">Validated local Draft summary · not saved</h4>'+
  '<p class="muted">Only the fields from this local form are shown. Names are '+
  'not verified identities. This is not a created document or approval.</p>'+
  '<dl class="tl-draft-summary-rows">'+
  [...commonSummaryRows,...rows].map(([key,label])=>
   '<div><dt>'+escape(label)+'</dt><dd data-tradelink-draft-summary-value="'+
    escape(key)+'"></dd></div>').join('')+
  '</dl><p class="muted">Edit any input or switch modules to discard this '+
  'local validation summary. Nothing was transmitted.</p></section>';
}
/** Pure presentation metadata. No document number, date or workflow state is
 * inferred from a local form, and no unapproved financial action is enabled. */
const referenceTitles=Object.freeze({
 esi:'Electronic Sales Invoice',packing:'Packing List',delivery:'Delivery Receipt',
 payment:'Electronic Payment Acknowledgement Receipt',
 quotation:'Quotation',po:'Purchase Order to Suppliers'
});
const referencePrefixes=Object.freeze({
 esi:'ESI-',packing:'PL-',delivery:'DR-',payment:'AR-',quotation:'Q-',po:'PO-'
});
/** Screenshot-derived suggestions, not server-managed records or workflow states.
 * Native datalists permit the user's custom text without changing the domain schema. */
export const TRADELINK_COMMERCIAL_SUGGESTIONS=Object.freeze({
 paymentTerms:Object.freeze([
  'Due on Receipt','COD (Cash on Delivery)','15 Days PDC','30 Days PDC',
  '50% DP-Balance upon completion','Advance payment prior to delivery',
  'Installment plans','30 Days Net','45 Days Net','60 Days Net','90 Days Net'
 ]),
 validity:Object.freeze(['15 Days','30 Days','60 Days','120 Days','6 Months','1 Year']),
 deliveryCommitment:Object.freeze([
  '3 Days (in Stock)','4 Weeks','6 Weeks','8 Weeks','12 Weeks',
  '16 Weeks','20 Weeks','24 Weeks'
 ])
});
function commercialSuggestionLists(type){
 if(type!=='quotation'&&type!=='po')return '';
 return '<div class="tl-reference-suggestion-lists">'+
  Object.entries(TRADELINK_COMMERCIAL_SUGGESTIONS).map(([name,values])=>
   '<datalist id="tl-suggest-'+name+'">'+
   values.map(value=>'<option value="'+escape(value)+'"></option>').join('')+
   '</datalist>').join('')+'</div>';
}
/** Contextual document guidance is presentation-only and never a server verdict. */
export const TRADELINK_MODULE_GUIDANCE=Object.freeze({
 esi:Object.freeze({heading:'Electronic Sales Invoice',detail:'Capture invoice client identity, taxable items, prices, and finance verification details.',boundary:'Financial figures are a local calculation until an authorized Draft is saved.'}),
 packing:Object.freeze({heading:'Packing List',detail:'Record physical item quantities and shipment references without inventing inventory movement.',boundary:'This Draft does not confirm packaging, dispatch, or delivery.'}),
 delivery:Object.freeze({heading:'Delivery Receipt',detail:'Describe received or delivered items and serial identifiers with QC and logistics responsibility.',boundary:'Assignee text does not record a quality-control check or confirm delivery.'}),
 payment:Object.freeze({heading:'Payment Acknowledgement',detail:'Describe the payment instrument, particulars, and intended receipt and verification responsibility.',boundary:'Entering an amount does not receive money or certify a settled receivable.'}),
 quotation:Object.freeze({heading:'Quotation',detail:'Prepare priced items, client contact details, validity, delivery commitment, and payment terms.',boundary:'Commercial terms are editable suggestions. No approval or PDF is issued by local validation.'}),
 po:Object.freeze({heading:'Purchase Order',detail:'Record supplier identity, purchased items, target delivery, and negotiated payment conditions.',boundary:'Saving a Draft does not authorize a purchase or trigger supplier fulfillment.'})
});
function renderModuleGuidance(type){
 const guide=TRADELINK_MODULE_GUIDANCE[type];
 return guide?'<aside class="tl-reference-module-guidance" role="note" aria-label="'+
  escape(guide.heading)+' drafting guidance"><strong>'+escape(guide.heading)+
  ' drafting guide</strong><p>'+escape(guide.detail)+'</p><small>'+
  escape(guide.boundary)+'</small></aside>':'';
}
function referenceDraftTabs(type){
 const base='#/boards/'+TRADELINK_BOARD_ID+'/tradelink/drafts/';
 return '<nav class="tl-reference-document-tabs" aria-label="TradeLink document modules">'+
 typeLabels.map(([key,label])=>
  '<a href="'+base+escape(key)+'"'+(key===type?' class="active" aria-current="page"':'')+
  '>'+escape(key==='quotation'?'Quotations':label)+'</a>').join('')+'</nav>';
}
function referenceDocumentHeader(type,editing,canSave=false,status='for-approval',documentId=''){
 const title=referenceTitles[type]||'TradeLink Document';
 const approved=status==='approved'&&validUuid(documentId);
 return '<div class="tl-reference-document-topcard"><header class="tl-reference-document-heading">'+
   '<div class="tl-reference-document-title">'+
    '<span class="tl-reference-document-icon" aria-hidden="true">'+
     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">'+
     '<path d="M8 3h7l5 5v12a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>'+
     '<path d="M15 3v6h5M8 13h8M8 17h8"/></svg></span>'+
    '<div><h3 id="tl-draft-editor-title">'+escape(title)+'</h3>'+
     '<p class="tl-reference-draft-status">'+
      (editing?'Editing saved document':'New document · not saved')+
     '</p></div></div>'+
   '<div class="tl-reference-document-toolbar" aria-label="Document actions">'+
    '<button type="button" class="tl-reference-tool" disabled title="Templates are not activated in APSYNTRA CRM">Templates</button>'+
    '<button type="button" class="tl-reference-tool" '+(approved?'data-action="tradelink-document-print" data-id="'+escape(documentId)+'"':'disabled')+
     ' title="'+(approved?'Print the verified Approved document':'PDF printing is available only after both reviewers approve')+'">Print PDF</button>'+
    '<button type="button" class="tl-reference-save" data-action="tradelink-draft-submit"'+
     (canSave?'':' disabled title="Signed document saving is unavailable"')+
     '>'+(editing?'Save Changes':'Save')+'</button>'+
   '</div></header></div>';
}
/** Compact source-matched Items editor; notes have no quantity or financial value. */
export function tradeLinkLineAmount(row){
 if(row?.kind==='note')return null;
 const q=Number(row?.quantity),p=Number(row?.unitPrice);
 return Number.isFinite(q)&&Number.isFinite(p)&&q>=0&&p>=0?
  q*p:null;
}
export function updateTradeLinkLineRowTotals(form){
 if(!form?.querySelectorAll)return;
 const currency=currencyUnit(form.querySelector('[name="currency"]')?.value);
 for(const row of form.querySelectorAll('[data-tradelink-line-item]')){
  const target=row.querySelector('[data-tradelink-line-total]');
  if(!target)continue;
  const kind=row.querySelector('[name="lineKind"]')?.value||'item';
  const rawQuantity=row.querySelector('[name="lineQuantity"]')?.value||'';
  const rawPrice=row.querySelector('[name="lineUnitPrice"]')?.value||'';
  const amount=rawQuantity!==''&&rawPrice!==''?
   tradeLinkLineAmount({kind,quantity:rawQuantity,unitPrice:rawPrice}):null;
  target.textContent=amount===null?'—':
   formatTradeLinkAmount(amount)+' '+currency;
 }
}
/** Render one existing or newly added item; all untrusted fields are escaped. */
export function renderTradeLinkDraftLineItem(item={},type='quotation',currency='PHP',index=0){
 const physical=type==='packing'||type==='delivery',priced=['esi','quotation','po'].includes(type);
 const note=item.kind==='note';
 const label=(note?'Note ':'Item ')+String(index+1);
 const req=(physical||priced)?' required':'';
 const desc=escape(item.description??'');
 const quantity=item.quantity??(note?'':'1'),unitPrice=item.unitPrice??'';
 return '<div class="tl-reference-line-item'+(note?' tl-reference-note-row':'')+'" data-tradelink-line-item>'+
  '<div class="tl-ref-item-handle" draggable="true" title="Drag to reorder" aria-hidden="true">⠿</div>'+
  '<span class="tl-ref-item-index" aria-label="'+escape(label)+'">'+escape(index+1)+'</span>'+
  '<label class="tl-draft-field tl-ref-item-description"><span class="sr-only">'+escape(label)+' description</span>'+
   '<textarea name="lineDescription" maxlength="2000" rows="2" placeholder="'+(note?'Enter item note…':'Enter material description…')+'" required>'+desc+'</textarea></label>'+
  (note?
   '<input type="hidden" name="lineQuantity" value="">'+
   (physical?'':'<input type="hidden" name="lineUnitPrice" value="">')+
   '<input type="hidden" name="lineUnit" value="">':
   '<label class="tl-draft-field tl-ref-item-quantity"><span class="sr-only">'+escape(label)+' quantity</span>'+
    '<input name="lineQuantity" type="number" min="0" max="1000000000" step="any" value="'+escape(quantity)+'" placeholder="Qty"'+req+'></label>'+
   (physical?'':
    '<label class="tl-draft-field tl-ref-item-price"><span class="sr-only">'+escape(label)+' unit price ('+escape(currency)+')</span>'+
    '<input name="lineUnitPrice" type="number" min="0" max="1000000000" step="any" value="'+escape(unitPrice)+'" placeholder="Unit price"'+(priced?' required':'')+'></label>')+
   (physical?
    '<label class="tl-draft-field tl-ref-item-unit"><span class="sr-only">'+escape(label)+' unit</span>'+
     '<input name="lineUnit" value="'+escape(item.unit??'')+'" maxlength="120" placeholder="Unit"></label>':
    '<input type="hidden" name="lineUnit" value="'+escape(item.unit??'')+'">'))+
  (type==='delivery'&&note?'<input type="hidden" name="lineSerialNumber" value="">':'')+
  (type==='delivery'&&!note?field('Serial / asset no.','lineSerialNumber',
    item.serialNumber??'','maxlength="120"'):'')+
  (priced&&!note?'<output class="tl-ref-item-total" data-tradelink-line-total aria-label="Line amount">'+
   (tradeLinkLineAmount(item)===null?'—':escape(formatTradeLinkAmount(tradeLinkLineAmount(item)))+' '+escape(currency))+'</output>':'')+
  '<div class="tl-ref-item-actions">'+
   '<button type="button" data-action="tradelink-draft-move-line" data-direction="up" aria-label="Move '+escape(label)+' up" title="Move up">↑</button>'+
   '<button type="button" data-action="tradelink-draft-move-line" data-direction="down" aria-label="Move '+escape(label)+' down" title="Move down">↓</button>'+
   '<button type="button" data-action="tradelink-draft-add-line" aria-label="Add item after '+escape(label)+'" title="Add item">＋</button>'+
   '<button type="button" data-action="tradelink-draft-remove-line" aria-label="Remove item '+escape(index+1)+'" title="Remove item" class="tl-ref-item-delete">♲</button>'+
  '</div>'+
  '<input type="hidden" name="lineKind" value="'+(note?'note':'item')+'">'+
  '<input type="hidden" name="lineId" value="'+escape(item.id??'')+'">'+
  '</div>';
}
/** Snapshot in-memory editor rows without creating records or using storage. */
export function snapshotTradeLinkDraftLineItems(form){
 if(!form?.querySelectorAll)return [];
 return [...form.querySelectorAll('[data-tradelink-line-item]')].map(row=>{
  const get=name=>row.querySelector('[name="'+name+'"]')?.value??'';
  return {id:get('lineId'),kind:get('lineKind')||'item',description:get('lineDescription'),
   quantity:get('lineQuantity'),unitPrice:get('lineUnitPrice'),
   unit:get('lineUnit'),serialNumber:get('lineSerialNumber')};
 });
}
function renderEditor(row,mode,canManage,formValues=null,draftNotice='',error='',message='',lineDrafts=null,actorName='',actorEmail='',reviewStages=null,showModuleTabs=true){
 const editing=mode==='edit'&&
  ['draft','for-approval','revision-required'].includes(row?.workflow_state)&&
  row.content&&typeof row.content==='object'&&
  (!Array.isArray(row.content.items)||row.content.items.length<=100);
 const data=editing?row.content:{};
 const fieldValue=(name,fallback='')=>formValues&&Object.hasOwn(formValues,name)?formValues[name]:fallback;
 const line=Array.isArray(data.items)?data.items[0]||{}:{};
 const writeEnabled=editing||mode==='create';
 const live=TL03_DOMAIN_WRITES_ENABLED&&canManage&&writeEnabled;
 const workflowState=editing?row.workflow_state:'for-approval';
 const documentId=editing?row.id:'';
 const selectedStatus=fieldValue('documentStatus',workflowState);

 const type=editing?data.documentType:fieldValue('documentType','quotation');
 const physical=type==='packing'||type==='delivery';
 const payment=type==='payment';
 const priced=type==='esi'||type==='quotation'||type==='po';
 const inputUnit=currencyUnit(fieldValue('currency',data.currency||'PHP'));
 const lines=Array.isArray(lineDrafts)&&lineDrafts.length?lineDrafts:
  editing&&Array.isArray(data.items)&&data.items.length?data.items:
  [{id:'',description:fieldValue('lineDescription',line.description??''),
    quantity:fieldValue('lineQuantity',line.quantity??''),
    unitPrice:fieldValue('lineUnitPrice',line.unitPrice??''),
    unit:fieldValue('lineUnit',line.unit??''),
    serialNumber:fieldValue('lineSerialNumber',line.serialNumber??'')}];
 const commonPartyLabel=type==='packing'?'Consignee':type==='delivery'?'Recipient / consignee':
  payment?'Payor':type==='po'?'Supplier':type==='esi'?'Invoice client':
  type==='quotation'?'Prospective client':'Customer / supplier';
 const localDate=new Date().toLocaleDateString('en-US',{
  year:'numeric',month:'2-digit',day:'2-digit'});
 return '<section class="tl-draft-panel tl-reference-editor" aria-labelledby="tl-draft-editor-title">'+
  referenceDocumentHeader(type,editing,live,workflowState,documentId)+
  (error?'<p class="tl-draft-feedback" role="alert">'+escape(error)+'</p>':'')+
  (message?'<p class="tl-draft-feedback" role="status">'+escape(message)+'</p>':'')+
  (editing?'<div class="tl-draft-editor-navigation">'+
   '<a class="secondary" href="#/boards/'+TRADELINK_BOARD_ID+
   '/tradelink/documents">Back to All Documents</a> '+
   '<button type="button" class="secondary tl-reference-new-draft" data-action="tradelink-draft-new">New Draft</button>'+
   '</div>':'')+
  (mode==='edit'&&!editing?'<p role="alert">This record cannot be edited with the bounded Phase 1 editor.</p>':'')+
  (draftNotice?'<p class="tl-draft-feedback" role="status">'+escape(draftNotice)+'</p>':'')+
  '<div class="tl-reference-editor-content">'+(showModuleTabs?referenceDraftTabs(type):'')+
  renderModuleGuidance(type)+
  '<form data-tradelink-draft-form'+(type==='quotation'?' novalidate':'')+'>'+
   // Retain the source documentType control for existing form contracts.
   // The embedded split workspace uses its sidebar as the visible module switcher.
   '<div class="tl-reference-sr-only"><label class="tl-draft-field"><span>Document module</span>'+
    '<select name="documentType" tabindex="-1" aria-hidden="true" '+(editing?'disabled':'')+'>'+
     options(typeLabels,type)+'</select></label></div>'+
   (editing?'<input type="hidden" name="documentType" value="'+escape(type)+'">':'')+
   '<section class="tl-reference-form-section tl-reference-document-info">'+
    '<h4>Document Information</h4>'+
    '<div class="tl-reference-document-grid">'+
     '<label class="tl-draft-field"><span>Status</span><select name="documentStatus"'+
      (live?'':' disabled')+' aria-describedby="tl-reference-status-help">'+
      [...TRADELINK_DOCUMENT_STATUS_OPTIONS,
       ...(workflowState&&!TRADELINK_DOCUMENT_STATUS_OPTIONS.some(([id])=>id===workflowState)?
        [[workflowState,tradeLinkWorkflowLabel(workflowState)]]:[])] .map(([id,label])=>{
       const selectable=['draft','for-approval'].includes(id)&&
        ['draft','for-approval'].includes(workflowState);
       const disabled=!selectable;
       return '<option value="'+escape(id)+'"'+(id===selectedStatus?' selected':'')+
        (disabled?' disabled':'')+'>'+escape(label)+'</option>';
      }).join('')+'</select><small id="tl-reference-status-help">Save defaults to For Approval. Select Draft explicitly to save as Draft. Approved is assigned automatically after both reviewers validate.</small></label>'+
     '<label class="tl-draft-field"><span>Number</span>'+
      '<input name="documentNumber" value="'+escape(fieldValue('documentNumber',data.documentNumber||''))+
       '" required maxlength="120" pattern="[A-Za-z0-9][A-Za-z0-9._ /-]*" '+
       'placeholder="'+escape(referencePrefixes[type]||'DOC-')+'Enter a reference" '+
       'aria-describedby="tl-reference-number-help">'+
      '<small id="tl-reference-number-help">Enter a Draft number for local validation; no number is assigned or saved automatically.</small></label>'+
     '<div class="tl-reference-static-field"><span>Date · local only</span>'+
      '<output>'+escape(localDate)+'</output></div>'+
     '<div class="tl-reference-static-field tl-reference-revision"><span>Revision No.</span>'+
      '<output>'+(editing?escape(row?.revision??'—'):'0 · Local preview')+'</output></div>'+
    '</div>'+
   '</section>'+
   '<section class="tl-reference-form-section tl-reference-client">'+
    '<h4>Client Information</h4>'+
    '<div class="tl-draft-form-grid">'+
     field(commonPartyLabel,'customerName',fieldValue('customerName',data.customerName||''),
      'maxlength="5000"'+(physical||payment||priced?' required':''))+
     field(physical?'Source reference':'Reference information','referenceNumber',
      fieldValue('referenceNumber',data.referenceNumber||''),
      'maxlength="5000"'+(physical?' required':''))+
     (type==='esi'?field('Client tax identity / TIN','customerTin',
      fieldValue('customerTin',data.customerTin||''),'maxlength="5000" required'):'')+
     (type==='quotation'?
      field('Client email (or phone)','customerEmail',fieldValue('customerEmail',data.customerEmail||''),
       'type="email" maxlength="5000"')+
      field('Client phone (or email)','customerPhone',fieldValue('customerPhone',data.customerPhone||''),
       'maxlength="5000"')+
      field('Payment terms','paymentTerms',fieldValue('paymentTerms',data.paymentTerms||''),
       'maxlength="5000" list="tl-suggest-paymentTerms" required')+
      field('Offer validity','validity',fieldValue('validity',data.validity||''),
       'maxlength="5000" list="tl-suggest-validity" required')+
      field('Delivery commitment','deliveryCommitment',
       fieldValue('deliveryCommitment',data.deliveryCommitment||''),
       'maxlength="5000" list="tl-suggest-deliveryCommitment" required'):'')+
     (type==='po'?
      field('Supplier PO number (optional)','poNumber',fieldValue('poNumber',data.poNumber||''),
       'maxlength="5000"')+
      field('Target delivery date','targetDeliveryDate',
       fieldValue('targetDeliveryDate',data.targetDeliveryDate||''),'type="date" required')+
      field('Payment terms','paymentTerms',fieldValue('paymentTerms',data.paymentTerms||''),
       'maxlength="5000" list="tl-suggest-paymentTerms" required'):'')+
     '<label class="tl-draft-field tl-reference-currency-field"><span>Currency</span>'+
      '<select name="currency" aria-describedby="tl-reference-currency-help">'+
       options(currencies.map(v=>[v,v]),fieldValue('currency',data.currency||'PHP'))+'</select>'+
      '<small id="tl-reference-currency-help">ISO currency code saved with this Draft revision. Currency conversion is never inferred.</small></label>'+

    '</div>'+
   '</section>'+commercialSuggestionLists(type)+
   (payment?
    '<fieldset class="tl-draft-lines tl-reference-payment"><legend>Form of Payment</legend>'+
     field('Payment particulars','paymentParticulars',fieldValue('paymentParticulars',data.paymentParticulars||''),
      'maxlength="5000" required')+
     moneyField('Cash amount','cashAmount',fieldValue('cashAmount',data.cashAmount??''),
      inputUnit,'type="number" min="0" max="1000000000000" step="any"')+
     moneyField('Cheque amount','chequeAmount',fieldValue('chequeAmount',data.chequeAmount??''),
      inputUnit,'type="number" min="0" max="1000000000000" step="any"')+
     field('Bank name (for cheque)','bankName',fieldValue('bankName',data.bankName||''),'maxlength="5000"')+
     field('Cheque number (for cheque)','chequeNumber',fieldValue('chequeNumber',data.chequeNumber||''),'maxlength="5000"')+
    '</fieldset>'+
    '<p class="muted">Payment amounts are unsaved estimates. This form does not receive or verify funds.</p>':
    '<fieldset class="tl-draft-lines tl-reference-items"><legend>Items</legend>'+
     '<div class="tl-ref-items-toolbar">'+

      '<button type="button" class="tl-ref-add-blank" data-action="tradelink-draft-add-line"'+
       (lines.length>=100?' disabled':'')+'>＋ Add Blank</button>'+
      '<button type="button" class="tl-ref-add-note" data-action="tradelink-draft-add-note"'+
       (lines.length>=100?' disabled':'')+'>Add Note</button></div>'+
     '<div class="tl-reference-items-note">'+(physical?'Physical shipment item (required for local readiness). ':'')+
      'Up to 100 items and notes per Draft. Reorder by dragging or use the arrow controls.</div>'+
     '<div data-tradelink-draft-line-items>'+
      lines.map((item,index)=>renderTradeLinkDraftLineItem(item,type,inputUnit,index)).join('')+
     '</div>'+
    '</fieldset>'+
    (physical?'<p class="muted">Shipment items are not priced here. This preview records no delivery or inventory movement.</p>':''))+
   (priced?renderTradeLinkDraftLocalAmounts(type,fieldValue,data,line,lines):'')+
   '<section class="tl-reference-form-section tl-reference-terms"><h4>Terms &amp; Conditions</h4>'+
    '<label class="tl-draft-field"><span>Document notes and terms</span>'+
     '<textarea name="remarks" maxlength="5000" rows="5" '+
      'placeholder="Enter local document remarks or terms">'+
       escape(fieldValue('remarks',data.remarks||''))+'</textarea>'+
     '<small>These notes are part of the local validation preview. No PDF, approval or document is generated.</small>'+
    '</label></section>'+
   (type==='quotation'?renderQuotationVerification(fieldValue,data,actorName,{
    actorEmail,documentSaved:editing,documentId,workflowState,reviewStages}):
    renderReferenceModuleWorkflow(type,fieldValue,data,actorName,{
     actorEmail,documentSaved:editing,documentId,workflowState,reviewStages}))+
   '<div class="tl-draft-actions">'+
    '<button type="button" class="secondary" data-action="tradelink-draft-clear">Clear form</button>'+
   '</div><p data-tradelink-draft-preview-status data-validation="pending" role="status" aria-live="polite" aria-atomic="true">'+
    (editing?'Saved revision '+escape(row?.revision??'—')+
     ' loaded. Changes remain local until Save Changes.':
     type==='quotation'?
      'Not saved. Save creates a For Approval document; choose Draft explicitly when needed.':
      'Not saved. Save creates a For Approval document; choose Draft explicitly when needed.')+'</p>'+
   renderTradeLinkDraftLocalSummary(type)+
  '</form></div></section>';
}

const draftListTypes=Object.freeze([['all','All modules'],...typeLabels]);
const draftListStates=Object.freeze([
 ['all','All workflow states'],['draft','Draft'],['for-approval','For Approval'],['submitted','Submitted'],
 ['under-review','Under Review'],['revision-required','Revision Required'],
 ['approved','Approved'],['rejected','Rejected'],
 ['completed','Completed'],['cancelled','Cancelled'],
 ['under-negotiation','Under Negotiation'],['expired','Expired'],['on-hold','On-hold'],
 ['won','Won'],['lost','Lost'],['delivered','Delivered'],['closed','Closed']
]);
const draftArchiveModes=Object.freeze([
 ['active','Active only'],['archived','Archived only'],['all','Active and archived']
]);
const draftSortFields=Object.freeze([
 ['documentNumber','Document number'],['documentType','Document module'],
 ['revision','Revision'],['updatedAt','Last updated']
]);
const draftSortDirections=Object.freeze([['asc','Ascending'],['desc','Descending']]);
const matchAllowed=(list,value,fallback)=>list.some(([key])=>key===value)?value:fallback;
export function initialTradeLinkDraftListFilters(){
 return {query:'',documentType:'all',workflowState:'all',archiveMode:'active',
  sortBy:'documentNumber',sortDirection:'asc'};
}
export function normalizeTradeLinkDraftListFilters(input={}){
 const f=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 return {
  query:String(typeof f.query==='string'?f.query:'').trim().slice(0,120).toLocaleLowerCase(),
  documentType:matchAllowed(draftListTypes,f.documentType,'all'),
  workflowState:matchAllowed(draftListStates,f.workflowState,'all'),
  archiveMode:matchAllowed(draftArchiveModes,f.archiveMode,'active'),
  sortBy:matchAllowed(draftSortFields,f.sortBy,'documentNumber'),
  sortDirection:matchAllowed(draftSortDirections,f.sortDirection,'asc')
 };
}
const tradeLinkDocumentLabel=value=>typeLabels.find(([id])=>id===value)?.[1]||String(value||'—');
const TRADELINK_POST_APPROVAL_STATUSES=Object.freeze([
 ['submitted','Submitted'],['under-negotiation','Under Negotiation'],
 ['expired','Expired'],['on-hold','On-hold'],['won','Won'],['lost','Lost'],
 ['cancelled','Cancelled'],['delivered','Delivered'],['closed','Closed']
]);
function tradeLinkStatusUpdateTargets(current){
 if(current==='cancelled')return [];
 if(['draft','for-approval'].includes(current))return [
  [current,tradeLinkWorkflowLabel(current)],['cancelled','Cancelled']
 ];
 if(current==='approved'||TRADELINK_POST_APPROVAL_STATUSES.some(([id])=>id===current))
  return [[current,tradeLinkWorkflowLabel(current)],...TRADELINK_POST_APPROVAL_STATUSES.filter(([id])=>id!==current)];
 return [];
}
const tradeLinkWorkflowLabel=value=>({
 draft:'Draft','for-approval':'For Approval',submitted:'Submitted','under-review':'Under Review',
 'revision-required':'Revision Required',approved:'Approved',rejected:'Rejected',
 completed:'Completed',cancelled:'Cancelled','under-negotiation':'Under Negotiation',
 expired:'Expired','on-hold':'On-hold',won:'Won',lost:'Lost',delivered:'Delivered',closed:'Closed'
})[value]||String(value||'—');
function renderTradeLinkWorkflowBadge(value,archived){
 const status=String(value||'draft');
 return '<span class="tl-doc-status tl-doc-status--'+escape(status)+'">'+
  escape(tradeLinkWorkflowLabel(status))+'</span>'+
  (archived?'<span class="tl-doc-status tl-doc-status--archived">Archived</span>':'');
}
function tradeLinkDraftRowMatches(row,filters){
 if(!row||typeof row!=='object')return false;
 if(!typeLabels.some(([id])=>id===row.documentType))return false;
 if(!draftListStates.some(([id])=>id===row.workflowState&&id!=='all'))return false;
 const archived=row.archived===true;
 return (filters.documentType==='all'||row.documentType===filters.documentType)&&
  (filters.workflowState==='all'||row.workflowState===filters.workflowState)&&
  (filters.archiveMode==='all'||
   (filters.archiveMode==='archived'?archived:!archived))&&
  String(row.documentNumber??'').toLocaleLowerCase().includes(filters.query);
}
/** Stable, bounded ordering of the current signed response only; no backend query. */
function sortTradeLinkDraftRows(rows,filters){
 const field=filters.sortBy,descending=filters.sortDirection==='desc';
 return [...rows].sort((left,right)=>{
  if(field==='updatedAt'){
   const a=tradeLinkTimestamp(left?.updatedAt),b=tradeLinkTimestamp(right?.updatedAt);
   // Missing times stay last in either direction; never invent a record date.
   if(a===null||b===null)return a===b?0:a===null?1:-1;
   return descending?b-a:a-b;
  }
  const a=field==='revision'?Number(left?.revision)||0:String(left?.[field]??'');
  const b=field==='revision'?Number(right?.revision)||0:String(right?.[field]??'');
  const order=field==='revision'?a-b:a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'});
  return descending?-order:order;
 });
}
function tradeLinkTimestamp(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
 const time=Date.parse(value);
 return Number.isFinite(time)?time:null;
}
function renderTradeLinkTimestamp(value){
 if(tradeLinkTimestamp(value)===null)return '—';
 const display=new Intl.DateTimeFormat('en-PH',{year:'numeric',month:'short',day:'2-digit',
  timeZone:'UTC'}).format(new Date(value));
 return '<time datetime="'+escape(value)+'">'+escape(display)+'</time>';
}
/** Search only the bounded current server-authorized page. No remote search. */
export function filterTradeLinkDraftAuthorizedRows(rows,input={}){
 const filters=normalizeTradeLinkDraftListFilters(input);
 if(!Array.isArray(rows))return [];
 return sortTradeLinkDraftRows(rows.slice(0,50).filter(row=>
  tradeLinkDraftRowMatches(row,filters)),filters);
}
/** Update native controls and visible rows of the signed listing, never its data. */
/** Date control is strictly local to the current authenticated response.
 * It filters LAST UPDATED, never the document issue date or unseen server pages.
 */
export function tradeLinkUpdatedDateMatches(timestamp,start='',end=''){
 if(!start&&!end)return true;
 const value=tradeLinkTimestamp(timestamp);
 if(value===null)return false;
 const day=new Date(value).toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
 return (!start||day>=start)&&(!end||day<=end);
}
export function updateTradeLinkDraftListUI(container,input={}){
 if(!container?.querySelectorAll||!container?.querySelector)return 0;
 const filters=normalizeTradeLinkDraftListFilters(input);
 let count=0;
 const rows=[...container.querySelectorAll('[data-tradelink-domain-record]')];
 for(const row of rows){
  const record={
   documentNumber:row.dataset?.documentNumber,
   documentType:row.dataset?.documentType,
   workflowState:row.dataset?.workflowState,
   archived:row.dataset?.archived==='true'
  };
  const start=container.querySelector('[data-tl-updated-start]')?.value||'';
  const end=container.querySelector('[data-tl-updated-end]')?.value||'';
  const matches=tradeLinkDraftRowMatches(record,filters)&&
   tradeLinkUpdatedDateMatches(row.dataset?.updatedAt,start,end);
  row.hidden=!matches;
  if(!matches){const selection=row.querySelector?.('[data-tl-select-document]');if(selection)selection.checked=false;}
  if(matches)count++;
 }
 const body=container.querySelector('[data-tradelink-domain-list-body]');
 if(body&&typeof body.appendChild==='function'){
  for(const row of sortTradeLinkDraftRows(rows.map(el=>({
   element:el,documentNumber:el.dataset?.documentNumber,
   documentType:el.dataset?.documentType,revision:el.dataset?.revision,
   updatedAt:el.dataset?.updatedAt
  })),filters))body.appendChild(row.element);
 }
 const counter=container.querySelector('[data-tradelink-domain-count]');
 if(counter)counter.textContent=count+' of '+rows.length+
  ' authorized records in this response';
 const empty=container.querySelector('[data-tradelink-domain-no-match]');
 if(empty)empty.hidden=count!==0||rows.length===0;
 return count;
}

/**
 * Only render the exact revision that came from the authenticated domain
 * read API. This does not interpret a Board item as document content.
 */
export function renderTradeLinkSavedDocumentPreview(record,workspaceId,documentId){
 const row=normalizeTradeLinkDomainRow(record,workspaceId,documentId);
 const data=row.content;
 if(data.documentType!==row.document_type||
   data.documentNumber!==row.document_number||
   !Object.hasOwn(localSummaryRows,data.documentType))
  throw new ApiError('TradeLink saved document content mismatch.',409);
 const summary={...tradeLinkDraftLocalSummaryValues(data)};
 // Saved documents may contain up to 100 items. Never reuse the one-line
 // local form estimator for authoritative multi-line monetary totals.
 if(['esi','quotation','po'].includes(row.document_type)){
  const amounts=calculateTradeLinkAmounts(data);
  const unit=currencyUnit(data.currency);
  for(const [key,amount] of [
   ['localSubtotal',amounts.subtotal],['localDiscount',amounts.discount],
   ['localVat',amounts.vat],['localTotal',amounts.total]])
   summary[key]=formatTradeLinkAmount(amount)+' '+unit;
  summary.localPhpEquivalent=data.currency==='PHP'||
   (Number.isFinite(data.exchangeRate)&&data.exchangeRate>0)?
   formatTradeLinkAmount(amounts.phpEquivalent)+' PHP':'—';
 }
 const type=typeLabels.find(([id])=>id===row.document_type)?.[1]||row.document_type;
 const details=[...commonSummaryRows,...localSummaryRows[row.document_type],
  ['remarks','Remarks'],['customerAddress','Party address'],['referenceNumber','Source reference'],
  ['customerTin','Tax identity'],['dueDate','Due date'],['paymentTerms','Payment terms'],
  ['verifiedBy','Intended verifier'],['approvedBy','Intended approver']]
  .filter(([key],i,all)=>all.findIndex(([name])=>name===key)===i);
 const currency=currencyUnit(data.currency);
 const items=Array.isArray(data.items)?data.items.slice(0,100):[];
 return '<section data-tradelink-saved-preview class="tl-draft-summary" '+
  'aria-labelledby="tl-saved-document-title">'+
  '<div class="tl-panel-heading"><div><p class="tl-eyebrow">Authoritative saved record</p>'+
  '<h3 id="tl-saved-document-title">Saved document · '+escape(row.document_number)+'</h3>'+
  '</div><span class="tl-draft-badge">Revision '+escape(row.revision)+'</span></div>'+
  '<p class="muted">This document was retrieved from the signed TradeLink server. '+
  'The revision, identity and Board association are server-owned; viewing is not approval.</p>'+
  '<dl class="tl-draft-summary-rows">'+
  [['Document module',type],['Workflow state',row.workflow_state],
   ['Document ID',row.id],['Linked Board item',row.board_item_id],
   ['Revision',row.revision],['Archived',row.archived_at?'Yes':'No'],
   ['Created',tradeLinkTimestamp(row.created_at)===null?'—':row.created_at],
   ['Last updated',row.updated_at??'—'],...details.map(([key,label])=>
    [label,(key==='remarks'||key==='customerAddress'||key==='dueDate')?
     (String(data[key]??'').trim()||'—'):
     (summary?.[key]??(String(data[key]??'').trim()||'—'))]
   )].map(([label,value])=>'<div><dt>'+escape(label)+'</dt><dd>'+
    escape(value)+'</dd></div>').join('')+
  '</dl>'+
  (items.length?'<div class="tl-records-scroll"><table class="tl-records-table">'+
   '<caption>Persisted line items · '+escape(currency)+'</caption>'+
   '<thead><tr><th scope="col">Item</th><th scope="col">Description</th>'+
   '<th scope="col">Quantity</th><th scope="col">Unit</th>'+
   '<th scope="col">Unit price</th><th scope="col">Serial number</th></tr></thead><tbody>'+
   items.map((item,i)=>'<tr><td>'+escape(i+1)+'</td><td>'+
    escape(item.description??'—')+'</td><td>'+escape(item.quantity??'—')+
    '</td><td>'+escape(item.unit??'—')+'</td><td>'+
    escape(item.kind==='item'&&typeof item.unitPrice==='number'?
     formatTradeLinkAmount(item.unitPrice)+' '+currency:'—')+'</td><td>'+
    escape(item.serialNumber??'—')+'</td></tr>').join('')+
   '</tbody></table></div>':'')+
  '<p class="muted">No local document copy was saved. Refresh the repository to '+
   'verify a newer revision.</p></section>';
}
function renderTradeLinkDraftList(rows,view,canManage,{readOnly=false,canReview=false,actorEmail=''}={}){
 const enabled=TL03_DOMAIN_READS_ENABLED&&(canManage||canReview)&&view.status==='AUTHORIZED_READ';
 const records=enabled?rows:[];
 const filters=normalizeTradeLinkDraftListFilters(view.listFilters);
 const page=readOnly&&enabled&&view.listPage?.server===true?view.listPage:null;
 const applied=page?normalizeTradeLinkDraftListFilters(page.appliedFilters):filters;
 const displayed=filterTradeLinkDraftAuthorizedRows(records,applied);
 const ordered=sortTradeLinkDraftRows(records,applied);
 const disabledAttr=enabled?'':' disabled';
 const filterSelect=(name,label,values,value)=>
  '<label class="tl-draft-field"><span>'+escape(label)+'</span>'+
  '<select name="'+name+'" data-tradelink-domain-filter'+disabledAttr+
  '>'+options(values,value)+'</select></label>';
 return '<section data-tradelink-domain-list aria-label="'+(readOnly?
  'Read-only TradeLink document repository':'Authorized TradeLink Draft listing')+'">'+
  (readOnly?'<nav class="tl-reference-document-filter-tabs" aria-label="Filter documents by module">'+
   draftListTypes.map(([id,label])=>'<button type="button" data-action="tradelink-documents-module" '+
    'data-module="'+escape(id)+'"'+(filters.documentType===id?' aria-current="true"':'')+
    disabledAttr+'>'+escape(label)+'</button>').join('')+'</nav>':'')+
  '<div class="tl-draft-list-filters" role="search" aria-label="Search authorized TradeLink Draft records">'+
   '<label class="tl-draft-field"><span>Search document number</span>'+
    '<input name="query" type="search" maxlength="120" autocomplete="off" '+
    'placeholder="'+(page?'Search all authorized documents':'Search this authorized page')+
    '" value="'+escape(filters.query)+'" '+
    'data-tradelink-domain-filter aria-describedby="tl-draft-search-scope"'+disabledAttr+'></label>'+
   filterSelect('workflowState','Workflow state',draftListStates,filters.workflowState)+
  '</div>'+
  (readOnly&&!canReview?'<div class="tl-reference-document-datebar" aria-label="Filter visible response by last updated date">'+
   '<span class="tl-date-label">Updated date (UTC · current page only)</span>'+
   '<label for="tl-doc-updated-start"><span class="sr-only">Updated from</span><input id="tl-doc-updated-start" type="date" data-tl-updated-start'+disabledAttr+'></label>'+
   '<span>to</span>'+
   '<label for="tl-doc-updated-end"><span class="sr-only">Updated through</span><input id="tl-doc-updated-end" type="date" data-tl-updated-end'+disabledAttr+'></label>'+
   '<div class="tl-reference-date-presets">'+
   [['today','Today'],['week','This Week'],['month','This Month'],['30','Last 30 Days'],['clear','Clear']].map(([key,label])=>
    '<button type="button" data-action="tradelink-documents-date" data-range="'+key+'"'+disabledAttr+'>'+label+'</button>').join('')+
   '</div>'+
   '<button type="button" class="tl-ref-apply-filter" data-action="tradelink-documents-apply-dates"'+disabledAttr+'>Apply Filters</button></div>':'')+
  '<details class="tl-ref-advanced-filters"><summary>More filters and sorting</summary>'+
   '<div class="tl-ref-advanced-filter-grid">'+
   filterSelect('documentType','Document module',draftListTypes,filters.documentType)+
   filterSelect('archiveMode','Archive status',draftArchiveModes,filters.archiveMode)+
   filterSelect('sortBy','Sort by',draftSortFields,filters.sortBy)+
   filterSelect('sortDirection','Sort order',draftSortDirections,filters.sortDirection)+
   '</div></details>'+
  (page?
   '<div class="tl-draft-pagination-controls" aria-label="Authorized document search">'+
    '<button type="button" class="secondary" data-action="tradelink-documents-search"'+
    (view.busy?' disabled':'')+'>Search documents</button>'+
    '<button type="button" class="secondary" data-action="tradelink-documents-previous"'+
    (!page.history?.length||view.busy?' disabled':'')+'>Previous page</button>'+
    '<span role="status">Page '+escape(page.pageIndex+1)+'</span>'+
    '<button type="button" class="secondary" data-action="tradelink-documents-next"'+
    (!page.hasMore||view.busy?' disabled':'')+'>Next page</button></div>':'')+
  '<p id="tl-draft-search-scope" class="muted">'+
    (canReview?'Only documents assigned to the signed account are shown. Review actions record the current account and server time.':page?'Signed server search and filters cover all authorized documents in this Board. '+
      'Results are paged newest-first (50 per page); Sort by applies to the visible page. '+
      'Select Search documents to apply new criteria.':
      'Search and filters apply only to the current signed, authorized response '+
      '(maximum 50 records). They do not query other workspaces or fetch additional pages.')+
   '</p>'+
  '<div class="tl-ref-selection-row"><p data-tradelink-domain-count role="status" aria-live="polite" aria-atomic="true">'+
   displayed.length+' of '+records.length+(canReview?' assigned documents':' authorized records')+' in this response</p>'+
   (readOnly&&!canReview?'<div class="tl-ref-selection-controls"><span data-tl-selected-count role="status" aria-live="polite">0 selected</span>'+
    '<button type="button" data-action="tradelink-documents-clear-selection">Clear selection</button></div>':'')+
   '</div>'+
  (records.length?
   '<div class="tl-records-scroll"><table class="tl-records-table">'+
    '<caption>'+(canReview?'Documents assigned to the signed account':readOnly?'Authorized TradeLink documents':'Authorized TradeLink Draft records')+
     ' in current response</caption>'+
    '<thead><tr><th scope="col"><input id="tl-select-visible-documents" type="checkbox" data-tl-select-all aria-label="Select all visible documents" /></th>'+
    '<th scope="col">No.</th><th scope="col">Document</th><th scope="col">Module</th>'+
    '<th scope="col">Last updated</th><th scope="col">Workflow Status</th>'+
    '<th scope="col">Rev. No.</th><th scope="col">Actions</th>'+
    '</tr></thead><tbody data-tradelink-domain-list-body>'+
    ordered.map((row,index)=>{
     const match=tradeLinkDraftRowMatches(row,applied);
     return '<tr data-tradelink-domain-record data-document-number="'+
      escape(row.documentNumber)+'" data-document-type="'+escape(row.documentType)+
      '" data-workflow-state="'+escape(row.workflowState)+'" data-revision="'+
      escape(row.revision)+'" data-updated-at="'+escape(tradeLinkTimestamp(row.updatedAt)===null?'':row.updatedAt)+'" data-archived="'+
      (row.archived===true?'true':'false')+'"'+(match?'':' hidden')+'>'+
      '<td><input id="tl-select-'+escape(row.documentId)+'" type="checkbox" data-tl-select-document aria-label="Select document '+escape(row.documentNumber)+'" /></td>'+
      '<td class="tl-ref-row-number">'+escape(index+1)+'</td>'+
      '<td class="tl-ref-doc-number">'+escape(row.documentNumber)+'</td>'+
      '<td>'+escape(tradeLinkDocumentLabel(row.documentType))+'</td>'+
      '<td>'+renderTradeLinkTimestamp(row.updatedAt)+'</td>'+
      '<td>'+renderTradeLinkWorkflowBadge(row.workflowState,row.archived)+'</td>'+
      '<td><span class="tl-ref-revision">'+escape(row.revision)+'</span></td>'+
      (readOnly?'<td class="tl-ref-actions-cell">'+(
       canReview?(()=>{
        const stage=row.assignedStage;
        const recordedAt=stage==='primary'?row.primaryAt:row.secondaryAt;
        const formatTime=value=>value&&Number.isFinite(Date.parse(value))?
         new Date(value).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'}):'Pending';
        const assignedLabel=stage==='primary'?'Primary reviewer':'Secondary reviewer';
        return '<div class="tl-reviewer-row-actions" data-tl-reviewer-stage="'+escape(stage)+'">'+
         '<button type="button" class="secondary" data-action="tradelink-review-document-open" '+
          'data-id="'+escape(row.documentId)+'"'+(view.busy?' disabled':'')+
          '>View document</button> '+
         '<p class="tl-reviewer-stage-summary">Primary: '+escape(formatTime(row.primaryAt))+
         '<br>Secondary: '+escape(formatTime(row.secondaryAt))+'</p>'+
         (recordedAt?'<span class="tl-reviewer-recorded" role="status">'+escape(assignedLabel)+
          ' validated · '+escape(formatTime(recordedAt))+'</span>':
          row.workflowState==='for-approval'?'<button type="button" class="primary" '+
           'data-action="tradelink-document-review-stage" data-id="'+escape(row.documentId)+'" '+
           'data-stage="'+escape(stage)+'"'+(view.busy?' disabled':'')+
           '>Use Time Now</button>':'<span class="muted">Validation is not available for this status.</span>')+
         '</div>';
       })():
       '<button type="button" class="tl-ref-row-action-trigger" popovertarget="tl-doc-menu-'+escape(row.documentId)+'" aria-label="Actions for '+escape(row.documentNumber)+'" title="Document actions">⋯</button>'+
       '<div popover="auto" data-tradelink-action-menu id="tl-doc-menu-'+escape(row.documentId)+'" class="tl-ref-actions-menu">'+
       (canManage&&TL03_DOMAIN_WRITES_ENABLED&&!row.archived&&
        ['draft','for-approval','revision-required'].includes(row.workflowState)&&
        tradeLinkDraftEditHref(row.documentId)?
        '<button type="button" class="secondary" data-action="tradelink-document-open" '+
         'data-id="'+escape(row.documentId)+'">Preview</button> '+
        '<a class="secondary" data-tradelink-document-edit href="'+
         escape(tradeLinkDraftEditHref(row.documentId))+'">Preview/Edit</a> ':
        '<button type="button" class="secondary" '+
         'data-action="tradelink-document-open" data-id="'+escape(row.documentId)+
         '">Preview</button> ')+
       '<button type="button" class="secondary" data-action="tradelink-document-print" '+
        'data-id="'+escape(row.documentId)+'"'+
        (view.busy||row.workflowState!=='approved'?' disabled title="PDF printing is available only after approval"':'')+
        '>Print PDF</button> '+
       (canManage&&!row.archived&&tradeLinkStatusUpdateTargets(row.workflowState).length?
        '<label class="tl-reference-status-action"><span>Change status</span>'+
        '<select data-tradelink-status-select data-id="'+escape(row.documentId)+'">'+
         options(tradeLinkStatusUpdateTargets(row.workflowState),row.workflowState)+
        '</select></label><button type="button" class="secondary" '+
         'data-action="tradelink-document-status-update" data-id="'+escape(row.documentId)+'" '+
         'data-current-state="'+escape(row.workflowState)+'">Save status</button> ':'')+
       (canManage&&['draft','for-approval','revision-required'].includes(row.workflowState)&&!row.archived?
        '<button type="button" class="secondary" data-action="tradelink-document-submit" '+
         'data-id="'+escape(row.documentId)+'"'+
         (TL03_WORKFLOW_SUBMIT_ENABLED?'':' disabled title="Submission backend not activated"')+
         '>'+(TL03_WORKFLOW_SUBMIT_ENABLED?'Submit Draft':'Submit (pending activation)')+
         '</button> ':'')+
       (canManage&&TL03_WORKFLOW_REVIEW_ENABLED&&!row.archived&&
        row.workflowState==='submitted'&&
        ['esi','quotation','po','payment'].includes(row.documentType)?
        '<button type="button" class="secondary" data-action="tradelink-document-review" '+
         'data-id="'+escape(row.documentId)+'">Record Review</button> ':'')+
       (canManage&&TL03_WORKFLOW_REVIEW_ENABLED&&!row.archived&&
        ['submitted','under-review'].includes(row.workflowState)?
        '<button type="button" class="secondary" data-action="tradelink-document-request-revision" '+
         'data-id="'+escape(row.documentId)+'">Request Revision</button> ':'')+
       (canManage&&TL03_WORKFLOW_DECISION_ENABLED&&!row.archived&&
        ['submitted','under-review'].includes(row.workflowState)&&
        ['esi','quotation','po'].includes(row.documentType)?
        '<button type="button" class="primary" data-action="tradelink-document-approve" '+
         'data-id="'+escape(row.documentId)+'">Approve</button> ':'')+
       (canManage&&TL03_WORKFLOW_DECISION_ENABLED&&!row.archived&&
        ['submitted','under-review'].includes(row.workflowState)&&
        row.documentType!=='packing'?
        '<button type="button" class="secondary" data-action="tradelink-document-reject" '+
         'data-id="'+escape(row.documentId)+'">Reject</button> ':'')+
       (canManage&&TL03_WORKFLOW_OPERATIONAL_ENABLED&&!row.archived&&
        ['submitted','under-review'].includes(row.workflowState)&&
        row.documentType==='delivery'?
        '<button type="button" class="secondary" data-action="tradelink-operational-checked" '+
         'data-id="'+escape(row.documentId)+'">Record QC timestamp</button> '+
        '<button type="button" class="secondary" data-action="tradelink-operational-delivered" '+
         'data-id="'+escape(row.documentId)+'">Record delivery timestamp</button> ':'')+
       (canManage&&TL03_WORKFLOW_OPERATIONAL_ENABLED&&!row.archived&&
        ['submitted','under-review'].includes(row.workflowState)&&
        row.documentType==='payment'?
        '<button type="button" class="secondary" data-action="tradelink-operational-received" '+
         'data-id="'+escape(row.documentId)+'">Record receipt timestamp</button> ':'')+
       (canManage&&TL03_WORKFLOW_OPERATIONAL_ENABLED&&!row.archived&&
        (row.workflowState==='approved'&&
          ['esi','quotation','po'].includes(row.documentType)||
         ['submitted','under-review'].includes(row.workflowState)&&
          ['delivery','payment'].includes(row.documentType))?
        '<button type="button" class="primary" data-action="tradelink-operational-complete" '+
         'data-id="'+escape(row.documentId)+'">Mark Completed</button> ':'')+
       (canManage&&TL03_WORKFLOW_OPERATIONAL_ENABLED&&!row.archived&&
        ['approved','rejected','completed','cancelled'].includes(row.workflowState)?
        '<button type="button" class="secondary" data-action="tradelink-operational-reopen" '+
         'data-id="'+escape(row.documentId)+'">Reopen to Draft</button> ':'')+
       (canManage&&TL03_DOMAIN_WRITES_ENABLED&&row.workflowState==='draft'?
        '<button type="button" class="secondary" data-action="'+
         (row.archived?'tradelink-draft-restore':'tradelink-draft-archive')+
         '" data-id="'+escape(row.documentId)+'">'+
         (row.archived?'Restore':'Archive')+'</button>':'')+
       '</div>')+'</td>':'<td>'+
      '<button type="button" class="secondary" data-action="tradelink-draft-open" data-id="'+escape(row.documentId)+'">Read</button> '+
      '<button type="button" class="secondary" data-action="tradelink-draft-archive" data-id="'+escape(row.documentId)+'"'+
       (!canManage||!TL03_DOMAIN_WRITES_ENABLED||row.archived||row.workflowState!=='draft'?' disabled':'')+'>Archive</button> '+
      '<button type="button" class="secondary" data-action="tradelink-draft-restore" data-id="'+escape(row.documentId)+'"'+
       (!canManage||!TL03_DOMAIN_WRITES_ENABLED||!row.archived||row.workflowState!=='draft'?' disabled':'')+'>Restore</button>'+
      '</td>')+'</tr>';

    }).join('')+'</tbody></table></div>'+
   '<p data-tradelink-domain-no-match class="muted"'+(displayed.length?' hidden':'')+
    '>No matching records in this authorized response.</p>':
   '<p class="muted">'+(enabled?
    'No authorized TradeLink Draft records were returned for this page.':
    'No authorized TradeLink Draft records have been loaded. Refresh the signed list.')+'</p>')+
  '</section>';
}
/**
 * Source-defined All Documents staging, independently workspace-scoped.
 * Only the existing signed response may render; never project board items into
 * Domain DocumentRecords. Read flags remain centrally disabled.
 */
/** Verified signed audit rows only. Never synthesize a workflow history from
 * a document's status or from local preview fields.
 */
export function renderTradeLinkSavedWorkflowHistory(events){
 if(!Array.isArray(events)||!events.length)return '';
 const items=events.slice(0,25).filter(event=>
  Number.isSafeInteger(event?.revision)&&event.revision>=1&&
  typeof event?.operation==='string'&&
  typeof event?.at==='string'&&Number.isFinite(Date.parse(event.at))&&
  typeof event?.actorId==='string');
 if(!items.length)return '';
 return '<section class="tl-signed-history" aria-labelledby="tl-signed-history-title">'+
  '<h3 id="tl-signed-history-title">Signed document history (latest '+items.length+')</h3>'+
  '<div class="tl-records-scroll"><table class="tl-records-table">'+
  '<thead><tr><th scope="col">Revision</th><th scope="col">Event</th>'+
  '<th scope="col">Time</th><th scope="col">Signed actor ID</th>'+
  '<th scope="col">Reason</th></tr></thead><tbody>'+
  items.map(e=>'<tr><td>'+escape(e.revision)+'</td><td>'+escape(e.operation)+
   '</td><td><time datetime="'+escape(e.at)+'">'+escape(e.at)+'</time></td>'+
   '<td><code>'+escape(e.actorId)+'</code></td><td>'+
   escape(typeof e.metadata?.reason==='string'?e.metadata.reason:'—')+
   '</td></tr>').join('')+
  '</tbody></table></div><p class="muted">Only the latest authenticated audit events are shown; no event has been modified.</p></section>';
}
/** Only a verified signed All Documents revision can reveal its attachments.
 * The bucket is private; never generate public or persistent signed URLs.
 */
export function renderTradeLinkDocumentAttachments(attachments,{
 documentId,workspaceId,editable=false,busy=false
}={}){
 if(!TL03_ATTACHMENTS_ENABLED)return '';
 if(!validUuid(documentId)||!validUuid(workspaceId))return '';
 let rows;
 try{rows=normalizeTradeLinkAttachmentList(attachments,workspaceId,documentId);}
 catch{return '<section role="alert">Signed attachment records could not be verified.</section>';}
 const buttons=busy?' disabled':'';
 return '<section class="tl-saved-attachments" data-tradelink-saved-attachments '+
  'aria-labelledby="tl-saved-attachment-heading">'+
  '<div class="tl-panel-heading"><h3 id="tl-saved-attachment-heading">Private document attachments</h3>'+
  '<span class="tl-draft-badge">Signed access · 20 MB per file</span></div>'+
  '<p class="muted">Only actively registered documents are downloadable. '+
  'Replaced and removed files retain a restricted recovery record. '+
  'Files are never published with anonymous links.</p>'+
  (rows.length?
   '<div class="tl-records-scroll"><table class="tl-records-table">'+
    '<thead><tr><th scope="col">File</th><th scope="col">Version</th>'+
    '<th scope="col">Size</th><th scope="col">Uploaded</th>'+
    '<th scope="col">Actions</th></tr></thead><tbody>'+
    rows.map(row=>'<tr><td>'+escape(row.fileName)+'</td><td>'+
     escape(row.revision)+'</td><td>'+escape(row.sizeBytes)+' bytes</td>'+
     '<td>'+escape(row.uploadedAt)+'</td><td>'+
     '<button type="button" class="secondary" data-action="tradelink-attachment-download" '+
      'data-id="'+escape(row.attachmentId)+'" data-document-id="'+escape(documentId)+'"'+
      buttons+'>Download verified file</button> '+
     (editable?'<button type="button" class="secondary" '+
      'data-action="tradelink-attachment-remove" '+
      'data-id="'+escape(row.attachmentId)+'" '+
      'data-document-id="'+escape(documentId)+'"'+buttons+
      '>Remove access</button>':'')+
     '</td></tr>').join('')+'</tbody></table></div>':
   '<p class="muted">No active attachments for this saved document.</p>')+
  (editable?
   '<div class="tl-attachment-upload">'+
   '<label class="tl-draft-field"><span>File (PDF, image, text/CSV, Word, Excel; max 20 MB)</span>'+
   '<input type="file" id="tl-attachment-upload-file" name="tlAttachmentUploadFile" data-tradelink-attachment-input '+(busy?'disabled ':'')+
    'accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx"/></label>'+
   '<label class="tl-draft-field"><span>Upload action</span>'+
   '<select id="tl-attachment-replace-choice" name="tlAttachmentReplaceChoice" data-tradelink-attachment-replace'+buttons+'>'+
   '<option value="">Add a new attachment</option>'+
   rows.map(row=>'<option value="'+escape(row.attachmentId)+'">'+
    'Replace '+escape(row.fileName)+'</option>').join('')+
   '</select></label>'+
   '<button type="button" class="primary" data-action="tradelink-attachment-upload" '+
    'data-id="'+escape(documentId)+'"'+buttons+'>Upload to private Storage</button>'+
   '</div>':'')+
  '</section>';
}
export function renderTradeLinkDocumentRepository({detail,workspaceId,
 view=initialTradeLinkDraftView(),canManage=false,canReview=false,actorEmail=''}={}){
 if(!isTradeLinkBoard(detail?.board)||detail.board.id!==TRADELINK_BOARD_ID||
  detail.board.workspace_id!==workspaceId)
  return '<section class="tl-content-panel" role="alert">Signed TradeLink document workspace unavailable.</section>';
 const rows=TL03_DOMAIN_READS_ENABLED&&(canManage||canReview)&&
  view.status==='AUTHORIZED_READ'&&Array.isArray(view.rows)?view.rows:[];
 const selection=view.documentPreview;
 const linked=rows.find(item=>item.documentId===selection?.documentId&&
  item.boardItemId===selection?.record?.board_item_id&&
  item.revision===selection?.record?.revision&&
  item.documentNumber===selection?.record?.document_number);
 let selectedPreview='';
 if(linked){
  try{selectedPreview=renderTradeLinkSavedDocumentPreview(
   selection.record,workspaceId,selection.documentId);}
  catch{selectedPreview='';}
 }
 return '<section class="tl-content-panel tl-document-repository" aria-labelledby="tl-domain-repository-title">'+
  '<div class="tl-panel-heading tl-reference-repository-actions">'+
   '<h2 id="tl-domain-repository-title">'+(canReview?'My Assigned Documents':'All Documents')+' <span class="tl-ref-count-badge">'+
    escape(rows.length)+'</span></h2>'+
   '<div class="tl-reference-repository-buttons">'+
   (canManage&&TL03_DOMAIN_WRITES_ENABLED?'<a class="primary" href="#/boards/'+TRADELINK_BOARD_ID+
    '/tradelink/drafts/quotation">Create New Document</a>':'')+
   '<button type="button" class="secondary" data-action="tradelink-documents-refresh"'+
   (!TL03_DOMAIN_READS_ENABLED||(!canManage&&!canReview)||view.busy?' disabled':'')+
   '>Refresh</button>'+
   '</div></div>'+
  (view.error?'<p role="alert">'+escape(view.error)+'</p>':'')+
  (view.message?'<p role="status">'+escape(view.message)+'</p>':'')+
  '<div class="tl-document-split-view" data-tradelink-document-split>'+
   '<div class="tl-document-list-pane">'+
    renderTradeLinkDraftList(rows,view,canManage,{readOnly:true,canReview,actorEmail})+
   '</div>'+
   '<aside class="tl-document-preview-pane" aria-label="Selected document preview">'+
    (selectedPreview?
     (linked&&canManage&&TL03_DOMAIN_WRITES_ENABLED&&
      ['draft','for-approval','revision-required'].includes(linked.workflowState)&&!linked.archived&&
      tradeLinkDraftEditHref(linked.documentId)?
      '<p class="tl-document-edit-action"><a class="secondary" '+
      'data-tradelink-document-edit href="'+
       escape(tradeLinkDraftEditHref(linked.documentId))+
      '">Edit this Draft</a></p>':'')+
     '<div class="tl-document-preview-close"><button type="button" class="secondary" data-action="tradelink-document-preview-close">Close document preview</button></div>'+
     selectedPreview+
     (linked&&canManage&&TL03_ATTACHMENTS_ENABLED?
      renderTradeLinkDocumentAttachments(selection?.attachments,{
       documentId:linked.documentId,workspaceId,
       editable:!linked.archived&&['draft','revision-required'].includes(linked.workflowState),
       busy:view.busy
      }):'')+
     (linked&&canManage?renderTradeLinkSavedWorkflowHistory(selection?.events):''):
     '<div class="tl-document-preview-empty" role="status">'+
      '<span class="tl-document-preview-empty-icon" aria-hidden="true">▤</span>'+
      '<h3>'+(view.busy?'Loading document preview':'Select a document')+'</h3>'+
      '<p>'+(view.busy?'Retrieving the latest signed document revision.':
       'Choose Preview or View document from the list to inspect its verified contents here.')+'</p>'+
     '</div>')+
   '</aside>'+
  '</div>'+
  '</section>';
}
export function renderTradeLinkDraftWorkspace({detail,workspaceId,view=initialTradeLinkDraftView(),canManage=false,actorName='',actorEmail='',showModuleTabs=true}={}){
 if(!isTradeLinkBoard(detail?.board)||detail.board.id!==TRADELINK_BOARD_ID||
   detail.board.workspace_id!==workspaceId)
  return '<section role="alert" class="tl-draft-panel">Signed TradeLink workspace unavailable.</section>';
 const rows=TL03_DOMAIN_READS_ENABLED&&canManage&&view.status==='AUTHORIZED_READ'&&Array.isArray(view.rows)?view.rows:[];
 const selected=TL03_DOMAIN_READS_ENABLED&&canManage&&view.mode==='edit'&&view.selected?.documentId?
   view.selected:null;
 const pendingEdit=view.editRequestId&&!selected;
 return '<div class="tl-draft-workspace">'+
  (pendingEdit?'<section class="tl-draft-panel" '+
    'role="'+(view.error?'alert':'status')+'">'+
    '<h2>Open saved Draft</h2><p>'+
    escape(view.error||'Verifying the signed document and its latest revision…')+
    '</p><a class="secondary" href="#/boards/'+TRADELINK_BOARD_ID+
    '/tradelink/documents">Back to All Documents</a></section>':
   renderEditor(selected?.record,view.mode,canManage,
   view.mode==='edit'&&!selected?null:view.formValues,view.draftNotice||'',
   view.error||'',view.message||'',view.lineDrafts,actorName,actorEmail,view.reviewStages||null,showModuleTabs))+
  '</div>';
}
