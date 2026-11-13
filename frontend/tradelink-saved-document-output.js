/**
 * CP-TL-09B — Official TradeLink output from an authenticated, revision-matched
 * saved document. Uses recovered v1.42 company profiles and six module layouts.
 * Browser Print / Save as PDF remains the output mechanism; no PDF issuance,
 * approval, payment, shipment, or persistence action is performed here.
 */
import {ApiError} from './session.js';
import {normalizeTradeLinkDomainRow} from './tradelink-domain-client.js';
import {calculateTradeLinkAmounts,formatTradeLinkAmount,TRADELINK_CURRENCIES} from './tradelink-finance.js';
import {resolveTradeLinkOfficialTemplate,TRADELINK_DEFAULT_TERMS,
 TRADELINK_TEMPLATE_VERSION} from './tradelink-official-templates.js';

const TYPE_LABELS=Object.freeze({
 esi:'Electronic Sales Invoice',quotation:'Quotation',po:'Purchase Order to Suppliers',
 delivery:'Delivery Receipt',packing:'Packing List',payment:'Payment Acknowledgement Receipt'
});
const STATES=new Set(['draft','for-approval','submitted','under-review','revision-required',
 'approved','rejected','completed','cancelled','under-negotiation','expired',
 'on-hold','won','lost','delivered','closed']);
const PRICED=new Set(['esi','quotation','po']);
const VAT_LABELS=Object.freeze({'12':'12% VAT',zero:'0% Zero Rated VAT',exempt:'0% Tax Exempt VAT',
 '15_tkm':'15% TKM VAT','15_ksa':'15% KSA VAT'});
const ESCAPE=Object.freeze({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'});
const safe=value=>String(value??'').replace(/[&<>"']/g,char=>ESCAPE[char]);
const display=value=>value===null||value===undefined||value===''?'—':safe(value);
const validStamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:'—';
const amount=value=>typeof value==='number'&&Number.isFinite(value)?formatTradeLinkAmount(value):'—';
const money=(value,currency)=>amount(value)+(Number.isFinite(value)?' '+safe(currency):'');
const pair=(label,value)=>'<div><dt>'+safe(label)+'</dt><dd>'+display(value)+'</dd></div>';
const validLines=items=>Array.isArray(items)&&items.length<=100&&
 items.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&
  ['item','note'].includes(row.kind)&&
  (row.description===undefined||typeof row.description==='string'&&row.description.length<=2000)&&
  (row.kind!=='item'||(typeof row.quantity==='number'&&Number.isFinite(row.quantity)&&
   typeof row.unitPrice==='number'&&Number.isFinite(row.unitPrice))));
const dateLabel=value=>{
 if(typeof value!=='string'||!value.trim())return '—';
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
  const [year,month,day]=value.split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-PH',{
   day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(date):safe(value);
 }
 return Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-PH',{
  day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',
  timeZone:'Asia/Manila',timeZoneName:'short'}).format(new Date(value)):safe(value);
};
const pdfTitle=type=>String(TYPE_LABELS[type]||type).toUpperCase();
const partyLabel=type=>type==='po'?'SUPPLIER':type==='payment'?'PAYOR / CLIENT':'CLIENT';
const moduleFields=Object.freeze({
 esi:[['customerTin','Customer TIN'],['dueDate','Due date'],
  ['verifiedBy','Assigned finance verifier'],['approvedBy','Assigned management approver']],
 quotation:[['customerEmail','Client email'],['customerPhone','Client phone'],
  ['validity','Validity'],['deliveryCommitment','Delivery commitment'],
  ['paymentTerms','Payment terms'],['verifiedBy','Assigned primary reviewer'],
  ['approvedBy','Assigned final approver']],
 po:[['poNumber','Supplier PO reference'],['targetDeliveryDate','Target delivery date'],
  ['paymentTerms','Payment terms'],['verifiedBy','Assigned Account Manager'],
  ['approvedBy','Assigned final approver']],
 packing:[['referenceNumber','Shipment / order reference'],
  ['verifiedBy','Assigned verifier'],['approvedBy','Assigned approver']],
 delivery:[['referenceNumber','Shipment / order reference'],
  ['checkedBy','Recorded QC responsible'],['deliveredBy','Recorded logistics responsible'],
  ['receivedBy','Recipient acknowledgement']],
 payment:[['paymentParticulars','Payment particulars'],['bankName','Bank'],
  ['chequeNumber','Cheque reference'],['receivedBy','Recorded received by'],
  ['verifiedBy','Assigned verifier']]
});
const logoUrl=asset=>new URL('./assets/tradelink/'+asset,import.meta.url).href;

