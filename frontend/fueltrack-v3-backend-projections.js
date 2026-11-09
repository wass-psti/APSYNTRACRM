/** Converts only verified signed FuelTrack RPC rows to existing views.
 * No Board-status reconstruction, client-side authorization, or writes.
 */
const validCount=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0;
const allowed=new Set(['submitted','approved','rejected','refueling_done','completed']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validRow=r=>r&&uuid.test(r.id||'')&&allowed.has(r.state)&&
 ['vehicle','container'].includes(r.kind)&&Number.isSafeInteger(Number(r.revision))&&
 Number(r.revision)>0&&r.details&&typeof r.details==='object'&&!Array.isArray(r.details)&&
 typeof r.requestor_name==='string'&&r.requestor_name.length<=200&&
 typeof r.created_at==='string'&&Number.isFinite(Date.parse(r.created_at));
const reference=r=>r.kind==='vehicle'?String(r.details.plate||'').slice(0,100):
 'Container × '+String(Number(r.details.containerCount)||0);
export function verifyFuelTrackBackendSnapshot(snapshot,boardId,workspaceId){
 if(!snapshot||snapshot.status!=='VERIFIED_READ'||snapshot.boardId!==boardId||
   snapshot.workspaceId!==workspaceId||!['Admin','User'].includes(snapshot.role)||
   !Array.isArray(snapshot.rows)||snapshot.rows.length>200||
   !snapshot.rows.every(validRow)||!snapshot.summary||
   !['total','submitted','approved','rejected','refuelingDone','completed']
     .every(k=>validCount(snapshot.summary[k])))return null;
 const ids=snapshot.rows.map(r=>r.id);
 return new Set(ids).size===ids.length?snapshot:null;
}
export function projectFuelTrackApprovals(snapshot){
 if(!snapshot||snapshot.role!=='Admin')return null;
 const summary=snapshot.summary;
 if(!['approvedToday','rejectedToday','decisionsToday','pendingCount']
     .every(k=>validCount(summary[k])))return null;
 const pending=snapshot.rows.filter(r=>r.state==='submitted').map(r=>({
  id:r.id,title:(reference(r)+' — '+r.requestor_name).slice(0,240),
  createdAt:r.created_at,revision:Number(r.revision)
 }));
 return {status:'VERIFIED_READ',boardId:snapshot.boardId,workspaceId:snapshot.workspaceId,
  approvedToday:Number(summary.approvedToday),rejectedToday:Number(summary.rejectedToday),
  decisionsToday:Number(summary.decisionsToday),pendingCount:Number(summary.pendingCount),pending};
}
export function projectFuelTrackLightFuels(snapshot){
 if(!snapshot||snapshot.role!=='Admin')return null;
 const summary=snapshot.summary;
 if(!['activeQueue','completed','completedToday','overdueCount'].every(k=>validCount(summary[k])))return null;
 const queue=snapshot.rows.filter(r=>['approved','refueling_done'].includes(r.state)).map(r=>({
   id:r.id,requestor:r.requestor_name.slice(0,120),type:r.kind,revision:Number(r.revision),
   status:r.state==='approved'?'Awaiting Refueling':'Refueling Done',
   reference:reference(r).slice(0,120),createdAt:r.created_at
 }));
 const recent=snapshot.rows.filter(r=>r.state==='completed').slice(0,100).map(r=>({
  id:r.id,requestor:r.requestor_name.slice(0,120),
  reference:reference(r).slice(0,120),completedAt:r.completed_at
 }));
 return {status:'VERIFIED_READ',boardId:snapshot.boardId,workspaceId:snapshot.workspaceId,
  activeCount:Number(summary.activeQueue),processedCount:Number(summary.completed),
  completedToday:Number(summary.completedToday),overdueCount:Number(summary.overdueCount),
  queue,recent};
}

const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const php=v=>Number.isFinite(Number(v))&&Number(v)>=0?
 new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(v)):'—';
