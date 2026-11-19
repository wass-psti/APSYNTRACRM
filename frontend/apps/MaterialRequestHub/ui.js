/** Source-aligned Material Request Hub presentation; no local demo data or network calls. */
import {materialRequestHubHref} from './route.js';
import {materialRequestStatus} from './client.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const fmt=value=>Number.isFinite(Number(value))?Number(value).toLocaleString('en-PH'):'—';
const date=value=>value&&!Number.isNaN(Date.parse(value))?
 new Date(value).toLocaleDateString('en-PH',{dateStyle:'medium'}):'—';
const valueOf=field=>Array.isArray(field)?field[0]||'':field||'';
const can=(access,cap)=>access?.capabilities?.includes(cap)===true;
const tabs=Object.freeze([
 ['overview','Overview'],['new-request','New Request'],['requests','All Requests'],
 ['approvals','Approvals'],['release','Release']
]);
const sources=['WASS Inventory','PSTI Inventory','WAO Inventory','IFAB'];
const requestTypes=['Client PO','Project BOM'];
const invoiceTypes=['Service Invoice','Sales Invoice','No Invoice'];
function select(name,label,values,current=''){
 return '<label class="mrh-form-field"><span>'+esc(label)+'</span><select name="'+name+'">'+
  '<option value="">Select '+esc(label.toLowerCase())+'</option>'+
  values.map(v=>'<option value="'+esc(v)+'"'+(v===current?' selected':'')+'>'+esc(v)+'</option>').join('')+
  '</select></label>';
}
function requestForm({selected=null,edit=false,busy=false}={}){
 return '<section class="mrh-panel mrh-form-panel" aria-label="'+(edit?'Edit request':'New material request')+'">'+
  '<div class="mrh-panel-header"><div><span class="mrh-overline">REQUEST ENTRY</span><h2>'+
   (edit?'Edit Request':'New Material Request')+'</h2>'+
   '<p>Submit a request to the existing authenticated workspace workflow.</p></div></div>'+
  '<form data-mrh-form="'+(edit?'edit':'create')+'" class="mrh-form">'+
   '<label class="mrh-form-field mrh-wide"><span>Request title *</span>'+
   '<input name="name" type="text" minlength="1" maxlength="240" required value="'+esc(selected?.name||'')+
   '" placeholder="e.g., Equipment spares for site maintenance" /></label>'+
   select('typeOfRequest','Type of request',requestTypes,valueOf(selected?.typeOfRequest))+
   select('sourceInventory','Source inventory',sources,valueOf(selected?.sourceInventory))+
   select('typeOfInvoice','Type of invoice',invoiceTypes,valueOf(selected?.typeOfInvoice))+
   '<label class="mrh-form-field"><span>Requested quantity</span>'+
   '<input name="requestedQty" inputmode="decimal" type="number" min="0" max="1000000000000" step="0.0001" value="'+
    esc(selected?.requestedQty??'')+'"/></label>'+
   '<label class="mrh-form-field mrh-wide"><span>Remarks</span>'+
   '<textarea name="remarks" maxlength="4000" rows="4" placeholder="Context, delivery requirements, or instructions">'+
    esc(selected?.remarks||'')+'</textarea></label>'+
   '<div class="mrh-form-actions"><button class="mrh-primary" type="submit"'+(busy?' disabled':'')+'>'+
    (busy?'Saving…':edit?'Save Changes':'Create Request')+'</button>'+
    '<a class="mrh-quiet" href="'+materialRequestHubHref('requests')+'">Cancel</a></div>'+
   '<p class="mrh-form-help">Actual request IDs, ownership and audit records are assigned by the existing Supabase backend. Avoid duplicate submissions if the network response is uncertain.</p>'+
  '</form></section>';
}
function kpi(label,value,note,tone=''){
 return '<article class="mrh-kpi '+tone+'"><span>'+esc(label)+'</span><strong>'+
  esc(value)+'</strong><small>'+esc(note)+'</small></article>';
}
function dashboard(summary,access){
 if(!summary)return '<div class="mrh-panel mrh-loading" role="status">Loading authorized workflow statistics…</div>';
 const counts=Object.fromEntries(summary.statuses.map(r=>[materialRequestStatus(r.approvalStatus),Number(r.count)]));
 return '<section class="mrh-dashboard" aria-label="Material Request Hub overview">'+
  '<div class="mrh-kpis">'+
   kpi('Total Requests',fmt(summary.total),'All request records','mrh-kpi-primary')+
   kpi('Pending Approval',fmt(counts.pending||0),'Awaiting approval decision','mrh-kpi-amber')+
   kpi('Approved',fmt(counts.approved||0),'Approved, including released','mrh-kpi-green')+
   kpi('Rejected',fmt(counts.rejected||0),'Returned with a reason','mrh-kpi-rose')+
   '</div><div class="mrh-dashboard-grid">'+
   '<section class="mrh-panel"><div class="mrh-panel-header"><div><span class="mrh-overline">WORKFLOW</span>'+
   '<h2>Request status</h2><p>Counts obtained from signed database aggregates.</p></div></div>'+
   '<div class="mrh-breakdown-list">'+
    ['pending','approved','rejected'].map(status=>
     '<div class="mrh-breakdown-row"><span class="mrh-status '+status+'">'+esc(status)+'</span>'+
     '<strong>'+fmt(counts[status]||0)+'</strong></div>').join('')+
   '</div></section>'+
   '<section class="mrh-panel"><div class="mrh-panel-header"><div><span class="mrh-overline">INVENTORY</span>'+
   '<h2>Request sources</h2><p>Only authorized workspace aggregate data.</p></div></div>'+
   '<div class="mrh-breakdown-list">'+
    (summary.sources.length?summary.sources.map(entry=>
     '<div class="mrh-breakdown-row"><span>'+esc(entry.sourceInventory)+'</span><strong>'+
     fmt(entry.count)+'</strong></div>').join(''):
     '<p class="mrh-muted">No source records available in this workspace.</p>')+
   '</div></section></div>'+
   '<div class="mrh-actions-row"><a class="mrh-primary" href="'+materialRequestHubHref(can(access,'create')?'new-request':'requests')+'">'+
    (can(access,'create')?'＋ New Request':'Browse Requests')+'</a>'+
   '<a class="mrh-quiet" href="'+materialRequestHubHref('requests')+'">All Requests</a></div>'+
  '</section>';
}
function statusBadge(row){
 return '<span class="mrh-status '+row.status+'">'+
  (row.status==='pending'?'Pending':row.status==='approved'?'Approved':'Rejected')+'</span>';
}
function rowMarkup(row,{section,access,busy,rejectId}={}){
 const ready=section==='release'&&row.status==='approved'&&!row.releasedDate;
 const pending=section==='approvals'&&row.status==='pending';
 const actions=(pending&&can(access,'approve')?
  '<button type="button" class="mrh-row-action mrh-approve" data-mrh-decision="approve" data-id="'+esc(row.id)+'" data-version="'+row.version+'"'+(busy?' disabled':'')+'>Approve</button>':'')+
  (pending&&can(access,'reject')?
  '<button type="button" class="mrh-row-action mrh-reject" data-mrh-reject-open="'+esc(row.id)+'"'+(busy?' disabled':'')+'>Reject</button>':'')+
  (ready&&can(access,'release')?
  '<button type="button" class="mrh-row-action mrh-release" data-mrh-decision="release" data-id="'+esc(row.id)+'" data-version="'+row.version+'"'+(busy?' disabled':'')+'>Mark Released</button>':'');
 return '<tr><td class="mrh-row-title"><a href="'+materialRequestHubHref('requests',row.id)+'">'+
  esc(row.name)+'</a><small>'+esc(row.id)+'</small></td>'+
  '<td>'+statusBadge(row)+'</td><td>'+esc(row.inventory||'—')+'</td>'+
  '<td>'+esc(row.creatorName||'—')+'</td><td>'+esc(row.requestedQty??'—')+'</td>'+
  '<td>'+date(row.createdAt)+'</td><td class="mrh-row-actions">'+
  (actions||'<a href="'+materialRequestHubHref('requests',row.id)+'">View</a>')+
  (rejectId===row.id?'<form class="mrh-reject-form" data-mrh-reject-form="'+esc(row.id)+'" data-version="'+row.version+'">'+
   '<label><span class="sr-only">Rejection reason</span><textarea name="reason" maxlength="2000" required rows="2" placeholder="Rejection reason (required)"></textarea></label>'+
   '<button type="submit"'+(busy?' disabled':'')+'>Confirm rejection</button>'+
   '<button type="button" data-mrh-reject-cancel>Cancel</button></form>':'')+
  '</td></tr>';
}
function list({items,section,access,busy,loading,cursor,search='',rejectId=null}){
 const label=section==='approvals'?'Pending Approvals':section==='release'?'Approved Release Queue':'All Requests';
 const visible=section==='release'?items.filter(row=>!row.releasedDate):items;
 return '<section class="mrh-panel mrh-list">'+
  '<div class="mrh-panel-header"><div><span class="mrh-overline">REQUEST MANAGEMENT</span><h2>'+
   esc(label)+'</h2><p>'+esc(section==='approvals'?'Review pending requests using your existing role.':
    section==='release'?'Release only approved requests that have not already been released.':
    'Search and inspect material requests within your authorized workspace.')+'</p></div>'+
   '<button type="button" class="mrh-quiet" data-mrh-refresh'+(busy?' disabled':'')+'>↻ Refresh</button></div>'+
  '<form class="mrh-search" data-mrh-search><label for="mrh-request-search">Search request title</label>'+
   '<input id="mrh-request-search" type="search" name="search" value="'+esc(search)+'" maxlength="120" placeholder="Search requests…"/>'+
   '<button type="submit" class="mrh-primary">Search</button></form>'+
  '<div class="mrh-table-scroller" role="region" aria-label="'+esc(label)+'" tabindex="0">'+
   '<table class="mrh-table"><thead><tr><th scope="col">Request</th><th scope="col">Status</th>'+
   '<th scope="col">Source</th><th scope="col">Requested by</th><th scope="col">Qty</th>'+
   '<th scope="col">Created</th><th scope="col">Action</th></tr></thead><tbody>'+
   (visible.map(row=>rowMarkup(row,{section,access,busy,rejectId})).join('')||
    '<tr><td colspan="7" class="mrh-empty-row">'+
    (loading?'Loading signed requests…':'No matching authorized requests on this page.')+'</td></tr>')+
   '</tbody></table></div>'+
   (cursor?'<div class="mrh-list-footer"><button class="mrh-quiet" type="button" data-mrh-load-more'+(busy?' disabled':'')+'>Load more requests</button></div>':'')+
   '<p class="mrh-muted">Results are paged by the signed service. The release queue excludes completed releases from the current page.</p>'+
  '</section>';
}
function field(label,value){
 return '<div class="mrh-detail-field"><span>'+esc(label)+'</span><strong>'+esc(value??'—')+'</strong></div>';
}
function detail({selected,access,busy,editing}){
 if(!selected)return '<section class="mrh-panel mrh-loading">Loading signed request detail…</section>';
 if(editing)return requestForm({selected,edit:true,busy});
 const canEdit=can(access,'edit')&&
  (access.role==='ADMIN'||access.role==='REQUESTOR'&&
   selected.creator?.id===access.userId&&
   ['pending','rejected'].includes(selected.status)&&!selected.releasedDate);
 return '<section class="mrh-panel mrh-detail">'+
  '<div class="mrh-panel-header"><div><span class="mrh-overline">REQUEST DETAIL</span>'+
   '<h2>'+esc(selected.name)+'</h2><p>'+esc(selected.id)+'</p></div>'+
   '<div class="mrh-detail-actions"><a class="mrh-quiet" href="'+materialRequestHubHref('requests')+'">← All Requests</a>'+
    (canEdit?'<button class="mrh-primary" type="button" data-mrh-edit>Edit request</button>':'')+
   '</div></div>'+
   '<div class="mrh-detail-grid">'+field('Status',selected.approvalStatus)+
    field('Request type',selected.requestType||'—')+
    field('Inventory source',selected.inventory||'—')+
    field('Invoice type',selected.invoiceType||'—')+
    field('Requested quantity',selected.requestedQty??'—')+
    field('Total cost',selected.totalCost==null?'Not recorded':fmt(selected.totalCost))+
    field('Requested by',selected.creatorName||'—')+
    field('Created',date(selected.createdAt))+
    field('Released',selected.releasedDate?date(selected.releasedDate):'Not released')+
    '</div><div class="mrh-detail-notes"><h3>Remarks</h3><p>'+esc(selected.remarks||'No remarks entered.')+'</p>'+
    (selected.rejectionReason?'<h3>Rejection reason</h3><p>'+esc(selected.rejectionReason)+'</p>':'')+'</div>'+
    '<section class="mrh-detail-sub"><h3>Subtasks</h3>'+
     (!selected.subitems?.length?'<p class="mrh-muted">No subtasks recorded.</p>':
       '<ul>'+selected.subitems.map(x=>'<li>'+esc(x.name||'Untitled')+' · '+esc(x.status||'—')+'</li>').join('')+'</ul>')+
    '</section><section class="mrh-detail-sub"><h3>Attachments</h3>'+
     (!selected.assets?.length?'<p class="mrh-muted">No attachments recorded.</p>':
       '<ul>'+selected.assets.map(x=>'<li>'+esc(x.name||'File')+' · '+fmt(x.file_size||0)+' bytes</li>').join('')+'</ul>')+
    '<p class="mrh-muted">Attachment previews/downloads require separately verified private Storage access.</p></section>'+
   '<section class="mrh-detail-sub"><h3>Updates &amp; discussion</h3>'+
    (!selected.updates?.length?'<p class="mrh-muted">No updates yet.</p>':
     '<ul>'+selected.updates.map(x=>
      '<li><strong>'+esc(x.creator?.name||'Member')+'</strong> · '+date(x.created_at)+
      '<p>'+esc(x.text_body||'')+'</p></li>').join('')+'</ul>')+
    (can(access,'comment')?'<form class="mrh-comment-form" data-mrh-comment>'+
     '<label for="mrh-comment-text">Add update</label><textarea id="mrh-comment-text" name="text" rows="3" maxlength="8000" required></textarea>'+
     '<button type="submit" class="mrh-primary"'+(busy?' disabled':'')+'>Post update</button></form>':'')+
   '</section></section>';
}
export function renderMaterialRequestHub({
 access=null,section='overview',items=[],summary=null,selected=null,requestId=null,
 busy=false,loading=false,error='',notice='',cursor=null,search='',rejectId=null,
 editing=false,sourcingHref=null
}={}){
 const accessReady=!!access;
 return '<section class="mrh-app fm1-app" aria-label="Material Request Hub application">'+
  '<header class="mrh-app-header"><div><span class="mrh-overline">APSYNTRA CRM · INVENTORY OPERATIONS</span>'+
   '<h1>Material Request <span>Hub</span></h1>'+
   '<p>Request submission, controlled approvals, and inventory release.</p></div>'+
   '<div class="mrh-header-meta"><span class="mrh-role-badge">'+esc(access?.role||'Signed access required')+'</span>'+
    (access?.userName?'<small>'+esc(access.userName)+'</small>':'')+'</div></header>'+
   '<nav class="mrh-main-nav" aria-label="Material Request Hub sections">'+
    tabs.filter(([key])=>key!=='new-request'||can(access,'create')).map(([key,label])=>
     '<a href="'+materialRequestHubHref(key)+'"'+(section===key?' aria-current="page"':'')+
      ' class="mrh-nav-link'+(section===key?' active':'')+'">'+esc(label)+'</a>').join('')+
   (sourcingHref?'<a class="mrh-nav-link mrh-sourcing-link" href="'+esc(sourcingHref)+'">Material Sourcing</a>':'')+
   '</nav><div class="mrh-main-content">'+
   (error?'<div class="mrh-alert" role="alert">'+esc(error)+'</div>':'')+
   (notice?'<div class="mrh-notice" role="status">'+esc(notice)+'</div>':'')+
   (!accessReady?'<section class="mrh-panel mrh-empty">'+
    '<h2>Signed access required</h2><p>Material Request Hub only displays records after the existing Supabase workspace and module role have been verified.</p>'+
    '<button type="button" class="mrh-primary" data-mrh-refresh>Retry signed access</button></section>':
    requestId?detail({selected,access,busy,editing}):
    section==='overview'?dashboard(summary,access):
    section==='new-request'?can(access,'create')?requestForm({busy}):
     '<p class="mrh-alert">Your Material Request Hub role does not permit request creation.</p>':
    list({items,section,access,busy,loading,cursor,search,rejectId}))+
   '<footer class="mrh-app-footer"><span>APSYNTRA CRM · Material Request Hub</span>'+
    '<span>Supabase signed workspace · Real records only</span></footer>'+
   '</div></section>';
}
