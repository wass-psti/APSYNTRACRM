/** Phase A signed operational acceptance, nonproduction module boards only.
 * Creates ONE uniquely identifiable acceptance item per board, verifies data from
 * the authoritative DB, then permanently deletes ONLY that owned test item.
 * Board events remain as audit evidence. Never calls a privileged API.
 */
import {BOARD_MODULES,boardColumns,boardDescription} from './board-manifest.js';
import {inspectFoundation} from './board-foundation.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const verify=(test,message)=>{if(!test)throw new Error(message);};
async function one(api,context,module,boardId){
 const result={module:module.key,boardName:module.name,status:'fail',steps:[],itemId:null,cleaned:false};
 const eventPrefix='APSYNTRA-A12-QA-'+crypto.randomUUID();
 let itemId=null;
 const pass=(name)=>result.steps.push(name);
 try{
  verify(await api.allowed(boardId,'edit')===true,'Edit permission denied');
  const first=await api.board(boardId);
  verify(first?.board?.workspace_id===context.workspace_id &&
    first?.board?.description===boardDescription(module) &&
    first?.board?.status==='active','Board identity/workspace or registry mismatch');
  verify(first.items?.length===0,'Board is not empty. Only isolated nonproduction boards may be tested.');
  const group=first.groups?.[0];
  const refCol=first.columns?.find(c=>c.name==='Source Record ID'&&c.data_type==='text');
  verify(UUID.test(group?.id||'')&&UUID.test(refCol?.id||''),'Group or source identity column missing');
  pass('Authorized board and empty isolation scope');
  itemId=await api.addItem(boardId,group.id,eventPrefix);
  verify(UUID.test(itemId),'Create RPC did not return persistent record UUID');
  result.itemId=itemId;
  let detail=await api.board(boardId);
  verify(detail.items.some(i=>i.id===itemId&&i.title===eventPrefix),'Created item did not persist');
  pass('Signed create and independent read');
  const sourceId=eventPrefix+'.source';
  await api.setBoardCellCas(itemId,refCol.id,sourceId,null);
  detail=await api.board(boardId);
  verify(detail.values.some(v=>v.item_id===itemId&&v.column_id===refCol.id&&v.value===sourceId),
   'Source identity cell was not persisted');
  pass('Typed source identity persistence');
  const updated=sourceId+'.v2';
  await api.setBoardCellCas(itemId,refCol.id,updated,sourceId);
  detail=await api.board(boardId);
  verify(detail.values.some(v=>v.item_id===itemId&&v.column_id===refCol.id&&v.value===updated),
   'Conditional update did not persist');
  let staleDenied=false;
  try{await api.setBoardCellCas(itemId,refCol.id,sourceId+'.stale',sourceId);}
  catch(err){
   staleDenied=err?.status===409 && err?.code==='PT409';
   if(!staleDenied)throw err;
  }
  verify(staleDenied,'Stale conditional update was not rejected with HTTP 409 / PT409');
  pass('Conditional update and stale-write denial');
  await api.deleteBoardItem(itemId);
  result.cleaned=true;
  detail=await api.board(boardId);
  verify(!detail.items.some(i=>i.id===itemId),'Acceptance item remains after delete');
  const events=await api.boardEvents(boardId,200);
  verify(Array.isArray(events)&&['item.created','item.cell_updated','item.deleted'].every(type=>
   events.some(e=>e.entity_id===itemId&&e.event_type===type&&e.actor_id===context.user_id)),
   'Authenticated create/update/delete board audit is incomplete');
  pass('Delete and independently verified audit');
  result.status='pass';
 }catch(err){
  result.error=err?.status===504?
   'Board API timed out (HTTP 504) during acceptance; audit/cleanup must be reconciled before retrying':
   err?.message||'Operational acceptance failed';
 }finally{
  // Only delete the exact record created during THIS acceptance run.
  if(itemId&&!result.cleaned){
   try{const existing=await api.board(boardId);
    if(existing.items.some(i=>i.id===itemId)){await api.deleteBoardItem(itemId);}
    result.cleaned=true;
   }catch{/* Leave evidence visible; never delete unrelated records. */}
  }
 }
 return result;
}
export async function runTwelveBoardQa(api,{context,onProgress=()=>{}}={}){
 verify(context?.profile?.platform_role==='admin_general_manager'&&
  context?.profile?.status==='active'&&context?.user_id===api.auth?.userId,
  'Active platform administrator session required');
 const refreshed=await api.context();
 verify(refreshed.user_id===context.user_id&&refreshed.workspace_id===context.workspace_id,
  'Authoritative workspace context changed');
 const active=await api.boards('active');
 const rows=await inspectFoundation(api,{context,boards:active});
 verify(rows.length===12&&rows.every(r=>r.status==='ready'),
  'All twelve configured boards must pass read-only readiness before nonproduction writes');
 const result=[];
 for(const module of BOARD_MODULES){
  const row=rows.find(r=>r.module.key===module.key);
  const entry=await one(api,context,module,row.boardId);
  result.push(entry);
  onProgress(entry);
  if(entry.status!=='pass')break; // fail closed: no cascading acceptance writes
 }
 return{results:result,passed:result.filter(r=>r.status==='pass').length,total:12,
  status:result.length===12&&result.every(r=>r.status==='pass')?'pass':'fail'};
}
