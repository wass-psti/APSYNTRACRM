/** CP-BOARD-ROW01 signed browser acceptance. Opt-in fixture-only writes.
 * Never use domain-managed, APSYNTRA QA, or ordinary operational boards.
 * This is NOT a substitute for independent revoked/expired-session testing.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
import {canManuallyEditBoard} from './board-inline-items.js';

export const ROW01_FIXTURE_NAME='APSYNTRA ROW01 QA';
export const ROW01_FIXTURE_MARKER='[APSYNTRA:ROW01:FIXTURE:v1]';
const STORE='apsyntra.crm.row01-acceptance.v1';
const PREFIX='APSYNTRA-ROW01-QA-';
const fail=(status,reason,checks=[])=>({checkpoint:'CP-BOARD-ROW01',status,reason,checks});
const pass=id=>({id,status:'PASS'});
const check=(id,status)=>({id,status});
const code=error=>String(error?.code||'');
const expired=record=>!Number.isFinite(record?.createdAt)||
 Date.now()-record.createdAt>24*60*60*1000||record.createdAt>Date.now()+60000;

export function isRow01Fixture(board){
 return !!board&&board.name===ROW01_FIXTURE_NAME&&
  board.description?.trim()===ROW01_FIXTURE_MARKER&&
  canManuallyEditBoard(board,true);
}
export function readRow01Pending(storage=globalThis.sessionStorage){
 try{
  const raw=storage?.getItem(STORE);
  if(!raw)return null;
  const r=JSON.parse(raw);
  if(!r||r.version!==1||![r.boardId,r.workspaceId,r.actorId,r.groupId,r.itemId]
    .every(validUuid)||typeof r.title!=='string'||!r.title.startsWith(PREFIX)||
    typeof r.updatedTitle!=='string'||r.updatedTitle!==r.title+' edited'||
    typeof r.bootId!=='string'||!['CREATED','READY'].includes(r.phase))return null;
  return r;
 }catch{return null;}
}
function persist(storage,record){
 if(!storage||typeof storage.setItem!=='function')throw new ApiError('Session storage unavailable.');
 storage.setItem(STORE,JSON.stringify(record));
}
function clear(storage){storage?.removeItem(STORE);}
async function verifyScope(auth,api,boardId,{requireEmpty=false}={}){
 const user=await auth.getVerifiedUser(),ctx=await api.context();
 if(!validUuid(user?.id)||ctx?.user_id!==user.id||
    ctx?.profile?.status!=='active'||!validUuid(ctx.workspace_id)||
    auth.userId!==user.id)throw new ApiError('Current signed identity is not verified.',403);
 const detail=await api.board(boardId);
 if(!isRow01Fixture(detail?.board)||detail.board.workspace_id!==ctx.workspace_id)
  throw new ApiError('This board is not an approved ROW01 disposable fixture.',403);
 if(!await api.allowed(boardId,'edit'))
  throw new ApiError('Signed board editor permission is required.',403);
 if(!Array.isArray(detail.items)||!Array.isArray(detail.groups)||
    detail.groups.length!==1||!validUuid(detail.groups[0].id))
  throw new ApiError('Fixture groups or items are not in the expected state.',409);
 if(requireEmpty&&detail.items.length!==0)
  throw new ApiError('Fixture must be empty before acceptance. Existing items were preserved.',409);
 return {actorId:user.id,workspaceId:ctx.workspace_id,detail,groupId:detail.groups[0].id};
}
function matchOwned(detail,record){
 return detail.items?.find(i=>i.id===record.itemId&&i.board_id===record.boardId&&
  i.group_id===record.groupId&&i.created_by===record.actorId&&
  [record.title,record.updatedTitle,record.title+' stale'].includes(i.title));
}
async function deleteOnlyOwned(auth,api,record){
 const s=await verifyScope(auth,api,record.boardId);
 if(s.actorId!==record.actorId||s.workspaceId!==record.workspaceId)
  throw new ApiError('Session changed; cleanup was not attempted.',403);
 if(!matchOwned(s.detail,record))
  throw new ApiError('Exact QA ownership not verified; cleanup was not attempted.',409);
 await api.deleteBoardItem(record.itemId);
 const after=await api.board(record.boardId);
 if(after.items?.some(i=>i.id===record.itemId))
  throw new ApiError('QA item still exists after cleanup.',409);
}
export async function prepareRow01Acceptance({auth,api,boardId,storage=globalThis.sessionStorage,
 bootId,makeId=()=>crypto.randomUUID()}={}){
 const checks=[];
 if(!validUuid(boardId)||!auth?.getVerifiedUser||!api?.board||
    !api?.setBoardCellCas||!api?.boardEvents||!api?.deleteBoardItem||
    typeof bootId!=='string'||!bootId)
  return fail('BLOCKED','A signed browser, board and acceptance clients are required.');
 if(storage?.getItem(STORE))
  return fail('BLOCKED','Unfinished ROW01 test exists. Complete or reconcile it before another write.');
 let scope,record;
 try{
  scope=await verifyScope(auth,api,boardId,{requireEmpty:true});
  checks.push(pass('signed-fixture-and-empty-board'));
  // Verify that the recovery journal works before writing an item.
  persist(storage,{probe:true});
  clear(storage);
  const unique=makeId();
  if(!validUuid(unique))throw new ApiError('Secure unique QA marker unavailable.',400);
  const title=PREFIX+unique,updatedTitle=title+' edited';
  const id=await api.addItem(boardId,scope.groupId,title);
  if(!validUuid(id))
   return fail('BLOCKED','Create receipt uncertain. Reconcile fixture and audit before retrying.',checks);
  record={version:1,phase:'CREATED',boardId,workspaceId:scope.workspaceId,
   actorId:scope.actorId,groupId:scope.groupId,itemId:id,title,updatedTitle,
   bootId,createdAt:Date.now()};
  persist(storage,record);
  const created=await api.board(boardId);
  if(!matchOwned(created,record)||created.items.length!==1||
    !created.items.some(i=>i.id===id&&i.title===title))
   throw new ApiError('Signed create was not independently persisted.',409);
  checks.push(pass('signed-create-and-database-read'));
  const pre=await verifyScope(auth,api,boardId);
  if(pre.actorId!==record.actorId||pre.workspaceId!==record.workspaceId||
    pre.detail.items.length!==1||!matchOwned(pre.detail,record))
   throw new ApiError('Signed scope changed before CAS editing.',403);
  await api.setBoardCellCas(id,null,updatedTitle,title);
  const updated=await api.board(boardId);
  if(!updated.items.some(i=>i.id===id&&i.title===updatedTitle))
   throw new ApiError('CAS title edit was not persisted.',409);
  checks.push(pass('signed-inline-cas-edit'));
  let staleDenied=false;
  try{await api.setBoardCellCas(id,null,title+' stale',title);}
  catch(error){staleDenied=error?.status===409&&code(error)==='PT409';}
  if(!staleDenied)throw new ApiError('Stale CAS request did not return HTTP 409 / PT409.',409);
  const stable=await api.board(boardId);
  if(!stable.items.some(i=>i.id===id&&i.title===updatedTitle))
   throw new ApiError('Stale CAS altered the verified record.',409);
  checks.push(pass('stale-cas-denied'));
  record.phase='READY';
  persist(storage,record);
  return {checkpoint:'CP-BOARD-ROW01',status:'AWAITING_RELOAD',checks,
   reason:'Reload this browser tab, then finalize under the same signed user to verify persistence and audit.'};
 }catch(error){
  if(record){
   try{await deleteOnlyOwned(auth,api,record);clear(storage);}
   catch{return fail('BLOCKED','Acceptance failed and QA cleanup needs manual reconciliation.',checks);}
  }
  return fail('FAIL','Signed fixture verification failed. Review the QA item and audit before retrying.',checks);
 }
}
export async function finalizeRow01Acceptance({auth,api,boardId,storage=globalThis.sessionStorage,
 bootId}={}){
 const record=readRow01Pending(storage),checks=[];
 if(!record||record.boardId!==boardId)
  return fail('BLOCKED','No valid ROW01 acceptance journal for this board.');
 if(expired(record))return fail('BLOCKED','QA journal is old. Review the exact fixture item before cleanup.');
 if(record.bootId===bootId)
  return fail('BLOCKED','A real browser reload is required before persistence acceptance.');
 try{
  const scope=await verifyScope(auth,api,boardId);
  if(scope.actorId!==record.actorId||scope.workspaceId!==record.workspaceId||
    scope.groupId!==record.groupId)
   return fail('BLOCKED','Signed user, workspace or group changed; no records were modified.');
  const row=matchOwned(scope.detail,record);
  if(!row)return fail('BLOCKED','QA item identity or ownership mismatch; no records were modified.');
  if(record.phase!=='READY'){
   await deleteOnlyOwned(auth,api,record);
   clear(storage);
   return fail('FAIL','Interrupted creation recovered; full signed edit/stale acceptance was not completed.');
  }
  if(row.title!==record.updatedTitle)
   return fail('FAIL','Edited QA value did not survive the browser refresh.');
  const isolated=scope.detail.items.length===1;
  checks.push(check('fixture-isolation-after-reload',isolated?'PASS':'FAIL'));
  checks.push(pass('real-browser-reload-and-persistence'));
  await deleteOnlyOwned(auth,api,record);
  clear(storage);
  checks.push(pass('owned-qa-item-removal'));
  const events=await api.boardEvents(boardId,200);
  const required=['item.created','item.cell_updated','item.deleted'];
  const good=Array.isArray(events)&&required.every(type=>
   events.some(e=>e.entity_id===record.itemId&&e.event_type===type&&
    e.actor_id===record.actorId));
  checks.push(check('signed-create-edit-remove-audit',good?'PASS':'FAIL'));
  return {checkpoint:'CP-BOARD-ROW01',status:good&&isolated?'PASS':'FAIL',checks,
   reason:good&&isolated?'Signed fixture acceptance passed. Only the owned QA item was removed.':
    'Owned QA item removed; audit was incomplete or the fixture was concurrently modified.'};
 }catch{return fail('BLOCKED','Signed acceptance or owned-item cleanup could not be verified.',checks);}
}
/** Nonsecret report: never include user IDs, titles, board IDs, bearer tokens or JWTs. */
export function sanitizeRow01Report(result){
 return JSON.stringify({checkpoint:'CP-BOARD-ROW01',status:result?.status||'BLOCKED',
  checks:(result?.checks||[]).map(x=>({id:x.id,status:x.status})),
  reason:result?.reason||'No acceptance result.'},null,2);
}
