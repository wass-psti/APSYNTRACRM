import {projectSalesIntelligence} from './order-intake-analytics.js';

const esc=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function metric(label,value,detail=''){
 return '<article><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong>'+(detail?'<small>'+esc(detail)+'</small>':'')+'</article>';
}
function distribution(title,items){
 const max=Math.max(1,...items.map(item=>item.count));
 return '<section class="oi-panel"><h2>'+esc(title)+'</h2><div class="oi-chart-scroll">'+
 (items.map(({label,count})=>'<div class="oi-distribution"><span>'+esc(label)+'</span><meter aria-label="'+esc(label+' orders')+'" min="0" max="'+max+'" value="'+count+'">'+count+'</meter><strong>'+count+'</strong></div>').join('')||'<p>No orders.</p>')+'</div></section>';
}
function financeTable(groups,basis){
 const historical=basis==='historical';
 const items=groups.filter(group=>group.basis===basis);
 const value=(group,key)=>group[key]===null?'—':esc(group.currency)+' '+esc(group[key]);
 const cell=(group,key)=>'<td>'+value(group,key)+'<small>'+group[key+'Count']+' / '+group.count+' with value</small></td>';
 return '<section class="oi-panel"><h2>'+(historical?'Historical source figures (not CRM VAT-derived)':'CRM-native order value and profitability')+'</h2>'+
 '<p>'+(historical?'Reported values only; unknown currencies excluded. Historical profit is not included in CRM profit totals.':'VAT-inclusive PO value is not recognized accounting revenue. Gross profit uses the CRM VAT-exclusive amount minus procurement expenses.')+'</p>'+
 (items.length?'<div class="oi-table-scroll" tabindex="0" aria-label="'+basis+' financial totals"><table class="oi-finance-table"><thead><tr><th scope="col">Currency</th><th scope="col">Order value</th><th scope="col">Expenses</th><th scope="col">'+(historical?'Reported profit':'Gross profit')+'</th></tr></thead><tbody>'+
 items.map(group=>'<tr><th scope="row">'+esc(group.currency)+'</th>'+cell(group,'amount')+cell(group,'expenses')+cell(group,'profit')+'</tr>').join('')+'</tbody></table></div>':'<p>No matching orders with known currency.</p>')+'</section>';
}
export function renderSalesDashboard(rows,{recentOrders='',complete=false}={}){
 const p=projectSalesIntelligence(rows);
 return '<section class="oi-sales-dashboard" aria-label="Sales intelligence">'+
 (!complete?'<p class="oi-dashboard-coverage" role="status">Analytics are provisional until every page is retrieved. Last available records only.</p>':'<p class="oi-dashboard-coverage">All available registry pages retrieved. Refresh for current data.</p>')+
 '<div class="oi-metrics">'+metric('Matching orders',p.total,p.native+' native · '+p.legacy+' historical')+
 metric('Open workflow orders',p.open,p.openArchiveUnknown+' with unknown archive state')+metric('Collected',p.collected)+metric('Cancelled',p.cancelled)+'</div>'+
 '<p class="oi-dashboard-coverage">Open means a known workflow status other than Collected, Closed or Cancelled; delivered orders may await collection. '+p.unknownStatus+' unknown workflow status · '+p.unknownArchive+' unknown archive state · '+p.unknownCurrency+' unknown currency · '+p.unknownReceived+' missing or invalid received date.</p>'+
 financeTable(p.finance,'native')+financeTable(p.finance,'historical')+
 '<div class="oi-analytics-grid">'+distribution('Account distribution',p.managers)+distribution('Company distribution',p.companies)+distribution('Industry distribution',p.industries)+distribution('Workflow status distribution',p.statuses)+distribution('Monthly orders by date received',p.months)+'</div>'+
 '<section class="oi-panel"><h2>Recent orders</h2>'+recentOrders+'</section></section>';
}
