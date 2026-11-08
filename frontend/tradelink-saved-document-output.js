/** TradeLink signed, print-ready document output.
 * This renderer accepts ONLY the result of the existing authenticated
 * tl03_document_read RPC, rechecked with its Board projection by app.js.
 * It does not create tax invoices, issue approvals, or save another copy.
 * PDF output uses the browser's Print -> Save as PDF, not a fake PDF download.
 */
import {ApiError} from './session.js';
import {normalizeTradeLinkDomainRow} from './tradelink-domain-client.js';
import {calculateTradeLinkAmounts,formatTradeLinkAmount,TRADELINK_CURRENCIES} from './tradelink-finance.js';

const TYPE_LABELS=Object.freeze({
 esi:'Electronic Sales Invoice',quotation:'Quotation',po:'Purchase Order to Suppliers',
 delivery:'Delivery Receipt',packing:'Packing List',payment:'Payment Acknowledgement / AR'
});
const STATES=new Set(['draft','submitted','under-review','revision-required',
 'approved','rejected','completed','cancelled']);
const PRICED=new Set(['esi','quotation','po']);
const TEXT_FIELDS=Object.freeze({
 esi:[['customerTin','Customer TIN'],['dueDate','Due date'],
  ['verifiedBy','Intended finance verifier'],['approvedBy','Intended approver']],
 quotation:[['customerEmail','Customer email'],['customerPhone','Customer phone'],
  ['validity','Valid for'],['deliveryCommitment','Delivery commitment'],
  ['paymentTerms','Payment terms'],['approvedBy','Intended approver']],
 po:[['poNumber','PO reference'],['targetDeliveryDate','Target delivery date'],
  ['paymentTerms','Payment terms'],['verifiedBy','Intended account verifier'],
  ['approvedBy','Intended approver']],
 packing:[['referenceNumber','Source order / shipment reference']],
 delivery:[['referenceNumber','Source order / shipment reference'],
  ['checkedBy','QC responsible'],['deliveredBy','Logistics responsible'],
  ['receivedBy','Recipient acknowledgement']],
 payment:[['paymentParticulars','Payment particulars'],
  ['cashAmount','Cash amount'],['chequeAmount','Cheque amount'],
  ['bankName','Bank'],['chequeNumber','Cheque reference'],
  ['receivedBy','Received by'],['verifiedBy','Intended verifier']]
});
const ESCAPE=Object.freeze({'&':'&amp;','<':'&lt;','>':'&gt;',
 '"':'&quot;',"'":'&#39;'});
