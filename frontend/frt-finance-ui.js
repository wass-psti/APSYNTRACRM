/** CP-FRT-SEC12: FRT board finance read-only UI; escape every server value. */
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const count=v=>Number.isSafeInteger(v)&&v>=0?String(v):'—';
export function renderFRTFinanceReadOnly({result=null,busy=false}={}){
 let html='<div class="page-head"><div><span class="label-top">Fund Released Tracker / Domain</span>'+
  '<h2>Financial requests</h2><p>Authoritative signed Supabase FRT snapshot. '+
  'Read-only; no amounts, bank details or requester identities are displayed.</p></div>'+
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
 html+='<div class="stat-grid" aria-label="Authorized FRT request counts">'+
  totals.map(([label,key])=>'<div class="stat-card"><div class="stat-label">'+label+
   '</div><div class="stat-value">'+count(result.summary?.[key])+'</div></div>').join('')+
  '</div><div class="panel"><div class="panel-header"><h3>Recent FRT requests</h3>'+
  '<span>Read-only · up to 100 entries displayed</span></div><div class="table-scroll"><table class="board-table">'+
  '<thead><tr><th>Voucher</th><th>Request</th><th>Status</th><th>Date needed</th></tr></thead><tbody>';
 html+=(result.requests||[]).map(r=>'<tr><td>'+escape(r.voucher)+'</td>'+
  '<td>'+escape(r.title)+'</td><td>'+escape(r.status)+'</td><td>'+
  escape(r.dateNeeded)+'</td></tr>').join('')||
  '<tr><td colspan="4" class="muted">No requests found for this company.</td></tr>';
 html+='</tbody></table></div></div><p class="muted">Backend returns at most 500 recent requests; '+
  'the first 100 are displayed. Monetary values, banking fields, files, '+
  'requestor identities and finance mutations are outside this read-only view.</p>';
 return html;
}
