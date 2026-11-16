/** TradeLink read-only analytics model for the signed document repository.
 * Aggregates contain no customer names, emails, addresses or document payloads.
 * Aging is deliberately reported unavailable until invoice/payment allocation
 * fields are part of the authoritative document contract.
 */
const TYPES=new Set(['esi','packing','delivery','payment','quotation','po']);
const STATES=new Set(['draft','for-approval','submitted','under-review','revision-required',
 'approved','rejected','completed','cancelled','under-negotiation','expired',
 'on-hold','won','lost','delivered','closed']);
const CURRENCIES=new Set(['PHP','USD','EUR','GBP','JPY','CNY','SGD','AUD','SAR','UNSPECIFIED']);
const VAT_CODES=new Set(['12','zero','exempt','15_tkm','15_ksa','unspecified']);
const finiteNonNegative=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const money=(value,currency)=>new Intl.NumberFormat('en-PH',{
 minimumFractionDigits:2,maximumFractionDigits:2}).format(value)+' '+currency;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function normalizeTradeLinkAnalyticsSummary(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!stamp(value.generatedAt)||
  !Array.isArray(value.documentCounts)||value.documentCounts.length>96||
  !Array.isArray(value.quotationPerformance)||value.quotationPerformance.length>96||
  !Array.isArray(value.taxSummary)||value.taxSummary.length>45||
  !value.aging||value.aging.available!==false||typeof value.aging.reason!=='string')
  throw new TypeError('Invalid TradeLink analytics response.');
 const documentCounts=value.documentCounts.map(row=>{
  if(!TYPES.has(row?.documentType)||!STATES.has(row?.workflowState)||
   !Number.isSafeInteger(row.count)||row.count<0)
   throw new TypeError('Invalid TradeLink document analytics row.');
  return {documentType:row.documentType,workflowState:row.workflowState,count:row.count};
 });
 const quotationPerformance=value.quotationPerformance.map(row=>{
  if(!STATES.has(row?.workflowState)||!CURRENCIES.has(row?.currency)||
   !Number.isSafeInteger(row.count)||row.count<0||!finiteNonNegative(row.total))
   throw new TypeError('Invalid TradeLink quotation analytics row.');
  return {workflowState:row.workflowState,currency:row.currency,
   count:row.count,total:row.total};
 });
 const taxSummary=value.taxSummary.map(row=>{
  if(!CURRENCIES.has(row?.currency)||!VAT_CODES.has(row?.vatType)||
   !Number.isSafeInteger(row.invoiceCount)||row.invoiceCount<0||
   !finiteNonNegative(row.taxable)||!finiteNonNegative(row.vat)||
   !finiteNonNegative(row.total))
   throw new TypeError('Invalid TradeLink tax analytics row.');
  return {currency:row.currency,vatType:row.vatType,invoiceCount:row.invoiceCount,
   taxable:row.taxable,vat:row.vat,total:row.total};
 });
 return {generatedAt:value.generatedAt,documentCounts,quotationPerformance,taxSummary,
  aging:{available:false,reason:value.aging.reason.slice(0,500)}};
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
  taxInvoices:value.taxSummary.reduce((sum,row)=>sum+row.invoiceCount,0)};
}
function chartRows(rows,{label,value,currency=null}={}){
 if(!rows.length)return '<p class="muted">No matching records in this reporting period.</p>';
 const max=Math.max(1,...rows.map(value));
 return '<div class="tl-analytics-bars">'+rows.map(row=>{
  const amount=value(row),width=Math.max(amount>0?2:0,amount/max*100);
  return '<div class="tl-analytics-bar-row"><span>'+esc(label(row))+'</span>'+
   '<progress class="tl-analytics-bar-track" max="100" value="'+width.toFixed(2)+'" aria-label="'+esc(label(row))+'"></progress>'+
   '<strong>'+amount+(currency?' '+esc(currency(row)):'')+'</strong></div>';
 }).join('')+'</div>';
}
export function renderTradeLinkAnalytics({summary=null,busy=false,error='',enabled=false}={}){
 if(!enabled&&!summary)return '<section class="tl-content-panel tl-analytics" aria-labelledby="tl-analytics-title">'+
  '<div class="tl-panel-heading"><div><p class="tl-eyebrow">TradeLink reporting</p><h2 id="tl-analytics-title">Analytics &amp; Dashboards</h2></div></div>'+
  '<div class="tl-analytics-empty" role="status"><strong>Analytics service is prepared but not activated.</strong>'+
  '<p>The signed aggregate-read database function must be installed before production-wide figures can be displayed. No partial-page figures or fabricated metrics are shown.</p></div></section>';
 if(busy)return '<section class="tl-content-panel tl-analytics" aria-busy="true"><h2>Analytics &amp; Dashboards</h2><p role="status">Loading signed TradeLink analytics…</p></section>';
 if(error)return '<section class="tl-content-panel tl-analytics"><h2>Analytics &amp; Dashboards</h2><p role="alert">'+esc(error)+'</p></section>';
 if(!summary)return '<section class="tl-content-panel tl-analytics"><h2>Analytics &amp; Dashboards</h2><p class="muted">Refresh analytics to retrieve the current signed summary.</p></section>';
 const data=normalizeTradeLinkAnalyticsSummary(summary),metrics=summarizeTradeLinkAnalytics(data);
 const quoteStatuses=[...new Set(data.quotationPerformance.map(row=>row.workflowState))];
 const quoteRows=quoteStatuses.map(workflowState=>({workflowState,
  count:data.quotationPerformance.filter(row=>row.workflowState===workflowState).reduce((sum,row)=>sum+row.count,0)}));
 const statusLabels={'draft':'Draft','for-approval':'For Approval','submitted':'Submitted',
  'under-review':'Under Review','revision-required':'Revision Required','approved':'Approved',
  'rejected':'Rejected','completed':'Completed','cancelled':'Cancelled',
  'under-negotiation':'Under Negotiation','expired':'Expired','on-hold':'On Hold',
  'won':'Won','lost':'Lost','delivered':'Delivered','closed':'Closed'};
 const typeLabels={esi:'ESI',packing:'Packing List',delivery:'Delivery Receipt',
  payment:'Payment AR',quotation:'Quotation',po:'Purchase Order'};
 const documentsByType=[...new Set(data.documentCounts.map(row=>row.documentType))].map(documentType=>({
  documentType,count:data.documentCounts.filter(row=>row.documentType===documentType).reduce((sum,row)=>sum+row.count,0)}));
 return '<section class="tl-content-panel tl-analytics" aria-labelledby="tl-analytics-title">'+
  '<div class="tl-panel-heading"><div><p class="tl-eyebrow">Signed document aggregates</p><h2 id="tl-analytics-title">Analytics &amp; Dashboards</h2>'+
   '<p class="muted">Generated '+esc(new Date(data.generatedAt).toLocaleString('en-PH'))+' · Active documents only</p></div>'+
   '<button type="button" class="secondary" data-action="tradelink-analytics-refresh"'+(busy?' disabled':'')+'>Refresh analytics</button></div>'+
  '<div class="tl-analytics-kpis">'+
   [['Documents',metrics.documents],['Quotations',metrics.quoteCount],['Won',metrics.won],['Lost',metrics.lost],
    ['Win rate',metrics.winRate===null?'—':(metrics.winRate*100).toFixed(1)+'%'],['Tax invoices',metrics.taxInvoices]]
    .map(([label,value])=>'<article><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></article>').join('')+
  '</div>'+
  '<div class="tl-analytics-grid"><section><h3>Document volume by module</h3>'+chartRows(documentsByType,{
   label:row=>typeLabels[row.documentType]||row.documentType,value:row=>row.count})+'</section>'+
   '<section><h3>Quotation outcomes</h3>'+chartRows(quoteRows,{
    label:row=>statusLabels[row.workflowState]||row.workflowState,value:row=>row.count})+
    '<p class="muted">Win rate = Won ÷ (Won + Lost). Open pipeline is not counted as a won or lost outcome.</p></section></div>'+
  '<section class="tl-analytics-table-section"><h3>Quotation pipeline by currency and status</h3>'+
   (data.quotationPerformance.length?'<div class="tl-records-scroll"><table class="tl-records-table"><thead><tr><th>Status</th><th>Currency</th><th>Documents</th><th>Document value</th></tr></thead><tbody>'+data.quotationPerformance.map(row=>
    '<tr><td>'+esc(statusLabels[row.workflowState]||row.workflowState)+'</td><td>'+esc(row.currency)+'</td><td>'+row.count+'</td><td>'+esc(money(row.total,row.currency))+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">No quotation records in this reporting period.</p>')+
  '</section>'+
  '<section class="tl-analytics-table-section"><h3>Tax summary · Approved Electronic Sales Invoices</h3>'+
   (data.taxSummary.length?'<div class="tl-records-scroll"><table class="tl-records-table"><thead><tr><th>Currency</th><th>VAT treatment</th><th>Invoices</th><th>Taxable amount</th><th>VAT</th><th>Total</th></tr></thead><tbody>'+data.taxSummary.map(row=>
    '<tr><td>'+esc(row.currency)+'</td><td>'+esc(row.vatType)+'</td><td>'+row.invoiceCount+'</td><td>'+esc(money(row.taxable,row.currency))+'</td><td>'+esc(money(row.vat,row.currency))+'</td><td>'+esc(money(row.total,row.currency))+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">No ESI tax records in this reporting period.</p>')+
  '</section>'+
  '<section class="tl-analytics-aging"><h3>Accounts Receivable Aging</h3><p>'+esc(data.aging.reason)+'</p>'+
   '<small>Aging figures are intentionally omitted until invoice due dates, payment allocations and outstanding balances are stored as authoritative fields.</small></section>'+
  '</section>';
}