const safe=value=>String(value??'').replace(/[&<>"']/g,char=>ESCAPE[char]);
const display=value=>value===null||value===undefined||value===''?'—':safe(value);
const amount=value=>typeof value==='number'&&Number.isFinite(value)?
 formatTradeLinkAmount(value):'—';
const money=(value,currency)=>amount(value)+(Number.isFinite(value)?' '+safe(currency):'');
const validStamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?
 value:'—';
const validLines=items=>Array.isArray(items)&&items.length<=100&&
 items.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&
  ['item','note'].includes(row.kind)&&typeof row.description==='string'&&
  row.description.length<=2000&&
  (row.kind!=='item'||(typeof row.quantity==='number'&&Number.isFinite(row.quantity)&&
   typeof row.unitPrice==='number'&&Number.isFinite(row.unitPrice))));
const pair=(label,value)=>'<div><dt>'+safe(label)+'</dt><dd>'+display(value)+'</dd></div>';

/** Pure printable markup, from an already signed read and matched identity. */
export function renderTradeLinkSavedDocumentOutput(record,workspaceId,documentId){
 const row=normalizeTradeLinkDomainRow(record,workspaceId,documentId);
 const data=row.content;
 if(!Object.hasOwn(TYPE_LABELS,row.document_type)||
  !STATES.has(row.workflow_state)||data.documentType!==row.document_type||
  data.documentNumber!==row.document_number||
  typeof row.document_number!=='string'||row.document_number.length>120||
  typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at))||
  !validLines(data.items??[])||
  typeof data.customerName!=='string'||data.customerName.length>5000)
  throw new ApiError('Saved document output cannot be verified.',409);
 const currency=TRADELINK_CURRENCIES.includes(data.currency)?data.currency:'—';
 const priced=PRICED.has(row.document_type);
 const lines=Array.isArray(data.items)?data.items:[];
 const fields=[
  ['Customer / supplier / recipient',data.customerName],
  ['Address',data.customerAddress],['Document date',data.date],
  ['Currency',currency],
  ...TEXT_FIELDS[row.document_type].map(([name,label])=>[
   label,name==='cashAmount'||name==='chequeAmount'?
    money(data[name],currency):data[name]
  ])
 ];
 const state=row.archived_at?'ARCHIVED · '+row.workflow_state.toUpperCase():
  row.workflow_state.toUpperCase();
 const lineTotal=item=>item.kind==='item'&&priced?
  money(item.quantity*item.unitPrice,currency):'—';
 const amounts=priced?calculateTradeLinkAmounts(data):null;
 const totals=priced?[
  ['Subtotal',amounts.subtotal],['Discount',amounts.discount],
  ['Taxable amount',amounts.taxable],['VAT',amounts.vat],['Total',amounts.total]
 ]:[];
 const paymentTotal=row.document_type==='payment'?
  (typeof data.cashAmount==='number'?data.cashAmount:0)+
   (typeof data.chequeAmount==='number'?data.chequeAmount:0):null;
 const financial=priced?
  '<section class="tl-print-financial" aria-label="Calculated saved commercial amounts">'+
   '<h3>Commercial amounts</h3><dl>'+
    totals.map(([name,value])=>pair(name,money(value,currency))).join('')+
    (data.currency!=='PHP'&&typeof data.exchangeRate==='number'&&data.exchangeRate>0?
     pair('PHP equivalent (saved exchange rate)',money(amounts.phpEquivalent,'PHP')):'')+
   '</dl></section>':
  row.document_type==='payment'?
   '<section class="tl-print-financial" aria-label="Recorded acknowledgement values">'+
    '<h3>Recorded payment amounts</h3><dl>'+
    pair('Cash',money(data.cashAmount,currency))+
    pair('Cheque',money(data.chequeAmount,currency))+
    pair('Total recorded amount',money(paymentTotal,currency))+
    '</dl></section>':'';
 const linesTable=lines.length?
  '<section class="tl-print-lines"><h3>Saved line items</h3>'+
  '<table><thead><tr><th scope="col">#</th><th scope="col">Description</th>'+
  '<th scope="col">Qty</th><th scope="col">Unit</th>'+
  (priced?'<th scope="col">Unit price</th><th scope="col">Line value</th>':'')+
  (row.document_type==='delivery'?'<th scope="col">Serial / asset no.</th>':'')+
  '</tr></thead><tbody>'+lines.map((item,i)=>
   '<tr><td>'+safe(i+1)+'</td><td>'+display(item.description)+'</td>'+
   '<td>'+display(item.kind==='item'?item.quantity:'—')+'</td>'+
   '<td>'+display(item.kind==='item'?item.unit:'—')+'</td>'+
   (priced?'<td>'+money(item.unitPrice,currency)+'</td><td>'+
    lineTotal(item)+'</td>':'')+
   (row.document_type==='delivery'?'<td>'+display(item.serialNumber)+'</td>':'')+
   '</tr>').join('')+'</tbody></table></section>':'';
 const party='<section class="tl-print-parties"><h3>Document details</h3><dl>'+
  fields.filter(([,value])=>value!==undefined&&value!==null&&value!=='')
    .map(([label,value])=>pair(label,value)).join('')+
  '</dl></section>';
 const note=row.workflow_state==='draft'||row.workflow_state==='revision-required'?
  'DRAFT — not approved or issued by printing.':row.workflow_state==='approved'?
  'Saved approved workflow state. This print view is not a digital signature.':
  'Saved workflow status shown as recorded; printing does not change status.';
 return '<article class="tl-print-paper" data-tradelink-signed-output '+
  'aria-labelledby="tl-print-document-title">'+
  '<header class="tl-print-header"><div><p class="tl-print-brand">APSYNTRA CRM / TRADELINK</p>'+
   '<h1 id="tl-print-document-title">'+safe(TYPE_LABELS[row.document_type])+'</h1>'+
   '<p class="tl-print-number">'+safe(row.document_number)+'</p></div>'+
   '<span class="tl-print-state">'+safe(state)+'</span></header>'+
  '<p class="tl-print-notice">'+safe(note)+'</p>'+
  '<dl class="tl-print-provenance">'+
   pair('Saved revision',row.revision)+pair('Last saved (UTC/offset)',validStamp(row.updated_at))+
   pair('Created (UTC/offset)',validStamp(row.created_at))+
   pair('Archived',row.archived_at?'Yes':'No')+
   pair('Authoritative document ID',row.id)+
   pair('Linked Board item ID',row.board_item_id)+'</dl>'+
  party+linesTable+financial+
  (data.remarks?'<section class="tl-print-remarks"><h3>Remarks</h3><p>'+
   safe(data.remarks)+'</p></section>':'')+
  (data.terms?'<section class="tl-print-remarks"><h3>Terms</h3><p>'+
   safe(data.terms)+'</p></section>':'')+
  '<footer class="tl-print-footer">Based on an authenticated saved document revision. '+
   'No approval, shipment, payment receipt, or document change is made by printing. '+
   'For source-of-record verification, reopen the signed TradeLink document in APSYNTRA CRM.'+
   '</footer></article>';
}
let active=null;
/** In-memory preview; deliberately no new tabs, blob URLs, local storage or iframe. */
export function closeTradeLinkSavedDocumentOutput(){
 if(!active)return;
 const {node,previous,onKey}=active;
 active=null;
 node.removeEventListener('keydown',onKey);
 node.remove();
 if(previous?.isConnected&&typeof previous.focus==='function')previous.focus();
}
export function mountTradeLinkSavedDocumentOutput(markup,{doc=document}={}){
 if(typeof markup!=='string'||!markup.startsWith('<article class="tl-print-paper"')||
  !doc?.createElement||!doc.body)
  throw new ApiError('Verified printable TradeLink record required.',409);
 closeTradeLinkSavedDocumentOutput();
 const node=doc.createElement('section');
 node.id='tradelink-saved-print';
 node.className='tl-print-overlay';
 node.setAttribute('role','dialog');
 node.setAttribute('aria-modal','true');
 node.setAttribute('aria-label','Saved TradeLink print preview');
 node.innerHTML='<div class="tl-print-shell">'+
  '<nav class="tl-print-controls" aria-label="Print preview actions">'+
   '<span>Signed saved document · Browser print / Save as PDF</span>'+
   '<button type="button" data-tradelink-print-action="print">Print / Save as PDF</button>'+
   '<button type="button" data-tradelink-print-action="close">Close preview</button>'+
  '</nav>'+markup+'</div>';
 const previous=doc.activeElement;
 const onKey=event=>{
  if(event.key==='Escape'){event.preventDefault();closeTradeLinkSavedDocumentOutput();}
  if(event.key==='Tab'){
   const buttons=[...node.querySelectorAll('button')];
   if(!buttons.length)return;
   if(event.shiftKey&&doc.activeElement===buttons[0]){
    event.preventDefault();buttons.at(-1).focus();
   }else if(!event.shiftKey&&doc.activeElement===buttons.at(-1)){
    event.preventDefault();buttons[0].focus();
   }
  }
 };
 node.addEventListener('keydown',onKey);
 node.querySelector('[data-tradelink-print-action="close"]').addEventListener(
  'click',closeTradeLinkSavedDocumentOutput);
 node.querySelector('[data-tradelink-print-action="print"]').addEventListener('click',()=>{
  const windowRef=doc.defaultView;
  if(!active||active.node!==node||typeof windowRef?.print!=='function')return;
  windowRef.print();
 });
 doc.body.append(node);
 active={node,previous,onKey};
 node.querySelector('[data-tradelink-print-action="print"]').focus();
 return node;
}
