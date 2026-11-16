/** TradeLink signed, aggregate-only commercial and receivables analytics. */
const TYPES=new Set(['esi','packing','delivery','payment','quotation','po']);
const STATES=new Set(['draft','for-approval','submitted','under-review','revision-required',
 'approved','rejected','completed','cancelled','under-negotiation','expired',
 'on-hold','won','lost','delivered','closed']);
const CURRENCIES=new Set(['PHP','USD','EUR','GBP','JPY','CNY','SGD','AUD','SAR','UNSPECIFIED']);
const VAT_CODES=new Set(['12','zero','exempt','15_tkm','15_ksa','unspecified']);
const QUOTE_STATUSES=new Set(['Working on it','Sent','Client Review','Accepted','Declined','On Hold','Closed','unspecified']);
const AGING_BUCKETS=new Set(['Current','1-30 days','31-60 days','61-90 days','Over 90 days']);
const finiteNonNegative=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const money=(value,currency)=>new Intl.NumberFormat('en-PH',{
 minimumFractionDigits:2,maximumFractionDigits:2}).format(value)+' '+currency;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const typeLabels={esi:'Electronic Sales Invoice',packing:'Packing List',delivery:'Delivery Receipt',
 payment:'Payment AR',quotation:'Quotation',po:'Purchase Order'};
const stateLabels={draft:'Draft','for-approval':'For Approval',submitted:'Submitted',
 'under-review':'Under Review','revision-required':'Revision Required',approved:'Approved',
 rejected:'Rejected',completed:'Completed',cancelled:'Cancelled',
 'under-negotiation':'Under Negotiation',expired:'Expired','on-hold':'On Hold',
 won:'Won',lost:'Lost',delivered:'Delivered',closed:'Closed'};