const metric=(label,value)=>'<article class="ft3-metric"><div class="ft3-metric-label"><span>'+
 h(label)+'</span></div><strong>'+h(value)+'</strong></article>';
const statusLabel={submitted:'Submitted',approved:'Approved',rejected:'Rejected',
 refueling_done:'Refueling Done',completed:'Completed'};
/** Uses the native card/table design and only authoritative transaction records. */
export function renderFuelTrackSignedDashboard(snapshot){
 if(!snapshot)return '<p class="ft3-approval-unavailable">Signed FuelTrack data unavailable.</p>';
 const s=snapshot.summary;
 return '<section class="ft3-dashboard"><p class="ft3-new-boundary">Verified FuelTrack operations</p>'+
 '<div class="ft3-metrics">'+metric('Total Requests',s.total)+
 metric('Pending Approvals',s.submitted)+metric('Approved',s.approved)+
 metric('Completed',s.completed)+metric('Completed Liters',s.totalLiters??'—')+
 metric('Completed Spending',php(s.totalAmount))+'</div>'+
 renderFuelTrackSignedRequests(snapshot,true)+'</section>';
}
export function renderFuelTrackSignedRequests(snapshot,compact=false){
 if(!snapshot)return '<p class="ft3-approval-unavailable">Signed requests unavailable.</p>';
 const rows=snapshot.rows;
 return '<section class="ft3-panel ft3-signed-requests"><header class="ft3-panel-head"><div><h3>'+
 (compact?'Recent Fuel Requests':'All Requests')+'</h3><p>'+
 rows.length+' latest authorized records; '+snapshot.summary.total+
 ' total</p></div></header>'+
 (rows.length?'<div class="ft3-recent-scroll"><table class="ft3-recent-table"><thead><tr>'+
 '<th scope="col">Requestor</th><th scope="col">Vehicle / Container</th>'+
 '<th scope="col">Status</th><th scope="col">Submitted</th></tr></thead><tbody>'+
 rows.slice(0,compact?15:200).map(r=>'<tr><td>'+h(r.requestor_name)+'</td><td>'+
 h(reference(r))+'</td><td>'+h(statusLabel[r.state])+'</td><td>'+
 h(r.created_at)+'</td></tr>').join('')+'</tbody></table></div>':
 '<p class="ft3-approval-unavailable">No fuel requests in the authorized records.</p>')+
 (rows.length>=200&&!compact?'<p>Older records require an authorized server pagination cursor.</p>':'')+
 '</section>';
}
export function renderFuelTrackSignedAnalytics(snapshot){
 if(!snapshot||snapshot.status!=='VERIFIED_READ'||!Array.isArray(snapshot.daily))
 return '<p class="ft3-approval-unavailable">Signed analytics unavailable.</p>';
 const rows=snapshot.daily;
 if(rows.length>365||rows.some(r=>!r||typeof r.day!=='string'||
  !validCount(r.transactions)||!Number.isFinite(Number(r.amount))||
  !Number.isFinite(Number(r.liters))))
 return '<p class="ft3-approval-unavailable">Invalid signed analytics response.</p>';
 return '<section class="ft3-panel ft3-signed-analytics"><header class="ft3-panel-head">'+
 '<div><h3>Fuel Analytics</h3><p>Completed refueling transactions · Manila-local calendar</p></div></header>'+
 (rows.length?'<div class="ft3-recent-scroll"><table class="ft3-recent-table"><thead>'+
 '<tr><th scope="col">Date</th><th scope="col">Transactions</th>'+
 '<th scope="col">Liters</th><th scope="col">Amount</th></tr></thead><tbody>'+
 rows.map(r=>'<tr><td>'+h(r.day)+'</td><td>'+h(r.transactions)+'</td><td>'+
 h(r.liters)+'</td><td>'+h(php(r.amount))+'</td></tr>').join('')+
 '</tbody></table></div>':
 '<p class="ft3-approval-unavailable">No completed refueling transactions in this period.</p>')+'</section>';
}
