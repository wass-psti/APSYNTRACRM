/** Signed aggregate-only Executive Dashboard for Fund Released Tracker. */
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e15?v:0;
const count=v=>Number.isSafeInteger(v)&&v>=0?v:0;
const currency=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:2,maximumFractionDigits:2});
const percentage=new Intl.NumberFormat('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
const money=v=>currency.format(amount(v));
const monthLabel=period=>{
 const match=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(period||''));
 if(!match)return '—';
 return new Intl.DateTimeFormat('en-PH',{month:'short',year:'numeric',timeZone:'UTC'})
  .format(new Date(Date.UTC(Number(match[1]),Number(match[2])-1,1)));
};
const palette=['#2da43d','#ff8425','#238ed0'];
function statusChart(summary){
 const complete=count(summary?.completed),progress=count(summary?.in_progress),pending=count(summary?.pending);
 const values=[complete,progress,pending],total=values.reduce((sum,n)=>sum+n,0);
 const denominator=Math.max(total,1);let offset=0;
 const arcs=values.map((value,i)=>{
  const span=100*value/denominator;
  const arc='<circle cx="100" cy="100" r="70" fill="none" stroke="'+palette[i]+'" stroke-width="34" pathLength="100" stroke-dasharray="'+span.toFixed(4)+' '+(100-span).toFixed(4)+'" stroke-dashoffset="'+(-offset).toFixed(4)+'" transform="rotate(-90 100 100)"/>';
  offset+=span;return arc;
 }).join('');
 return '<svg class="frt-exec-donut" viewBox="0 0 200 200" role="img" aria-label="Request status: '+complete+' completed, '+progress+' in progress, '+pending+' pending approval">'+
  '<circle cx="100" cy="100" r="70" fill="none" stroke="#dfe7f1" stroke-width="34"/>'+arcs+
  '<text x="100" y="105" text-anchor="middle" class="frt-exec-donut-total">'+total+'</text></svg>';
}
function categoryChart(categories){
 if(!categories.length)return '<div class="frt-exec-chart-empty" role="status">No expense category data is available for this company yet.</div>';
 const max=Math.max(1,...categories.map(row=>amount(row.amount)));
 return '<div class="frt-exec-categories" role="list" aria-label="Top expense categories">'+
  categories.map(row=>{
   const width=Math.max(0,Math.min(100,amount(row.amount)/max*100));
   return '<div class="frt-exec-category-row" role="listitem"><span class="frt-exec-category-name" title="'+escape(row.category)+'">'+escape(row.category)+'</span>'+
    '<span class="frt-exec-category-track"><svg viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="100" height="14" rx="4" fill="#eaf0f8"/><rect class="frt-exec-category-bar" x="0" y="0" width="'+width.toFixed(2)+'" height="14" rx="4" fill="#6485e8"/></svg></span>'+
    '<strong>'+money(row.amount)+'</strong></div>';
  }).join('')+'</div>';
}
function compactMoney(value){
 const n=amount(value);
 if(n>=1000000)return '₱'+(n/1000000).toFixed(1)+'M';
 if(n>=1000)return '₱'+(n/1000).toFixed(0)+'K';
 return '₱'+n.toFixed(0);
}
function trendChart(rows){
 const width=1000,height=320,left=72,right=30,top=24,bottom=62;
 const plotW=width-left-right,plotH=height-top-bottom;
 const max=Math.max(1,...rows.flatMap(row=>[amount(row.requested),amount(row.spent)]));
 const x=i=>left+(rows.length<=1?plotW/2:i*plotW/(rows.length-1));
 const y=v=>top+plotH-(amount(v)/max*plotH);
 const requested=rows.map((r,i)=>x(i).toFixed(1)+','+y(r.requested).toFixed(1)).join(' ');
 const spent=rows.map((r,i)=>x(i).toFixed(1)+','+y(r.spent).toFixed(1)).join(' ');
 const grid=[0,1,2,3,4].map(i=>{
  const yy=top+plotH*i/4,value=max*(1-i/4);
  return '<line x1="'+left+'" y1="'+yy.toFixed(1)+'" x2="'+(width-right)+'" y2="'+yy.toFixed(1)+'" stroke="#e2e9f2"/>'+
   '<text x="'+(left-10)+'" y="'+(yy+4).toFixed(1)+'" text-anchor="end" class="frt-exec-axis-label">'+compactMoney(value)+'</text>';
 }).join('');
 const labels=rows.map((r,i)=>'<text x="'+x(i).toFixed(1)+'" y="'+(height-25)+'" text-anchor="middle" class="frt-exec-axis-label">'+escape(monthLabel(r.period))+'</text>').join('');
 const requestedArea=left+','+(top+plotH)+' '+requested+' '+(left+plotW)+','+(top+plotH);
 return '<svg class="frt-exec-trend-chart" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Six-month requested versus actual spent trend">'+
  grid+'<polygon points="'+requestedArea+'" fill="#2787d0" opacity=".09"/>'+
  '<polyline points="'+requested+'" fill="none" stroke="#2787d0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+
  '<polyline points="'+spent+'" fill="none" stroke="#f28a27" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+
  rows.map((r,i)=>'<circle cx="'+x(i).toFixed(1)+'" cy="'+y(r.requested).toFixed(1)+'" r="4" fill="#2787d0"/>'+
   '<circle cx="'+x(i).toFixed(1)+'" cy="'+y(r.spent).toFixed(1)+'" r="4" fill="#f28a27"/>').join('')+
  labels+'</svg>';
}
const unavailable=reason=>'<section class="frt-exec frt-exec-blocked" role="status" aria-label="Executive Dashboard unavailable">'+
 '<header class="frt-exec-header"><span class="frt-exec-heading-icon" aria-hidden="true">◎</span><div><h2>Executive Dashboard</h2><p>Company-scoped financial overview</p></div></header>'+
 '<div class="frt-exec-notice">'+(reason==='EXECUTIVE_REPORTING_NOT_ACTIVATED'?
 'Executive reporting is not activated on the existing backend yet. Fund Tracker remains available; no estimates or sample amounts are displayed.':
 'Executive reporting data is currently unavailable. Refresh after the signed reporting service is available.')+'</div></section>';