function renderTerms(terms){
 const lines=String(terms||'').replace(/\r/g,'').split('\n');
 if(!lines.some(line=>line.trim()))return '';
 return lines.map(raw=>{
  const line=raw.trim();
  if(!line)return '<div class="tl-official-term-gap"></div>';
  const heading=/^(?:\d+\.?\s+|[A-Z][A-Za-z &/\-]{2,}:?$)/.test(line)&&line.length<110;
  return heading?'<h3>'+safe(line)+'</h3>':'<p>'+safe(line)+'</p>';
 }).join('');
}
function renderCommercial(data,type,currency){
 const rows=[];
 const reference=data.poNumber||data.referenceNumber;
 if(reference)rows.push(['Reference',reference]);
 if(data.paymentTerms)rows.push(['Payment terms',data.paymentTerms]);
 if(type==='quotation'||type==='po'){
  if(data.validity)rows.push(['Validity',data.validity]);
  if(data.deliveryCommitment)rows.push(['Delivery',data.deliveryCommitment]);
 }
 if(type==='po'&&data.targetDeliveryDate)rows.push(['Target delivery',dateLabel(data.targetDeliveryDate)]);
 if(type==='esi'&&data.dueDate)rows.push(['Due date',dateLabel(data.dueDate)]);
 if(currency&&currency!=='—')rows.push(['Currency',currency]);
 return rows.length?'<section class="tl-official-commercial"><h3>Commercial details</h3><dl>'+
  rows.map(([label,value])=>pair(label,value)).join('')+'</dl></section>':'';
}
function renderItems(data,type,currency){
 const items=Array.isArray(data.items)?data.items:[];
 if(type==='payment'||!items.length)return '';
 const priced=PRICED.has(type),serial=type==='delivery';
 const columns=3+(priced?2:0)+(serial?1:0);
 const rows=items.map((item,index)=>{
  if(item.kind==='note')return '<tr class="tl-official-note-row"><td>'+String(index+1)+
   '</td><td colspan="'+(columns-1)+'">'+display(item.description)+'</td></tr>';
  return '<tr><td class="tl-official-number">'+String(index+1)+'</td>'+
   '<td>'+display(item.description)+'</td><td class="tl-official-number">'+display(item.quantity)+'</td>'+
   (serial?'<td>'+display(item.serialNumber)+'</td>':'')+
   (priced?'<td class="tl-official-money">'+money(item.unitPrice,currency)+'</td>'+
    '<td class="tl-official-money">'+money(item.quantity*item.unitPrice,currency)+'</td>':'')+'</tr>';
 }).join('');
 return '<section class="tl-official-items"><h3>Item description</h3><table><thead><tr>'+
  '<th>#</th><th>MATERIAL DESCRIPTION</th><th>QTY</th>'+
  (serial?'<th>SERIAL / ASSET ID</th>':'')+
  (priced?'<th>UNIT PRICE</th><th>TOTAL</th>':'')+
  '</tr></thead><tbody>'+rows+'</tbody></table></section>';
}
function renderFinancial(data,type,currency){
 if(PRICED.has(type)){
  const totals=calculateTradeLinkAmounts(data);
  const discountLabel=data.discountType==='percentage'&&Number(data.discountValue)>0?
   'Discount ('+safe(data.discountValue)+'%)':'Discount';
  return '<section class="tl-official-totals"><dl>'+
   pair('Subtotal',money(totals.subtotal,currency))+
   pair(discountLabel,'− '+money(totals.discount,currency))+
   pair('After discount',money(totals.taxable,currency))+
   pair('VAT / tax classification',VAT_LABELS[data.vatType]||data.vatType||'—')+
   pair('VAT amount',money(totals.vat,currency))+
   '<div class="tl-official-grand"><dt>TOTAL</dt><dd>'+money(totals.total,currency)+'</dd></div>'+
   (data.currency!=='PHP'&&typeof data.exchangeRate==='number'&&data.exchangeRate>0?
    pair('PHP equivalent · saved exchange rate',money(totals.phpEquivalent,'PHP')):'')+
   '</dl></section>';
 }
 if(type==='payment'){
  const cash=typeof data.cashAmount==='number'?data.cashAmount:0;
  const cheque=typeof data.chequeAmount==='number'?data.chequeAmount:0;
  return '<section class="tl-official-totals"><h3>Payment acknowledgement</h3><dl>'+
   pair('Cash amount',money(cash,currency))+pair('Cheque amount',money(cheque,currency))+
   '<div class="tl-official-grand"><dt>Total recorded amount</dt><dd>'+money(cash+cheque,currency)+'</dd></div>'+
   '</dl></section>';
 }
 return '';
}
function renderApproval(data,row){
 const assignments=(moduleFields[row.document_type]||[]).filter(([key])=>
  ['verifiedBy','approvedBy','checkedBy','deliveredBy','receivedBy'].includes(key));
 const state=row.workflow_state==='approved';
 const label=state?'APPROVED':'NOT APPROVED';
 return '<section class="tl-official-approval" aria-label="Document workflow status">'+
  '<div class="tl-official-approval-stamp '+(state?'is-approved':'is-not-approved')+'">'+
   '<strong>'+label+'</strong><span>'+(state?'WORKFLOW APPROVED · PDF NOT ISSUED':
    'NOT APPROVED · PDF NOT ISSUED')+'</span><span>'+(state?'Approved revision '+safe(row.revision):
    'This print view does not approve the document')+'</span></div>'+
  (assignments.length?'<div class="tl-official-assignees"><h3>Workflow assignments / recorded responsibility</h3><dl>'+
   assignments.map(([key,label])=>pair(label,data[key]||data[key+'Email'])).join('')+'</dl></div>':'')+
  '<p class="tl-official-approval-note">The APPROVED mark is shown only when the signed TradeLink workflow state is Approved. Assigned reviewers are identified separately from recorded approval actions. Electronic PDF approval and issuance have NOT been verified; this is a browser print copy, not an electronically issued PDF.</p>'+
  '</section>';
}

