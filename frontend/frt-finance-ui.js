/** FRT signed safe reads; only existing server-authorized date corrections mutate. */
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const count=v=>Number.isSafeInteger(v)&&v>=0?String(v):'—';
import {frtActionSpec} from './frt-board-domain-actions.js';
const editRoles=new Set(['FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER']);
const statusTone=value=>{
 const v=String(value||'').toUpperCase();
 if(['CLOSED','DONE','COMPLETED','APPROVED'].includes(v))return 'completed';
 if(v.includes('PENDING'))return 'pending';
 if(['REJECTED','BLOCKED'].includes(v))return 'blocked';
 return 'working';
};
const friendlyStatus=value=>String(value||'—').replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase());
const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));
function chartDonut(summary){
 const values=[summary?.completed||0,summary?.in_progress||0,summary?.pending||0];
 const sum=values.reduce((a,b)=>a+b,0);
 const total=Math.max(sum,summary?.total_requests||0,1);
 let offset=0;
 const arcs=values.map((value,i)=>{
  const span=clamp(100*value/total);
  const circle='<circle cx="60" cy="60" r="43" fill="none" stroke="'+
   ['#f0a7a5','#a8c7e4','#b6e4c6'][i]+'" stroke-width="18" stroke-dasharray="'+
   span.toFixed(2)+' '+(100-span).toFixed(2)+'" stroke-dashoffset="'+(-offset).toFixed(2)+
   '" pathLength="100" transform="rotate(-90 60 60)"/>';
  offset+=span;return circle;
 }).join('');
 return '<svg class="frt-ref-donut" viewBox="0 0 120 120" role="img" aria-label="Request distribution: '+
  values[0]+' completed, '+values[1]+' in progress, '+values[2]+' pending approval">'+
  '<circle cx="60" cy="60" r="43" fill="none" stroke="#e7ebf2" stroke-width="18"/>'+arcs+
  '<text x="60" y="64" text-anchor="middle" class="frt-ref-donut-center">'+count(summary?.total_requests)+'</text></svg>';
}
function chartBars(summary){
 const values=[summary?.completed||0,summary?.in_progress||0,summary?.pending||0];
 const max=Math.max(1,...values);
 const bars=values.map((value,i)=>{
  const x=58+i*105,height=Math.round(111*value/max);
  return '<rect x="'+x+'" y="'+(144-height)+'" width="64" height="'+height+
    '" rx="5" fill="'+['#f0a7a5','#a7c6e5','#b6e4c6'][i]+'"/>'+
    '<text x="'+(x+32)+'" y="'+(137-height)+'" text-anchor="middle" class="frt-ref-chart-number">'+value+'</text>';
 }).join('');
 return '<svg viewBox="0 0 370 182" class="frt-ref-bars" role="img" aria-label="Request status comparison: '+
  values[0]+' completed, '+values[1]+' in progress, '+values[2]+' pending approval">'+
  '<path d="M38 30H360 M38 58H360 M38 86H360 M38 114H360 M38 144H360" stroke="#e9edf4" fill="none"/>'+bars+
  '<text x="90" y="165" text-anchor="middle">Completed</text><text x="195" y="165" text-anchor="middle">In progress</text>'+
  '<text x="300" y="165" text-anchor="middle">Pending</text></svg>';
}
function renderFRTExecutiveDashboard(result){
 const summary=result.summary||{};
 const metrics=[
  ['Requested','—','Financial amount is not supplied by the current signed finance projection','violet','▤'],
  ['Liquidated','—','Liquidated amount is not supplied by the current signed finance projection','teal','✓'],
  ['Budget Utilization','—','Cannot calculate without verified budget and release totals','blue','◷'],
  ['Pending Liquidation',count(summary.pending_liquidation_count),'Verified company-scoped request count','rose','!']
 ];
 return '<section class="frt-exec-dashboard" aria-label="Executive Dashboard for '+escape(result.companyCode)+'">'+
  '<header class="frt-exec-heading"><div><span class="frt-exec-eyebrow">'+escape(result.companyCode)+' / FINANCIAL OVERVIEW</span>'+
  '<h2>Executive Dashboard</h2><p>Company-scoped fund request performance and workflow health.</p></div>'+
  '<span class="frt-exec-source">Signed company projection</span></header>'+
  '<div class="frt-exec-kpis">'+metrics.map(([label,value,note,tone,icon])=>
   '<article class="frt-exec-kpi frt-exec-'+tone+'"><div><span>'+label+'</span><strong>'+value+'</strong><small>'+note+'</small></div>'+
   '<i aria-hidden="true">'+icon+'</i></article>').join('')+'</div>'+
  '<div class="frt-exec-grid">'+
   '<section class="frt-exec-panel"><header><div><h3>Request Status Pipeline</h3><p>Verified workflow counts for '+escape(result.companyCode)+'</p></div></header>'+
    chartDonut(summary)+'<div class="frt-ref-legend"><span><i class="frt-ref-dot is-complete"></i>Completed <b>'+count(summary.completed)+'</b></span>'+
    '<span><i class="frt-ref-dot is-progress"></i>In progress <b>'+count(summary.in_progress)+'</b></span>'+
    '<span><i class="frt-ref-dot is-pending"></i>Pending approval <b>'+count(summary.pending)+'</b></span></div></section>'+
   '<section class="frt-exec-panel"><header><div><h3>Top 5 Expense Categories</h3><p>Highest requested spending areas</p></div></header>'+
    '<div class="frt-exec-empty"><strong>Category breakdown unavailable</strong><p>Expense-category totals are not supplied by the current signed finance projection.</p></div></section>'+
   '<section class="frt-exec-panel frt-exec-panel-wide"><header><div><h3>Requested vs. Spent — Last 6 Months</h3><p>Monthly financial comparison</p></div></header>'+
    '<div class="frt-exec-empty"><strong>Six-month trend unavailable</strong><p>Monthly requested and spent amounts are not supplied by the current signed finance projection.</p></div></section>'+
  '</div><p class="frt-exec-disclosure">Financial totals, expense categories and monthly amounts are not available in this signed read projection. They are shown as unavailable rather than estimated or fabricated. The 90% budget warning is evaluated only when verified utilization data exists.</p>'+
  '</section>';
}
function renderFRTOpexAnalytics(result){
 return '<section class="frt-exec-dashboard" aria-label="OPEX Analytics for '+escape(result.companyCode)+'">'+
  '<header class="frt-exec-heading"><div><span class="frt-exec-eyebrow">'+escape(result.companyCode)+' / OPERATING EXPENDITURE</span>'+
  '<h2>OPEX Analytics</h2><p>Expense categories and monthly requested-versus-spent performance.</p></div></header>'+
  '<div class="frt-exec-grid">'+
   '<section class="frt-exec-panel"><header><div><h3>Top 5 Expense Categories</h3><p>Company-scoped expense ranking</p></div></header>'+
    '<div class="frt-exec-empty"><strong>Category breakdown unavailable</strong><p>Expense-category totals are not supplied by the current signed finance projection.</p></div></section>'+
   '<section class="frt-exec-panel"><header><div><h3>Requested vs. Spent — Last 6 Months</h3><p>Monthly financial comparison</p></div></header>'+
    '<div class="frt-exec-empty"><strong>Trend data unavailable</strong><p>The six-month requested-versus-spent series is not supplied by the current signed finance projection.</p></div></section>'+
  '</div><p class="frt-exec-disclosure">No financial amounts or category totals are inferred from request titles, status counts or dates.</p></section>';
}
function renderFRTManual(result){
 return '<section class="frt-exec-dashboard" aria-label="Fund Released Tracker user manual">'+
  '<header class="frt-exec-heading"><div><span class="frt-exec-eyebrow">'+escape(result.companyCode)+' / HELP</span>'+
  '<h2>Fund Released Tracker — User Manual</h2><p>How to navigate the company-scoped finance views.</p></div></header>'+
  '<div class="frt-exec-manual"><article><h3>1. Select a company</h3><p>Use the company selector above to switch between companies available in your signed FRT workspace. Each view refreshes against the selected company.</p></article>'+
  '<article><h3>2. Review the Fund Tracker</h3><p>Open Fund Tracker to view the signed request list, status filters and existing request actions.</p></article>'+
  '<article><h3>3. Review Executive Dashboard and OPEX Analytics</h3><p>These views summarize the signed request status projection. Financial totals, expense categories and monthly amounts remain marked unavailable until the signed data contract supplies them.</p></article></div></section>';
}
export function renderFRTFinanceReadOnly({result=null,busy=false,detailResult=null,detailBusy=false,selectedRequestId=null,statusFilter='all',view='tracker'}={}){
 const selectedView=['tracker','executive','opex','manual'].includes(view)?view:'tracker';
 let html='<section class="frt-ref" aria-label="Fund Released Tracker application">'+
  '<header class="frt-ref-company"><div class="frt-ref-company-identity"><span class="frt-ref-icon" aria-hidden="true">▣</span>'+
  '<div><strong>Select Your Company</strong><small>Authorized company scope for requests and documents</small></div></div>';
 if(result?.status==='PASS'&&result.companies?.length){
  html+='<div class="frt-ref-company-switch" role="group" aria-label="Select authorized FRT company">'+
   result.companies.map(c=>'<button type="button" class="frt-ref-company-choice '+
    (c.code===result.companyCode?'is-active':'')+'" data-action="frt-finance-company" data-code="'+
    escape(c.code)+'" title="'+escape(c.name)+'" '+(busy?'disabled':'')+'>'+escape(c.code)+
    (c.code===result.companyCode?' <span aria-hidden="true">✓</span>':'')+'</button>').join('')+'</div>';
 }
 html+='</header><nav class="frt-ref-nav" aria-label="Fund Tracker sections">'+
  [['tracker','▤ &nbsp; Fund Tracker'],['executive','▦ &nbsp; Executive Dashboard'],
   ['opex','◫ &nbsp; OPEX Analytics'],['manual','▤ &nbsp; User Manual']].map(([key,label])=>
    '<button type="button" class="frt-ref-nav-button '+
    (selectedView===key?'frt-ref-nav-active':'')+'" data-action="frt-finance-view" data-view="'+key+'"'+
    (selectedView===key?' aria-current="page"':'')+'>'+label+'</button>').join('')+
  '</nav>';
 if(busy)return html+'<div class="frt-ref-loading" role="status">Loading verified financial requests…</div></section>';
 if(!result)return html+'<div class="frt-ref-loading">Select this view to read your authorized financial requests.</div></section>';
 if(result.status!=='PASS'){
  const reason=/^[A-Z0-9_]{1,65}$/.test(result.reason||'')?result.reason:'FRT_ACCESS_NOT_VERIFIED';
  return html+'<div class="frt-ref-loading" role="status">FRT finance data is unavailable: '+
   escape(reason)+'. No records or permissions were changed.</div></section>';
 }
 if(!result.companies?.length)return html+'<div class="frt-ref-loading">No FRT companies configured for this workspace.</div></section>';
 const summary=result.summary||{};
 const rows=Array.isArray(result.requests)?result.requests:[];
 const statuses=[...new Set(rows.map(r=>r.status))].sort();
 const filter=statusFilter==='all'||statuses.includes(statusFilter)?statusFilter:'all';
 const shown=rows.filter(r=>filter==='all'||r.status===filter);
 const selectedCompany=result.companies.find(c=>c.code===result.companyCode);
 if(selectedView==='executive')return html+renderFRTExecutiveDashboard(result)+'</section>';
 if(selectedView==='opex')return html+renderFRTOpexAnalytics(result)+'</section>';
 if(selectedView==='manual')return html+renderFRTManual(result)+'</section>';
 html+='<div class="frt-ref-deadlines" role="status"><span class="frt-ref-warning" aria-hidden="true">△</span>'+
  '<div><strong>Pending Liquidation</strong><small>Signed request workflow summary; overdue deadlines are not provided by this API</small></div>'+
  '<b>'+count(summary.pending_liquidation_count)+' pending</b></div>';
 html+='<div class="frt-ref-hero"><div class="frt-ref-hero-title"><span class="frt-ref-icon" aria-hidden="true">▣</span>'+
  '<div><h2>Fund Release Tracker</h2><p>Complete workflow from request to liquidation</p></div></div>'+
  '<div class="frt-ref-toolbar"><span class="frt-ref-pill" title="Signed FRT company">▣ '+
  escape(result.companyCode)+'</span><span class="frt-ref-company-name">'+escape(selectedCompany?.name||'')+'</span>'+
  '<button class="frt-ref-action is-primary" type="button" data-action="frt-ui-dialog" data-frt-section="new" title="Create an authorized fund request">＋ New Fund Request</button>'+
  '<button class="frt-ref-action" type="button" disabled title="Bulk fund-request import is not connected">⇧ Bulk Import</button>'+
  '<button class="frt-ref-action" type="button" data-action="frt-ui-dialog" data-frt-section="activity" title="View the activity-log panel">⌁ Activity Log</button>'+
  '<button class="frt-ref-action" type="button" data-action="frt-ui-dialog" data-frt-section="archive" title="View the archive-storage panel">▤ Archive Storage</button>'+
  '<button class="frt-ref-action" type="button" disabled title="Domain export is not connected in this phase">⇩ Export</button>'+
  '<button class="frt-ref-action frt-ref-refresh" type="button" data-action="frt-finance-refresh" '+
   (busy?'disabled':'')+' aria-label="Refresh Fund Released Tracker">↻ Refresh</button></div></div>';
 const metrics=[['Total Requests','total_requests','violet','▥'],['Completed','completed','teal','✓'],
  ['In Progress','in_progress','orange','◷'],['Pending Approval','pending','rose','!']];
 html+='<div class="frt-ref-metrics">'+metrics.map(([label,key,tone,icon])=>
  '<article class="frt-ref-metric frt-ref-'+tone+'"><div><span>'+label+'</span><strong>'+count(summary[key])+ '</strong></div>'+
  '<span class="frt-ref-metric-icon" aria-hidden="true">'+icon+'</span></article>').join('')+'</div>';
 html+='<div class="frt-ref-analytics"><section class="frt-ref-chart"><header><strong>Status Distribution</strong>'+
  '<small>Verified domain status counts</small></header>'+chartDonut(summary)+
  '<div class="frt-ref-legend"><span><i class="frt-ref-dot is-complete"></i>Completed</span>'+
  '<span><i class="frt-ref-dot is-progress"></i>In progress</span><span><i class="frt-ref-dot is-pending"></i>Pending approval</span></div></section>'+
  '<section class="frt-ref-chart"><header><strong>Request Overview</strong><small>Status comparison</small></header>'+chartBars(summary)+'</section></div>';
 html+='<section class="frt-ref-table-card"><header class="frt-ref-table-heading"><div><h3>Fund Requests</h3><small>'+count(summary.total_requests)+
  ' requests in '+escape(result.companyCode)+' · '+rows.length+' recent requests displayed</small></div><span class="frt-ref-role">'+
  escape(result.role)+'</span></header><div class="frt-ref-filters"><label for="frt-status-filter">Status</label>'+
  '<select id="frt-status-filter" aria-label="Filter FRT requests by status"><option value="all">All statuses</option>'+
  statuses.map(s=>'<option value="'+escape(s)+'"'+(filter===s?' selected':'')+'>'+escape(friendlyStatus(s))+'</option>').join('')+
  '</select><span>Financial amounts and requester identities are not in this signed projection.</span></div>'+
  '<div class="frt-ref-table-scroll"><table class="frt-ref-table"><thead><tr><th>Request Name</th><th>Amount</th><th>Voucher</th><th>Status</th>'+
  '<th>Liquidation</th><th>BPI BizLink</th><th>Date</th><th>Requestor</th><th>Actions</th></tr></thead><tbody>';
 html+=shown.map(r=>{
  const canEdit=editRoles.has(result.role)&&typeof r.requestId==='string';
  const requestId=escape(r.requestId||'');
  return '<tr><td class="frt-ref-request-name">'+escape(r.title)+'</td><td class="frt-ref-private">—</td>'+
   '<td class="frt-ref-voucher">'+escape(r.voucher)+'</td><td><span class="frt-ref-status is-'+statusTone(r.status)+'">'+
   escape(friendlyStatus(r.status))+'</span></td><td>—</td><td><button type="button" class="frt-ref-filing '+(r.filingStatus==='FILED'?'is-filed':'is-unfiled')+'" data-action="frt-filing-toggle" data-request-id="'+requestId+'" title="Click to update filing status">'+(r.filingStatus==='FILED'?'✓ Filed':'Not Filed')+'</button></td>'+
   '<td>'+escape(r.dateNeeded)+'</td><td class="frt-ref-private">—</td><td><div class="frt-ref-row-actions">'+
   (typeof r.requestId==='string'?'<button type="button" title="Discussion" aria-label="Discussion for '+escape(r.title)+'" data-action="frt-ui-dialog" data-frt-section="discussion" data-request-id="'+requestId+'">▣</button>':'')+
   (typeof r.requestId==='string'?'<button type="button" title="View request details" aria-label="View '+escape(r.title)+
    ' details" data-action="frt-finance-detail" data-request-id="'+requestId+'" '+(detailBusy?'disabled':'')+'>▤</button>':'')+
   (canEdit?'<button type="button" title="Edit date" data-action="frt-date-edit" data-request-id="'+requestId+'">◷</button>'+
    '<button type="button" title="Assign person" data-action="frt-person-edit" data-request-id="'+requestId+'">♙</button>':'')+
   '<details class="frt-ref-more"><summary aria-label="Request actions">⋮</summary><div class="frt-ref-more-menu">'+
   (typeof r.requestId==='string'?'<button type="button" data-action="frt-finance-detail" data-request-id="'+requestId+'">View Details</button>':'')+
   '<button type="button" disabled title="Requires a verified repeat-request contract">Repeat This Request</button>'+
   '<button type="button" disabled title="Requires a verified edit-request contract">Edit Request</button>'+
   '<button type="button" disabled title="Requires verified archive retrieval and lifecycle controls">Archive Request</button>'+
   '<button type="button" disabled title="Financial records cannot be deleted using an unverified contract">Delete Request</button></div></details></div></td></tr>';
 }).join('')||'<tr><td colspan="9" class="frt-ref-empty">No requests found for this company.</td></tr>';
 html+='</tbody></table></div><footer class="frt-ref-table-footer">'+
  'Showing authorized recent requests. New requests begin with Not Filed. '+
  'No approval, archive, comment or upload operation is simulated.</footer></section>';
 if(detailBusy){
  html+='<div class="panel"><div class="panel-body">Retrieving signed FRT request details…</div></div>';
 }else if(detailResult?.status==='PASS'&&detailResult.detail){
  const d=detailResult.detail;
  html+='<section class="panel" aria-label="FRT request details"><div class="panel-header"><h3>Request details (read-only)</h3>'+
   '<button type="button" class="secondary" data-action="frt-finance-detail-close">Close details</button></div>'+
   '<div class="panel-body"><div class="settings-grid">'+
   [['Voucher',d.voucher],['Request',d.title],['Date needed',d.dateNeeded],
    ['Request status',d.status],['Liquidation status',d.liquidationStatus],
    ['Finance approved',d.financeApproved?'Yes':'No'],
    ['GM verified',d.transferConfirmed?'Yes':'No'],
    ['Request closed',d.closed?'Yes':'No']].map(([label,value])=>
     '<div class="settings-detail"><label>'+escape(label)+'</label><strong>'+escape(value)+'</strong></div>'
    ).join('')+'</div><h3>Financial workflow contract</h3>'+
    '<p class="muted">Informational role-and-state assessment only. Candidate does not mean the server has authorized execution. '+
    'Every actual operation requires the existing FRT backend permission, session and lifecycle checks. '+
    'Choose a candidate action to review its consequences and explicitly confirm it. '+
    'The server determines whether it is permitted.</p>'+
    '<div class="table-scroll"><table class="board-table"><thead>'+
    '<tr><th>Existing backend action</th><th>Role and request state</th><th>Execution authority</th></tr>'+
    '</thead><tbody>'+d.workflow.map(w=>'<tr><td>'+escape(w.label)+'</td><td>'+
      (w.candidate?'Candidate — requires server authorization':'Not eligible by role/state')+
      '</td><td>'+(w.candidate&&frtActionSpec(w.code)&&selectedRequestId?
       '<button type="button" class="secondary" data-action="frt-finance-action" data-request-id="'+
        escape(selectedRequestId)+'" data-frt-action="'+escape(w.code)+'">Review '+escape(w.label)+'</button>':
       'Unavailable for this request')+'</td></tr>').join('')+
    '</tbody></table></div></div></section>';
 }else if(detailResult?.status==='BLOCKED'){
  const reason=/^[A-Z0-9_]{1,70}$/.test(detailResult.reason||'')?detailResult.reason:'FRT_DETAIL_NOT_VERIFIED';
  html+='<div class="panel"><div class="panel-body"><div class="note">Request details unavailable: '+
   escape(reason)+'. No request was modified.</div></div></div>';
 }
 return html+'</section>';
}