export function normalizeTradeLinkAnalyticsSummary(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!stamp(value.generatedAt)||
  !Array.isArray(value.documentCounts)||value.documentCounts.length>96||
  !Array.isArray(value.quotationPerformance)||value.quotationPerformance.length>96||
  !Array.isArray(value.quotationCommercialStatus)||value.quotationCommercialStatus.length>56||
  !Array.isArray(value.taxSummary)||value.taxSummary.length>45||
  !value.aging||typeof value.aging.available!=='boolean'||typeof value.aging.reason!=='string')
  throw new TypeError('Invalid TradeLink analytics response.');
 const documentCounts=value.documentCounts.map(row=>{
  if(!TYPES.has(row?.documentType)||!STATES.has(row?.workflowState)||!integer(row.count))
   throw new TypeError('Invalid TradeLink document analytics row.');
  return Object.freeze({documentType:row.documentType,workflowState:row.workflowState,count:row.count});
 });
 const quotationPerformance=value.quotationPerformance.map(row=>{
  if(!STATES.has(row?.workflowState)||!CURRENCIES.has(row?.currency)||
   !integer(row.count)||!finiteNonNegative(row.total))
   throw new TypeError('Invalid TradeLink quotation workflow row.');
  return Object.freeze({workflowState:row.workflowState,currency:row.currency,
   count:row.count,total:row.total});
 });
 const quotationCommercialStatus=value.quotationCommercialStatus.map(row=>{
  if(!QUOTE_STATUSES.has(row?.quoteStatus)||!CURRENCIES.has(row?.currency)||
   !integer(row.count)||!finiteNonNegative(row.total))
   throw new TypeError('Invalid TradeLink quotation commercial-status row.');
  return Object.freeze({quoteStatus:row.quoteStatus,currency:row.currency,
   count:row.count,total:row.total});
 });
 const taxSummary=value.taxSummary.map(row=>{
  if(!CURRENCIES.has(row?.currency)||!VAT_CODES.has(row?.vatType)||
   !integer(row.invoiceCount)||!finiteNonNegative(row.taxable)||
   !finiteNonNegative(row.vat)||!finiteNonNegative(row.total))
   throw new TypeError('Invalid TradeLink tax analytics row.');
  return Object.freeze({currency:row.currency,vatType:row.vatType,
   invoiceCount:row.invoiceCount,taxable:row.taxable,vat:row.vat,total:row.total});
 });
 let aging;
 if(value.aging.available===true){
  if(!Array.isArray(value.aging.buckets)||value.aging.buckets.length>100||
   !Array.isArray(value.aging.unallocatedReceipts)||value.aging.unallocatedReceipts.length>100||
   !Array.isArray(value.aging.excessPayments)||value.aging.excessPayments.length>100||
   !Array.isArray(value.aging.pendingChequeReceipts)||value.aging.pendingChequeReceipts.length>100||
   !integer(value.aging.excludedWithoutDueDate))
   throw new TypeError('Invalid TradeLink receivables aging response.');
  const buckets=value.aging.buckets.map(row=>{
   if(!CURRENCIES.has(row?.currency)||!AGING_BUCKETS.has(row?.bucket)||
    !integer(row.invoiceCount)||!finiteNonNegative(row.outstanding))
    throw new TypeError('Invalid TradeLink aging bucket.');
   return Object.freeze({currency:row.currency,bucket:row.bucket,
    invoiceCount:row.invoiceCount,outstanding:row.outstanding});
  });
  const receiptRows=key=>value.aging[key].map(row=>{
   if(!CURRENCIES.has(row?.currency)||!integer(row.count)||!finiteNonNegative(row.amount))
    throw new TypeError('Invalid TradeLink Payment AR aggregate.');
   return Object.freeze({currency:row.currency,count:row.count,amount:row.amount});
  });
  aging=Object.freeze({available:true,reason:value.aging.reason,
   buckets:Object.freeze(buckets),
   unallocatedReceipts:Object.freeze(receiptRows('unallocatedReceipts')),
   excessPayments:Object.freeze(receiptRows('excessPayments')),
   pendingChequeReceipts:Object.freeze(receiptRows('pendingChequeReceipts')),
   excludedWithoutDueDate:value.aging.excludedWithoutDueDate});
 }else{
  aging=Object.freeze({available:false,reason:value.aging.reason.slice(0,500)});
 }
 return Object.freeze({generatedAt:value.generatedAt,
  documentCounts:Object.freeze(documentCounts),
  quotationPerformance:Object.freeze(quotationPerformance),
  quotationCommercialStatus:Object.freeze(quotationCommercialStatus),
  taxSummary:Object.freeze(taxSummary),aging});
}
export function summarizeTradeLinkAnalytics(summary){
 const value=normalizeTradeLinkAnalyticsSummary(summary);
 const documents=value.documentCounts.reduce((sum,row)=>sum+row.count,0);
 const quotes=value.quotationPerformance;
 const quoteCount=quotes.reduce((sum,row)=>sum+row.count,0);
 const won=quotes.filter(row=>row.workflowState==='won').reduce((sum,row)=>sum+row.count,0);
 const lost=quotes.filter(row=>row.workflowState==='lost').reduce((sum,row)=>sum+row.count,0);
 const decided=won+lost;
 return {documents,quoteCount,won,lost,winRate:decided?won/decided:null,
  taxInvoices:value.taxSummary.reduce((sum,row)=>sum+row.invoiceCount,0),
  agingAvailable:value.aging.available};
}
function chartRows(rows,{label,value}={}){
 if(!rows.length)return '<p class="muted">No matching records in this reporting period.</p>';
 const max=Math.max(1,...rows.map(value));
 return '<div class="tl-analytics-bars">'+rows.map(row=>{
  const amount=value(row),width=Math.max(amount>0?2:0,amount/max*100);
  return '<div class="tl-analytics-bar-row"><span>'+esc(label(row))+'</span>'+
   '<progress class="tl-analytics-bar-track" max="100" value="'+width.toFixed(2)+'" aria-label="'+esc(label(row))+'"></progress>'+
   '<strong>'+amount+'</strong></div>';
 }).join('')+'</div>';
}
function table(rows,headers,empty){
 return rows.length?'<div class="tl-records-scroll"><table class="tl-records-table"><thead><tr>'+headers.map(h=>
  '<th'+(h.numeric?' class="numeric"':'')+'>'+esc(h.label)+'</th>').join('')+
  '</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>':
  '<p class="muted">'+esc(empty)+'</p>';
}
export function renderTradeLinkAnalytics({summary=null,busy=false,error='',enabled=false}={}){
 const shell='<section class="tl-content-panel tl-analytics" aria-labelledby="tl-analytics-title">'+
  '<div class="tl-panel-heading"><div><p class="tl-eyebrow">TradeLink reporting</p><h2 id="tl-analytics-title">Analytics &amp; Dashboards</h2></div></div>';
 if(!enabled&&!summary)return shell+
  '<div class="tl-analytics-empty" role="status"><strong>Analytics service is prepared but not activated.</strong>'+
  '<p>The signed aggregate-read database function and matching report schema must be activated before production figures can be displayed. No partial-page figures or fabricated metrics are shown.</p></div></section>';
 if(busy)return shell+'<p role="status">Loading signed TradeLink analytics…</p></section>';
 if(error)return shell+'<p role="alert">'+esc(error)+'</p></section>';
 if(!summary)return shell+'<p class="muted">Refresh analytics to retrieve the current signed summary.</p></section>';
 const data=normalizeTradeLinkAnalyticsSummary(summary),metrics=summarizeTradeLinkAnalytics(data);
 const documentRows=[...new Set(data.documentCounts.map(row=>row.documentType))].map(documentType=>({
  documentType,count:data.documentCounts.filter(row=>row.documentType===documentType).reduce((sum,row)=>sum+row.count,0)}));
 const quoteWorkflow=[...new Set(data.quotationPerformance.map(row=>row.workflowState))].map(workflowState=>({
  workflowState,count:data.quotationPerformance.filter(row=>row.workflowState===workflowState).reduce((sum,row)=>sum+row.count,0)}));
 const workflowRows=data.quotationPerformance.map(row=>'<tr><td>'+esc(stateLabels[row.workflowState]||row.workflowState)+
  '</td><td>'+esc(row.currency)+'</td><td>'+row.count+'</td><td>'+esc(money(row.total,row.currency))+'</td></tr>');
 const commercialRows=data.quotationCommercialStatus.map(row=>'<tr><td>'+esc(row.quoteStatus==='unspecified'?'Not recorded':row.quoteStatus)+
  '</td><td>'+esc(row.currency)+'</td><td>'+row.count+'</td><td>'+esc(money(row.total,row.currency))+'</td></tr>');
 const taxRows=data.taxSummary.map(row=>'<tr><td>'+esc(row.currency)+'</td><td>'+esc(row.vatType)+
  '</td><td>'+row.invoiceCount+'</td><td>'+esc(money(row.taxable,row.currency))+'</td><td>'+esc(money(row.vat,row.currency))+
  '</td><td>'+esc(money(row.total,row.currency))+'</td></tr>');
 let agingHtml='';
 if(!data.aging.available){
  agingHtml='<section class="tl-analytics-aging"><h3>Accounts Receivable Aging</h3><p>'+esc(data.aging.reason)+'</p></section>';
 }else{
  const buckets=data.aging.buckets.map(row=>'<tr><td>'+esc(row.currency)+'</td><td>'+esc(row.bucket)+
   '</td><td>'+row.invoiceCount+'</td><td>'+esc(money(row.outstanding,row.currency))+'</td></tr>');
  const unallocated=data.aging.unallocatedReceipts.map(row=>'<tr><td>'+esc(row.currency)+'</td><td>'+row.count+
   '</td><td>'+esc(money(row.amount,row.currency))+'</td></tr>');
  const excess=data.aging.excessPayments.map(row=>'<tr><td>'+esc(row.currency)+'</td><td>'+row.count+
   '</td><td>'+esc(money(row.amount,row.currency))+'</td></tr>');
  const cheques=data.aging.pendingChequeReceipts.map(row=>'<tr><td>'+esc(row.currency)+'</td><td>'+row.count+
   '</td><td>'+esc(money(row.amount,row.currency))+'</td></tr>');
  agingHtml='<section class="tl-analytics-aging"><h3>Accounts Receivable Aging</h3>'+table(buckets,
   [{label:'Currency'},{label:'Aging bucket'},{label:'Open invoices',numeric:true},{label:'Outstanding',numeric:true}],
   'No approved ESI invoices with a due date and an outstanding balance were found.')+
   '<h4>Unmatched cash receipts</h4>'+table(unallocated,
   [{label:'Currency'},{label:'Receipts',numeric:true},{label:'Unallocated amount',numeric:true}],
   'No unmatched cash receipts were found.')+
   '<h4>Excess cash payments</h4>'+table(excess,
   [{label:'Currency'},{label:'Invoices with excess',numeric:true},{label:'Excess amount',numeric:true}],
   'No excess cash allocations were found.')+
   '<h4>Cheque receipts pending bank clearance</h4>'+table(cheques,
   [{label:'Currency'},{label:'Cheques',numeric:true},{label:'Pending amount',numeric:true}],
   'No completed cheque receipts are pending bank clearance.')+
   '<p class="muted">'+esc(data.aging.reason)+' Invoices without a due date are excluded from aging: '+data.aging.excludedWithoutDueDate+'. Partial cash receipts are applied only to an exact ESI document-number reference in the same currency. Cheques are not deducted until bank clearance is recorded. No currency conversion is inferred.</p></section>';
 }
 return '<section class="tl-content-panel tl-analytics" aria-labelledby="tl-analytics-title">'+
  '<div class="tl-panel-heading"><div><p class="tl-eyebrow">Signed document aggregates</p><h2 id="tl-analytics-title">Analytics &amp; Dashboards</h2>'+
   '<p class="muted">Generated '+esc(new Date(data.generatedAt).toLocaleString('en-PH'))+' · Active documents only</p></div>'+
   '<button type="button" class="secondary" data-action="tradelink-analytics-refresh"'+(busy?' disabled':'')+'>Refresh analytics</button></div>'+
  '<div class="tl-analytics-kpis">'+
   [['Documents',metrics.documents],['Quotations',metrics.quoteCount],['Won',metrics.won],['Lost',metrics.lost],
    ['Win rate',metrics.winRate===null?'—':(metrics.winRate*100).toFixed(1)+'%'],['Tax invoices',metrics.taxInvoices]]
    .map(([label,value])=>'<article><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></article>').join('')+
  '</div>'+
  '<div class="tl-analytics-grid"><section><h3>Document volume by module</h3>'+chartRows(documentRows,{
   label:row=>typeLabels[row.documentType]||row.documentType,value:row=>row.count})+'</section>'+
   '<section><h3>Quotation workflow outcomes</h3>'+chartRows(quoteWorkflow,{
    label:row=>stateLabels[row.workflowState]||row.workflowState,value:row=>row.count})+
    '<p class="muted">Win rate = Won ÷ (Won + Lost). Commercial quotation statuses are reported separately.</p></section></div>'+
  '<section class="tl-analytics-table-section"><h3>Quotation commercial status</h3>'+table(commercialRows,
   [{label:'Commercial status'},{label:'Currency'},{label:'Documents',numeric:true},{label:'Quoted value',numeric:true}],
   'No quotation commercial statuses have been recorded.')+'</section>'+
  '<section class="tl-analytics-table-section"><h3>Quotation workflow by currency</h3>'+table(workflowRows,
   [{label:'Workflow state'},{label:'Currency'},{label:'Documents',numeric:true},{label:'Document value',numeric:true}],
   'No quotation records in this reporting period.')+'</section>'+
  '<section class="tl-analytics-table-section"><h3>Tax summary · Approved Electronic Sales Invoices</h3>'+table(taxRows,
   [{label:'Currency'},{label:'VAT treatment'},{label:'Invoices',numeric:true},{label:'Taxable amount',numeric:true},{label:'VAT',numeric:true},{label:'Total',numeric:true}],
   'No approved ESI tax records in this reporting period.')+'</section>'+agingHtml+
  '</section>';
}