/** Pure official printable markup, from an already authenticated and matched record. */
export function renderTradeLinkSavedDocumentOutput(record,workspaceId,documentId){
 const row=normalizeTradeLinkDomainRow(record,workspaceId,documentId);
 const data=row.content;
 if(!Object.hasOwn(TYPE_LABELS,row.document_type)||!STATES.has(row.workflow_state)||
  data.documentType!==row.document_type||data.documentNumber!==row.document_number||
  typeof row.document_number!=='string'||row.document_number.length>120||
  typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at))||
  !validLines(data.items??[])||
  (data.customerName!==undefined&&(typeof data.customerName!=='string'||data.customerName.length>5000)))
  throw new ApiError('Saved document output cannot be verified.',409);
 const {company,template,legacyDefaulted,profileValid,templateIdValid}=resolveTradeLinkOfficialTemplate(data);
 if(!profileValid||!templateIdValid)
  throw new ApiError('Saved TradeLink company/template snapshot does not match an official profile.',409);
 const logo=logoUrl(company.logoAsset);
 const currency=TRADELINK_CURRENCIES.includes(data.currency)?data.currency:'—';
 const address=String(company.address||'').split(/\r?\n/).filter(Boolean)
  .map(line=>'<p>'+safe(line)+'</p>').join('');
 const companyHeader='<header class="tl-official-header"><div class="tl-official-brand">'+
  '<img class="tl-official-logo" src="'+safe(logo)+'" alt="'+safe(company.name)+' logo">'+
  '<div class="tl-official-company"><h1>'+safe(company.name)+'</h1>'+address+
  '<p>Tel: '+display(company.phone)+'</p><p>Email: '+display(company.email)+'</p>'+
  '<p>Website: '+display(company.website)+'</p><p>TIN: '+display(company.tin)+'</p></div></div>'+
  '<div class="tl-official-document-title"><h2>'+safe(pdfTitle(row.document_type))+'</h2><dl>'+
   pair('No.',row.document_number)+pair('Rev.',row.revision)+
   pair('Date',dateLabel(data.date||row.created_at))+
  '</dl></div></header>';
 const partyFields=[['Address',data.customerAddress],['Contact',data.customerContact],
  ['Email',data.customerEmail],['Phone',data.customerPhone],['TIN',data.customerTin]]
  .filter(([,value])=>value!==undefined&&value!==null&&value!=='');
 const party='<section class="tl-official-party-grid"><div class="tl-official-party"><h3>'+
  partyLabel(row.document_type)+':</h3><strong>'+display(data.customerName)+'</strong>'+
  partyFields.map(([label,value])=>'<p><b>'+safe(label)+':</b> '+display(value)+'</p>').join('')+
  '</div></section>';
 const commercial=renderCommercial(data,row.document_type,currency);
 const payment=row.document_type==='payment'?'<section class="tl-official-payment-particulars"><h3>Payment particulars</h3><p>'+
  display(data.paymentParticulars)+'</p><dl>'+pair('Bank',data.bankName)+
  pair('Cheque reference',data.chequeNumber)+'</dl></section>':'';
 const remarks=data.remarks?'<section class="tl-official-notes"><h3>Additional notes</h3><p>'+
  safe(data.remarks)+'</p></section>':'';
 const terms=typeof data.terms==='string'?data.terms:TRADELINK_DEFAULT_TERMS[row.document_type]||'';
 const termsHtml=renderTerms(terms);
 const footer='<footer class="tl-official-footer"><span>'+safe(company.name)+'</span>'+
  '<span>'+safe(row.document_number)+'</span></footer>';
 const workflowLine='<div class="tl-official-workflow-line"><span>'+
  (row.workflow_state==='approved'?'APPROVED':
   safe(row.workflow_state).replaceAll('-',' ').toUpperCase())+'</span>'+
  '<span>Revision '+safe(row.revision)+'</span></div>';
 const mainHeaderContent=companyHeader+workflowLine+party;
 const mainBodyContent=commercial+payment+renderItems(data,row.document_type,currency)+
  renderFinancial(data,row.document_type,currency)+remarks+renderApproval(data,row);
 const continuationHeader='<header class="tl-official-continuation"><span>'+safe(company.name)+
  '</span><span>'+safe(row.document_number)+'</span></header>';
 const flowingTerms=termsHtml&&template.termsMode!=='new-page'?
  '<section class="tl-official-terms"><h2>Terms &amp; Conditions</h2>'+termsHtml+'</section>':'';
 const threePageQuotation=row.document_type==='quotation'&&template.termsMode==='new-page';
 const main=threePageQuotation?
  '<section class="tl-official-page tl-official-quotation-page-1">'+mainHeaderContent+'</section>'+
  '<section class="tl-official-page tl-official-quotation-page-2">'+continuationHeader+
   mainBodyContent+(termsHtml?'':footer)+'</section>':
  '<section class="tl-official-page">'+mainHeaderContent+mainBodyContent+flowingTerms+
   (!termsHtml||template.termsMode!=='new-page'?footer:'')+'</section>';
 const termsPage=termsHtml&&template.termsMode==='new-page'?
  '<section class="tl-official-page tl-official-terms-page">'+continuationHeader+
  '<header class="tl-official-terms-heading"><h2>'+
   (row.document_type==='quotation'?'Standard Terms & Conditions of Sale':'Terms & Conditions')+
   '</h2></header><div class="tl-official-terms">'+termsHtml+'</div>'+
  (row.document_type==='quotation'?'<section class="tl-official-acceptance"><h3>Accepted by: (Client)</h3>'+
   '<div class="tl-official-sign-line"></div><small>(Printed Name &amp; Signature)</small>'+
   '<h3>Date:</h3><div class="tl-official-sign-line"></div>'+
   '<p>Thank you for considering '+safe(company.name)+'. We appreciate the opportunity to support your requirements.</p></section>':'')+
  footer+'</section>':'';
 return '<article class="tl-print-paper tl-official-paper tl-official-profile-'+safe(company.id)+'" data-tradelink-signed-output '+
  'data-tradelink-template-version="'+safe(template.version||TRADELINK_TEMPLATE_VERSION)+'" '+
  'data-tradelink-template-id="'+safe(template.id)+'" '+
  'data-tradelink-company-profile="'+safe(company.id)+'" '+
  'data-tradelink-legacy-company-default="'+(legacyDefaulted?'true':'false')+'">'+
  main+termsPage+'</article>';
}
let active=null;
/** In-memory preview; deliberately no new tabs, blob URLs, local storage or iframe. */
export function closeTradeLinkSavedDocumentOutput(){
 if(!active)return;
 const {node,previous,onKey}=active;active=null;
 node.removeEventListener('keydown',onKey);node.remove();
 if(previous?.isConnected&&typeof previous.focus==='function')previous.focus();
}
export function mountTradeLinkSavedDocumentOutput(markup,{doc=document}={}){
 if(typeof markup!=='string'||!markup.startsWith('<article class="tl-print-paper')||
  !doc?.createElement||!doc.body)
  throw new ApiError('Verified printable TradeLink record required.',409);
 closeTradeLinkSavedDocumentOutput();
 const node=doc.createElement('section');node.id='tradelink-saved-print';
 node.className='tl-print-overlay';node.setAttribute('role','dialog');
 node.setAttribute('aria-modal','true');node.setAttribute('aria-label','Official TradeLink print preview');
 const legacyDefault=markup.includes('data-tradelink-legacy-company-default="true"');
 const legacyNotice=legacyDefault?'<p class="tl-print-legacy-notice" role="status">This older saved record has no company profile assignment. The historical TradeLink default, Watchdog Automation Sales &amp; Services, is shown. Confirm the legal entity before printing.</p>':'';
 node.innerHTML='<div class="tl-print-shell"><nav class="tl-print-controls" aria-label="Print preview actions">'+
  '<span>Official TradeLink template · Browser print / Save as PDF</span>'+
  '<button type="button" data-tradelink-print-action="print">Print / Save as PDF</button>'+
  '<button type="button" data-tradelink-print-action="close">Close preview</button></nav>'+legacyNotice+markup+'</div>';
 const previous=doc.activeElement;
 const onKey=event=>{
  if(event.key==='Escape'){event.preventDefault();closeTradeLinkSavedDocumentOutput();}
  if(event.key==='Tab'){
   const buttons=[...node.querySelectorAll('button')];if(!buttons.length)return;
   if(event.shiftKey&&doc.activeElement===buttons[0]){event.preventDefault();buttons.at(-1).focus();}
   else if(!event.shiftKey&&doc.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus();}
  }
 };
 node.addEventListener('keydown',onKey);
 node.querySelector('[data-tradelink-print-action="close"]').addEventListener('click',closeTradeLinkSavedDocumentOutput);
 node.querySelector('[data-tradelink-print-action="print"]').addEventListener('click',()=>{
  const windowRef=doc.defaultView;
  if(!active||active.node!==node||typeof windowRef?.print!=='function')return;
  windowRef.print();
 });
 doc.body.append(node);active={node,previous,onKey};
 node.querySelector('[data-tradelink-print-action="print"]').focus();return node;
}