export function renderFRTExecutiveDashboard(result){
 if(result?.status!=='PASS')return '<section class="frt-exec" role="status">Executive Dashboard requires a verified FRT session.</section>';
 const executive=result.executive;
 if(executive?.status!=='PASS')return unavailable(executive?.reason);
 const s=result.summary||{};
 const total=amount(executive.totalAmount),liquidated=amount(executive.totalLiquidated);
 const utilization=amount(executive.budgetUtilization),pending=amount(executive.pendingLiquidation);
 const categories=Array.isArray(executive.topCategories)?executive.topCategories:[];
 const trends=Array.isArray(executive.monthlyTrend)?executive.monthlyTrend:[];
 const cards=[
  ['Total Fund Requests',money(total),'Cumulative requested amount','blue','₱'],
  ['Total Liquidated',money(liquidated),'Completed fund requests · Done / Closed','green','✓'],
  ['Budget Utilization',percentage.format(utilization)+'%','Liquidated amount ÷ total requests','red','⌁'],
  ['Pending Liquidation',money(pending),'Approved requests awaiting liquidation','purple','◷']
 ];
 const cardHtml=cards.map(([label,value,detail,tone,symbol])=>
  '<article class="frt-exec-kpi frt-exec-'+tone+'"><span class="frt-exec-kpi-symbol" aria-hidden="true">'+symbol+'</span>'+
  '<strong>'+value+'</strong><span>'+label+'</span><small>'+detail+'</small></article>').join('');
 const warning=utilization>90?
  '<div class="frt-exec-notice" role="alert">Budget utilization exceeds 90% — review spending controls.</div>':
  '<div class="frt-exec-notice frt-exec-notice-neutral" role="status">Financial metrics are based on the selected company’s signed FRT records.</div>';
 const legend=[['Pending Approval',count(s.pending),'blue'],
  ['In Progress',count(s.in_progress),'orange'],
  ['Completed',count(s.completed),'green']].map(([label,value,tone])=>
   '<span class="frt-exec-legend-item"><i class="frt-exec-legend-dot frt-exec-legend-'+tone+'"></i>'+label+' <b>'+value+'</b></span>').join('');
 return '<section class="frt-exec" aria-label="Executive Dashboard" data-testid="frt-executive-dashboard">'+
  '<header class="frt-exec-header"><span class="frt-exec-heading-icon" aria-hidden="true">◎</span><div><h2>Executive Dashboard</h2><p>Real-time financial insights and performance metrics · '+escape(result.companyCode)+'</p></div></header>'+
  warning+'<div class="frt-exec-kpis">'+cardHtml+'</div>'+
  '<div class="frt-exec-chart-grid"><section class="frt-exec-panel"><header><h3>Request Status Pipeline</h3><p>Current workflow distribution · '+count(s.total_requests)+' signed requests</p></header>'+
  statusChart(s)+'<div class="frt-exec-legend">'+legend+'</div></section>'+
  '<section class="frt-exec-panel"><header><h3>Top 5 Expense Categories</h3><p>Highest requested expense-item categories</p></header>'+
  categoryChart(categories)+'</section></div>'+
  '<section class="frt-exec-panel frt-exec-trends"><header><h3>6-Month Financial Trends</h3><p>Requested versus actual liquidation spending</p></header>'+
  (trends.length?trendChart(trends):'<div class="frt-exec-chart-empty" role="status">No monthly trend data is available.</div>')+
  '<div class="frt-exec-legend"><span class="frt-exec-legend-item"><i class="frt-exec-legend-dot frt-exec-legend-blue"></i>Requested</span>'+
  '<span class="frt-exec-legend-item"><i class="frt-exec-legend-dot frt-exec-legend-orange"></i>Spent</span></div></section>'+
  '<footer class="frt-exec-footnote">Total liquidated follows the existing FRT completed-request definition (Done / Closed). Budget utilization is total liquidated divided by total requested. Monthly spent values use submitted liquidation totals; expense categories use submitted request-item amounts. Source: signed, workspace- and company-scoped aggregate RPC. No recipient, banking, requester or request-level financial details are returned.</footer></section>';
}
