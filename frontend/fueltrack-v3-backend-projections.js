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
