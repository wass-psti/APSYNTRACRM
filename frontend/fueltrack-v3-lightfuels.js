/** LightFuels reference surface.
 * Board Fuel Events are NOT assumed to be refueling requests.
 * A dedicated signed server projection is required before showing queue data.
 * This module performs no writes, storage operations, or role inference.
 */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uint=v=>Number.isSafeInteger(v)&&v>=0;
const validDate=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function fuelTrackLightFuelsModel({snapshot=null,boardId=null,workspaceId=null}={}){
 if(!snapshot||snapshot.status!=='VERIFIED_READ'||snapshot.boardId!==boardId||
    snapshot.workspaceId!==workspaceId||!Array.isArray(snapshot.queue)||
    !Array.isArray(snapshot.recent)||snapshot.queue.length>500||snapshot.recent.length>100||
    !['activeCount','processedCount','completedToday','overdueCount'].every(k=>uint(snapshot[k]))||
    snapshot.activeCount<snapshot.queue.length||
    snapshot.overdueCount>snapshot.activeCount)return null;
 const validQueue=r=>r&&typeof r.id==='string'&&r.id.length>0&&r.id.length<=128&&
   typeof r.requestor==='string'&&r.requestor.length<=120&&
   typeof r.type==='string'&&['vehicle','container'].includes(r.type)&&
   typeof r.status==='string'&&['Awaiting Refueling','Refueling Done'].includes(r.status)&&
   typeof r.reference==='string'&&r.reference.length<=120&&validDate(r.createdAt);
 const validRecent=r=>r&&typeof r.id==='string'&&r.id.length>0&&r.id.length<=128&&
   typeof r.requestor==='string'&&r.requestor.length<=120&&
   typeof r.reference==='string'&&r.reference.length<=120&&validDate(r.completedAt);
 if(!snapshot.queue.every(validQueue)||!snapshot.recent.every(validRecent))return null;
 const ids=[...snapshot.queue,...snapshot.recent].map(r=>r.id);
 if(new Set(ids).size!==ids.length)return null;
 const queue=snapshot.queue.map(r=>Object.freeze({
   id:r.id,requestor:r.requestor,type:r.type,status:r.status,
   reference:r.reference,createdAt:r.createdAt
 }));
 const recent=snapshot.recent.map(r=>Object.freeze({
   id:r.id,requestor:r.requestor,reference:r.reference,completedAt:r.completedAt
 }));
 return Object.freeze({
  activeCount:snapshot.activeCount,processedCount:snapshot.processedCount,
  completedToday:snapshot.completedToday,overdueCount:snapshot.overdueCount,
  queue:Object.freeze(queue),recent:Object.freeze(recent)
 });
}
const metric=(label,value)=>'<div class="ft3-light-metric"><small>'+esc(label)+
 '</small><strong>'+esc(value)+'</strong></div>';
const card=r=>'<article class="ft3-light-card"><div class="ft3-light-card-top"><strong>'+
 esc(r.requestor)+'</strong><span>'+esc(r.type==='vehicle'?'Vehicle':'Container')+'</span></div>'+
 '<p>'+esc(r.reference)+'</p><small>'+esc(r.status)+'</small>'+
 '<p class="ft3-light-created">Created '+esc(r.createdAt)+'</p>'+
 '<button type="button" disabled title="Signed refueling transition unavailable">'+
 'Process — unavailable</button></article>';
function workflowGuide(){
 return '<details class="ft3-light-guide"><summary>Refueling workflow requirements</summary>'+
 '<div class="ft3-light-guide-steps">'+
 '<section><h3>1. Mark as Refueling Done</h3>'+
 '<p>Confirm physical refueling is complete. This transition requires an authorized, audited server operation.</p>'+
 '<button type="button" disabled>Mark as Refueling Done — unavailable</button></section>'+
 '<section><h3>2. Enter Refueling & Receipt Details</h3>'+
 '<p>Actual amount, optional invoice or receipt number, fuel quantity and optional receipt photo are required by the reference workflow.</p>'+
 '<div class="ft3-light-field-grid"><label>Actual Amount (₱)<input type="number" min="0.01" step="0.01" placeholder="0.00" disabled></label>'+
 '<label>Invoice / Receipt Number<input type="text" placeholder="INV-XXXX" disabled></label>'+
 '<label>Fuel Quantity (Liters)<input type="number" min="0.01" step="0.01" placeholder="0" disabled></label>'+
 '<label>Receipt Photo<input type="file" accept="image/*" disabled></label></div>'+
 '<button type="button" disabled>Save & Complete — unavailable</button></section></div></details>';
}
export function renderFuelTrackLightFuels({snapshot=null,boardId=null,workspaceId=null}={}){
 const model=fuelTrackLightFuelsModel({snapshot,boardId,workspaceId});
 return '<section class="ft3-light" aria-labelledby="ft3-light-heading">'+
 '<header class="ft3-light-head"><div><h2 id="ft3-light-heading">LightFuels</h2>'+
 '<p>'+(model?esc(model.activeCount)+' in queue · '+esc(model.processedCount)+
 ' processed':'Queue and processing data unavailable')+'</p></div>'+
 '<button type="button" data-action="refresh-board">↻ Refresh</button></header>'+
 '<aside class="ft3-light-reminder"><strong>Fuel attendant reminder</strong>'+
 '<p>Mark a request as Refueling Done only after physical refueling. Then record required receipt and refueling details.</p></aside>'+
 (model&&model.overdueCount>0?'<p class="ft3-light-warning">'+
 esc(model.overdueCount)+' overdue requests require attention</p>':'')+
 '<div class="ft3-light-metrics">'+
 metric('Active Queue',model?model.activeCount:'—')+
 metric('Session Done',model?model.completedToday:'—')+
 metric('Total Processed',model?model.processedCount:'—')+'</div>'+
 '<div class="ft3-light-filters"><label for="ft3-light-search">Search queue</label>'+
 '<input id="ft3-light-search" type="search" placeholder="Search queue..." disabled>'+
 '<button type="button" disabled>All</button><button type="button" disabled>Vehicle</button>'+
 '<button type="button" disabled>Container</button></div>'+
 (model?(model.activeCount===0?
  '<div class="ft3-light-empty"><h3>Queue clear</h3><p>No requests awaiting refueling.</p></div>':
  '<div class="ft3-light-queue">'+model.queue.map(card).join('')+
  (model.activeCount>model.queue.length?'<p>More queue records require a signed paginated response.</p>':'')+'</div>'):
  '<p class="ft3-light-unavailable" role="status">The signed LightFuels queue and refueling workflow are not connected. No request or completion totals are inferred from Board items, and no refueling operation was attempted.</p>')+
 '<section class="ft3-light-completed"><h3>Recently Completed</h3><p>Latest fuel transactions</p>'+
 (model&&model.recent.length?'<div class="ft3-light-table-scroll"><table><thead><tr>'+
 '<th scope="col">Requestor</th><th scope="col">Vehicle / Container</th><th scope="col">Date</th></tr></thead><tbody>'+
 model.recent.map(r=>'<tr><td>'+esc(r.requestor)+'</td><td>'+esc(r.reference)+
 '</td><td>'+esc(r.completedAt)+'</td></tr>').join('')+'</tbody></table></div>':
 '<p class="ft3-light-completed-empty">'+(model?'No completed records in the verified response.':
 'Completed records unavailable without a signed service.')+'</p>')+'</section>'+
 workflowGuide()+'</section>';
}
