/** Signed TradeLink Draft operations using the existing DomainClient.
 * No local persistence, fabricated records, second login, or write bypass.
 */
import {ApiError} from './session.js';
import {TRADELINK_MAX_ITEMS} from './tradelink/limits.js';
import {GM_SALES_EXEMPT_POLICY,GM_CREATOR_APPROVAL_FREE_POLICY,tradeLinkGmApprovalPreview} from './tradelink/approval-policy.js?v=cp-tl-universal-edit-01k-20261126-01';
import {validUuid} from './data.js';
import {calculateTradeLinkAmounts,formatTradeLinkAmount,TRADELINK_CURRENCIES,TRADELINK_VAT_CODES} from './tradelink-finance.js';
import {TRADELINK_BOARD_ID,isTradeLinkBoard} from './tradelink-board-items.js';
import {tradeLinkApplicationHref} from './tradelink-application-route.js';
import {TL03_ATTACHMENTS_ENABLED,normalizeTradeLinkAttachmentList}
 from './tradelink-attachments.js';
import {TRADELINK_DEFAULT_COMPANY_PROFILE_ID,TRADELINK_COMPANY_PROFILE_OPTIONS,
 TRADELINK_DEFAULT_TERMS,isTradeLinkCompanyProfileId,
 tradeLinkCompanyTemplateSnapshot,tradeLinkCompanyProfileIdFromTemplateId}
 from './tradelink-official-templates.js';
import {TradeLinkNativeClient,TL03_DOMAIN_READS_ENABLED,
 TL03_DOMAIN_WRITES_ENABLED,TL03_AUTOMATIC_NUMBERING_ENABLED,TL03_WORKFLOW_SUBMIT_ENABLED,
 TL03_WORKFLOW_REVIEW_ENABLED,TL03_WORKFLOW_DECISION_ENABLED,
 TL03_WORKFLOW_OPERATIONAL_ENABLED,TL03_DUAL_REVIEW_ENABLED,
 validateTradeLinkDraftEnvelope,
 normalizeTradeLinkDomainRow} from './tradelink-native.js?v=cp-tl-opt-01-20261127-01';

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
 return validUuid(documentId)?tradeLinkApplicationHref('drafts/edit/'+documentId):'';
}

/** Merge the current actor's own document page with the independently
 * authorized reviewer assignment list. Preserve assignment metadata when a
 * creator is also an assigned reviewer; never merge by mutable document number.
 */
export function mergeTradeLinkCreatedAndAssignedRows(createdRows,assignedRows){
 if(!Array.isArray(createdRows)||!Array.isArray(assignedRows))
  throw new ApiError('TradeLink document sources are unavailable.',409);
 const merged=new Map();
 for(const row of assignedRows){
  if(!validUuid(row?.documentId)||!['primary','secondary'].includes(row?.assignedStage)||
   typeof row?.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt))||
   typeof row?.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt)))
   throw new ApiError('Invalid assigned TradeLink document row.',409);
  merged.set(row.documentId,{...row,createdByActor:false});
 }
 for(const row of createdRows){
  if(!validUuid(row?.documentId)||row?.createdByActor!==true||
   typeof row?.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt))||
   typeof row?.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt)))
   throw new ApiError('Invalid creator-owned TradeLink document row.',409);
  const previous=merged.get(row.documentId)||{};
  merged.set(row.documentId,{...previous,...row,createdByActor:true});
 }
 return [...merged.values()].sort((a,b)=>
  Date.parse(b.createdAt)-Date.parse(a.createdAt)||
  b.documentId.localeCompare(a.documentId));
}

export function initialTradeLinkDraftView(documentType=null){
 // The route may request only one of the existing six source document types.
 // This is transient UI state, never browser or server persistence.
 const selected=typeLabels.some(([key])=>key===documentType)?documentType:null;
 return {status:'READ_PENDING',rows:[],selected:null,documentPreview:null,busy:false,error:'',
  message:'',draftNotice:'',mode:'create',editRequestId:null,pendingCreateId:null,pendingCreateDraft:null,pendingSave:null,lineDrafts:null,unsavedChanges:false,
  listFilters:initialTradeLinkDraftListFilters(),listPage:null,selectedDocumentIds:[],selectedDocuments:[],
  assignedOnly:false,sharedVisibility:false,
  formValues:selected?{documentType:selected}:null};
}
/**
 * Discard ALL prior module inputs, including sensitive financial and reviewer
 * fields. This is in-memory UI state only; no browser or server persistence.
 */
export function resetTradeLinkDraftForm(view=initialTradeLinkDraftView(),documentType=null){
 const requested=documentType??view?.formValues?.documentType??'quotation';
 const safeType=typeLabels.some(([id])=>id===requested)?requested:'quotation';
 return {...view,mode:'create',selected:null,documentPreview:null,pendingCreateId:null,pendingCreateDraft:null,pendingSave:null,lineDrafts:null,error:'',message:'',
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
export function tradeLinkDraftFieldForError(error){
 const message=typeof error==='string'?error:error?.message;
 return typeof message==='string'&&message.startsWith('Invalid Quotation contact email.')?
  'customerEmail':null;
}
/** Expose only program-defined local validation messages, not field values. */
export function tradeLinkDraftValidationMessage(error){
 return error instanceof ApiError&&error.status===400?
  error.message:'Invalid Draft input.';
}
/** Deliberately sanitize server failures: no SQL details or private record data. */
export function tradeLinkSaveDefinitelyRejected(error){
 return Number(error?.status)===400&&['22023','23514','23502'].includes(String(error?.code||''));
}
/** Deliberately sanitize server failures: no SQL details or private record data. */
export function tradeLinkDraftSaveFailureMessage(error,{committed=false}={}){
 if(committed)return 'Document saved, but Board and All Documents could not be verified. Select Save again to retry verification only.';
 const code=String(error?.code||''),status=Number(error?.status);
 if(tradeLinkSaveDefinitelyRejected(error)){
  if(error.message==='Invalid Quotation contact email.')
   return 'Invalid Quotation contact email. Enter an email address in Client email.';
  if(error.message==='Two different assigned TradeLink reviewers are required')
   return 'Document rejected: select two different assigned TradeLink reviewers, then save again.';
  if(error.message==='Both assigned reviewers must be active confirmed TradeLink accounts in this workspace')
   return 'Document rejected: select two active, confirmed TradeLink reviewer accounts in this workspace.';
  return 'Document rejected: check the required document fields and reviewer selections, then save again.';
 }
 if(status===401||status===403||code==='42501')
  return 'Saving is not authorized for this session or workspace. Nothing was confirmed. Sign in again or ask your administrator.';
 if(status===409||code==='40001'||code==='23505')
  return 'Draft number or revision conflicts with an existing saved record. Refresh All Documents before editing or creating another Draft.';
 if(code==='REQUEST_TIMEOUT'||status===0)
  return 'Save confirmation was interrupted. Retry unchanged inputs to reuse the same document ID, or refresh All Documents before changing the Draft.';
 return 'Save could not be confirmed. Retry unchanged inputs to reuse the same document ID, or refresh All Documents before changing the Draft.';
}
// Contact values are text, not numbers: preserve leading zeroes and formatting.
const QUOTATION_EMAIL_PATTERN=String.raw`[^\s@]+@[^\s@]+\.[^\s@]+`;
const QUOTATION_PHONE_PATTERN=String.raw`\+?[0-9\s\(\).\-\/]*[0-9][0-9\s\(\).\-\/]*(?:\s*(?:[Ee][Xx][Tt]\.?|[Xx])\s*[0-9]+)?`;
const quotationEmailValid=value=>/^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(value);
const quotationPhoneValid=value=>new RegExp('^(?:'+QUOTATION_PHONE_PATTERN+')$').test(value);

export function parseTradeLinkDraftForm(fields,{
 lineId=()=>globalThis.crypto?.randomUUID?.(),purpose='readiness',executivePreview=false,approvalFreePreview=false
}={}){
 if(!fields||typeof fields.get!=='function')
  throw new ApiError('TradeLink Draft input is missing.',400);
 const value=k=>String(fields.get(k)??'').trim();
 const type=value('documentType');
 const approvalFree=approvalFreePreview&&['quotation','po'].includes(type);
 const companyProfileId=value('vendorId')||TRADELINK_DEFAULT_COMPANY_PROFILE_ID;
 if(!isTradeLinkCompanyProfileId(companyProfileId))
  throw new ApiError('Select a valid TradeLink company profile.',400);
 const termsInput=fields.get('terms');
 const terms=termsInput===null?TRADELINK_DEFAULT_TERMS[type]:String(termsInput).trim();
 if(typeof terms!=='string'||terms.length>5000)
  throw new ApiError('Invalid TradeLink document terms.',400);
 // Company identity and visual template are revision-bound document content.
 // The selected profile is resolved only from the bundled official directory.
 const draft={documentType:type,documentNumber:value('documentNumber'),
  vendorId:companyProfileId,templateId:tradeLinkCompanyTemplateSnapshot(companyProfileId).id,terms};
 // The signed Draft-write API permits incomplete quotation content. The
 // separate submission workflow enforces commercial readiness. Preserve
 // full validation for Preview and all existing non-quotation modules.
 const incompleteQuotationSave=type==='quotation'&&purpose==='save';
 const physical=type==='packing'||type==='delivery';
 const priced=type==='esi'||type==='quotation'||type==='po';
 const addText=(key,{required=false}={})=>{
  const text=value(key);
  if(text.length>5000||(required&&!text))
   throw new ApiError('Invalid or missing TradeLink '+key+'.',400);
  if(text)draft[key]=text;
 };
 for(const key of ['date','dueDate','customerName','customerContact','referenceNumber','remarks',
  'verifiedBy','verifiedByEmail','approvedBy','approvedByEmail']){
  if(!approvalFree||!['verifiedBy','verifiedByEmail','approvedBy','approvedByEmail'].includes(key))addText(key);
 }
 if(type==='quotation')addText('customerAddress');
 const validDocumentDate=value=>!value||/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 if(!validDocumentDate(draft.date)||!validDocumentDate(draft.dueDate))
  throw new ApiError('Enter valid document and due dates.',400);
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
  if(count<1||count>TRADELINK_MAX_ITEMS)throw new ApiError('Invalid Draft line-item count.',400);
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
   for(const key of ['customerEmail','customerPhone'])addText(key);
   for(const key of ['validity','deliveryCommitment','paymentTerms']){
    const text=value(key)===QUOTATION_CUSTOM_CHOICE?value(key+'Custom'):value(key);
    if(text.length>5000)throw new ApiError('Invalid TradeLink '+key+'.',400);
    if(text)draft[key]=text;
   }
   if(!approvalFree)addText('approvedBy');
   if(!incompleteQuotationSave&&((!draft.customerEmail&&!draft.customerPhone)||
     !draft.validity||!draft.deliveryCommitment||
     !draft.paymentTerms||(!approvalFree&&!draft.approvedBy)))
    throw new ApiError(approvalFree?'Quotation readiness needs client contact, validity, delivery and payment terms.':'Quotation readiness needs client contact, validity, delivery, payment terms and an intended approver.',400);
   if(draft.customerEmail&&!quotationEmailValid(draft.customerEmail))
    throw new ApiError('Invalid Quotation contact email. Enter an email address in Client email.',400);
   if(draft.customerPhone&&!quotationPhoneValid(draft.customerPhone))
    throw new ApiError('Invalid Quotation contact phone. Enter a phone number in Client phone.',400);
  }else if(type==='po'){
   for(const key of ['poNumber','targetDeliveryDate','paymentTerms',
    'verifiedBy','approvedBy']){
    if(!approvalFree||!['verifiedBy','approvedBy'].includes(key))addText(key);
   }
   if(!draft.paymentTerms||(!approvalFree&&((!draft.verifiedBy&&!(executivePreview&&draft.approvedBy==='asenagan@watchdogautomation.com.ph'))||!draft.approvedBy))||
      !draft.targetDeliveryDate)
    throw new ApiError(approvalFree?'Supplier PO readiness needs delivery date and payment terms.':'Supplier PO readiness needs delivery date, payment terms, reviewer and intended approver.',400);
   const date=draft.targetDeliveryDate;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||
      !Number.isFinite(Date.parse(date))||
      new Date(date).toISOString().slice(0,10)!==date)
    throw new ApiError('Invalid supplier PO delivery date.',400);
  }
 }
 if(type==='quotation'){
  const quoteStatus=value('quoteStatus');
  if(quoteStatus){
   if(!['Working on it','Sent','Client Review','Accepted','Declined','On Hold','Closed'].includes(quoteStatus))
    throw new ApiError('Select a valid Quotation commercial status.',400);
   draft.quoteStatus=quoteStatus;
  }
 }
 return validateTradeLinkDraftEnvelope(validateTradeLinkModuleAccountAssignments(draft,{executivePreview,approvalFreePreview:approvalFree}),
  {allowUnassignedNumber:true});
}
/**
 * Keep the exact payload (including line ID) for ambiguous create retries.
 * A changed form must never reuse an uncertain document ID: this avoids
 * inconsistent retries and duplicate authoritative Board projections.
 */
