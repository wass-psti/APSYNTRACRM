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
   id:r.id,requestor:r.requestor,type:r.type,status:r.status,revision:r.revision,
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
const displayDate=value=>new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',
 hour:'numeric',minute:'2-digit',hour12:true
}).format(new Date(value));
const card=(r,actionEnabled=false)=>{
 const canAct=actionEnabled&&Number.isSafeInteger(r.revision)&&r.revision>0;
 const awaiting=r.status==='Awaiting Refueling';
 return '<article class="ft3-light-card" aria-label="Refueling request">'+
 '<div class="ft3-light-card-top"><div class="ft3-light-card-person">'+
 '<span class="ft3-light-card-icon" aria-hidden="true">'+(r.type==='vehicle'?'⛽':'▣')+'</span>'+
 '<div><span class="ft3-light-card-overline">FUEL REQUEST</span><h3>'+esc(r.requestor)+'</h3></div></div>'+
 '<span class="ft3-light-card-type">'+esc(r.type==='vehicle'?'Vehicle':'Container')+'</span></div>'+
 '<div class="ft3-light-card-info"><div><span>Reference</span><strong>'+esc(r.reference)+'</strong></div>'+
 '<div><span>Submitted</span><strong>'+esc(displayDate(r.createdAt))+'</strong></div></div>'+
 '<div class="ft3-light-card-status"><span class="ft3-light-state'+(awaiting?' is-awaiting':'')+'">'+
 '<span aria-hidden="true">●</span> '+esc(r.status)+'</span></div>'+
 (canAct?(awaiting?
  '<button class="ft3-light-mark" type="button" data-action="ft3-mark-refueled" data-id="'+esc(r.id)+'">'+
  '<span aria-hidden="true">✓</span> Mark as Refueling Done</button>':
  '<button class="ft3-light-mark" type="button" data-action="ft3-open-receipt" data-id="'+esc(r.id)+'">'+
  'Enter Refueling & Receipt Details</button>'):
  '<p class="ft3-light-action-note" role="status">Signed Admin access and a current request revision are required to process this request.</p>')+
 '</article>';
};
const completedRow=(r,actionEnabled,receiptLink)=>{
 const ready=receiptLink?.requestId===r.id&&receiptLink.expiresAt>Date.now()&&
  typeof receiptLink.href==='string'&&/^https:\/\//.test(receiptLink.href);
 return '<tr class="ft3-light-history-row"><td data-label="Requestor"><div class="ft3-light-history-person">'+
 '<span class="ft3-light-history-avatar" aria-hidden="true">✓</span>'+
 '<div><strong>'+esc(r.requestor)+'</strong><small>Fuel transaction</small></div></div></td>'+
 '<td data-label="Vehicle / Container"><span class="ft3-light-history-reference">'+esc(r.reference)+'</span></td>'+
 '<td data-label="Completed"><time datetime="'+esc(r.completedAt)+'">'+esc(displayDate(r.completedAt))+'</time></td>'+
 '<td data-label="Receipt"><div class="ft3-light-history-actions">'+
 (actionEnabled?'<button type="button" class="ft3-light-history-action" data-action="ft3-attach-receipt" data-id="'+esc(r.id)+'">Attach receipt if missing</button>'+
  (ready?
   '<a class="ft3-light-history-action is-primary" href="'+esc(receiptLink.href)+'" target="_blank" rel="noopener noreferrer" aria-label="Open private receipt for '+esc(r.requestor)+'">Open receipt</a>':
   '<button type="button" class="ft3-light-history-action is-primary" data-action="ft3-view-receipt" data-id="'+esc(r.id)+'">Get receipt link</button>')+
  '<button type="button" class="ft3-light-history-action" data-action="ft3-verify-receipt" data-id="'+esc(r.id)+'">Verify file</button>':
  '<span class="ft3-light-history-unavailable">Admin access required</span>')+
 '</div></td></tr>';
};
function workflowGuide(){
 return '<details class="ft3-light-guide"><summary>Refueling workflow requirements</summary>'+
 '<div class="ft3-light-guide-steps">'+
 '<section><h3>1. Mark as Refueling Done</h3>'+
 '<p>Confirm physical refueling is complete. This transition requires an authorized, audited server operation.</p>'+
 '</section>'+
 '<section><h3>2. Enter Refueling & Receipt Details</h3>'+
 '<p>Actual amount, optional invoice or receipt number, fuel quantity and optional receipt photo are required by the reference workflow.</p>'+
 '<p>Complete the signed form inside the Refueling Done request card. Private receipt uploads are attached to the verified Board request.</p>'+
 '</section></div></details>';
}
export function renderFuelTrackLightFuels({snapshot=null,boardId=null,workspaceId=null,actionEnabled=false,receiptLink=null}={}){
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

 (model?(model.activeCount===0?
  '<div class="ft3-light-empty"><h3>Queue clear</h3><p>No requests awaiting refueling.</p></div>':
  '<div class="ft3-light-queue-head"><div><span>ACTIVE REQUESTS</span><h3>Refueling queue</h3></div><strong>'+esc(model.activeCount)+' awaiting processing</strong></div><div class="ft3-light-queue">'+model.queue.map(r=>card(r,actionEnabled)).join('')+
  (model.activeCount>model.queue.length?'<p>More queue records require a signed paginated response.</p>':'')+'</div>'):
  '<p class="ft3-light-unavailable" role="status">The signed LightFuels queue and refueling workflow are not connected. No request or completion totals are inferred from Board items, and no refueling operation was attempted.</p>')+
 '<section class="ft3-light-completed" aria-labelledby="ft3-light-history-title">'+
 '<header class="ft3-light-history-head"><div><span class="ft3-light-history-eyebrow">TRANSACTION HISTORY</span>'+
 '<h3 id="ft3-light-history-title">Recently Completed</h3>'+
 '<p>Latest verified fuel transactions</p></div>'+
 (model?'<span class="ft3-light-history-count">'+esc(model.processedCount)+' processed</span>':'')+
 '</header>'+
 (model&&model.recent.length?'<div class="ft3-light-table-scroll"><table class="ft3-light-history-table">'+
 '<thead><tr><th scope="col">Requestor</th><th scope="col">Vehicle / Container</th>'+
 '<th scope="col">Completed</th><th scope="col">Receipt</th></tr></thead><tbody>'+
 model.recent.map(r=>completedRow(r,actionEnabled,receiptLink)).join('')+
 '</tbody></table></div>':
 '<div class="ft3-light-completed-empty"><span aria-hidden="true">✓</span><p>'+
 (model?'No completed transactions in the verified response.':
 'Completed records unavailable without a signed service.')+'</p></div>')+'</section>'+
 workflowGuide()+'</section>';
}


