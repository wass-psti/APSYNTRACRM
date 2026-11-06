/** CP-TL-03D / Phase 1 — Draft workspace, controlled dark launch.
 * This is a presentation layer over the EXISTING signed TradeLinkDomainClient.
 * No local persistence, fabricated domain records, second login, or write bypass.
 */
import {ApiError} from './session.js';
import {calculateTradeLinkAmounts,formatTradeLinkAmount,TRADELINK_CURRENCIES,TRADELINK_VAT_CODES} from './tradelink-finance.js';
import {TRADELINK_BOARD_ID,isTradeLinkBoard} from './tradelink-board-items.js';
import {TradeLinkDomainClient,TL03_DOMAIN_READS_ENABLED,
 TL03_DOMAIN_WRITES_ENABLED,validateTradeLinkDraftEnvelope} from './tradelink-domain-client.js';

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
export function initialTradeLinkDraftView(documentType=null){
 // The route may request only one of the existing six source document types.
 // This is transient UI state, never browser or server persistence.
 const selected=typeLabels.some(([key])=>key===documentType)?documentType:null;
 return {status:'DARK_LAUNCH',rows:[],selected:null,busy:false,error:'',
  message:'',draftNotice:'',mode:'create',pendingCreateId:null,
  listFilters:initialTradeLinkDraftListFilters(),
  formValues:selected?{documentType:selected}:null};
}
/**
 * Discard ALL prior module inputs, including sensitive financial and reviewer
 * fields. This is in-memory UI state only; no browser or server persistence.
 */