export function restoreTradeLinkPendingSave(pendingSave,lines){
 if(!pendingSave||pendingSave.itemsStoredInLines!==true)return pendingSave;
 const command=pendingSave.command,draft=command?.draft;
 if(!draft||!Array.isArray(lines)||lines.length>TRADELINK_MAX_ITEMS)
  throw new ApiError('Saved recovery data cannot restore its pending line items.',409);
 const physical=draft.documentType==='packing'||draft.documentType==='delivery';
 const priced=['esi','quotation','po'].includes(draft.documentType);
 const lineIds=new Set();
 const items=lines.map(line=>{
  const id=String(line?.id??''),kind=line?.kind||'item';
  const description=String(line?.description??'').trim();
  if(!id||id.length>120||lineIds.has(id)||!['item','note'].includes(kind)||
    !description||description.length>2000)
   throw new ApiError('Saved recovery line identity or description is invalid.',409);
  lineIds.add(id);
  if(kind==='note'){
   if(String(line.quantity??'').trim()||String(line.unitPrice??'').trim()||
     String(line.unit??'').trim())
    throw new ApiError('Saved recovery note contains item-only values.',409);
   return {id,kind:'note',description};
  }
  const quantityText=String(line.quantity??'').trim();
  const unitPriceText=String(line.unitPrice??'').trim();
  const quantity=Number(quantityText),unitPrice=physical?0:Number(unitPriceText);
  if(!quantityText||(!physical&&!unitPriceText)||!Number.isFinite(quantity)||
    !Number.isFinite(unitPrice)||quantity<0||unitPrice<0||quantity>1000000000||
    unitPrice>1000000000||((physical||priced)&&quantity===0)||(priced&&unitPrice===0))
   throw new ApiError('Saved recovery quantity or unit price is invalid.',409);
  const unit=String(line.unit??'').trim();
  const item={id,kind:'item',description,quantity,unitPrice,...(unit?{unit}:{})};
  if(draft.documentType==='delivery'){
   const serial=String(line.serialNumber??'').trim();
   if(serial.length>120)throw new ApiError('Saved recovery serial number is invalid.',409);
   if(serial)item.serialNumber=serial;
  }
  return item;
 });
 const {itemsStoredInLines,...rest}=pendingSave;
 return {...rest,command:{...command,draft:{...draft,items}}};
}
export function tradeLinkApprovalFreeDraftPreview({executivePreview=false,actorId='',record=null}={}){
 return executivePreview===true&&(!record||Boolean(actorId)&&record.created_by===actorId);
}
export function prepareTradeLinkDraftCommand(view,fields,{
 documentId=()=>globalThis.crypto?.randomUUID?.(),
 lineId=()=>globalThis.crypto?.randomUUID?.(),executivePreview=false,actorId=''
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
 const approvalFreePreview=tradeLinkApprovalFreeDraftPreview({executivePreview,actorId,record:selected?.record});
 const draft=parseTradeLinkDraftForm(fields,{
  lineId:index=>pending?.items?.[index]?.id||lineId(index),
  purpose:'save',executivePreview:executivePreview&&!selected||selected?.record?.approval_policy===GM_SALES_EXEMPT_POLICY,
  approvalFreePreview
 });
 if(selected){
  const existingContent=selected.record.content||{};
  // The signed supersession contract preserves historical assignment metadata.
  if(approvalFreePreview&&['quotation','po'].includes(draft.documentType)&&selected.record.workflow_state==='approved'){
   for(const key of ['verifiedBy','verifiedByEmail','approvedBy','approvedByEmail']){
    if(Object.hasOwn(existingContent,key))draft[key]=existingContent[key];
   }
  }
  const boundProfileId=existingContent.vendorId||
   tradeLinkCompanyProfileIdFromTemplateId(existingContent.templateId)||'';
  if(boundProfileId&&draft.vendorId!==boundProfileId)
   throw new ApiError('A saved TradeLink document cannot be rebound to another company profile.',409);
  if(boundProfileId){
   draft.vendorId=boundProfileId;
   draft.templateId=existingContent.templateId||
    tradeLinkCompanyTemplateSnapshot(boundProfileId).id;
  }
 }
 const id=selected?.documentId||view?.pendingCreateId||documentId();
 if(!selected&&pending&&JSON.stringify(pending)!==JSON.stringify(draft))
  throw new ApiError('A previous save may have succeeded. Refresh All Documents before changing this Draft.',409);
 return {documentId:id,expectedRevision,draft,
  ...(approvalFreePreview&&['quotation','po'].includes(draft.documentType)?{approvalFreePreview:true}:{}),
  pendingCreateDraft:selected?null:pending||draft};
}
/** Reconcile a saved record against the authoritative signed bounded list.
 * A signed 50-row list is not guaranteed to contain every record. An exact
 * signed read and matching Board item are already checked by the caller;
 * preserve that verified record in the current All Documents window rather
 * than presenting a successful commit as failed solely due to pagination.
 */
export function serializeTradeLinkDocumentCsv(records){
 if(!Array.isArray(records)||records.length>50)
  throw new ApiError('Select no more than 50 visible TradeLink documents.',400);
 const columns=[['documentNumber','Document Number'],['clientName','Client Name'],
  ['documentType','Document Type'],['createdAt','Created At'],
  ['workflowState','Workflow Status'],['revision','Revision'],
  ['updatedAt','Last Updated'],['archived','Archived']];
 const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
 const rows=records.map(row=>{
  if(!row||typeof row.documentNumber!=='string'||
   !typeLabels.some(([id])=>id===row.documentType)||
   typeof row.workflowState!=='string'||!Number.isSafeInteger(row.revision)||
   row.revision<1||typeof row.archived!=='boolean'||
   (row.clientName!==null&&row.clientName!==undefined&&typeof row.clientName!=='string')||
   typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt))||
   typeof row.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt)))
   throw new ApiError('Selected TradeLink document metadata is invalid.',409);
  return columns.map(([key])=>quote(row[key])).join(',');
 });
 return [columns.map(([,label])=>quote(label)).join(','),...rows].join('\r\n')+'\r\n';
}
export function reconcileTradeLinkSavedListing(list,record,receipt){
 if(list?.status!=='AUTHORIZED_READ'||!Array.isArray(list.rows)||
    !record||record.id!==receipt?.documentId||
    record.board_item_id!==receipt?.boardItemId||
    record.revision!==receipt?.revision||
    (!['draft','for-approval','revision-required'].includes(record.workflow_state)&&
      !(record.workflow_state==='approved'&&receipt.state==='approved'&&record.approval_policy===GM_CREATOR_APPROVAL_FREE_POLICY))||
    record.archived_at!==null||
    typeof record.document_number!=='string'||
    typeof record.created_at!=='string'||!Number.isFinite(Date.parse(record.created_at))||
    typeof record.updated_at!=='string'||
    !Number.isFinite(Date.parse(record.updated_at)))
  throw new ApiError('Signed TradeLink document listing reconciliation failed.',409);
 const summary={documentId:record.id,boardItemId:record.board_item_id,
  documentNumber:record.document_number,clientName:record.content?.customerName??null,
  documentType:record.document_type,workflowState:record.workflow_state,
  revision:record.revision,archived:false,
  ...(record.workflow_state==='approved'?{approvalPolicy:record.approval_policy,primaryAt:null,secondaryAt:null}:{}),
  createdAt:record.created_at,updatedAt:record.updated_at};
 const existing=list.rows.find(row=>row.documentId===record.id);
 if(existing&&(existing.boardItemId!==record.board_item_id||
    existing.documentType!==record.document_type||
    existing.documentNumber!==record.document_number))
  throw new ApiError('Signed TradeLink document listing conflicts with saved record.',409);
 const rows=[summary,...list.rows.filter(row=>row.documentId!==record.id)];
 rows.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||
  b.documentId.localeCompare(a.documentId));
 return {...list,rows:rows.slice(0,50)};
}