/** Signed, in-memory, two-step refueling dialog; request mutations remain in app.js.
 * A modal is never rendered from reference-only Board rows or an unverified role.
 */
export function renderFuelTrackRefuelingDialog({snapshot=null,boardId=null,workspaceId=null,dialog=null,busy=false}={}){
 const model=fuelTrackLightFuelsModel({snapshot,boardId,workspaceId});
 if(!model||!dialog||!['confirm','details'].includes(dialog.stage))return '';
 const r=model.queue.find(item=>item.id===dialog.id);
 const step=dialog.stage==='confirm'?1:2;
 if(!r||!Number.isSafeInteger(r.revision)||r.revision<1||
  (step===1&&r.status!=='Awaiting Refueling')||
  (step===2&&r.status!=='Refueling Done'))return '';
 const receipt=step===2;
 return '<div class="ft3-refuel-overlay" data-ft3-refuel-overlay>'+
 '<section class="ft3-refuel-dialog" role="dialog" aria-modal="true" aria-labelledby="ft3-refuel-title" aria-describedby="ft3-refuel-subtitle" tabindex="-1">'+
 '<header class="ft3-refuel-dialog-header"><div><span class="ft3-refuel-kicker">FUELTRACK+ · LIGHTFUELS</span>'+
 '<h2 id="ft3-refuel-title">'+(receipt?'Enter Refueling & Receipt Details':'Mark as Refueling Done')+'</h2>'+
 '<p id="ft3-refuel-subtitle">Step '+step+' of 2 — '+(receipt?'record final transaction details':'confirm the physical refueling')+'</p></div>'+
 '<button type="button" class="ft3-refuel-close" data-action="ft3-refuel-cancel" aria-label="Close refueling dialog"'+(busy?' disabled':'')+'>×</button></header>'+
 '<div class="ft3-refuel-dialog-body">'+
 '<div class="ft3-refuel-person"><span class="ft3-refuel-person-icon" aria-hidden="true">'+(r.type==='vehicle'?'⛽':'▣')+'</span>'+
 '<div><strong>'+esc(r.requestor)+'</strong><small>'+esc(r.reference)+' · '+esc(r.type==='vehicle'?'Vehicle':'Container')+'</small></div></div>'+
 '<div class="ft3-refuel-progress" aria-label="Refueling workflow progress">'+
 '<span class="is-complete">Pending</span><span class="is-complete">Awaiting Refueling</span>'+
 '<span class="'+(receipt?'is-complete':'is-current')+'">Refueling Done</span>'+
 '<span class="'+(receipt?'is-current':'')+'">Processed</span></div>'+
 (receipt?'<div class="ft3-refuel-confirmation is-done" role="status">✓ Refueling completed — enter the final transaction details.</div>'+
 '<form id="ft3-refuel-details-form" class="ft3-light-receipt-form" data-ft3-receipt="'+esc(r.id)+'">'+
 '<div class="ft3-refuel-field"><label for="ft3-refuel-amount">Actual Amount <span class="ft3-refuel-required" aria-label="required">*</span></label>'+
 '<div class="ft3-refuel-input-wrap"><span class="ft3-refuel-unit" aria-hidden="true">₱</span>'+
 '<input id="ft3-refuel-amount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" required></div>'+
 '<small>Enter the actual cost of this refueling.</small></div>'+
 '<div class="ft3-refuel-quick" aria-label="Suggested amounts">'+[500,1000,1500,2000,2500,3000].map(n=>
 '<button type="button" data-action="ft3-refuel-amount" data-value="'+n+'">₱'+n.toLocaleString('en-PH')+'</button>').join('')+'</div>'+
 '<div class="ft3-refuel-field"><label for="ft3-refuel-receipt-number">Invoice / Receipt Number <span class="ft3-refuel-optional">Optional</span></label>'+
 '<input id="ft3-refuel-receipt-number" name="receiptNumber" type="text" maxlength="120" placeholder="e.g. INV-2026-001" autocomplete="off"></div>'+
 '<div class="ft3-refuel-field"><label for="ft3-refuel-liters">Fuel Quantity <span class="ft3-refuel-required" aria-label="required">*</span></label>'+
 '<div class="ft3-refuel-input-wrap"><input id="ft3-refuel-liters" name="liters" type="number" min="0.001" step="0.001" inputmode="decimal" placeholder="0.000" required>'+
 '<span class="ft3-refuel-unit" aria-hidden="true">L</span></div>'+
 '<small>Actual fuel dispensed, in liters.</small></div>'+
 '<div class="ft3-refuel-quick" aria-label="Suggested quantities">'+[5,10,15,20,25,50].map(n=>
 '<button type="button" data-action="ft3-refuel-liters" data-value="'+n+'">'+n+'L</button>').join('')+'</div>'+
 '<div class="ft3-refuel-field ft3-refuel-upload"><label for="ft3-refuel-photo">Receipt / Photo <span class="ft3-refuel-optional">Optional · Private</span></label>'+
 '<div class="ft3-refuel-upload-surface"><span class="ft3-refuel-upload-icon" aria-hidden="true">▧</span>'+
 '<div class="ft3-refuel-upload-copy"><strong>Attach receipt image</strong><small>JPG, PNG or WebP · up to 5 MB</small></div>'+
 '<input id="ft3-refuel-photo" name="receiptPhoto" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a private receipt image"></div></div>'+
 '<footer class="ft3-refuel-dialog-footer"><button type="button" data-action="ft3-refuel-cancel"'+(busy?' disabled':'')+'>Cancel</button>'+
 '<button type="submit" class="ft3-refuel-primary"'+(busy?' disabled':'')+'>'+(busy?'Saving…':'✓ Save & Complete')+'</button></footer></form>':
 '<div class="ft3-refuel-confirmation">Confirm that this vehicle or container has actually been refueled. The final receipt fields will open once the signed transaction is saved.</div>'+
 '<div class="ft3-refuel-dialog-footer"><button type="button" data-action="ft3-refuel-cancel"'+(busy?' disabled':'')+'>Cancel</button>'+
 '<button type="button" class="ft3-refuel-primary" data-action="ft3-refuel-confirm"'+(busy?' disabled':'')+'>'+(busy?'Saving…':'✓ Mark as Refueling Done')+'</button></div>')+
 '</div></section></div>';
}