export function resetTradeLinkDraftForm(view=initialTradeLinkDraftView(),documentType=null){
 const requested=documentType??view?.formValues?.documentType??'quotation';
 const safeType=typeLabels.some(([id])=>id===requested)?requested:'quotation';
 return {...view,mode:'create',selected:null,pendingCreateId:null,error:'',message:'',
  draftNotice:'Unsaved local fields cleared. Nothing saved or transmitted.',
  formValues:{documentType:safeType}};
}
/** Expose only program-defined local validation messages, not field values. */
export function tradeLinkDraftValidationMessage(error){
 return error instanceof ApiError&&error.status===400?
  error.message:'Invalid Draft input.';
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
function moneyField(label,name,val,currency,attrs){
 return '<label class="tl-draft-field"><span>'+escape(label)+
  ' (<span data-tradelink-draft-money-currency>'+escape(currency)+'</span>)</span>'+
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

/** One unsaved priced line; reuse the authoritative source calculation formula. */
export function calculateTradeLinkDraftLocalAmounts(fields){
 if(!fields||typeof fields.get!=='function')return null;
 const value=name=>String(fields.get(name)??'').trim();
 if(!['esi','quotation','po'].includes(value('documentType')))return null;
 const qText=value('lineQuantity'),pText=value('lineUnitPrice');
 const quantity=Number(qText),unitPrice=Number(pText);
 const currency=value('currency'),vatType=value('vatType');
 if(!qText||!pText||!Number.isFinite(quantity)||!Number.isFinite(unitPrice)||
  quantity<=0||unitPrice<=0||quantity>1000000000||unitPrice>1000000000||
  !currencies.includes(currency)||!TRADELINK_VAT_CODES.includes(vatType))
  return null;
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
  items:[{kind:'item',quantity,unitPrice}],currency,vatType,
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
 const fields={get:key=>form.querySelector('[name="'+key+'"]')?.value??''};
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
function renderTradeLinkDraftLocalAmounts(type,fieldValue,data,line){
 const defaults={documentType:type,lineQuantity:line.quantity??'',
  lineUnitPrice:line.unitPrice??'',currency:data.currency||'PHP',
  vatType:data.vatType||'12',discountType:data.discountType||'percentage',
  discountValue:data.discountValue??'',exchangeRate:data.exchangeRate??''};
 const value=key=>fieldValue(key,defaults[key]??'');
 const initial=calculateTradeLinkDraftLocalAmounts({get:value});
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
 const amount=calculateTradeLinkDraftLocalAmounts({get:name=>{
  if(name==='lineQuantity')return item.quantity??'';
  if(name==='lineUnitPrice')return item.unitPrice??'';
  return draft[name]??'';
 }});
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
function renderEditor(row,mode,canManage,formValues=null,draftNotice=''){
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
 const inputUnit=currencyUnit(fieldValue('currency',data.currency||'PHP'));
 const commonPartyLabel=type==='packing'?'Consignee':type==='delivery'?'Recipient / consignee':
  payment?'Payor':type==='po'?'Supplier':type==='esi'?'Invoice client':
  type==='quotation'?'Prospective client':'Customer / supplier';
 return '<section class="tl-draft-panel" aria-labelledby="tl-draft-editor-title">'+
  '<div class="tl-panel-heading"><div><p class="tl-eyebrow">Source-aligned Draft editor</p>'+
  '<h3 id="tl-draft-editor-title">'+(editing?'Edit authorized Draft':'Prepare a Draft')+'</h3></div>'+
  (editing?'<button type="button" class="secondary" data-action="tradelink-draft-new">New Draft</button>':'')+'</div>'+
  (mode==='edit'&&!editing?'<p role="alert">This record cannot be edited with the bounded Phase 1 editor.</p>':'')+
  '<p class="muted">Fields are a local, unsaved preparation form. Preview validation does not create a server record.</p>'+
  (draftNotice?'<p class="tl-draft-feedback" role="status">'+escape(draftNotice)+'</p>':'')+
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
    '<label class="tl-draft-field"><span>Currency (ISO code)</span><select name="currency">'+
     options(currencies.map(v=>[v,v]),fieldValue('currency',data.currency||'PHP'))+'</select></label>'+
    (physical||payment?'':'<label class="tl-draft-field"><span>VAT</span><select name="vatType">'+
     options(vatCodes,fieldValue('vatType',data.vatType||'12'))+'</select></label>')+
   '</div>'+
   (payment?
    '<fieldset class="tl-draft-lines"><legend>Received payment · local readiness only</legend>'+
     field('Payment particulars','paymentParticulars',fieldValue('paymentParticulars',data.paymentParticulars||''),
      'maxlength="5000" required')+
     moneyField('Cash amount','cashAmount',fieldValue('cashAmount',data.cashAmount??''),
      inputUnit,'type="number" min="0" max="1000000000000" step="any"')+
     moneyField('Cheque amount','chequeAmount',fieldValue('chequeAmount',data.chequeAmount??''),
      inputUnit,'type="number" min="0" max="1000000000000" step="any"')+
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
    (physical?'':moneyField('Unit price','lineUnitPrice',
     fieldValue('lineUnitPrice',line.unitPrice??''),inputUnit,
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
   (priced?renderTradeLinkDraftLocalAmounts(type,fieldValue,data,line):'')+
   renderCommercialReadiness(type,fieldValue,data)+
   '<label class="tl-draft-field"><span>Remarks</span>'+
    '<textarea name="remarks" maxlength="5000" rows="3">'+escape(fieldValue('remarks',data.remarks||''))+'</textarea></label>'+
   '<div class="tl-draft-actions">'+
    '<button type="button" class="secondary" data-action="tradelink-draft-preview">Validate locally</button>'+
    '<button type="button" class="secondary" data-action="tradelink-draft-clear">Clear local fields</button>'+
    '<button type="submit" class="primary"'+(live?'':' disabled title="Production Draft writes are not activated"')+
     '>'+(editing?'Save revision':'Create Draft')+'</button>'+
   '</div><p data-tradelink-draft-preview-status data-validation="pending" role="status" aria-live="polite" aria-atomic="true">'+
    'Not saved. Domain write activation is pending.</p>'+
   renderTradeLinkDraftLocalSummary(type)+
  '</form></section>';
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
const matchAllowed=(list,value,fallback)=>list.some(([key])=>key===value)?value:fallback;
export function initialTradeLinkDraftListFilters(){
 return {query:'',documentType:'all',workflowState:'all',archiveMode:'active'};
}
export function normalizeTradeLinkDraftListFilters(input={}){
 const f=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 return {
  query:String(typeof f.query==='string'?f.query:'').trim().slice(0,120).toLocaleLowerCase(),
  documentType:matchAllowed(draftListTypes,f.documentType,'all'),
  workflowState:matchAllowed(draftListStates,f.workflowState,'all'),
  archiveMode:matchAllowed(draftArchiveModes,f.archiveMode,'active')
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
/** Search only the bounded current server-authorized page. No remote search. */
export function filterTradeLinkDraftAuthorizedRows(rows,input={}){
 const filters=normalizeTradeLinkDraftListFilters(input);
 if(!Array.isArray(rows))return [];
 return rows.slice(0,50).filter(row=>tradeLinkDraftRowMatches(row,filters));
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
 const counter=container.querySelector('[data-tradelink-domain-count]');
 if(counter)counter.textContent=count+' of '+rows.length+
  ' authorized records in this response';
 const empty=container.querySelector('[data-tradelink-domain-no-match]');
 if(empty)empty.hidden=count!==0||rows.length===0;
 return count;
}
function renderTradeLinkDraftList(rows,view,canManage){
 const enabled=TL03_DOMAIN_READS_ENABLED&&canManage&&view.status==='AUTHORIZED_READ';
 const records=enabled?rows:[];
 const filters=normalizeTradeLinkDraftListFilters(view.listFilters);
 const displayed=filterTradeLinkDraftAuthorizedRows(records,filters);
 const disabledAttr=enabled?'':' disabled';
 const filterSelect=(name,label,values,value)=>
  '<label class="tl-draft-field"><span>'+escape(label)+'</span>'+
  '<select name="'+name+'" data-tradelink-domain-filter'+disabledAttr+
  '>'+options(values,value)+'</select></label>';
 return '<section data-tradelink-domain-list aria-label="Authorized TradeLink Draft listing">'+
  '<div class="tl-draft-list-filters" role="search" aria-label="Search authorized TradeLink Draft records">'+
   '<label class="tl-draft-field"><span>Search document number</span>'+
    '<input name="query" type="search" maxlength="120" autocomplete="off" '+
    'placeholder="Search this authorized page" value="'+escape(filters.query)+'" '+
    'data-tradelink-domain-filter aria-describedby="tl-draft-search-scope"'+disabledAttr+'></label>'+
   filterSelect('documentType','Document module',draftListTypes,filters.documentType)+
   filterSelect('workflowState','Workflow state',draftListStates,filters.workflowState)+
   filterSelect('archiveMode','Archive status',draftArchiveModes,filters.archiveMode)+
  '</div>'+
  '<p id="tl-draft-search-scope" class="muted">Search and filters apply only to the '+
    'current signed, authorized response (maximum 50 records). They do not query '+
    'other workspaces or fetch additional pages.</p>'+
  '<p data-tradelink-domain-count role="status" aria-live="polite" aria-atomic="true">'+
   displayed.length+' of '+records.length+' authorized records in this response</p>'+
  (records.length?
   '<div class="tl-records-scroll"><table class="tl-records-table">'+
    '<caption>Authorized TradeLink Draft records in current response</caption>'+
    '<thead><tr><th scope="col">Document</th><th scope="col">Module</th>'+
    '<th scope="col">Revision</th><th scope="col">State</th>'+
    '<th scope="col">Actions</th></tr></thead><tbody>'+
    records.map(row=>{
     const match=tradeLinkDraftRowMatches(row,filters);
     return '<tr data-tradelink-domain-record data-document-number="'+
      escape(row.documentNumber)+'" data-document-type="'+escape(row.documentType)+
      '" data-workflow-state="'+escape(row.workflowState)+'" data-archived="'+
      (row.archived===true?'true':'false')+'"'+(match?'':' hidden')+'>'+
      '<td>'+escape(row.documentNumber)+'</td><td>'+escape(row.documentType)+
      '</td><td>'+escape(row.revision)+'</td><td>'+escape(row.workflowState)+
      (row.archived?' · Archived':'')+'</td><td>'+
      '<button type="button" class="secondary" data-action="tradelink-draft-open" data-id="'+escape(row.documentId)+'">Read</button> '+
      '<button type="button" class="secondary" data-action="tradelink-draft-archive" data-id="'+escape(row.documentId)+'"'+
       (!canManage||!TL03_DOMAIN_WRITES_ENABLED||row.archived||row.workflowState!=='draft'?' disabled':'')+'>Archive</button> '+
      '<button type="button" class="secondary" data-action="tradelink-draft-restore" data-id="'+escape(row.documentId)+'"'+
       (!canManage||!TL03_DOMAIN_WRITES_ENABLED||!row.archived||row.workflowState!=='draft'?' disabled':'')+'>Restore</button>'+
      '</td></tr>';
    }).join('')+'</tbody></table></div>'+
   '<p data-tradelink-domain-no-match class="muted"'+(displayed.length?' hidden':'')+
    '>No matching records in this authorized response.</p>':
   '<p class="muted">'+(enabled?
    'No authorized TradeLink Draft records were returned for this page.':
    'No persisted TradeLink Draft records are displayed. The signed document-list endpoint remains off during this dark launch.')+'</p>')+
  '</section>';
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
   renderTradeLinkDraftList(rows,view,canManage)+
  '</section>'+renderEditor(selected?.record,view.mode,canManage,
   view.mode==='edit'&&!selected?null:view.formValues,view.draftNotice||'')+'</div>';
}
