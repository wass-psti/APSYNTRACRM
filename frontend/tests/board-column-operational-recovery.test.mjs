import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiError} from '../session.js';
import {BoardColumnOperationalRecoveryClient} from '../board-column-recovery.js';
const boardId='11111111-1111-4111-8111-111111111111',colId='22222222-2222-4222-8222-222222222222';
const deletionId='33333333-3333-4333-8333-333333333333';
const revision='2026-11-12T00:00:00.000Z',newRevision='2026-11-12T00:01:00.000Z';
const data=()=>({board:{id:boardId,status:'active',updated_at:revision},
 values:[{column_id:colId,item_id:'44444444-4444-4444-8444-444444444444',value:'alpha'},
  {column_id:colId,item_id:'55555555-5555-4555-8555-555555555555',value:null}]});
const column={id:colId,name:'Operational status',deletable:true,immutable:false};
const entry={deletionId,columnId:colId,name:'Operational status',valueRows:2,deletedAt:revision,restorable:true};
const row={deletion_id:deletionId,column_id:colId,name:'Operational status',value_rows:2,deleted_at:revision,restorable:true};
const make=({manage=true,mode='ok'}={})=>{
 const calls=[];
 const api={allowed:async(...args)=>{calls.push(['allowed',...args]);return manage;},
 rpc:async(name,args)=>{calls.push(['rpc',name,args]);
  if(mode==='inactive')throw new ApiError('COL_RECOVERY_LIST_NOT_ACTIVATED',403,'42501');
  if(mode==='qa')throw new ApiError('COL_QA_SCOPE_DENIED',403,'42501');
  if(mode==='network')throw new TypeError('Failed to fetch');
  if(mode==='invalid')return {};
  if(mode==='denied')throw new ApiError('COL_DELETE_AUTHORIZATION_DENIED',403,'42501');
  if(mode==='stale')throw new ApiError('COL_DELETE_STALE_BOARD_REVISION',409,'40001');
  if(name==='wm_list_recoverable_board_columns')return [row];
  if(name==='wm_delete_board_column_recoverable')return {board_id:boardId,
   column_id:colId,deletion_id:deletionId,action:'delete-recoverable',value_rows:2,updated_at:newRevision};
  if(name==='wm_restore_board_column_recoverable')return {board_id:boardId,
   column_id:colId,deletion_id:deletionId,action:'restore-recoverable',value_rows:2,updated_at:newRevision};
  throw Error('Unexpected RPC');
 }};
 return {calls,subject:new BoardColumnOperationalRecoveryClient(api)};
};
test('read-only signed capability fails closed while production flags and QA scope are disabled',async()=>{
 for(const mode of ['inactive','qa']){
  const {subject,calls}=make({mode});
  assert.deepEqual(await subject.available(boardId),{ready:false,entries:[]});
  assert.deepEqual(calls.map(call=>call[0]),['allowed','rpc']);
 }
 const {subject,calls}=make({manage:false});
 assert.deepEqual(await subject.available(boardId),{ready:false,entries:[]});
 assert.equal(calls.filter(c=>c[0]==='rpc').length,0);
});
test('signed manager probes backend capability without receiving private cell contents',async()=>{
 const {subject,calls}=make();
 const cap=await subject.available(boardId);
 assert.equal(cap.ready,true);assert.deepEqual(cap.entries,[entry]);
 assert.equal(calls.filter(x=>x[0]==='rpc')[0][1],'wm_list_recoverable_board_columns');
 assert.doesNotMatch(JSON.stringify(cap),/alpha|private/);
 const invalid=make({mode:'invalid'});
 await assert.rejects(()=>invalid.subject.available(boardId),/Recovery metadata/);
});
test('operational populated deletion uses signed manager, board CAS, row count and exact confirmation',async()=>{
 const {subject,calls}=make();
 const receipt=await subject.delete(data(),column,'DELETE Operational status');
 assert.deepEqual(receipt,{boardId,columnId:colId,deletionId,action:'delete-recoverable',
  valueRows:2,updatedAt:newRevision});
 assert.deepEqual(calls.filter(x=>x[0]==='rpc')[0],['rpc','wm_delete_board_column_recoverable',{
  p_board_id:boardId,p_column_id:colId,p_expected_updated_at:revision,
  p_expected_value_count:2,p_confirmation:'DELETE Operational status'}]);
});
test('read-only, invalid columns, empty values, and incorrect confirmation never delete',async()=>{
 for(const [detail,col,phrase] of [[data(),column,'delete Operational status'],
  [data(),{...column,deletable:false},'DELETE Operational status'],
  [{...data(),values:[]},column,'DELETE Operational status'],
  [{...data(),board:{...data().board,status:'archived'}},column,'DELETE Operational status']]){
  const {subject,calls}=make();await assert.rejects(()=>subject.delete(detail,col,phrase));
  assert.equal(calls.filter(c=>c[0]==='rpc').length,0);
 }
 const x=make({manage:false});await assert.rejects(()=>x.subject.delete(data(),column,'DELETE Operational status'),/manager/);
 assert.equal(x.calls.filter(c=>c[0]==='rpc').length,0);
});
test('restoration uses the current board revision; missing snapshots or unauthorized managers fail closed',async()=>{
 const {subject,calls}=make();
 const receipt=await subject.restore(data(),entry);assert.equal(receipt.action,'restore-recoverable');
 assert.deepEqual(calls.filter(x=>x[0]==='rpc')[0],['rpc','wm_restore_board_column_recoverable',{
  p_board_id:boardId,p_deletion_id:deletionId,p_expected_updated_at:revision}]);
 const blocked=make({manage:false});
 await assert.rejects(()=>blocked.subject.restore(data(),entry),/manager/);
 assert.equal(blocked.calls.filter(c=>c[0]==='rpc').length,0);
 const denied=make();
 await assert.rejects(()=>denied.subject.restore(data(),{...entry,restorable:false}));
 assert.equal(denied.calls.filter(c=>c[0]==='rpc').length,0);
});
test('denied and stale writes preserve database safety; ambiguous outcomes never auto-retry',async()=>{
 for(const [mode,status] of [['denied',403],['stale',409]]){
  const {subject}=make({mode});
  await assert.rejects(()=>subject.delete(data(),column,'DELETE Operational status'),e=>e.status===status);
 }
 for(const mode of ['network','invalid']){
  const {subject,calls}=make({mode});
  await assert.rejects(()=>subject.delete(data(),column,'DELETE Operational status'),e=>e.schemaOutcomeUncertain===true);
  assert.equal(calls.filter(c=>c[0]==='rpc').length,1);
 }
});
