/** FuelTrack+ Approvals. Reference-aligned, fail-closed view.
 * Fuel-event Board rows are not approval decisions. Only a future explicitly
 * authorized approval read contract may provide the verified snapshot.
 */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const metric=(value,label,icon)=>'<article class="ft3-approval-metric"><span aria-hidden="true">'+icon+'</span><div><strong>'+esc(value)+'</strong><small>'+esc(label)+'</small></div></article>';
const approvalDate=value=>new Intl.DateTimeFormat('en-PH',{
 month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',
 timeZone:'Asia/Manila',hour12:true
}).format(new Date(value));
const approvalCard=(r,index,actionEnabled)=>{
 const canAct=actionEnabled&&Number.isSafeInteger(r.revision)&&r.revision>0;
 return '<li class="ft3-approval-card"><article aria-label="Request awaiting approval">'+
  '<div class="ft3-approval-card-top"><div class="ft3-approval-identity">'+
  '<span class="ft3-approval-card-index" aria-hidden="true">'+String(index+1).padStart(2,'0')+'</span>'+
  '<div class="ft3-approval-card-title"><span class="ft3-approval-eyebrow">Fuel request · Awaiting review</span>'+
  '<h4>'+esc(r.title)+'</h4></div></div>'+
  '<span class="ft3-approval-status"><span aria-hidden="true">●</span> Pending approval</span></div>'+
  '<div class="ft3-approval-card-details"><div><span>Submitted</span><strong>'+
  esc(approvalDate(r.createdAt))+'</strong></div>'+
  '<div><span>Workflow</span><strong>Approval review</strong></div></div>'+
  (canAct?'<div class="ft3-approval-decision">'+
   '<button class="ft3-approval-accept" type="button" data-action="ft3-approve" data-id="'+esc(r.id)+'">'+
   '<span aria-hidden="true">✓</span> Approve request</button>'+
   '<label class="ft3-approval-reason" for="ft3-reason-'+esc(r.id)+'">'+
   '<span>Reason for rejection</span>'+
   '<input id="ft3-reason-'+esc(r.id)+'" maxlength="1000" placeholder="Required when rejecting" autocomplete="off"></label>'+
   '<button class="ft3-approval-reject" type="button" data-action="ft3-reject" data-id="'+esc(r.id)+'">'+
   '<span aria-hidden="true">×</span> Reject</button></div>':
   '<p class="ft3-approval-readonly">Decision actions are unavailable for this request.</p>')+
  '</article></li>';
};
const blocked='<p class="ft3-approval-unavailable" role="status">Approval statistics and pending requests are unavailable until the signed FuelTrack approval service is connected. No decision or delegation was attempted.</p>';
/** Contract: opaque read receipt must be VERIFIED_READ, workspace/board scoped,
 * and counts must be server-computed integers. Never derive from Board status.
 */
export function fuelTrackApprovalModel({snapshot=null,boardId=null,workspaceId=null}={}){
 if(!snapshot||snapshot.status!=='VERIFIED_READ'||snapshot.boardId!==boardId||
  snapshot.workspaceId!==workspaceId||!Array.isArray(snapshot.pending)||
  snapshot.pending.length>500||
  !['approvedToday','rejectedToday','decisionsToday','pendingCount'].every(key=>
   Number.isSafeInteger(snapshot[key])&&snapshot[key]>=0)||
  snapshot.decisionsToday<snapshot.approvedToday+snapshot.rejectedToday||
  snapshot.pendingCount<snapshot.pending.length)return null;
 if(!snapshot.pending.every(r=>r&&typeof r.id==='string'&&r.id.length>0&&
  typeof r.title==='string'&&r.title.length<=240&&
  typeof r.createdAt==='string'&&Number.isFinite(Date.parse(r.createdAt))))return null;
 const ids=snapshot.pending.map(r=>r.id);
 if(new Set(ids).size!==ids.length)return null;
 return Object.freeze({approvedToday:snapshot.approvedToday,rejectedToday:snapshot.rejectedToday,
  decisionsToday:snapshot.decisionsToday,pendingCount:snapshot.pendingCount,
  pending:Object.freeze(snapshot.pending.map(r=>Object.freeze({id:r.id,title:r.title,createdAt:r.createdAt,revision:r.revision})))});
}
export function renderFuelTrackApprovals({snapshot=null,boardId=null,workspaceId=null,actionEnabled=false}={}){
 const model=fuelTrackApprovalModel({snapshot,boardId,workspaceId});
 const rate=model&&model.decisionsToday>0?Math.round(model.approvedToday/model.decisionsToday*100)+'%':'—';
 return '<section class="ft3-approvals" aria-labelledby="ft3-approvals-heading">'+
 '<header class="ft3-approvals-heading"><div><h2 id="ft3-approvals-heading">Approvals</h2>'+
 '<p>'+(model?esc(model.pendingCount)+' pending review':'Pending review unavailable')+'</p></div>'+
 '<div class="ft3-approvals-actions">'+
 '<button type="button" data-action="refresh-board">↻ Refresh</button></div></header>'+
 '<div class="ft3-approvals-metrics" aria-label="Verified approval statistics">'+
 metric(model?model.approvedToday:'—','Approved today','✓')+
 metric(model?model.rejectedToday:'—','Rejected today','×')+
 metric(model?model.decisionsToday:'—','Decisions today','↗')+
 metric(rate,'Approval rate','◷')+'</div>'+
 '<div class="ft3-approvals-sort" aria-label="Approval queue sort options">'+
 '<span>Sort by</span><button type="button" disabled>Newest</button><button type="button" disabled>Oldest</button>'+
 '<button type="button" disabled>Urgency</button><button type="button" disabled>Name</button></div>'+
 (model?(model.pendingCount===0?
  '<div class="ft3-approvals-empty"><span aria-hidden="true">▤</span><h3>All clear!</h3><p>No pending requests to review.</p></div>':
  '<div class="ft3-approvals-queue" role="region" aria-label="Pending approval requests">'+
  '<div class="ft3-approvals-queue-heading"><div><span class="ft3-approval-queue-label">REVIEW QUEUE</span>'+
  '<h3>Awaiting your decision</h3>'+
  '<p>'+esc(model.pendingCount)+' request'+(model.pendingCount===1?'':'s')+' pending approval</p></div>'+
  '<span class="ft3-approval-queue-count">'+esc(model.pendingCount)+' pending</span></div>'+
  (actionEnabled?'':'<p class="ft3-approval-readonly">Review actions are unavailable until the signed decision contract is activated.</p>')+
  '<ul class="ft3-approval-cards">'+model.pending.map((r,i)=>approvalCard(r,i,actionEnabled)).join('')+'</ul>'+
  (model.pendingCount>model.pending.length?'<p>Additional requests require a signed paginated response.</p>':'')+'</div>'):blocked)+
 '</section>';
}