export class TradeLinkDraftWorkspace{
 constructor({auth,api,automaticNumberingEnabled=TL03_AUTOMATIC_NUMBERING_ENABLED}={}){
  this.automaticNumberingEnabled=automaticNumberingEnabled===true;
  this.client=new TradeLinkNativeClient({auth,api,
   automaticNumberingEnabled:this.automaticNumberingEnabled});
 }
 async analyticsSummary(period={}){
  return this.client.analyticsSummary(period);
 }
 async list(){
  if(!TL03_DOMAIN_READS_ENABLED)return {status:'DARK_LAUNCH',rows:[]};
  return {status:'AUTHORIZED_READ',rows:await this.client.list(50)};
 }
 async searchPage({filters=initialTradeLinkDraftListFilters(),cursor=null,limit=50}={}){
  if(!TL03_DOMAIN_READS_ENABLED)disabled();
  if(!Number.isSafeInteger(limit)||limit<1||limit>50)
   throw new ApiError('TradeLink search limit must be 1–50.',400);
  const f=normalizeTradeLinkDraftListFilters(filters);
  const page=await this.client.searchPage({
   query:f.query,documentType:f.documentType,workflowState:f.workflowState,
   archiveMode:f.archiveMode,visibilityMode:f.visibilityMode,
   updatedFrom:f.updatedFrom,updatedTo:f.updatedTo,
   sortBy:f.sortBy,sortDirection:f.sortDirection,cursor,limit});
  return {status:'AUTHORIZED_READ',rows:page.rows,
   listPage:{server:true,hasMore:page.hasMore,nextCursor:page.nextCursor,
    totalCount:page.totalCount,limit,cursor,history:[],pageIndex:0,appliedFilters:f}};
 }
 async read(documentId){
  if(!TL03_DOMAIN_READS_ENABLED)disabled();
  return this.client.read(documentId);
 }
 async revisionBundle(documentId,revision=null){
  if(!TL03_DOMAIN_READS_ENABLED)disabled();
  return this.client.revisionBundle(documentId,revision);
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
 async boardProjection(documentId){
  if(!TL03_DOMAIN_READS_ENABLED)disabled();
  return this.client.boardProjection(documentId);
 }
 async recordReviewStage(input={}){
  if(!TL03_DUAL_REVIEW_ENABLED)disabled();
  return this.client.recordReviewStage(input);
 }
 async chequeClearance(input={}){
  return this.client.chequeClearance(input);
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
 async save({documentId,expectedRevision=0,draft,initialState='for-approval',reviseApproved=false,approvalFreePreview=false}={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)disabled();
  const operation=expectedRevision===0?'create':reviseApproved?'revise-approved':'update';
  const payload=validateTradeLinkDraftEnvelope(applyQuotationApprovalHierarchy(draft,{approvalFreePreview}),
   {allowUnassignedNumber:operation==='create'&&this.automaticNumberingEnabled});
  const id=documentId||globalThis.crypto?.randomUUID?.();
  return this.client.commit({documentId:id,expectedRevision,operation,
   draft:payload,initialState});
 }
 async changeState({documentId,revision,operation}={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)disabled();
  if(!['archive','restore'].includes(operation))
   throw new ApiError('Only archive and restore are supported for TradeLink Draft.',400);
  return this.client.commit({documentId,expectedRevision:revision,operation});
 }
 async bulkAction(input={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)disabled();
  return this.client.bulkAction(input);
 }
}
const options=(arr,current)=>arr.map(([id,label])=>
 '<option value="'+escape(id)+'"'+(id===current?' selected':'')+'>'+
 escape(label)+'</option>').join('');
const contactPlaceholders={
 customerEmail:'Enter contact email address',customerPhone:'Enter contact number',
 customerTin:'Enter client TIN',verifiedBy:'Enter reviewer email address',
 approvedBy:'Enter approver email address',lineSerialNumber:'Enter serial / asset number',
 poNumber:'Enter supplier PO number',paymentTerms:'Enter payment terms',
 paymentParticulars:'Enter payment particulars',bankName:'Enter bank name',
 chequeNumber:'Enter cheque number',cashAmount:'Enter cash amount',chequeAmount:'Enter cheque amount'
};
const partyPlaceholders={
 esi:'Enter client name',quotation:'Enter client name',packing:'Enter consignee name',
 delivery:'Enter recipient / consignee name',payment:'Enter payor name',po:'Enter supplier name'
};
function placeholderAttribute(text){
 return text?' placeholder="'+escape(text)+'"':'';
}
function field(label,name,val='',attrs='',hint=contactPlaceholders[name],error=''){
 const invalid=error?
  ' aria-invalid="true" aria-describedby="tl-quotation-contact-email-error"':'';
 return '<label class="tl-draft-field"><span>'+escape(label)+'</span>'+
  '<input name="'+escape(name)+'" value="'+escape(val)+'" '+attrs+invalid+placeholderAttribute(hint)+'>'+
  (error?'<small id="tl-quotation-contact-email-error" class="tl-draft-field-error" role="alert">'+
   'Enter a valid email address in Client email.</small>':'')+'</label>';
}
function moneyField(label,name,val,currency,attrs){
 return '<label class="tl-draft-field"><span>'+escape(label)+
  ' (<span data-tradelink-draft-money-currency>'+escape(currency)+'</span>)</span>'+
  '<input name="'+escape(name)+'" value="'+escape(val)+'" '+attrs+placeholderAttribute(contactPlaceholders[name])+'></label>';
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
export function validateTradeLinkModuleAccountAssignments(draft,{executivePreview=false,approvalFreePreview=false}={}){
 if(approvalFreePreview&&['quotation','po'].includes(draft?.documentType))return draft;
 const allowed=TRADELINK_MODULE_ACCOUNT_OPTIONS[draft?.documentType];
 if(!allowed)return draft;
 for(const [field,options] of Object.entries(allowed)){
  const value=String(draft[field]??'').trim().toLowerCase();
  if(draft.documentType==='po'&&field==='verifiedBy'&&!value&&executivePreview&&draft.approvedBy==='asenagan@watchdogautomation.com.ph')continue;
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
 actorEmail='',documentSaved=false,documentId='',workflowState='draft',reviewedAt=null,exempt=false
}={}){
 if(exempt)return '<p class="tl-reference-assigned-account" role="status">Sales Supervisor approval exempt for this revision.</p>';
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
function referenceCreator(creatorName,documentSaved=false){
 const creator=typeof creatorName==='string'?creatorName.trim():'';
 const displayName=creator||(
  documentSaved?'Original creator unavailable':'Current authenticated user');
 return '<div class="tl-reference-approval-creator"><span aria-hidden="true">♙</span><div>'+
  '<strong>Created By</strong> <span class="tl-reference-approval-chip">'+
  (documentSaved?'Original creator':'Auto-captured on save')+'</span>'+
  '<p>'+escape(displayName)+'</p>'+
  '<small>'+(documentSaved?
   'Original creator identity is read from the saved document record.':
   'Signed server identity and timestamp are captured on successful save.')+'</small>'+
  '</div></div>';
}
function renderApprovalFreeWorkflow(creatorName,documentSaved){
 return '<section id="tl-section-approval" class="tl-reference-approval" aria-label="Verification and approval workflow">'+
  '<h4>Verification &amp; Approval Workflow</h4>'+referenceCreator(creatorName,documentSaved)+
  '<div class="tl-reference-approval-stage"><strong>Reviewer approval — Not Applicable</strong></div>'+
  '<div class="tl-reference-approval-stage"><strong>Management approval — Not Applicable</strong></div>'+
  '<p>'+(documentSaved?'No reviewer validation is expected for your new revision.':'No reviewer validation is expected for this document.')+
  ' The server confirms the applicable policy on save.</p></section>';
}
function renderReferenceModuleWorkflow(type,fieldValue,data,creatorName,reviewContext={}){
 if(type==='po'&&reviewContext.approvalFreePreview)
  return renderApprovalFreeWorkflow(creatorName,reviewContext.documentSaved);
 const {actorEmail='',documentSaved=false,documentId='',workflowState='draft',reviewStages=null,gmPreview=false}=reviewContext;
 const value=name=>fieldValue(name,data[name]||'');
 const stage=(field,stageName,label)=>referenceAssignedPdfStage(field,value(field),label,stageName,{
  actorEmail,documentSaved,documentId,workflowState,
  reviewedAt:reviewStages?.[stageName]?.recordedAt||null,
  exempt:stageName==='primary'&&reviewStages?.approvalPolicy===GM_SALES_EXEMPT_POLICY
 });
 const person=(label,name,placeholder,required=false,stageName='primary')=>
  referencePersonField(label,name,value(name),TRADELINK_MODULE_ACCOUNT_OPTIONS[type][name],placeholder,{required})+
  stage(name,stageName,label);
 const help='<p class="tl-reference-workflow-disclaimer">Assigned reviewers are validated against their existing signed TradeLink accounts. Assignments do not grant roles or board permissions.</p>';
 const group=(title,content)=>'<div class="tl-reference-approval-stage">'+
  '<h5>'+title+'</h5>'+content+'</div>';
 if(type==='packing')return '<section id="tl-section-approval" class="tl-reference-approval tl-reference-module-approval" aria-label="Packing List verification and approval">'+
  '<h4>Verification &amp; Approval Workflow</h4>'+referenceCreator(creatorName,documentSaved)+
  group('Primary Reviewer',field('Primary reviewer email','verifiedBy',value('verifiedBy'),
   'type="email" maxlength="254" required')+stage('verifiedBy','primary','Primary reviewer'))+
  group('Secondary Reviewer',field('Secondary reviewer email','approvedBy',value('approvedBy'),
   'type="email" maxlength="254" required')+stage('approvedBy','secondary','Secondary reviewer'))+
  help+'</section>';
 if(type==='esi')return '<section id="tl-section-approval" class="tl-reference-approval tl-reference-module-approval" aria-label="Electronic SI verification and approval">'+
  '<h4>Verification &amp; Approval Workflow</h4>'+referenceCreator(creatorName,documentSaved)+
  group('Verified By (Finance Team)',
   person('Finance team member','verifiedBy','Select finance team member...',true,'primary'))+
  group('Approved By (Management)',
   person('Management approver','approvedBy','Select management member...',true,'secondary'))+
  help+'</section>';
 if(type==='delivery')return '<section id="tl-section-approval" class="tl-reference-approval tl-reference-module-approval" aria-label="Delivery tracking">'+
  '<h4>Delivery Tracking</h4>'+referenceCreator(creatorName,documentSaved)+
  group('Checked By (Quality Control)',
   person('QC personnel','checkedBy','Select QC personnel...',true,'primary'))+
  group('Delivered By (Logistics)',
   person('Logistics personnel','deliveredBy','Select logistics personnel...',true,'secondary'))+
  '<div class="tl-reference-assignment-field"><label for="tl-ref-delivery-received">Received By (optional)</label>'+
  '<input id="tl-ref-delivery-received" name="receivedBy" maxlength="5000" value="'+escape(value('receivedBy'))+'" placeholder="Enter recipient name"></div>'+
  help+'</section>';
 if(type==='payment')return '<section id="tl-section-approval" class="tl-reference-approval tl-reference-module-approval" aria-label="Payment acknowledgement">'+
  '<h4>Payment Acknowledgement</h4>'+referenceCreator(creatorName,documentSaved)+
  group('Payment Received By (Finance)',
   person('Finance team member','receivedBy','Select finance team member...',true,'primary'))+
  group('Verified By (Administration)',
   person('Administrator','verifiedBy','Select admin...',true,'secondary'))+
  help+'</section>';
 if(type==='po')return '<section id="tl-section-approval" class="tl-reference-approval tl-reference-module-approval" aria-label="Supplier purchase order verification and approval">'+
  '<h4>Verification &amp; Approval Workflow</h4>'+referenceCreator(creatorName,documentSaved)+
  group('Reviewed By (Account Manager)',
   referencePersonField('Account Manager','verifiedBy',
    (!documentSaved&&gmPreview||reviewStages?.approvalPolicy===GM_SALES_EXEMPT_POLICY)?value('verifiedBy'):value('verifiedBy')||'aacsenagan@watchdogautomation.com.ph',
    TRADELINK_MODULE_ACCOUNT_OPTIONS.po.verifiedBy,'Select account manager...',{required:!(!documentSaved&&gmPreview||reviewStages?.approvalPolicy===GM_SALES_EXEMPT_POLICY)})+
   '<small>Suggested default reviewer: aacsenagan@watchdogautomation.com.ph. This selection is editable.</small>'+
   (!documentSaved&&gmPreview?'<p>Intermediate review is optional when you select yourself as final approver. The signed server confirms the policy.</p>':'')+
   stage('verifiedBy','primary','Account Manager review'))+
  group('Approved By (Management)',
   referencePersonField('Management approver','approvedBy',fieldValue('approvedBy',data.approvedBy||(!documentSaved&&gmPreview?'asenagan@watchdogautomation.com.ph':'')),TRADELINK_MODULE_ACCOUNT_OPTIONS.po.approvedBy,'Select management member...',{required:true})+
   stage('approvedBy','secondary','Management approver'))+
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
/** CP-TL-08E-01: one document-scoped temporary reviewer substitution.
 * This does not expand the general Quotation reviewer list or grant account access. */
export const CP_TL_08E_TEMP_REVIEW={
 documentNumber:'CP-TL-08C-QA-20261112-01',
 reviewerEmail:'lmsenagan@watchdogautomation.com.ph'
};
export function quotationSecondaryOptionsForDocument(documentNumber=''){
 const base=QUOTATION_APPROVAL_HIERARCHY.secondaryOptions;
 return String(documentNumber||'').trim().toUpperCase()===CP_TL_08E_TEMP_REVIEW.documentNumber
  ? [...base,CP_TL_08E_TEMP_REVIEW.reviewerEmail] : base;
}
/** Canonicalize the fixed first-stage reviewer, and reject unauthorized second-stage
 * nominees at the signed Draft-save boundary. Actual review and approval
 * authorization continues to be enforced by the backend. */
export function applyQuotationApprovalHierarchy(draft,{approvalFreePreview=false}={}){
 if(draft?.documentType!=='quotation'||approvalFreePreview)return draft;
 const secondaryOptions=quotationSecondaryOptionsForDocument(draft.documentNumber);
 const email=String(draft.approvedByEmail||secondaryOptions[0]).trim().toLowerCase();
 if(!secondaryOptions.includes(email))
  throw new ApiError('Select an authorized Quotation management approver.',400);
 return {...draft,verifiedBy:QUOTATION_APPROVAL_HIERARCHY.primary.label,
  verifiedByEmail:QUOTATION_APPROVAL_HIERARCHY.primary.email,
  approvedBy:'Management',approvedByEmail:email};
}
/** Presentation-only eligibility. A matching email never authorizes an RPC:
 * server-enforced stage membership, document status and audit must also pass. */
export function quotationReviewControlEligibility({
 actorEmail='',secondaryEmail='',documentSaved=false,workflowState='draft',
 primaryRecordedAt=null,secondaryRecordedAt=null,
 secondaryOptions=QUOTATION_APPROVAL_HIERARCHY.secondaryOptions
}={}){
 const actor=String(actorEmail||'').trim().toLowerCase();
 const selected=String(secondaryEmail||'').trim().toLowerCase();
 const primaryAssigned=actor!==''&&actor===QUOTATION_APPROVAL_HIERARCHY.primary.email;
 const secondaryAssigned=actor!==''&&actor===selected&&secondaryOptions.includes(selected);
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
function renderQuotationVerification(fieldValue,data,creatorName='',reviewContext={}){
 if(reviewContext.approvalFreePreview)
  return renderApprovalFreeWorkflow(creatorName,reviewContext.documentSaved);
 const {actorEmail='',documentSaved=false,documentId='',workflowState='draft',reviewStages=null,gmPreview=false}=reviewContext;
 const {primary}=QUOTATION_APPROVAL_HIERARCHY;
 const exempt=reviewStages?.approvalPolicy===GM_SALES_EXEMPT_POLICY;
 const preview=!documentSaved&&gmPreview&&fieldValue('approvedByEmail',data.approvedByEmail||'asenagan@watchdogautomation.com.ph')==='asenagan@watchdogautomation.com.ph';
 const secondaryOptionsForDocument=quotationSecondaryOptionsForDocument(data.documentNumber);
 const selected=fieldValue('approvedByEmail',data.approvedByEmail||secondaryOptionsForDocument[0]);
 const safeSelected=secondaryOptionsForDocument.includes(selected)?selected:secondaryOptionsForDocument[0];
 const eligibility=quotationReviewControlEligibility({actorEmail,secondaryEmail:safeSelected,
  secondaryOptions:secondaryOptionsForDocument,
  documentSaved,workflowState,primaryRecordedAt:reviewStages?.primary?.recordedAt,
  secondaryRecordedAt:reviewStages?.secondary?.recordedAt});
 return '<section id="tl-section-approval" class="tl-reference-approval" aria-labelledby="tl-quotation-approval-heading">'+
  '<h4 id="tl-quotation-approval-heading">Verification &amp; Approval Workflow</h4>'+
  '<div class="tl-reference-approval-creator"><span aria-hidden="true">♙</span><div><strong>Created By</strong> '+
   '<span class="tl-reference-approval-chip">'+
   (documentSaved?'Original creator':'Auto-captured on save')+'</span><p>'+
   escape(creatorName||(documentSaved?'Original creator unavailable':'Current authenticated user'))+
   '</p><small>'+(documentSaved?
    'Original creator identity is read from the saved document record.':
    'Identity and time are recorded by the signed server on successful save.')+
   '</small></div></div>'+
  '<div class="tl-reference-approval-stage">'+
   (exempt||preview?'<strong>Sales Supervisor approval — '+(exempt?'Exempted':'Exemption on save')+'</strong><input type="hidden" name="verifiedByEmail" value="'+escape(primary.email)+'"><input type="hidden" name="verifiedBy" value="'+escape(primary.label)+'"><p>'+(exempt?'Not required for this General Manager revision.':'Management validation remains. Exemption is confirmed by the signed server on save.')+'</p>':
   '<label for="tl-quote-reviewer-email">Primary approver — Sales Supervisor</label>'+
   '<input id="tl-quote-reviewer-email" name="verifiedByEmail" value="'+escape(primary.email)+'" '+
    'type="email" maxlength="254" readonly required aria-describedby="tl-quote-primary-note">'+
   '<input type="hidden" name="verifiedBy" value="'+escape(primary.label)+'">'+
   '<small id="tl-quote-primary-note">Permanent first-stage reviewer for standard policy. Only this assigned signed account can validate. Eligible General Manager submissions do not require this review.</small>'+
   referenceAssignedPdfStage('verifiedByEmail',primary.email,'Sales Supervisor review','primary',{
    actorEmail,documentSaved,documentId,workflowState,
    reviewedAt:reviewStages?.primary?.recordedAt||null}))+
  '</div>'+
  '<div class="tl-reference-approval-stage">'+
   '<label for="tl-quote-approver-email">Secondary approver — Management</label>'+
   '<select id="tl-quote-approver-email" name="approvedByEmail" required aria-describedby="tl-quote-secondary-note">'+
    secondaryOptionsForDocument.map(email=>'<option value="'+escape(email)+'"'+
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
 if(count<1||count>TRADELINK_MAX_ITEMS||!currencies.includes(currency)||
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
 return '<section id="tl-section-totals" class="tl-draft-finance tl-reference-totals" data-tradelink-draft-finance '+
  'aria-label="Document totals · unsaved preview">'+
  '<div class="tl-reference-totals-right">'+
   '<dl class="tl-draft-finance-results">'+
    '<div class="tl-ref-total-subtotal"><dt>Subtotal:</dt><dd data-tradelink-draft-amount="subtotal">'+display('subtotal')+'</dd></div>'+
    '<div class="tl-ref-total-discount"><dt><label for="tl-reference-discount-input">Discount:</label></dt><dd class="tl-ref-total-discount-fields">'+
     '<select name="discountType" aria-label="Discount method" aria-describedby="tl-draft-discount-help">'+
      options([['percentage','Percentage (%)'],['fixed','Fixed amount']],value('discountType'))+'</select>'+
     '<input id="tl-reference-discount-input" name="discountValue" value="'+escape(value('discountValue'))+'" '+
      'type="number" min="0" max="1000000000000" step="any" placeholder="Enter discount" aria-describedby="tl-draft-discount-help">'+
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
     'type="number" min="0" max="1000000000000" step="any" placeholder="Enter exchange rate" aria-describedby="tl-draft-fx-help">'+
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
 quotation:[['customerAddress','Client Address'],['customerEmail','Client email'],['customerPhone','Client phone'],
  ['lineDescription','Priced item'],['lineQuantity','Quantity'],
  ['lineUnitPrice','Unit price'],['validity','Validity of Quotation'],
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
const commonSummaryRowsFor=type=>commonSummaryRows.map(([key,label])=>[
 key,key==='customerName'&&type==='quotation'?'Client Name':label
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
 const rows=[...commonSummaryRowsFor(draft.documentType),...localSummaryRows[draft.documentType]];
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
  [...commonSummaryRowsFor(type),...rows].map(([key,label])=>
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
// UI-only sentinel. The Save parser writes the chosen or custom text to
// the established document field, never this sentinel or helper field.
const QUOTATION_CUSTOM_CHOICE='__custom__';
const quotationCommercialChoices={
 paymentTerms:{label:'Payment terms',placeholder:'Select payment terms...',
  customLabel:'Other (Custom)',customInput:'Custom payment terms',
  values:TRADELINK_COMMERCIAL_SUGGESTIONS.paymentTerms.map(v=>v==='Installment plans'?'installment plans':v)},
 deliveryCommitment:{label:'Delivery commitment',placeholder:'Select delivery time...',
  customLabel:'Others (Custom)',customInput:'Custom delivery time',
  values:TRADELINK_COMMERCIAL_SUGGESTIONS.deliveryCommitment.map(v=>v==='3 Days (in Stock)'?'3 Days (in stock)':v)},
 validity:{label:'Validity of Quotation',placeholder:'Select validity period...',
  customLabel:'Others (Custom Date)',customInput:'Custom validity date',
  values:TRADELINK_COMMERCIAL_SUGGESTIONS.validity}
};
function quotationCommercialField(name,savedValue,customValue=''){
 const config=quotationCommercialChoices[name];
 const text=String(savedValue??'');
 const custom=text===QUOTATION_CUSTOM_CHOICE||text!==''&&!config.values.includes(text);
 const selected=custom?QUOTATION_CUSTOM_CHOICE:text;
 const customText=custom&&text!==QUOTATION_CUSTOM_CHOICE?text:customValue;
 const id='tl-quotation-'+name;
 return '<div class="tl-draft-field" data-tl-commercial-choice>'+
  '<label for="'+id+'"><span>'+escape(config.label)+'</span></label>'+
  '<select id="'+id+'" name="'+name+'" required aria-controls="'+id+'-custom">'+
   options([['',config.placeholder],...config.values.map(v=>[v,v]),[QUOTATION_CUSTOM_CHOICE,config.customLabel]],selected)+'</select>'+
  '<div id="'+id+'-custom" data-tl-commercial-custom'+(custom?'':' hidden')+'>'+
   '<label class="tl-draft-field"><span>'+escape(config.customInput)+'</span>'+
   '<input name="'+name+'Custom" value="'+escape(customText)+'" maxlength="5000"'+
   placeholderAttribute(name==='validity'?'Enter date or custom validity':name==='paymentTerms'?'Enter custom payment terms':'Enter custom delivery time')+(custom?' required':'')+'></label></div></div>';
}
function commercialSuggestionLists(type){
 if(type!=='po')return '';
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
 const base=tradeLinkApplicationHref('drafts')+'/';
 return '<nav class="tl-reference-document-tabs" aria-label="TradeLink document modules">'+
 typeLabels.map(([key,label])=>
  '<a href="'+base+escape(key)+'"'+(key===type?' class="active" aria-current="page"':'')+
  '>'+escape(key==='quotation'?'Quotations':label)+'</a>').join('')+'</nav>';
}
function referenceDraftSectionNavigation(type){
 const links=[['document','Document'],['client','Client'],
  ['items',type==='payment'?'Payment':'Items']];
 if(['esi','quotation','po'].includes(type))links.push(['totals','Totals']);
 links.push(['notes','Notes'],['terms','Terms'],['approval','Workflow']);
 return '<nav class="tl-reference-section-nav" aria-label="Document section navigation">'+
  '<span class="tl-reference-section-nav-label">Jump to</span>'+
  links.map(([key,label])=>'<button type="button" data-action="tradelink-draft-section" '+
   'data-target="tl-section-'+key+'" aria-label="Jump to '+escape(label)+
   ' section">'+escape(label)+'</button>').join('')+'</nav>';
}
function referenceDocumentHeader(type,editing,canSave=false,status='for-approval',documentId='',revisingApproved=false){
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
     ' title="'+(approved?'Print the verified Approved document':'PDF printing is available only after all required reviewers approve')+'">Print PDF</button>'+
    '<button type="button" class="tl-reference-save" data-action="tradelink-draft-submit"'+
     (canSave?'':' disabled title="Signed document saving is unavailable"')+
     '>'+(revisingApproved?'Save New Revision':editing?'Save Changes':'Save')+'</button>'+
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
   '<span class="tl-ref-item-label" aria-hidden="true">'+escape(label)+' description</span>'+
   '<textarea name="lineDescription" maxlength="2000" rows="2" placeholder="'+(note?'Enter item note':'Enter item description')+'" required>'+desc+'</textarea></label>'+
  (note?
   '<input type="hidden" name="lineQuantity" value="">'+
   (physical?'':'<input type="hidden" name="lineUnitPrice" value="">')+
   '<input type="hidden" name="lineUnit" value="">':
   '<label class="tl-draft-field tl-ref-item-quantity"><span class="sr-only">'+escape(label)+' quantity</span>'+
    '<span class="tl-ref-item-label" aria-hidden="true">Quantity</span>'+
    '<input name="lineQuantity" type="number" min="0" max="1000000000" step="any" value="'+escape(quantity)+'" placeholder="Enter quantity"'+req+'></label>'+
   (physical?'':
    '<label class="tl-draft-field tl-ref-item-price"><span class="sr-only">'+escape(label)+' unit price ('+escape(currency)+')</span>'+
    '<span class="tl-ref-item-label" aria-hidden="true">Unit price ('+escape(currency)+')</span>'+
    '<input name="lineUnitPrice" type="number" min="0" max="1000000000" step="any" value="'+escape(unitPrice)+'" placeholder="Enter unit price"'+(priced?' required':'')+'></label>')+
   (physical?
    '<label class="tl-draft-field tl-ref-item-unit"><span class="sr-only">'+escape(label)+' unit</span>'+
     '<span class="tl-ref-item-label" aria-hidden="true">Unit</span>'+
     '<input name="lineUnit" value="'+escape(item.unit??'')+'" maxlength="120" placeholder="Enter unit"></label>':
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
  '<input type="hidden" name="lineId" value="'+escape(item.id||globalThis.crypto.randomUUID())+'">'+
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
function renderEditor(row,mode,canManage,formValues=null,draftNotice='',error='',message='',lineDrafts=null,actorName='',actorEmail='',reviewStages=null,showModuleTabs=true,canCreate=false,canEditOwnDraft=false,actorModuleRole='',moduleNavigation='',actorId=''){
 const editing=mode==='edit'&&
  ['draft','for-approval','revision-required','approved'].includes(row?.workflow_state)&&
  row.content&&typeof row.content==='object'&&
  (!Array.isArray(row.content.items)||row.content.items.length<=TRADELINK_MAX_ITEMS);
 const data=editing?row.content:{};
 // Saved records use the server-resolved original creator, never the viewer's session name.
 const creatorName=editing?row.created_by_name:actorName;
 const fieldValue=(name,fallback='')=>formValues&&Object.hasOwn(formValues,name)?formValues[name]:fallback;
 const line=Array.isArray(data.items)?data.items[0]||{}:{};
 const writeEnabled=editing||mode==='create';
 const live=TL03_DOMAIN_WRITES_ENABLED&&writeEnabled&&(canManage||(editing?canEditOwnDraft:canCreate));
 const workflowState=editing&&row.workflow_state!=='approved'?row.workflow_state:'for-approval';
 const documentId=editing?row.id:'';
 const selectedStatus=fieldValue('documentStatus',workflowState==='revision-required'?'for-approval':workflowState);
 const type=editing?data.documentType:fieldValue('documentType','quotation');
 const approvalFree=['quotation','po'].includes(type)&&tradeLinkApprovalFreeDraftPreview({
  executivePreview:tradeLinkGmApprovalPreview(actorEmail,actorModuleRole),actorId,record:editing?row:null});
 if(editing&&row.approval_policy===GM_CREATOR_APPROVAL_FREE_POLICY&&!reviewStages)reviewStages={approvalPolicy:row.approval_policy};
 const contactEmailError=type==='quotation'&&
  tradeLinkDraftFieldForError(error)==='customerEmail'?error:'';
 const selectedCompanyProfileId=fieldValue('vendorId',
  data.vendorId||tradeLinkCompanyProfileIdFromTemplateId(data.templateId)||TRADELINK_DEFAULT_COMPANY_PROFILE_ID);
 const companyProfileLocked=editing&&Boolean(data.vendorId||data.templateId);
 const selectedTerms=fieldValue('terms',
  typeof data.terms==='string'?data.terms:TRADELINK_DEFAULT_TERMS[type]);
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
  type==='quotation'?'Client Name':'Customer / supplier';
 const now=new Date();
 const localDateInput=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),
  String(now.getDate()).padStart(2,'0')].join('-');
 return '<section class="tl-draft-panel tl-reference-editor" aria-labelledby="tl-draft-editor-title">'+
  referenceDocumentHeader(type,editing,live,workflowState,documentId,editing&&row.workflow_state==='approved')+
  moduleNavigation+
  (error&&!contactEmailError?'<p class="tl-draft-feedback" role="alert">'+escape(error)+'</p>':'')+
  (message?'<p class="tl-draft-feedback" role="status">'+escape(message)+'</p>':'')+
  (editing?'<div class="tl-draft-editor-navigation">'+
   '<a class="secondary" href="'+tradeLinkApplicationHref('documents')+'">Back to All Documents</a> '+
   (canCreate?'<button type="button" class="secondary tl-reference-new-draft" data-action="tradelink-draft-new">New Draft</button>':'')+
   '</div>':'')+
  (mode==='edit'&&!editing?'<p role="alert">This record cannot be edited with the bounded Phase 1 editor.</p>':'')+
  (draftNotice?'<p class="tl-draft-feedback" role="status">'+escape(draftNotice)+'</p>':'')+
  '<div data-tradelink-recovery-choices></div>'+
  '<p hidden data-tradelink-recovery-status class="tl-draft-feedback" role="status" aria-live="polite"></p>'+
  '<div class="tl-reference-editor-content">'+
   (editing&&row.workflow_state==='approved'?'<p role="status" class="tl-draft-feedback">Revise Approved: the existing approved revision remains printable. Saving creates a new revision. The server determines its applicable approval policy.</p>':'')+
   (showModuleTabs?referenceDraftTabs(type):'')+
  renderModuleGuidance(type)+referenceDraftSectionNavigation(type)+
  '<form data-tradelink-draft-form'+(type==='quotation'?' novalidate':'')+'>'+
   // Retain the source documentType control for existing form contracts.
   // The embedded split workspace uses its sidebar as the visible module switcher.
   '<div class="tl-reference-sr-only"><label class="tl-draft-field"><span>Document module</span>'+
    '<select name="documentType" tabindex="-1" aria-hidden="true" '+(editing?'disabled':'')+'>'+
     options(typeLabels,type)+'</select></label></div>'+
   (editing?'<input type="hidden" name="documentType" value="'+escape(type)+'">':'')+
   '<section id="tl-section-document" class="tl-reference-form-section tl-reference-document-info">'+
    '<h4>Document Information</h4>'+
    '<div class="tl-reference-document-grid">'+
     '<label class="tl-draft-field"><span>Status</span><select name="documentStatus"'+
      (live?'':' disabled')+' aria-describedby="tl-reference-status-help">'+
      [...TRADELINK_DOCUMENT_STATUS_OPTIONS,
       ...(workflowState&&!TRADELINK_DOCUMENT_STATUS_OPTIONS.some(([id])=>id===workflowState)?
        [[workflowState,tradeLinkWorkflowLabel(workflowState)]]:[])] .map(([id,label])=>{
       const selectable=['draft','for-approval'].includes(id)&&
        ['draft','for-approval','revision-required'].includes(workflowState)&&
        !(editing&&row.workflow_state==='approved'&&id==='draft');
       const disabled=!selectable;
       return '<option value="'+escape(id)+'"'+(id===selectedStatus?' selected':'')+
        (disabled?' disabled':'')+'>'+escape(approvalFree&&id==='for-approval'?'Approved (on save)':label)+'</option>';
      }).join('')+'</select><small id="tl-reference-status-help">'+(approvalFree?'Save requests approval-free completion. The server confirms eligibility and the saved status. Select Draft explicitly to save as Draft.':'Save defaults to For Approval. Select Draft explicitly to save as Draft. Approved is assigned automatically after all required reviewers validate.')+'</small></label>'+
     '<label class="tl-draft-field"><span>Document number</span>'+
      '<input name="documentNumber" value="'+escape(fieldValue('documentNumber',data.documentNumber||''))+'" '+
       (editing||TL03_AUTOMATIC_NUMBERING_ENABLED?'readonly ':'required maxlength="120" pattern="[A-Za-z0-9][A-Za-z0-9._ /-]*" ')+
       'placeholder="'+(editing||TL03_AUTOMATIC_NUMBERING_ENABLED?'Assigned on save':'Enter document number')+'" aria-describedby="tl-reference-number-help">'+
      '<small id="tl-reference-number-help">'+(editing?'Assigned number is permanent and remains unchanged across revisions.':
       TL03_AUTOMATIC_NUMBERING_ENABLED?'Automatically assigned by the database when this document is first saved.':
       'Enter the document number manually. The automatic-numbering database capability is installed but is not enabled for production document creation.')+'</small></label>'+
     '<label class="tl-draft-field"><span>Document date</span>'+
      '<input name="date" type="date" value="'+escape(fieldValue('date',data.date||(!editing?localDateInput:'')))+'"></label>'+
     '<div class="tl-reference-static-field tl-reference-revision"><span>Revision No.</span>'+
      '<output>'+(editing?escape(row?.revision??'—'):'0 · Local preview')+'</output></div>'+
     '<label class="tl-draft-field tl-reference-company-profile"><span>Company / legal entity</span>'+
      '<select name="vendorId"'+(companyProfileLocked?' disabled':'')+'>'+
      options(TRADELINK_COMPANY_PROFILE_OPTIONS,selectedCompanyProfileId)+'</select>'+
      (companyProfileLocked?'<input type="hidden" name="vendorId" value="'+escape(selectedCompanyProfileId)+'">':'')+
      '<small>Saved with this document revision. Existing company assignments remain unchanged.</small></label>'+
    '</div>'+
   '</section>'+
   '<section id="tl-section-client" class="tl-reference-form-section tl-reference-client">'+
    '<h4>Client Information</h4>'+
    '<div class="tl-draft-form-grid">'+
     field(commonPartyLabel,'customerName',fieldValue('customerName',data.customerName||''),
      'maxlength="5000"'+(physical||payment||priced?' required':''),partyPlaceholders[type])+
     field('Contact Person','customerContact',fieldValue('customerContact',data.customerContact||''),
      'maxlength="5000"','Enter contact person name')+
     (type==='quotation'?'<label class="tl-draft-field tl-reference-address-field"><span>Client Address</span>'+
      '<textarea name="customerAddress" rows="2" maxlength="5000" placeholder="Enter client address">\n'+
      escape(fieldValue('customerAddress',data.customerAddress||''))+'</textarea></label>':'')+
     field(physical?'Source reference':'Reference information','referenceNumber',
      fieldValue('referenceNumber',data.referenceNumber||''),
      'maxlength="5000"'+(physical?' required':''),physical?'Enter shipment reference':'PO Number / Reference #')+
     field('Due date (optional)','dueDate',fieldValue('dueDate',data.dueDate||''),'type="date"')+
     (type==='esi'?field('Client tax identity / TIN','customerTin',
      fieldValue('customerTin',data.customerTin||''),'maxlength="5000" required'):'')+
     (type==='quotation'?
      '<label class="tl-draft-field"><span>Quotation commercial status</span><select name="quoteStatus">'+
       options([['','Not recorded'],['Working on it','Working on it'],['Sent','Sent'],['Client Review','Client Review'],
        ['Accepted','Accepted'],['Declined','Declined'],['On Hold','On Hold'],['Closed','Closed']],
        fieldValue('quoteStatus',data.quoteStatus||(editing?'':'Working on it')))+'</select><small>Commercial status is separate from the signed approval and document workflow state. Older records without a value remain Not recorded until selected.</small></label>'+
      field('Client email','customerEmail',fieldValue('customerEmail',data.customerEmail||''),
       'type="email" autocomplete="email" maxlength="5000" pattern="'+escape(QUOTATION_EMAIL_PATTERN)+'" title="Enter an email address"',
       undefined,contactEmailError)+
      field('Client phone','customerPhone',fieldValue('customerPhone',data.customerPhone||''),
       'type="tel" inputmode="tel" autocomplete="tel" maxlength="5000" pattern="'+escape(QUOTATION_PHONE_PATTERN)+'" title="Enter a phone number, including country code or extension if applicable"')+
      quotationCommercialField('paymentTerms',fieldValue('paymentTerms',data.paymentTerms||''),fieldValue('paymentTermsCustom',''))+
      quotationCommercialField('validity',fieldValue('validity',data.validity||''),fieldValue('validityCustom',''))+
      quotationCommercialField('deliveryCommitment',fieldValue('deliveryCommitment',data.deliveryCommitment||''),fieldValue('deliveryCommitmentCustom','')):'')+
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
    '<fieldset id="tl-section-items" class="tl-draft-lines tl-reference-payment"><legend>Form of Payment</legend>'+
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
    '<fieldset id="tl-section-items" class="tl-draft-lines tl-reference-items"><legend>Items</legend>'+
     '<div class="tl-ref-items-toolbar">'+

      '<button type="button" class="tl-ref-add-blank" data-action="tradelink-draft-add-line"'+
       (lines.length>=TRADELINK_MAX_ITEMS?' disabled':'')+'>＋ Add Blank</button>'+
      '<button type="button" class="tl-ref-add-note" data-action="tradelink-draft-add-note"'+
       (lines.length>=TRADELINK_MAX_ITEMS?' disabled':'')+'>Add Note</button></div>'+
     '<div class="tl-reference-items-note">'+(physical?'Physical shipment item (required for local readiness). ':'')+
      'Up to 250 items and notes per Draft (2 MiB maximum). Reorder by dragging or use the arrow controls.</div>'+
     '<div data-tradelink-draft-line-items>'+
      lines.map((item,index)=>renderTradeLinkDraftLineItem(item,type,inputUnit,index)).join('')+
     '</div>'+
    '</fieldset>'+
    (physical?'<p class="muted">Shipment items are not priced here. This preview records no delivery or inventory movement.</p>':''))+
   (priced?renderTradeLinkDraftLocalAmounts(type,fieldValue,data,line,lines):'')+
   '<section id="tl-section-notes" class="tl-reference-form-section tl-reference-terms"><h4>Additional Notes</h4>'+
    '<label class="tl-draft-field"><span>Document notes</span>'+
     '<textarea name="remarks" maxlength="5000" rows="4" '+
      'placeholder="Enter additional remarks">'+
       escape(fieldValue('remarks',data.remarks||''))+'</textarea>'+
     '<small>Additional notes are saved with this document revision.</small>'+
    '</label></section>'+
   '<details id="tl-section-terms" class="tl-reference-official-terms"><summary>Terms &amp; Conditions · Official TradeLink template</summary>'+
    '<label class="tl-draft-field"><span>Document terms</span>'+
     '<textarea name="terms" maxlength="5000" rows="12" placeholder="Enter terms and conditions">'+escape(selectedTerms)+'</textarea>'+
     '<small>Recovered from the original TradeLink v1.42.0 template. Changes are saved with this document revision. No PDF, approval or document is generated by changing terms locally; eligible saved records remain printable through the existing workflow.</small>'+
    '</label></details>'+
   (type==='quotation'?renderQuotationVerification(fieldValue,data,creatorName,{
    actorEmail,documentSaved:editing,documentId,workflowState,reviewStages,approvalFreePreview:approvalFree,gmPreview:tradeLinkGmApprovalPreview(actorEmail,actorModuleRole)}):
    renderReferenceModuleWorkflow(type,fieldValue,data,creatorName,{
     actorEmail,documentSaved:editing,documentId,workflowState,reviewStages,approvalFreePreview:approvalFree,gmPreview:tradeLinkGmApprovalPreview(actorEmail,actorModuleRole)}))+
   '<div class="tl-draft-actions">'+
    '<button type="button" class="secondary" data-action="tradelink-draft-clear">Clear form</button>'+
   '</div><p data-tradelink-draft-preview-status data-validation="pending" role="status" aria-live="polite" aria-atomic="true">'+
    (editing?'Saved revision '+escape(row?.revision??'—')+
     ' loaded. Changes remain local until Save Changes.':
     approvalFree?'Not saved. Save requests approval-free completion; choose Draft explicitly when needed.':
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
const draftVisibilityModes=Object.freeze([
 ['visible','Visible only'],['hidden','Hidden only'],['all','Visible and hidden']
]);
const draftSortFields=Object.freeze([
 ['createdAt','Date created'],['documentNumber','Document number'],
 ['documentType','Document module'],['revision','Revision'],['updatedAt','Last updated']
]);
const draftSortDirections=Object.freeze([['asc','Ascending'],['desc','Descending']]);
const matchAllowed=(list,value,fallback)=>list.some(([key])=>key===value)?value:fallback;
const normalizeTradeLinkDate=value=>{
 const date=typeof value==='string'?value.trim():'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const parsed=new Date(date+'T00:00:00.000Z');
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:null;
};
export function initialTradeLinkDraftListFilters(){
 return {query:'',documentType:'all',workflowState:'all',archiveMode:'active',
  visibilityMode:'visible',sortBy:'createdAt',sortDirection:'desc',updatedFrom:null,updatedTo:null};
}
export function normalizeTradeLinkDraftListFilters(input={}){
 const f=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 return {
  query:String(typeof f.query==='string'?f.query:'').trim().slice(0,120).toLowerCase(),
  documentType:matchAllowed(draftListTypes,f.documentType,'all'),
  workflowState:matchAllowed(draftListStates,f.workflowState,'all'),
  archiveMode:matchAllowed(draftArchiveModes,f.archiveMode,'active'),
  visibilityMode:matchAllowed(draftVisibilityModes,f.visibilityMode,'visible'),
  sortBy:matchAllowed(draftSortFields,f.sortBy,'createdAt'),
  sortDirection:matchAllowed(draftSortDirections,f.sortDirection,'desc'),
  updatedFrom:normalizeTradeLinkDate(f.updatedFrom),
  updatedTo:normalizeTradeLinkDate(f.updatedTo)
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
 const hidden=row.hidden===true;
 return (filters.visibilityMode==='all'||(filters.visibilityMode==='hidden'?hidden:!hidden))&&
  (filters.documentType==='all'||row.documentType===filters.documentType)&&
  (filters.workflowState==='all'||row.workflowState===filters.workflowState)&&
  (filters.archiveMode==='all'||
   (filters.archiveMode==='archived'?archived:!archived))&&
  [row.documentNumber,row.clientName,row.referenceNumber,row.poNumber].some(value=>
   String(value??'').toLowerCase().includes(filters.query));
}
/** Stable, bounded ordering of the current signed response only; no backend query. */
function sortTradeLinkDraftRows(rows,filters){
 const field=filters.sortBy,descending=filters.sortDirection==='desc';
 return [...rows].sort((left,right)=>{
  if(field==='createdAt'||field==='updatedAt'){
   const a=tradeLinkTimestamp(left?.[field]),b=tradeLinkTimestamp(right?.[field]);
   // Missing times stay last in either direction; never invent a record date.
   if(a===null||b===null)return a===b?0:a===null?1:-1;
   const timeOrder=descending?b-a:a-b;
   return timeOrder||String(right?.documentId||'').localeCompare(String(left?.documentId||''));
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
/** Bounded fallback search only; the active repository path searches on the server. */
export function filterTradeLinkDraftAuthorizedRows(rows,input={}){
 const filters=normalizeTradeLinkDraftListFilters(input);
 if(!Array.isArray(rows))return [];
 return sortTradeLinkDraftRows(rows.slice(0,50).filter(row=>
  tradeLinkDraftRowMatches(row,filters)),filters);
}
/** Reconcile selected IDs with retained snapshots and the current server page. */
export function mergeTradeLinkDocumentSelection(
 existingDocuments,pageRows,checkedIds,limit=50,existingDocumentIds
){
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)
  return {documents:[],documentIds:[],missingDocumentIds:[],overflow:false};
 const checked=checkedIds instanceof Set?checkedIds:new Set(
  Array.isArray(checkedIds)?checkedIds:[]);
 const sourceIds=existingDocumentIds===undefined?
  (Array.isArray(existingDocuments)?existingDocuments.map(row=>row?.documentId):[]):
  (existingDocumentIds instanceof Set?[...existingDocumentIds]:
   Array.isArray(existingDocumentIds)?existingDocumentIds:[]);
 const selectedIds=new Set(sourceIds.filter(validUuid));
 let overflow=false;
 for(const row of Array.isArray(pageRows)?pageRows:[]){
  const id=row?.documentId;
  if(!validUuid(id))continue;
  if(checked.has(id)){
   if(selectedIds.has(id)||selectedIds.size<limit)selectedIds.add(id);
   else overflow=true;
  }else selectedIds.delete(id);
 }
 if(selectedIds.size>limit)overflow=true;
 const selected=new Map();
 for(const row of Array.isArray(existingDocuments)?existingDocuments:[]){
  if(selectedIds.has(row?.documentId)&&validUuid(row?.documentId)&&
   Number.isSafeInteger(row?.revision)&&row.revision>0)
   selected.set(row.documentId,row);
 }
 // Prefer the current server page when it contains a newer row snapshot.
 for(const row of Array.isArray(pageRows)?pageRows:[]){
  if(selectedIds.has(row?.documentId)&&validUuid(row?.documentId)&&
   Number.isSafeInteger(row?.revision)&&row.revision>0)
   selected.set(row.documentId,row);
 }
 const documentIds=[...selectedIds];
 const documents=documentIds.map(id=>selected.get(id)).filter(Boolean);
 const missingDocumentIds=documentIds.filter(id=>!selected.has(id));
 return {documents,documentIds,missingDocumentIds,overflow};
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
   clientName:row.dataset?.clientName,
   referenceNumber:row.dataset?.referenceNumber,
   poNumber:row.dataset?.poNumber,
   documentType:row.dataset?.documentType,
   workflowState:row.dataset?.workflowState,
   archived:row.dataset?.archived==='true',
   hidden:row.dataset?.hidden==='true'
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
   createdAt:el.dataset?.createdAt,updatedAt:el.dataset?.updatedAt
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
 // Saved documents may contain up to 250 items. Never reuse the one-line
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
 const details=[...commonSummaryRowsFor(row.document_type),...localSummaryRows[row.document_type],
  ['customerContact','Contact Person'],['remarks','Remarks'],['customerAddress','Party address'],['referenceNumber','Source reference'],
  ['customerTin','Tax identity'],['dueDate','Due date'],['paymentTerms','Payment terms'],
  ['verifiedBy','Intended verifier'],['approvedBy','Intended approver']]
  .filter(([key],i,all)=>all.findIndex(([name])=>name===key)===i);
 const currency=currencyUnit(data.currency);
 const items=Array.isArray(data.items)?data.items.slice(0,TRADELINK_MAX_ITEMS):[];
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
function renderTradeLinkDraftList(rows,view,canManage,{readOnly=false,canReview=false,canCreate=canManage,actorEmail=''}={}){
 const creatorMode=canCreate&&!canManage;
 const enabled=TL03_DOMAIN_READS_ENABLED&&(view.sharedVisibility===true||canManage||canReview||canCreate)&&view.status==='AUTHORIZED_READ';
 const records=enabled?rows:[];
 const filters=normalizeTradeLinkDraftListFilters(view.listFilters);
 const selectedIds=new Set(Array.isArray(view.selectedDocumentIds)?view.selectedDocumentIds:[]);
 const page=readOnly&&enabled&&view.listPage?.server===true?view.listPage:null;
 const applied=page?normalizeTradeLinkDraftListFilters(page.appliedFilters):filters;
 const displayed=page?records:filterTradeLinkDraftAuthorizedRows(records,applied);
 const ordered=page?records:sortTradeLinkDraftRows(records,applied);
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
   '<label class="tl-draft-field"><span>Search document, client, reference or PO</span>'+
    '<input name="query" type="search" maxlength="120" autocomplete="off" '+
    'placeholder="'+(page?'Search documents, clients, references or PO numbers':'Search this authorized page')+
    '" value="'+escape(filters.query)+'" '+
    'data-tradelink-domain-filter aria-describedby="tl-draft-search-scope"'+disabledAttr+'></label>'+
   filterSelect('workflowState','Workflow state',draftListStates,filters.workflowState)+
  '</div>'+
  (readOnly?'<div class="tl-reference-document-datebar" aria-label="Filter the repository by last updated date">'+
   '<span class="tl-date-label">Last updated (UTC)</span>'+
   '<label for="tl-doc-updated-start"><span class="sr-only">Updated from</span><input id="tl-doc-updated-start" name="updatedFrom" type="date" value="'+escape(filters.updatedFrom||'')+'" data-tradelink-domain-filter data-tl-updated-start'+disabledAttr+'></label>'+
   '<span>to</span>'+
   '<label for="tl-doc-updated-end"><span class="sr-only">Updated through</span><input id="tl-doc-updated-end" name="updatedTo" type="date" value="'+escape(filters.updatedTo||'')+'" data-tradelink-domain-filter data-tl-updated-end'+disabledAttr+'></label>'+
   '<div class="tl-reference-date-presets">'+
   [['today','Today'],['week','This Week'],['month','This Month'],['30','Last 30 Days'],['clear','Clear']].map(([key,label])=>
    '<button type="button" data-action="tradelink-documents-date" data-range="'+key+'"'+disabledAttr+'>'+label+'</button>').join('')+
   '</div>'+
   '<button type="button" class="tl-ref-apply-filter" data-action="tradelink-documents-apply-dates"'+disabledAttr+'>Apply Date Range</button></div>':'')+
  '<details class="tl-ref-advanced-filters"><summary>More filters and sorting</summary>'+
   '<div class="tl-ref-advanced-filter-grid">'+
   filterSelect('documentType','Document module',draftListTypes,filters.documentType)+
   filterSelect('archiveMode','Archive status',draftArchiveModes,filters.archiveMode)+
   (canManage?filterSelect('visibilityMode','Visibility',draftVisibilityModes,filters.visibilityMode):'')+
   filterSelect('sortBy','Sort by',draftSortFields,filters.sortBy)+
   filterSelect('sortDirection','Sort order',draftSortDirections,filters.sortDirection)+
   '</div></details>'+
  (page?
   '<div class="tl-draft-pagination-controls" aria-label="Authorized document search">'+
    '<button type="button" class="secondary" data-action="tradelink-documents-search"'+
    (view.busy?' disabled':'')+'>Search documents</button>'+
    '<button type="button" class="secondary" data-action="tradelink-documents-previous"'+
    (!page.history?.length||view.busy?' disabled':'')+'>Previous page</button>'+
    '<span role="status">Page '+escape(page.pageIndex+1)+' · '+escape(page.totalCount)+' matches</span>'+
    '<button type="button" class="secondary" data-action="tradelink-documents-next"'+
    (!page.hasMore||view.busy?' disabled':'')+'>Next page</button></div>':'')+
  '<p id="tl-draft-search-scope" class="muted">'+
    (page?'Search, date filtering and sorting run against the complete TradeLink repository in the database. Search includes document number, client name, reference number and PO number. Results use stable 50-record pages. Select Search documents to apply changed criteria.':
      'This is a bounded fallback response. Global search, sorting and date filtering require the unified server repository query.')+
   '</p>'+
  '<div class="tl-ref-selection-row"><p data-tradelink-domain-count role="status" aria-live="polite" aria-atomic="true">'+
   (page?displayed.length+' of '+page.totalCount+' matching documents · Page '+(page.pageIndex+1):
    displayed.length+' of '+records.length+' documents in this response')+'</p>'+
   (readOnly&&!canReview?(()=>{
    const selection=mergeTradeLinkDocumentSelection(
     view.selectedDocuments,displayed,selectedIds,50,[...selectedIds]);
    const selectedRows=selection.documents;
    const selectedCount=selection.documentIds.length;
    const selectedHidden=selectedRows.filter(row=>row.hidden===true).length;
    const selectionComplete=selection.missingDocumentIds.length===0&&!selection.overflow;
    const selectionMessage=selection.overflow?
     'Maximum of 50 documents per bulk action. Deselect an item to add another.':
     selection.missingDocumentIds.length?
      selection.missingDocumentIds.length+' selected document(s) are not loaded. Clear and reselect them before bulk actions.':
      selectedCount?selectedCount+' selected across pages. Up to 50 documents per bulk action.':
       'Selection is retained across pages; select up to 50 documents.';
    const busy=view.busy===true;
    return '<div class="tl-ref-selection-controls"><span data-tl-selected-count role="status" aria-live="polite">'+selectedCount+' selected across pages</span>'+
     '<button type="button" data-action="tradelink-documents-export-selection"'+(selectedCount&&selectionComplete&&!busy?'':' disabled')+'>Export selected CSV</button> '+
     (canManage?'<button type="button" data-action="tradelink-documents-delete-selection"'+(selectedCount&&selectionComplete&&!busy?'':' disabled')+'>Delete Selected</button> '+
      '<button type="button" data-action="tradelink-documents-hide-selection"'+(selectedCount&&selectionComplete&&selectedHidden===0&&!busy?'':' disabled')+'>Hide Selected</button> '+
      '<button type="button" data-action="tradelink-documents-unhide-selection"'+(selectedCount&&selectionComplete&&selectedHidden===selectedCount&&!busy?'':' disabled')+'>Unhide Selected</button> ':'')+
     '<button type="button" data-action="tradelink-documents-clear-selection"'+(selectedCount&&!busy?'':' disabled')+'>Clear selection</button>'+
     '<span data-tl-selection-feedback role="status">'+selectionMessage+'</span></div>';
   })():'')+
   '</div>'+
  (records.length?
   '<div class="tl-records-scroll"><table class="tl-records-table">'+
    '<caption>'+(canReview&&!creatorMode?'Documents assigned to the signed account':readOnly?'Authorized TradeLink documents':'Authorized TradeLink Draft records')+
     (page?' · page '+(page.pageIndex+1):' · current response')+'</caption>'+
    '<thead><tr>'+(readOnly&&!canReview?'<th class="tl-ref-select-column" scope="col"><input id="tl-select-visible-documents" type="checkbox" data-tl-select-all aria-label="Select all documents on this page"'+(view.busy||selectedIds.size>=50&&displayed.some(row=>!selectedIds.has(row.documentId))?' disabled':'')+' /></th>':'')+
    '<th class="tl-ref-row-number" scope="col">No.</th><th class="tl-ref-doc-number" scope="col">Document Number</th><th class="tl-ref-client-name" scope="col">Client Name</th>'+
    '<th class="tl-ref-created-by" scope="col">Created By</th><th class="tl-ref-module" scope="col">Module</th><th class="tl-ref-created-at" scope="col">Created</th>'+
    '<th class="tl-ref-updated-at" scope="col">Last updated</th><th class="tl-ref-workflow-status" scope="col">Workflow Status</th>'+
    '<th class="tl-ref-revision-column" scope="col">Rev. No.</th><th scope="col">Actions</th>'+
    '</tr></thead><tbody data-tradelink-domain-list-body>'+
    ordered.map((row,index)=>{
     const match=page?true:tradeLinkDraftRowMatches(row,applied);
     const ownerDraft=creatorMode&&row.createdByActor===true&&
      row.workflowState==='draft'&&!row.archived;
     const clientName=typeof row.clientName==='string'&&row.clientName.trim()?row.clientName:'—';
     const createdByName=typeof row.createdByName==='string'&&row.createdByName.trim()?row.createdByName:'—';
     const canEditRow=ownerDraft||((canManage||view.sharedVisibility===true)&&TL03_DOMAIN_WRITES_ENABLED&&
      !row.archived&&['draft','for-approval','revision-required','approved'].includes(row.workflowState));
     return '<tr data-tradelink-domain-record data-document-id="'+escape(row.documentId)+'" data-document-number="'+
      escape(row.documentNumber)+'" data-client-name="'+escape(row.clientName??'')+
      '" data-reference-number="'+escape(row.referenceNumber??'')+'" data-po-number="'+
      escape(row.poNumber??'')+'" data-document-type="'+escape(row.documentType)+
      '" data-workflow-state="'+escape(row.workflowState)+'" data-revision="'+
      escape(row.revision)+'" data-created-at="'+escape(tradeLinkTimestamp(row.createdAt)===null?'':row.createdAt)+
      '" data-updated-at="'+escape(tradeLinkTimestamp(row.updatedAt)===null?'':row.updatedAt)+'" data-archived="'+
      (row.archived===true?'true':'false')+'" data-hidden="'+(row.hidden===true?'true':'false')+'"'+(match?'':' hidden')+'>'+
      (readOnly&&!canReview?'<td class="tl-ref-select-column"><input id="tl-select-'+escape(row.documentId)+'" type="checkbox" data-tl-select-document data-document-id="'+escape(row.documentId)+'"'+(match&&selectedIds.has(row.documentId)?' checked':'')+(view.busy||selectedIds.size>=50&&!selectedIds.has(row.documentId)?' disabled':'')+' aria-label="Select document '+escape(row.documentNumber)+'" /></td>':'')+
      '<td class="tl-ref-row-number">'+escape((page?page.pageIndex*50:0)+index+1)+'</td>'+
      '<td class="tl-ref-doc-number">'+escape(row.documentNumber)+'</td>'+
      '<td class="tl-ref-client-name" title="'+escape(clientName)+'"><span class="tl-ref-cell-truncate">'+escape(clientName)+'</span></td>'+
      '<td class="tl-ref-created-by" title="'+escape(createdByName)+'"><span class="tl-ref-cell-truncate">'+escape(createdByName)+'</span></td>'+
      '<td class="tl-ref-module">'+escape(tradeLinkDocumentLabel(row.documentType))+'</td>'+
      '<td class="tl-ref-created-at">'+renderTradeLinkTimestamp(row.createdAt)+'</td>'+
      '<td class="tl-ref-updated-at">'+renderTradeLinkTimestamp(row.updatedAt)+'</td>'+
      '<td class="tl-ref-workflow-status">'+renderTradeLinkWorkflowBadge(row.workflowState,row.archived)+'</td>'+
      '<td class="tl-ref-revision-column"><span class="tl-ref-revision">'+escape(row.revision)+'</span></td>'+
      (readOnly?'<td class="tl-ref-actions-cell">'+(
       '<button type="button" class="tl-ref-row-action-trigger" popovertarget="tl-doc-menu-'+escape(row.documentId)+'" aria-label="Actions for '+escape(row.documentNumber)+'" title="Document actions">⋯</button>'+
       '<div popover="auto" data-tradelink-action-menu id="tl-doc-menu-'+escape(row.documentId)+'" class="tl-ref-actions-menu">'+
       (()=>{
        const statusTargets=tradeLinkStatusUpdateTargets(row.workflowState);
        const canPrint=(canManage||(creatorMode&&row.createdByActor===true))&&
         row.workflowState==='approved';
        const reviewerStage=canReview&&!canManage&&
         ['primary','secondary'].includes(row.assignedStage)&&
         row.workflowState==='for-approval'&&!row.archived;
        const stage=row.assignedStage;
        const recordedAt=stage==='primary'?row.primaryAt:row.secondaryAt;
        const exempt=row.approvalPolicy===GM_SALES_EXEMPT_POLICY;
        const actions=[];
        if(canEditRow&&tradeLinkDraftEditHref(row.documentId)){
         actions.push('<a class="secondary" data-tradelink-document-edit href="'+
          escape(tradeLinkDraftEditHref(row.documentId))+'">'+
          'Preview/Edit'+'</a>');
        }else{
         actions.push('<button type="button" class="secondary" data-action="tradelink-document-open" '+
          'data-id="'+escape(row.documentId)+'"'+(view.busy?' disabled':'')+
          '>View document</button>');
        }
        actions.push('<button type="button" class="secondary" data-action="tradelink-document-open" '+
         'data-id="'+escape(row.documentId)+'"'+(view.busy?' disabled':'')+
         '>Revision history &amp; details</button>');
        actions.push('<button type="button" class="secondary" data-action="tradelink-document-print" '+
         'data-id="'+escape(row.documentId)+'"'+
         (view.busy||!canPrint?' disabled title="'+
          (row.workflowState!=='approved'?'PDF printing is available only after approval':
           'PDF printing is available only to the document creator or manager')+'"':'')+
         '>Print PDF</button>');
        if(!row.archived&&statusTargets.length){
         const statusDisabled=!canManage||view.busy;
         actions.push('<label class="tl-reference-status-action"><span>Change status</span>'+
          '<select data-tradelink-status-select data-id="'+escape(row.documentId)+'"'+
          (statusDisabled?' disabled title="Status updates require existing document management access"':'')+'>'+
          options(statusTargets,row.workflowState)+
          '</select></label><button type="button" class="secondary" '+
          'data-action="tradelink-document-status-update" data-id="'+escape(row.documentId)+'" '+
          'data-current-state="'+escape(row.workflowState)+'"'+
          (statusDisabled?' disabled title="Status updates require existing document management access"':'')+
          '>Save status</button>');
        }
        if(reviewerStage&&!recordedAt&&!(exempt&&stage==='primary')){
         actions.push('<button type="button" class="primary" data-action="tradelink-document-review-stage" '+
          'data-id="'+escape(row.documentId)+'" data-stage="'+escape(stage)+'"'+
          (view.busy?' disabled':'')+'>Use Time Now</button>');
        }
        return actions.join(' ');
       })()+

       (canManage&&TL03_WORKFLOW_SUBMIT_ENABLED&&
        ['draft','revision-required'].includes(row.workflowState)&&!row.archived?
        '<button type="button" class="secondary" data-action="tradelink-document-check-readiness" '+
         'data-id="'+escape(row.documentId)+'">Check readiness</button> ':'')+
       (canManage&&['draft','revision-required'].includes(row.workflowState)&&!row.archived?
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
    '>'+(page?'No documents match the current repository filters.':'No matching records in this authorized response.')+'</p>':
   '<p class="muted" role="status" aria-live="polite">'+(view.busy?'Loading the signed TradeLink document list…':
    enabled?'No documents match the current TradeLink workspace filters.':
    view.status==='READ_FAILED'?'The signed document list could not be loaded. Refresh to retry; no local or cached records are being shown.':
    'The signed document list has not been loaded. Select Refresh to retrieve the current authorized records.')+'</p>')+
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
function renderTradeLinkRevisionHistory(revisions,{
 documentId,selectedRevision,canManage=false,busy=false
}={}){
 if(!Array.isArray(revisions)||!revisions.length)return '';
 return '<section class="tl-document-revision-history" aria-labelledby="tl-revision-history-title">'+
  '<div class="tl-revision-history-heading"><h3 id="tl-revision-history-title">Revision history</h3>'+
   '<span>'+escape(revisions.length)+' saved '+(revisions.length===1?'revision':'revisions')+'</span></div>'+
  '<ol>'+revisions.map(row=>{
   const current=row.current===true;
   const state=row.approved===true?'Approved':row.workflowState.replaceAll('-',' ');
   const stamp=new Date(row.revisionAt).toLocaleString('en-PH');
   const warning=row.snapshotSource==='baseline'&&row.revision>1?
    '<p class="tl-revision-history-warning">Earlier revisions were not retained before revision history activation.</p>':'';
   return '<li class="tl-revision-history-item'+(row.revision===selectedRevision?' is-selected':'')+'">'+
    '<div class="tl-revision-history-meta"><strong>Revision '+escape(row.revision)+'</strong>'+
     '<span class="tl-revision-state'+(row.approved?' is-approved':'')+'">'+escape(state)+'</span>'+
     (current?'<span class="tl-revision-current">Current</span>':'')+
     '<small>'+escape(stamp)+'</small></div>'+
    '<div class="tl-revision-history-actions">'+
     '<button type="button" class="secondary" data-action="tradelink-document-revision-open"'+
      ' data-id="'+escape(documentId)+'" data-revision="'+escape(row.revision)+'"'+
      (busy||row.revision===selectedRevision?' disabled':'')+'>View</button>'+
     (canManage&&row.approved?
      '<button type="button" class="secondary" data-action="tradelink-document-revision-print"'+
       ' data-id="'+escape(documentId)+'" data-revision="'+escape(row.revision)+'"'+
       (busy?' disabled':'')+'>Print PDF</button>':'')+
    '</div>'+warning+'</li>';
  }).join('')+'</ol></section>';
}
export function renderTradeLinkChequeClearance(record,status,busy=false){
 if(record?.document_type!=='payment'||!['closed','completed'].includes(record.workflow_state)||
    !(Number(record.content?.chequeAmount)>0))return '';
 if(!status||status.documentId!==record.id||status.revision!==record.revision)
  return '<section class="tl-content-panel"><h3>Bank clearance</h3><p>Clearance status unavailable. Refresh the document to retry.</p></section>';
 return '<section class="tl-content-panel"><h3>Bank clearance</h3>'+
  (status.clearedAt?'<p>Cleared · '+escape(new Date(status.clearedAt).toLocaleString('en-PH'))+'</p>':
   '<p>Pending bank clearance. Confirm actual bank clearance before recording.</p>'+
   '<button type="button" class="primary" data-action="tradelink-cheque-clearance" data-id="'+escape(record.id)+'"'+(busy?' disabled':'')+'>Record Bank Clearance</button>')+'</section>';
}
export function renderTradeLinkDocumentRepository({detail,workspaceId,
 view=initialTradeLinkDraftView(),canManage=false,canReview=false,canCreate=canManage,actorId='',actorEmail=''}={}){
 if(!isTradeLinkBoard(detail?.board)||detail.board.id!==TRADELINK_BOARD_ID||
  detail.board.workspace_id!==workspaceId)
  return '<section class="tl-content-panel" role="alert">Signed TradeLink document workspace unavailable.</section>';
 const creatorMode=canCreate&&!canManage;
 const rows=TL03_DOMAIN_READS_ENABLED&&(view.sharedVisibility===true||canManage||canReview||canCreate)&&
  view.status==='AUTHORIZED_READ'&&Array.isArray(view.rows)?view.rows:[];
 const selection=view.documentPreview;
 const latestRecord=selection?.latestRecord||selection?.record;
 const selectedRecord=selection?.record;
 const linked=rows.find(item=>item.documentId===selection?.documentId&&
  item.boardItemId===latestRecord?.board_item_id&&item.revision===latestRecord?.revision&&
  item.documentNumber===latestRecord?.document_number);
 let selectedPreview='';
 if(linked&&selectedRecord){
  try{selectedPreview=renderTradeLinkSavedDocumentPreview(selectedRecord,workspaceId,selection.documentId);}
  catch{selectedPreview='';}
 }
 return '<section class="tl-content-panel tl-document-repository" data-tl-screen="documents" aria-labelledby="tl-domain-repository-title">'+
  '<div class="tl-panel-heading tl-reference-repository-actions">'+
   '<h2 id="tl-domain-repository-title">All Documents <span class="tl-ref-count-badge">'+
    escape(view.listPage?.server===true&&Number.isSafeInteger(view.listPage.totalCount)?
     view.listPage.totalCount:rows.length)+'</span></h2>'+
   '<div class="tl-reference-repository-buttons">'+
   (canCreate&&TL03_DOMAIN_WRITES_ENABLED?'<a class="primary" href="'+tradeLinkApplicationHref('drafts/quotation')+'">Create New Document</a>':'')+
   '<button type="button" class="secondary" data-action="tradelink-documents-refresh"'+
   (!TL03_DOMAIN_READS_ENABLED||(!view.sharedVisibility&&!canManage&&!canReview&&!canCreate)||view.busy?' disabled':'')+'>Refresh</button>'+
   '</div></div>'+
  (view.error?'<p role="alert">'+escape(view.error)+'</p>':'')+
  (view.message?'<p role="status">'+escape(view.message)+'</p>':'')+
  '<div class="tl-document-list-pane">'+renderTradeLinkDraftList(rows,view,canManage,{readOnly:true,canReview,canCreate,actorEmail})+'</div>'+
  (selectedPreview?
   '<section class="tl-document-detail-view" aria-label="Selected document details">'+
     (linked&&(view.sharedVisibility===true||canManage||(creatorMode&&linked.createdByActor===true&&linked.workflowState==='draft'))&&
      selectedRecord.revision===linked.revision&&TL03_DOMAIN_WRITES_ENABLED&&
      ['draft','for-approval','revision-required','approved'].includes(linked.workflowState)&&!linked.archived&&
      tradeLinkDraftEditHref(linked.documentId)?
      '<p class="tl-document-edit-action"><a class="secondary" data-tradelink-document-edit href="'+
       escape(tradeLinkDraftEditHref(linked.documentId))+'">'+
       'Preview/Edit'+'</a></p>':'')+
     '<div class="tl-document-preview-close"><button type="button" class="secondary" data-action="tradelink-document-preview-close">Close document preview</button></div>'+
     renderTradeLinkRevisionHistory(selection.revisions,{
      documentId:selection.documentId,selectedRevision:selectedRecord.revision,
      canManage:canManage||(creatorMode&&linked?.createdByActor===true),busy:view.busy
     })+selectedPreview+
     (linked&&canManage&&selectedRecord.revision===linked.revision?
      renderTradeLinkChequeClearance(selectedRecord,selection.chequeClearance,view.busy):'')+
     (linked&&canManage&&selectedRecord.revision===linked.revision&&TL03_ATTACHMENTS_ENABLED?
      renderTradeLinkDocumentAttachments(selection?.attachments,{
       documentId:linked.documentId,workspaceId,
       editable:!linked.archived&&['draft','revision-required'].includes(linked.workflowState),
       busy:view.busy
      }):'')+
     (linked&&canManage&&selectedRecord.revision===latestRecord.revision?
      renderTradeLinkSavedWorkflowHistory(selection?.events):'')+
   '</section>':'')+'</section>';
}
export function renderTradeLinkDraftWorkspace({detail,workspaceId,view=initialTradeLinkDraftView(),canManage=false,canCreate=canManage,actorId='',actorName='',actorEmail='',showModuleTabs=true,actorModuleRole='',moduleNavigation=''}={}){
 if(!isTradeLinkBoard(detail?.board)||detail.board.id!==TRADELINK_BOARD_ID||
   detail.board.workspace_id!==workspaceId)
  return '<section role="alert" class="tl-draft-panel">Signed TradeLink workspace unavailable.</section>';
 const rows=TL03_DOMAIN_READS_ENABLED&&(canManage||canCreate)&&view.status==='AUTHORIZED_READ'&&Array.isArray(view.rows)?view.rows:[];
 const ownerSelected=canCreate&&validUuid(actorId)&&view.canEditOwnDraft===true&&view.selected?.record?.created_by===actorId;
 const selected=TL03_DOMAIN_READS_ENABLED&&(canManage||ownerSelected||view.canEditExisting===true)&&view.mode==='edit'&&view.selected?.documentId?
   view.selected:null;
 const pendingEdit=view.editRequestId&&!selected;
 return '<div class="tl-draft-workspace">'+
  (pendingEdit?'<section class="tl-draft-panel" '+
    'role="'+(view.error?'alert':'status')+'">'+
    '<h2>Open saved Draft</h2><p>'+
    escape(view.error||'Verifying the signed document and its latest revision…')+
    '</p><a class="secondary" href="'+tradeLinkApplicationHref('documents')+'">Back to All Documents</a></section>':
   renderEditor(selected?.record,view.mode,canManage,
   view.mode==='edit'&&!selected?null:view.formValues,view.draftNotice||'',
   view.error||'',view.message||'',view.lineDrafts,actorName,actorEmail,view.reviewStages||null,showModuleTabs,
   canCreate,view.canEditExisting===true||view.canEditOwnDraft===true,actorModuleRole,moduleNavigation,actorId))+
  '</div>';
}
