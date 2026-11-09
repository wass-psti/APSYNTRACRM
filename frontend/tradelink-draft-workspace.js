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
 TL03_WORKFLOW_OPERATIONAL_ENABLED,validateTradeLinkDraftEnvelope,
 normalizeTradeLinkDomainRow} from './tradelink-domain-client.js';

export const TL03_DRAFT_INTERFACE_ENABLED=true; // presentation only
const typeLabels=Object.freeze([
 ['esi','Electronic SI'],['packing','Packing List'],['delivery','Delivery Receipt'],
 ['payment','Payment AR'],['quotation','Quotation'],['po','PO to Suppliers']
]);
const currencies=TRADELINK_CURRENCIES;
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
 for(const key of ['customerName','referenceNumber','remarks',
  'verifiedBy','verifiedByEmail','approvedByEmail'])addText(key);
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
  ids=lineValues('lineId'),serials=lineValues('lineSerialNumber');
 const count=Math.max(descriptions.length,quantities.length,prices.length,
  units.length,ids.length,serials.length);
 const anyLine=[...descriptions,...quantities,...prices,...units,...ids,...serials]
  .some(Boolean);
 if(physical||priced||anyLine){
  if(count<1||count>100)throw new ApiError('Invalid Draft line-item count.',400);
  draft.items=[];
  for(let index=0;index<count;index++){
   const description=descriptions[index]||'',quantity=quantities[index]||'',
    unitPrice=physical?'':prices[index]||'',unit=units[index]||'';
   if(!description||!quantity||(!physical&&!unitPrice))
    throw new ApiError('Line item requires description, quantity and unit price where applicable.',400);
   const q=Number(quantity),price=physical?0:Number(unitPrice);
   if(!Number.isFinite(q)||!Number.isFinite(price)||q<0||price<0||
      q>1000000000||price>1000000000||((physical||priced)&&q===0)||
      (priced&&price===0))
    throw new ApiError('Invalid Draft line quantity or unit price.',400);
   const id=ids[index]||lineId(index);
   if(typeof id!=='string'||!id||id.length>120)
    throw new ApiError('Could not create a valid line-item identifier.',400);
   const item={id,kind:'item',description,quantity:q,unitPrice:price,
    ...(unit?{unit}:{})};
   if(type==='delivery'){
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
 const expectedRevision=selected?.record?.revision??0;
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
  throw new ApiError('Invalid saved Draft revision.',409);
 const pending=view?.pendingCreateDraft;
 const draft=parseTradeLinkDraftForm(fields,{lineId:index=>pending?.items?.[index]?.id||lineId(index)});
 const id=selected?.documentId||view?.pendingCreateId||documentId();
 if(!selected&&pending&&JSON.stringify(pending)!==JSON.stringify(draft))
  throw new ApiError('A previous save may have succeeded. Refresh All Documents before changing this Draft.',409);
 return {documentId:id,expectedRevision,draft,
  pendingCreateDraft:selected?null:pending||draft};
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
 async save({documentId,expectedRevision=0,draft,workflowState='draft'}={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)disabled();
  const payload=validateTradeLinkDraftEnvelope(draft);
  const id=documentId||globalThis.crypto?.randomUUID?.();
  const operation=expectedRevision===0?'create':'update';
  return this.client.commit({documentId:id,expectedRevision,operation,
   draft:payload,expectedState:workflowState});
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
function renderCommercialReadiness(type,fieldValue,data){
 const input=(label,name,attrs='maxlength="5000" required')=>
  field(label,name,fieldValue(name,data[name]||''),attrs);
 const note='<p class="muted">Readiness is local only. Reviewer and approver names do not assign roles, grant approval, or submit a workflow.</p>';
 // All existing supported commercial contact and terms inputs now sit in
 // Client Information, as the uploaded reference shows. Reviewer inputs stay
 // in the final source-defined readiness section; no inputs are duplicated.
 if(type==='esi')return '<fieldset class="tl-draft-lines"><legend>Electronic SI readiness · preview only</legend>'+
  input('Intended finance verifier','verifiedBy')+
  input('Intended management approver','approvedBy')+'</fieldset>'+note;
 if(type==='quotation')return '<fieldset class="tl-draft-lines"><legend>Quotation readiness · preview only</legend>'+
  input('Intended approver','approvedBy')+'</fieldset>'+note;
 if(type==='po')return '<fieldset class="tl-draft-lines"><legend>Supplier PO readiness · preview only</legend>'+
  input('Intended Account Manager reviewer','verifiedBy')+
  input('Intended final approver','approvedBy')+'</fieldset>'+note;
 return '';
}

/** One unsaved priced line; reuse the authoritative source calculation formula. */
export function calculateTradeLinkDraftLocalAmounts(fields){
 if(!fields||typeof fields.get!=='function')return null;
 const value=name=>String(fields.get(name)??'').trim();
 if(!['esi','quotation','po'].includes(value('documentType')))return null;
 const rows=name=>(typeof fields.getAll==='function'?
  fields.getAll(name):[fields.get(name)]).map(v=>String(v??'').trim());
 const quantities=rows('lineQuantity'),prices=rows('lineUnitPrice');
 const count=Math.max(quantities.length,prices.length);
 const currency=value('currency'),vatType=value('vatType');
 if(count<1||count>100||!currencies.includes(currency)||
    !TRADELINK_VAT_CODES.includes(vatType))return null;
 const items=[];
 for(let i=0;i<count;i++){
  const q=quantities[i]||'',p=prices[i]||'';
  if(!/^\d+(?:\.\d+)?$/.test(q)||!/^\d+(?:\.\d+)?$/.test(p))return null;
  const quantity=Number(q),unitPrice=Number(p);
  if(!Number.isFinite(quantity)||!Number.isFinite(unitPrice)||
    quantity<=0||unitPrice<=0||quantity>1000000000||unitPrice>1000000000)
   return null;
  items.push({kind:'item',quantity,unitPrice});
 }
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
    (lines.length>1?lines.map(x=>String(x.unitPrice??'')):[value('lineUnitPrice')]):[]});
 const unit=currencyUnit(value('currency'));
 const display=key=>initial&&initial[key]!==null?formatTradeLinkAmount(initial[key]):'—';
 return '<section class="tl-draft-finance" data-tradelink-draft-finance '+
  'aria-label="Source-aligned local commercial estimate">'+
  '<h4>Local commercial estimate</h4>'+
  '<p class="muted">One priced item using the source discount, VAT and currency rules. '+
  'All amounts remain unsaved. No exchange rate or approval is inferred.</p>'+
  '<div class="tl-draft-finance-inputs">'+
   '<label class="tl-draft-field"><span>Discount method</span>'+
    '<select name="discountType" aria-describedby="tl-draft-discount-help">'+
    options([['percentage','Percentage'],['fixed','Fixed amount']],value('discountType'))+
   '</select></label>'+
   field('Discount value','discountValue',value('discountValue'),
    'type="number" min="0" max="1000000000000" step="any" aria-describedby="tl-draft-discount-help"')+
   '<label class="tl-draft-field"><span>PHP conversion rate (PHP per 1 '+
    '<span data-tradelink-draft-fx-base>'+escape(unit)+'</span>)</span>'+
    '<input name="exchangeRate" value="'+escape(value('exchangeRate'))+
    '" type="number" min="0" max="1000000000000" step="any" '+
    'aria-describedby="tl-draft-fx-help"></label>'+
  '</div>'+
  '<p id="tl-draft-discount-help" class="tl-draft-help">Percentage: 0–100. '+
   'Fixed discount: amount in the selected currency.</p>'+
  '<p id="tl-draft-fx-help" class="tl-draft-help">Optional for non-PHP currencies. '+
   'Enter the number of Philippine pesos for one unit of the selected currency. '+
   'Ignored for PHP. No external exchange-rate lookup occurs.</p>'+
  '<dl class="tl-draft-finance-results">'+
  [['subtotal','Subtotal'],['discount','Discount'],['taxable','Taxable'],
   ['vat','VAT'],['total','Total'],['phpEquivalent','PHP equivalent']].map(([key,label])=>
   '<div><dt>'+label+(key==='phpEquivalent'?' (PHP)':
    ' (<span data-tradelink-draft-denomination="'+key+'">'+escape(unit)+'</span>)')+
   '</dt><dd data-tradelink-draft-amount="'+key+'">'+
    display(key)+'</dd></div>').join('')+
  '</dl><p class="muted">Currency: <span data-tradelink-draft-amount-currency>'+
  escape(initial?.currency||'—')+'</span></p>'+
  '<p data-tradelink-draft-finance-status role="status" aria-live="polite" aria-atomic="true">'+
  (initial?(initial.currency!=='PHP'&&initial.phpEquivalent===null?
   'Selected-currency estimate only. Enter a positive PHP exchange rate for conversion. Nothing saved.':
   'Unsaved estimate only. Validate the Draft separately; nothing was transmitted.'):
   'Enter valid positive quantity, price, discount, currency and VAT to preview amounts.')+
  '</p><p class="muted">Local estimate only · no Draft save, payment, transaction or approval.</p>'+
  '</section>';
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
  ['lineQuantity','Quantity'],['lineUnit','Unit']],
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
function referenceDraftTabs(type){
 const base='#/boards/'+TRADELINK_BOARD_ID+'/tradelink/drafts/';
 return '<nav class="tl-reference-document-tabs" aria-label="TradeLink document modules">'+
 typeLabels.map(([key,label])=>
  '<a href="'+base+escape(key)+'"'+(key===type?' class="active" aria-current="page"':'')+
  '>'+escape(key==='quotation'?'Quotations':label)+'</a>').join('')+'</nav>';
}
function referenceDocumentHeader(type,editing,canSave=false){
 const title=referenceTitles[type]||'TradeLink Draft';
 return '<div class="tl-reference-document-topcard"><header class="tl-reference-document-heading">'+
   '<div class="tl-reference-document-title">'+
    '<span class="tl-reference-document-icon" aria-hidden="true">'+
     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">'+
     '<path d="M8 3h7l5 5v12a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>'+
     '<path d="M15 3v6h5M8 13h8M8 17h8"/></svg></span>'+
    '<div><h3 id="tl-draft-editor-title">'+escape(title)+'</h3>'+
     '<p class="tl-reference-draft-status">'+
      (editing?'Signed Draft loaded · unsaved edits':'Prepare a Draft · unsaved local · no document created')+
     '</p></div></div>'+
   '<div class="tl-reference-document-toolbar" aria-label="Document actions">'+
    '<button type="button" class="tl-reference-tool" disabled title="Templates are not activated in APSYNTRA CRM">Templates</button>'+
    '<button type="button" class="tl-reference-tool" disabled title="PDF generation requires an authorized workflow">Generate PDF</button>'+
    '<button type="button" class="tl-reference-primary" data-action="tradelink-draft-preview">Validate locally</button>'+
    '<button type="button" class="tl-reference-save" data-action="tradelink-draft-submit"'+
     (canSave?'':' disabled title="Production Draft writes are not activated"')+
     '>Save Draft</button>'+
   '</div>'+
  '</header>'+
  '<p class="tl-reference-workflow-notice" role="note">'+
   'Validate Draft inputs locally, then Save Draft to create or update the signed database record '+
   'and its linked Board item. Submission, approvals, Templates and PDF export remain unavailable.'+
  '</p></div>';
}
/** Render one existing or newly added item; all untrusted fields are escaped. */
export function renderTradeLinkDraftLineItem(item={},type='quotation',currency='PHP',index=0){
 const physical=type==='packing'||type==='delivery',priced=['esi','quotation','po'].includes(type);
 const req=(physical||priced)?' required':'';
 const label='Item '+String(index+1);
 return '<div class="tl-reference-line-item" data-tradelink-line-item>'+
  '<div class="tl-panel-heading"><strong>'+escape(label)+'</strong>'+
   '<button type="button" class="secondary" data-action="tradelink-draft-remove-line" aria-label="Remove '+
    escape(label)+'">Remove item</button></div>'+
  field('Description','lineDescription',item.description??'','maxlength="2000"'+req)+
  field('Quantity','lineQuantity',item.quantity??'',
   'type="number" min="0" max="1000000000" step="any"'+req)+
  (physical?'':moneyField('Unit price','lineUnitPrice',item.unitPrice??'',currency,
    'type="number" min="0" max="1000000000" step="any"'+(priced?' required':'')))+
  field('Unit','lineUnit',item.unit??'','maxlength="120"')+
  (type==='delivery'?field('Serial / asset number (optional)','lineSerialNumber',
    item.serialNumber??'','maxlength="120"'):'')+
  '<input type="hidden" name="lineId" value="'+escape(item.id??'')+'">'+
  '</div>';
}
/** Snapshot in-memory editor rows without creating records or using storage. */
export function snapshotTradeLinkDraftLineItems(form){
 if(!form?.querySelectorAll)return [];
 return [...form.querySelectorAll('[data-tradelink-line-item]')].map(row=>{
  const get=name=>row.querySelector('[name="'+name+'"]')?.value??'';
  return {id:get('lineId'),description:get('lineDescription'),
   quantity:get('lineQuantity'),unitPrice:get('lineUnitPrice'),
   unit:get('lineUnit'),serialNumber:get('lineSerialNumber')};
 });
}
function renderEditor(row,mode,canManage,formValues=null,draftNotice='',error='',message='',lineDrafts=null){
 const editing=mode==='edit'&&
  ['draft','revision-required'].includes(row?.workflow_state)&&
  row.content&&typeof row.content==='object'&&
  (!Array.isArray(row.content.items)||row.content.items.length<=100);
 const data=editing?row.content:{};
 const fieldValue=(name,fallback='')=>formValues&&Object.hasOwn(formValues,name)?formValues[name]:fallback;
 const line=Array.isArray(data.items)?data.items[0]||{}:{};
 const writeEnabled=editing||mode==='create';
 const live=TL03_DOMAIN_WRITES_ENABLED&&canManage&&writeEnabled;
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
  referenceDocumentHeader(type,editing,live)+
  (error?'<p class="tl-draft-feedback" role="alert">'+escape(error)+'</p>':'')+
  (message?'<p class="tl-draft-feedback" role="status">'+escape(message)+'</p>':'')+
  (editing?'<div class="tl-draft-editor-navigation">'+
   '<a class="secondary" href="#/boards/'+TRADELINK_BOARD_ID+
   '/tradelink/documents">Back to All Documents</a> '+
   '<button type="button" class="secondary tl-reference-new-draft" data-action="tradelink-draft-new">New Draft</button>'+
   '</div>':'')+
  (mode==='edit'&&!editing?'<p role="alert">This record cannot be edited with the bounded Phase 1 editor.</p>':'')+
  (draftNotice?'<p class="tl-draft-feedback" role="status">'+escape(draftNotice)+'</p>':'')+
  '<div class="tl-reference-editor-content">'+referenceDraftTabs(type)+
  '<form data-tradelink-draft-form>'+
   // Retain existing module form control for source contract/tests. The
   // horizontal tab links are the visible accessible module switcher.
   '<div class="tl-reference-sr-only"><label class="tl-draft-field"><span>Document module</span>'+
    '<select name="documentType" tabindex="-1" aria-hidden="true" '+(editing?'disabled':'')+'>'+
     options(typeLabels,type)+'</select></label></div>'+
   (editing?'<input type="hidden" name="documentType" value="'+escape(type)+'">':'')+
   '<section class="tl-reference-form-section tl-reference-document-info">'+
    '<h4>Document Information</h4>'+
    '<div class="tl-reference-document-grid">'+
     '<div class="tl-reference-static-field"><span>Status</span>'+
      '<output>'+(editing&&row?.workflow_state==='revision-required'?
       'Revision Required':'Draft'+(editing?'':' · Not saved'))+'</output></div>'+
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
      '<small id="tl-reference-currency-help">ISO currency code for the unsaved Draft. Currency conversion is never inferred.</small></label>'+
     (physical||payment?'':'<label class="tl-draft-field"><span>VAT</span><select name="vatType">'+
      options(vatCodes,fieldValue('vatType',data.vatType||'12'))+'</select></label>')+
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
     field('Received by (signed account email)','receivedBy',
      fieldValue('receivedBy',data.receivedBy||''),'maxlength="254" required')+
     field('Verified by','verifiedBy',fieldValue('verifiedBy',data.verifiedBy||''),'maxlength="5000" required')+
    '</fieldset>'+
    '<p class="muted">Payment amounts are unsaved estimates. This form does not receive or verify funds.</p>':
    '<fieldset class="tl-draft-lines tl-reference-items"><legend>Items</legend>'+
     '<p class="tl-reference-items-note">'+
      (physical?'Physical shipment item (required for local readiness)':
       priced?'Priced line item (required for local readiness)':'Single line item (optional)')+
      '. Add up to 100 items to the same Draft revision.</p>'+
     '<div data-tradelink-draft-line-items>'+
      lines.map((item,index)=>renderTradeLinkDraftLineItem(item,type,inputUnit,index)).join('')+
     '</div>'+
     '<button type="button" class="secondary" data-action="tradelink-draft-add-line"'+
      (lines.length>=100?' disabled':'')+'>Add item</button>'+
    '</fieldset>'+
    (type==='delivery'?
     '<fieldset class="tl-draft-lines tl-reference-workflow-fields"><legend>Delivery responsibility · preview only</legend>'+
      field('QC assignee (signed account email)','checkedBy',
       fieldValue('checkedBy',data.checkedBy||''),
       'maxlength="254" required')+
      field('Logistics assignee (signed account email)','deliveredBy',
       fieldValue('deliveredBy',data.deliveredBy||''),
       'maxlength="254" required')+
      field('Received by (optional)','receivedBy',fieldValue('receivedBy',data.receivedBy||''),
       'maxlength="5000"')+
     '</fieldset>':'')+
    (physical?'<p class="muted">Shipment items are not priced here. This preview records no delivery or inventory movement.</p>':''))+
   (priced?renderTradeLinkDraftLocalAmounts(type,fieldValue,data,line,lines):'')+
   (type!=='packing'?
    '<fieldset class="tl-draft-lines tl-reference-workflow-fields"><legend>Workflow account assignments</legend>'+
     '<p class="muted">Reviewer email must match a verified signed APSYNTRA CRM account. '+
      'Names alone never grant review permission; this form does not assign system roles.</p>'+
     (['quotation','delivery'].includes(type)?
      field('Intended reviewer (optional)','verifiedBy',
       fieldValue('verifiedBy',data.verifiedBy||''),'maxlength="5000"'):'')+
     field('Assigned reviewer account email (optional)','verifiedByEmail',
      fieldValue('verifiedByEmail',data.verifiedByEmail||''),'type="email" maxlength="254"')+
     (['esi','quotation','po'].includes(type)?
      field('Assigned approver account email (optional)','approvedByEmail',
       fieldValue('approvedByEmail',data.approvedByEmail||''),'type="email" maxlength="254"'):'')+
    '</fieldset>':'')+
   '<section class="tl-reference-form-section tl-reference-terms"><h4>Terms &amp; Conditions</h4>'+
    '<label class="tl-draft-field"><span>Document notes and terms · local preview</span>'+
     '<textarea name="remarks" maxlength="5000" rows="5" '+
      'placeholder="Enter local document remarks or terms">'+
       escape(fieldValue('remarks',data.remarks||''))+'</textarea>'+
     '<small>These notes are part of the local validation preview. No PDF, approval or document is generated.</small>'+
    '</label></section>'+
   (renderCommercialReadiness(type,fieldValue,data))+
   '<div class="tl-draft-actions">'+
    '<button type="button" class="secondary" data-action="tradelink-draft-preview">Validate locally</button>'+
    '<button type="button" class="secondary" data-action="tradelink-draft-clear">Clear local fields</button>'+
    '<button type="submit" class="primary"'+(live?'':' disabled title="Production Draft writes are not activated"')+
     '>'+(editing?'Save revision':'Create Draft')+'</button>'+
   '</div><p data-tradelink-draft-preview-status data-validation="pending" role="status" aria-live="polite" aria-atomic="true">'+
    'Not saved. Complete required fields before saving.</p>'+
   renderTradeLinkDraftLocalSummary(type)+
  '</form></div></section>';
}

const draftListTypes=Object.freeze([['all','All modules'],...typeLabels]);
const draftListStates=Object.freeze([
 ['all','All workflow states'],['draft','Draft'],['submitted','Submitted'],
 ['under-review','Under Review'],['revision-required','Revision Required'],
 ['approved','Approved'],['rejected','Rejected'],
 ['completed','Completed'],['cancelled','Cancelled']
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
 return '<time datetime="'+escape(value)+'">'+escape(value)+'</time>';
}
/** Search only the bounded current server-authorized page. No remote search. */
export function filterTradeLinkDraftAuthorizedRows(rows,input={}){
 const filters=normalizeTradeLinkDraftListFilters(input);
 if(!Array.isArray(rows))return [];
 return sortTradeLinkDraftRows(rows.slice(0,50).filter(row=>
  tradeLinkDraftRowMatches(row,filters)),filters);
}
/** Update native controls and visible rows of the signed listing, never its data. */
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
  const matches=tradeLinkDraftRowMatches(record,filters);
  row.hidden=!matches;if(matches)count++;
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
function renderTradeLinkDraftList(rows,view,canManage,{readOnly=false}={}){
 const enabled=TL03_DOMAIN_READS_ENABLED&&canManage&&view.status==='AUTHORIZED_READ';
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
  '<div class="tl-draft-list-filters" role="search" aria-label="Search authorized TradeLink Draft records">'+
   '<label class="tl-draft-field"><span>Search document number</span>'+
    '<input name="query" type="search" maxlength="120" autocomplete="off" '+
    'placeholder="'+(page?'Search all authorized documents':'Search this authorized page')+
    '" value="'+escape(filters.query)+'" '+
    'data-tradelink-domain-filter aria-describedby="tl-draft-search-scope"'+disabledAttr+'></label>'+
   filterSelect('documentType','Document module',draftListTypes,filters.documentType)+
   filterSelect('workflowState','Workflow state',draftListStates,filters.workflowState)+
   filterSelect('archiveMode','Archive status',draftArchiveModes,filters.archiveMode)+
   filterSelect('sortBy','Sort by',draftSortFields,filters.sortBy)+
   filterSelect('sortDirection','Sort order',draftSortDirections,filters.sortDirection)+
  '</div>'+
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
    (page?'Signed server search and filters cover all authorized documents in this Board. '+
      'Results are paged newest-first (50 per page); Sort by applies to the visible page. '+
      'Select Search documents to apply new criteria.':
      'Search and filters apply only to the current signed, authorized response '+
      '(maximum 50 records). They do not query other workspaces or fetch additional pages.')+
   '</p>'+
  '<p data-tradelink-domain-count role="status" aria-live="polite" aria-atomic="true">'+
   displayed.length+' of '+records.length+' authorized records in this response</p>'+
  (records.length?
   '<div class="tl-records-scroll"><table class="tl-records-table">'+
    '<caption>'+(readOnly?'Authorized TradeLink documents':'Authorized TradeLink Draft records')+
     ' in current response</caption>'+
    '<thead><tr><th scope="col">Document</th><th scope="col">Module</th>'+
    '<th scope="col">Revision</th><th scope="col">State</th><th scope="col">Last updated</th>'+
    '<th scope="col">Actions</th>'+
    '</tr></thead><tbody data-tradelink-domain-list-body>'+
    ordered.map(row=>{
     const match=tradeLinkDraftRowMatches(row,applied);
     return '<tr data-tradelink-domain-record data-document-number="'+
      escape(row.documentNumber)+'" data-document-type="'+escape(row.documentType)+
      '" data-workflow-state="'+escape(row.workflowState)+'" data-revision="'+
      escape(row.revision)+'" data-updated-at="'+escape(tradeLinkTimestamp(row.updatedAt)===null?'':row.updatedAt)+'" data-archived="'+
      (row.archived===true?'true':'false')+'"'+(match?'':' hidden')+'>'+
      '<td>'+escape(row.documentNumber)+'</td><td>'+escape(row.documentType)+
      '</td><td>'+escape(row.revision)+'</td><td>'+escape(row.workflowState)+
      (row.archived?' · Archived':'')+'</td><td>'+renderTradeLinkTimestamp(row.updatedAt)+'</td>'+
      (readOnly?'<td><button type="button" class="secondary" '+
       'data-action="tradelink-document-open" data-id="'+escape(row.documentId)+
       '">Preview saved</button> '+
       '<button type="button" class="secondary" data-action="tradelink-document-print" '+
        'data-id="'+escape(row.documentId)+'"'+(view.busy?' disabled':'')+
        '>Print / Save PDF</button> '+
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
       (canManage&&TL03_DOMAIN_WRITES_ENABLED&&
        ['draft','revision-required'].includes(row.workflowState)&&
        !row.archived&&tradeLinkDraftEditHref(row.documentId)?
        '<a class="secondary" data-tradelink-document-edit href="'+
        escape(tradeLinkDraftEditHref(row.documentId))+'">Edit Draft</a> ':'')+
       (canManage&&TL03_DOMAIN_WRITES_ENABLED&&row.workflowState==='draft'?
        '<button type="button" class="secondary" data-action="'+
         (row.archived?'tradelink-draft-restore':'tradelink-draft-archive')+
         '" data-id="'+escape(row.documentId)+'">'+
         (row.archived?'Restore':'Archive')+'</button>':'')+
       '</td>':'<td>'+
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
 view=initialTradeLinkDraftView(),canManage=false}={}){
 if(!isTradeLinkBoard(detail?.board)||detail.board.id!==TRADELINK_BOARD_ID||
  detail.board.workspace_id!==workspaceId)
  return '<section class="tl-content-panel" role="alert">Signed TradeLink document workspace unavailable.</section>';
 const rows=TL03_DOMAIN_READS_ENABLED&&canManage&&
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
  '<div class="tl-panel-heading"><div><p class="tl-eyebrow">Source-aligned All Documents</p>'+
  '<h2 id="tl-domain-repository-title">TradeLink document workspace</h2></div>'+
  '<span class="tl-draft-badge">Signed document preview</span></div>'+
  '<p class="muted">This authoritative document workspace is separate from Board Items. '+
  'Only a signed, role-authorized Domain DocumentRecord response may appear here. '+
  'Document reads are '+(TL03_DOMAIN_READS_ENABLED?'subject to signed authorization':
  'not activated')+'.</p>'+
  '<p class="tl-draft-boundary" role="note">Authorized Drafts can be edited, archived or restored '+
  'through the signed database. Print / Save PDF opens a newly verified saved revision '+
  'and uses the browser print dialog; this is not an issued or signed tax document. '+
  (TL03_ATTACHMENTS_ENABLED?
   'Private document attachments require signed file-level authorization. ':
   'Secure attachment uploads remain unavailable pending backend activation. ')+
  'Board status does not change the document workflow state.</p>'+
  '<div class="tl-panel-heading"><h3>Authorized documents</h3>'+
   '<button type="button" class="secondary" data-action="tradelink-documents-refresh"'+
   (!TL03_DOMAIN_READS_ENABLED||!canManage||view.busy?' disabled':'')+
   '>Refresh documents</button></div>'+
  (view.error?'<p role="alert">'+escape(view.error)+'</p>':'')+
  (view.message?'<p role="status">'+escape(view.message)+'</p>':'')+
  renderTradeLinkDraftList(rows,view,canManage,{readOnly:true})+
  (linked&&canManage&&TL03_DOMAIN_WRITES_ENABLED&&
   ['draft','revision-required'].includes(linked.workflowState)&&!linked.archived&&
   tradeLinkDraftEditHref(linked.documentId)?
   '<p class="tl-document-edit-action"><a class="secondary" '+
   'data-tradelink-document-edit href="'+
    escape(tradeLinkDraftEditHref(linked.documentId))+
   '">Edit this Draft</a></p>':'')+
  selectedPreview+
  (linked&&canManage&&TL03_ATTACHMENTS_ENABLED?
   renderTradeLinkDocumentAttachments(selection?.attachments,{
    documentId:linked.documentId,workspaceId,
    editable:!linked.archived&&['draft','revision-required'].includes(linked.workflowState),
    busy:view.busy
   }):'')+
  (linked&&canManage?renderTradeLinkSavedWorkflowHistory(selection?.events):'')+
  '<h3>Document modules</h3><nav class="tl-document-module-nav" aria-label="TradeLink document modules">'+
  typeLabels.map(([id,label])=>'<a class="secondary" href="#/boards/'+TRADELINK_BOARD_ID+
   '/tradelink/'+escape(id)+'">'+escape(label)+'</a>').join('')+
  '</nav></section>';
}
export function renderTradeLinkDraftWorkspace({detail,workspaceId,view=initialTradeLinkDraftView(),canManage=false}={}){
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
   view.error||'',view.message||'',view.lineDrafts))+
  '<details class="tl-reference-list-details">'+
   '<summary>All Documents · authorized Draft listing'+
    '<span class="tl-draft-badge">Signed Draft operations</span></summary>'+
   '<section class="tl-draft-panel"><div class="tl-panel-heading">'+
    '<div><p class="tl-eyebrow">TradeLink document management</p><h2>Draft workspace</h2></div></div>'+
    '<p class="muted">Domain reads: <strong>'+
     (TL03_DOMAIN_READS_ENABLED?'enabled':'not activated')+'</strong>. Writes: <strong>'+
     (TL03_DOMAIN_WRITES_ENABLED?'enabled':'not activated')+
    '</strong>. Existing APSYNTRA signed authorization remains mandatory.</p>'+
    '<p class="tl-draft-boundary" role="note">No local draft storage, synthetic saved documents, independent login or attachments. Workflow decisions require separate server activation. For print / Save as PDF, open a genuinely saved record through All Documents; a local preview is not a saved record.</p>'+
    '<div class="tl-panel-heading"><h3>Authoritative Draft records</h3>'+
     '<button type="button" class="secondary" data-action="tradelink-draft-refresh"'+
       (!TL03_DOMAIN_READS_ENABLED||view.busy?' disabled':'')+'>Refresh</button></div>'+
    (view.error?'<p role="alert">'+escape(view.error)+'</p>':'')+
    (view.message?'<p role="status">'+escape(view.message)+'</p>':'')+
    renderTradeLinkDraftList(rows,view,canManage)+
   '</section></details></div>';
}
