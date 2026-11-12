/** FRT signed safe reads; only existing server-authorized date corrections mutate. */
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const count=v=>Number.isSafeInteger(v)&&v>=0?String(v):'—';
export function renderFRTFinanceReadOnly({result=null,busy=false,detailResult=null,detailBusy=false,selectedRequestId=null,statusFilter='all'}={}){
 let html='<div class="page-head"><div><span class="label-top">Fund Released Tracker / Domain</span>'+
  '<h2>Financial requests</h2><p>Authoritative signed Supabase FRT snapshot. '+
  'No amounts, bank details or requester identities are displayed. '+
  'Date corrections use the existing signed FRT backend.</p></div>'+
  '<div class="head-actions"><button class="secondary" data-action="frt-finance-refresh" '+
  (busy?'disabled':'')+'>'+(busy?'Loading…':'↻ Refresh FRT')+'</button></div></div>';
 if(busy)return html+'<div class="panel"><div class="panel-body">Verifying FRT finance access…</div></div>';
 if(!result)return html+'<div class="panel"><div class="panel-body">Select this view to read your authorized finance summary.</div></div>';
 if(result.status!=='PASS'){
  const reason=/^[A-Z0-9_]{1,65}$/.test(result.reason||'')?result.reason:'FRT_ACCESS_NOT_VERIFIED';
  return html+'<div class="panel"><div class="panel-body"><div class="note">FRT finance data is unavailable: '+
   escape(reason)+'. No financial records or permissions were changed.</div></div></div>';
 }
 html+='<div class="panel"><div class="panel-header"><h3>Authorized FRT role</h3>'+
  '<span>'+escape(result.role)+'</span></div><div class="panel-body">';
 if(!result.companies?.length)return html+'<p class="muted">No FRT companies are configured for this workspace.</p></div></div>';
 html+='<div class="toolbar"><div class="segmented" aria-label="Select authorized FRT company">'+
  result.companies.map(c=>'<button type="button" class="segment '+
   (c.code===result.companyCode?'active':'')+'" data-action="frt-finance-company" data-code="'+
   escape(c.code)+'" title="'+escape(c.name)+'">'+escape(c.code)+'</button>').join('')+
  '</div></div><p class="muted">Company: '+
  escape(result.companies.find(c=>c.code===result.companyCode)?.name||'Unknown')+'</p></div></div>';
 const totals=[['Requests','total_requests'],['Pending approval','pending'],
  ['In progress','in_progress'],['Completed','completed'],
  ['Pending liquidation','pending_liquidation_count']];
 const statuses=[...new Set((result.requests||[]).map(r=>r.status))].sort();
 const filter=statusFilter==='all'||statuses.includes(statusFilter)?statusFilter:'all';
 html+='<div class="toolbar" aria-label="FRT request filtering"><label for="frt-status-filter">Status</label>'+
  '<select id="frt-status-filter" aria-label="Filter FRT requests by status">'+
  '<option value="all">All statuses</option>'+statuses.map(s=>'<option value="'+escape(s)+'"'+
   (filter===s?' selected':'')+'>'+escape(s.replaceAll('_',' ').toLowerCase())+'</option>').join('')+
   '</select></div>';
 html+='<div class="stat-grid" aria-label="Authorized FRT request counts">'+
  totals.map(([label,key])=>'<div class="stat-card"><div class="stat-label">'+label+
   '</div><div class="stat-value">'+count(result.summary?.[key])+'</div></div>').join('')+
  '</div><div class="panel"><div class="panel-header"><h3>Recent FRT requests</h3>'+
  '<span>Signed requests · up to 100 entries displayed</span></div><div class="table-scroll"><table class="board-table">'+
  '<thead><tr><th>Voucher</th><th>Request</th><th>Status</th><th>Date needed</th><th>Details</th></tr></thead><tbody>';
 html+=(result.requests||[]).filter(r=>filter==='all'||r.status===filter).map(r=>'<tr><td>'+escape(r.voucher)+'</td>'+
  '<td>'+escape(r.title)+'</td><td>'+escape(r.status)+'</td><td>'+
  escape(r.dateNeeded)+(typeof r.requestId==='string'&&
   ['FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER'].includes(result.role)?
   ' <button type="button" class="secondary" data-action="frt-date-edit" data-request-id="'+
    escape(r.requestId)+'" aria-label="Edit date needed for '+escape(r.title)+'">Edit date</button>':'')+'</td><td>'+
  (typeof r.requestId==='string'?
    '<button type="button" class="secondary" data-action="frt-finance-detail" data-request-id="'+
    escape(r.requestId)+'" '+(detailBusy?'disabled':'')+'>'+
    (r.requestId===selectedRequestId?'Selected':'View details')+'</button>':
    '—')+'</td></tr>').join('')||
  '<tr><td colspan="5" class="muted">No requests found for this company.</td></tr>';
 html+='</tbody></table></div></div><p class="muted">Backend returns at most 500 recent requests; '+
  'the first 100 are displayed. Monetary values, banking fields, files, '+
  'requestor identities, person assignment, attachment upload, QR files and approval actions are not modified here.</p>';
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
    'No workflow actions are executable here.</p>'+
    '<div class="table-scroll"><table class="board-table"><thead>'+
    '<tr><th>Existing backend action</th><th>Role and request state</th><th>Execution authority</th></tr>'+
    '</thead><tbody>'+d.workflow.map(w=>'<tr><td>'+escape(w.label)+'</td><td>'+
      (w.candidate?'Candidate (not authorized)':'Not eligible by role/state')+
      '</td><td>Not verified — read-only</td></tr>').join('')+
    '</tbody></table></div></div></section>';
 }else if(detailResult?.status==='BLOCKED'){
  const reason=/^[A-Z0-9_]{1,70}$/.test(detailResult.reason||'')?detailResult.reason:'FRT_DETAIL_NOT_VERIFIED';
  html+='<div class="panel"><div class="panel-body"><div class="note">Request details unavailable: '+
   escape(reason)+'. No request was modified.</div></div></div>';
 }
 return html;
}
