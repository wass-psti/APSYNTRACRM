/** FuelTrack+ Approvals — verified queue presentation.
 * The signed snapshot and decision handlers remain the only source of approval state and writes.
 */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const metric=(value,label,icon,tone)=>'<article class="ft3-approval-metric ft3-approval-metric-'+tone+'">'+
 '<span class="ft3-approval-metric-icon" aria-hidden="true">'+icon+'</span>'+
 '<div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div></article>';
const approvalDate=value=>new Intl.DateTimeFormat('en-PH',{
 month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',
 timeZone:'Asia/Manila',hour12:true
}).format(new Date(value));
const approvalFact=(label,value)=>value===null||value===undefined||value===''?'':'<div><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';
const approvalCard=(r,index,actionEnabled)=>{
 const canAct=actionEnabled&&Number.isSafeInteger(r.revision)&&r.revision>0;
 const reasonId='ft3-reason-'+r.id;
 const numberLabel=value=>new Intl.NumberFormat('en-PH',{maximumFractionDigits:2}).format(value);
 const facts=[
  approvalFact('Request type',r.requestType==='vehicle'?'Vehicle fuel':r.requestType==='container'?'Container refill':null),
  approvalFact('Requested by',r.requestorName),
  approvalFact(r.requestType==='vehicle'?'Vehicle plate':'Asset reference',r.reference),
  approvalFact('Vehicle owner',r.vehicleOwner),
  approvalFact('Trip route',r.origin&&r.destination?r.origin+' → '+r.destination:null),
  approvalFact('Odometer',r.odometer===null?null:numberLabel(r.odometer)+' km'),
  approvalFact('Distance',r.distance===null?null:numberLabel(r.distance)+' km'),
  approvalFact('Container quantity',r.containerCount===null?null:r.containerCount+' container'+(r.containerCount===1?'':'s')),
  approvalFact('Responsible person',r.responsiblePerson)
 ].filter(Boolean).join('');
 const purpose=r.purpose?'<div class="ft3-approval-card-details ft3-approval-purpose" aria-label="Request purpose"><div><span>Purpose</span><strong>'+esc(r.purpose)+'</strong></div></div>':'';
 return '<li class="ft3-approval-card"><article aria-label="Fuel request awaiting approval">'+
  '<div class="ft3-approval-card-top"><div class="ft3-approval-identity">'+
  '<span class="ft3-approval-card-index" aria-hidden="true">'+String(index+1).padStart(2,'0')+'</span>'+
  '<div class="ft3-approval-card-title"><span class="ft3-approval-eyebrow">FUEL REQUEST / REVIEW REQUIRED</span>'+
  '<h4>'+esc(r.title)+'</h4></div></div>'+
  '<span class="ft3-approval-status"><span aria-hidden="true">●</span> Pending approval</span></div>'+
  '<div class="ft3-approval-card-details"><div><span>Submitted</span><strong>'+
  esc(approvalDate(r.createdAt))+'</strong></div>'+
  '<div><span>Next step</span><strong>Approval decision</strong></div></div>'+
  (facts?'<div class="ft3-approval-card-details ft3-approval-request-facts" aria-label="Fuel request details">'+facts+'</div>':'')+
  purpose+  (canAct?'<div class="ft3-approval-decision">'+
   '<div class="ft3-approval-decision-copy"><span>REVIEW ACTION</span>'+
   '<strong>Record your decision</strong><p>Approve the request or provide a reason to reject it.</p></div>'+
   '<div class="ft3-approval-controls">'+
   '<label class="ft3-approval-reason" for="'+esc(reasonId)+'">'+
   '<span>Rejection reason <b>Required to reject</b></span>'+
   '<input id="'+esc(reasonId)+'" maxlength="1000" placeholder="Enter the reason for rejection" autocomplete="off" aria-describedby="'+esc(reasonId)+'-hint">'+
   '<small id="'+esc(reasonId)+'-hint">Up to 1,000 characters. Required before rejecting.</small></label>'+
   '<div class="ft3-approval-buttons">'+
   '<button class="ft3-approval-accept" type="button" data-action="ft3-approve" data-id="'+esc(r.id)+'">'+
   '<span aria-hidden="true">✓</span> Approve request</button>'+
   '<button class="ft3-approval-reject" type="button" data-action="ft3-reject" data-id="'+esc(r.id)+'">'+
   '<span aria-hidden="true">×</span> Reject request</button></div></div></div>':
   '<p class="ft3-approval-readonly" role="note">Decision actions are unavailable for this request.</p>')+
  '</article></li>';
};
const blocked='<div class="ft3-approval-unavailable" role="status">'+
 '<span class="ft3-approval-unavailable-icon" aria-hidden="true">◷</span>'+
 '<div><span class="ft3-approval-eyebrow">SIGNED DATA NOT VERIFIED</span>'+
 '<h3>Approval queue unavailable</h3>'+
 '<p>Approval statistics and pending requests are unavailable until the signed FuelTrack approval service is connected. No decision or delegation was attempted.</p></div></div>';
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
 const optionalText=(value,max)=>value===undefined||value===null||
  (typeof value==='string'&&value.length<=max);
 const optionalNumber=(value,max)=>value===undefined||value===null||
  (typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max);
 if(!snapshot.pending.every(r=>r&&typeof r.id==='string'&&r.id.length>0&&
  typeof r.title==='string'&&r.title.length<=240&&
  typeof r.createdAt==='string'&&Number.isFinite(Date.parse(r.createdAt))&&
  optionalText(r.requestorName,200)&&
  (r.requestType===undefined||r.requestType===null||['vehicle','container'].includes(r.requestType))&&
  optionalText(r.reference,120)&&optionalText(r.purpose,500)&&
  optionalText(r.vehicleOwner,150)&&optionalText(r.origin,240)&&
  optionalText(r.destination,240)&&optionalText(r.responsiblePerson,150)&&
  optionalNumber(r.odometer,1000000000)&&optionalNumber(r.distance,10000000)&&
  (r.containerCount===undefined||r.containerCount===null||
   (Number.isSafeInteger(r.containerCount)&&r.containerCount>=1&&r.containerCount<=10000))))return null;
 const ids=snapshot.pending.map(r=>r.id);
 if(new Set(ids).size!==ids.length)return null;
 return Object.freeze({approvedToday:snapshot.approvedToday,rejectedToday:snapshot.rejectedToday,
  decisionsToday:snapshot.decisionsToday,pendingCount:snapshot.pendingCount,
  pending:Object.freeze(snapshot.pending.map(r=>Object.freeze({
   id:r.id,title:r.title,createdAt:r.createdAt,revision:r.revision,
   requestorName:r.requestorName??null,requestType:r.requestType??null,
   reference:r.reference??null,purpose:r.purpose??null,vehicleOwner:r.vehicleOwner??null,
   origin:r.origin??null,destination:r.destination??null,
   odometer:r.odometer??null,distance:r.distance??null,
   containerCount:r.containerCount??null,responsiblePerson:r.responsiblePerson??null
  }))) });
}
export function renderFuelTrackApprovals({snapshot=null,boardId=null,workspaceId=null,actionEnabled=false}={}){
 const model=fuelTrackApprovalModel({snapshot,boardId,workspaceId});
 const rate=model&&model.decisionsToday>0?Math.round(model.approvedToday/model.decisionsToday*100)+'%':'—';
 return '<section class="ft3-approvals" aria-labelledby="ft3-approvals-heading">'+
 '<header class="ft3-approvals-heading"><div class="ft3-approvals-heading-main">'+
 '<span class="ft3-approval-eyebrow">FUEL OPERATIONS / DECISION CENTER</span>'+
 '<div class="ft3-approvals-title-row"><h2 id="ft3-approvals-heading">Approvals</h2>'+
 '<span class="ft3-approvals-data-state '+(model?'is-verified':'is-unavailable')+'">'+
 (model?'<span aria-hidden="true">●</span> Verified approval data':'<span aria-hidden="true">○</span> Data unavailable')+'</span></div>'+
 '<p>Review submitted fuel requests and record decisions through the existing approval workflow.</p>'+
 '<span class="ft3-approvals-pending-summary">'+(model?esc(model.pendingCount)+' pending review':'Pending review unavailable')+'</span>'+
 '</div><div class="ft3-approvals-actions">'+
 '<button type="button" data-action="refresh-board"><span aria-hidden="true">↻</span> Refresh queue</button></div></header>'+
 '<div class="ft3-approvals-metrics" aria-label="Verified approval statistics">'+
 metric(model?model.approvedToday:'—','Approved today','✓','approved')+
 metric(model?model.rejectedToday:'—','Rejected today','×','rejected')+
 metric(model?model.decisionsToday:'—','Decisions today','↗','decisions')+
 metric(rate,'Approval rate','◷','rate')+'</div>'+
 '<div class="ft3-approvals-sort" aria-label="Queue ordering"><span>Queue order</span><span>Newest submissions first</span></div>'+
 (model?(model.pendingCount===0?
  '<div class="ft3-approvals-empty"><span class="ft3-approvals-empty-icon" aria-hidden="true">✓</span>'+
  '<span class="ft3-approval-eyebrow">QUEUE STATUS</span><h3>All clear!</h3>'+
  '<p>No pending requests to review. New submissions will appear here.</p></div>':
  '<div class="ft3-approvals-queue" role="region" aria-label="Pending approval requests">'+
  '<div class="ft3-approvals-queue-heading"><div><span class="ft3-approval-queue-label">REVIEW QUEUE</span>'+
  '<h3>Awaiting your decision</h3>'+
  '<p>'+esc(model.pendingCount)+' request'+(model.pendingCount===1?'':'s')+' waiting for an approval decision</p></div>'+
  '<span class="ft3-approval-queue-count">'+esc(model.pendingCount)+' pending</span></div>'+
  (actionEnabled?'':'<p class="ft3-approval-readonly">Review actions are unavailable until the signed decision contract is activated.</p>')+
  '<ul class="ft3-approval-cards">'+model.pending.map((r,i)=>approvalCard(r,i,actionEnabled)).join('')+'</ul>'+
  (model.pendingCount>model.pending.length?'<p class="ft3-approval-pagination-note">Additional requests require a signed paginated response.</p>':'')+'</div>'):blocked)+
 '</section>';
}
