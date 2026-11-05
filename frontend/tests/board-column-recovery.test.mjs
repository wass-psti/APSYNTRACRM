import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ApiError} from '../session.js';
import {
 BOARD_COLUMN_RECOVERY_ENABLED,BoardColumnRecoveryClient,
 renderBoardColumnRecoveryList,explainColumnDeleteError
} from '../board-column-recovery.js';
const boardId='11111111-1111-4111-8111-111111111111';
const columnId='22222222-2222-4222-8222-222222222222';
const deletionId='33333333-3333-4333-8333-333333333333';
const updatedAt='2026-11-05T10:00:00.000Z';
const newUpdated='2026-11-05T10:01:00.000Z';
const column={id:columnId,name:'Status I',deletable:true,immutable:false};
const detail={board:{id:boardId,updated_at:updatedAt},values:[
 {item_id:'44444444-4444-4444-8444-444444444444',column_id:columnId,value:'active'},
 {item_id:'55555555-5555-4555-8555-555555555555',column_id:columnId,value:null}
]};
const entry={deletionId,columnId,name:'Status I',valueRows:2,deletedAt:updatedAt,restorable:true};
function client({manage=true,mode='ok'}={}){
 const calls=[];
 const api={allowed:async(id,required)=>{
  calls.push(['allowed',id,required]);return manage;
 },rpc:async(name,args)=>{
  calls.push(['rpc',name,args]);
  if(mode==='network')throw new TypeError('fetch unavailable');
  if(mode==='denied')throw new ApiError('nope',403,'42501');
  if(mode==='stale')throw new ApiError('stale',400,'40001');
  if(mode==='conflict')throw new ApiError('conflict',400,'23505');
  if(mode==='invalid')return {};
  if(name==='wm_delete_board_column_recoverable')return {
   board_id:boardId,column_id:columnId,deletion_id:deletionId,
   action:'delete-recoverable',value_rows:2,updated_at:newUpdated
  };
  if(name==='wm_restore_board_column_recoverable')return {
   board_id:boardId,column_id:columnId,deletion_id:deletionId,
   action:'restore-recoverable',value_rows:2,updated_at:newUpdated
  };
  if(name==='wm_list_recoverable_board_columns')return [{
   deletion_id:deletionId,column_id:columnId,name:'Status I',value_rows:2,
   deleted_at:updatedAt,restorable:true
  }];
  throw new Error('Unexpected operation');
 }};
 return {api,calls,subject:new BoardColumnRecoveryClient(api)};
}
test('recovery remains disabled by default with zero server calls',async()=>{
 assert.equal(BOARD_COLUMN_RECOVERY_ENABLED,false);
 const {subject,calls}=client();
 await assert.rejects(()=>subject.delete(detail,column,'DELETE Status I'),
  err=>err.status===503&&err.code==='COL_RECOVERY_DISABLED');
 assert.deepEqual(calls,[]);
});
test('enabled signed manager performs one CAS and count-protected populated deletion',async()=>{
 const {subject,calls}=client();
 const result=await subject.delete(detail,column,'DELETE Status I',{enabled:true});
 assert.deepEqual(result,{boardId,action:'delete-recoverable',columnId,deletionId,
  valueRows:2,updatedAt:newUpdated});
 assert.deepEqual(calls,[
  ['allowed',boardId,'manage'],
  ['rpc','wm_delete_board_column_recoverable',{
   p_board_id:boardId,p_column_id:columnId,p_expected_updated_at:updatedAt,
   p_expected_value_count:2,p_confirmation:'DELETE Status I'
  }]
 ]);
});
test('protected, invalid confirmation, unauthorized or zero-value deletion sends no mutation',async()=>{
 const none={...detail,values:[]};
 for(const [values,col,conf] of [
  [none,column,'DELETE Status I'],
  [detail,{...column,deletable:false},'DELETE Status I'],
  [detail,column,'delete status i']
 ]){
  const {subject,calls}=client();
  await assert.rejects(()=>subject.delete(values,col,conf,{enabled:true}));
  assert.equal(calls.filter(x=>x[0]==='rpc').length,0);
 }
 const {subject,calls}=client({manage:false});
 await assert.rejects(()=>subject.delete(detail,column,'DELETE Status I',{enabled:true}),
  err=>err.status===403);
 assert.equal(calls.filter(x=>x[0]==='rpc').length,0);
});
test('manager-only Activity list returns metadata, not archived values or private table fields',async()=>{
 const {subject,calls}=client();
 const rows=await subject.list(boardId,{enabled:true});
 assert.deepEqual(rows,[entry]);
 assert.equal(calls.filter(x=>x[0]==='rpc')[0][1],
  'wm_list_recoverable_board_columns');
 const html=renderBoardColumnRecoveryList(rows);
 assert.match(html,/Restore column/);
 assert.match(html,/data-board-history-action="restore-column"/);
 assert.doesNotMatch(html,/archived_value|Bearer|private_snapshot/);
 const malicious=renderBoardColumnRecoveryList([
  {...entry,name:'<img src=x onerror=alert(1)>'}
 ]);
 assert.doesNotMatch(malicious,/<img/);
 assert.match(malicious,/&lt;img/);
});
test('authorized restore uses fresh board revision and exact server receipt',async()=>{
 const {subject,calls}=client();
 const result=await subject.restore(detail,entry,{enabled:true});
 assert.equal(result.action,'restore-recoverable');
 assert.deepEqual(calls.filter(x=>x[0]==='rpc'),[
  ['rpc','wm_restore_board_column_recoverable',{
   p_board_id:boardId,p_deletion_id:deletionId,p_expected_updated_at:updatedAt
  }]
 ]);
});
test('unrestorable snapshot, stale, denied and conflicting rename fail closed',async()=>{
 const {subject,calls}=client();
 await assert.rejects(()=>subject.restore(detail,{...entry,restorable:false},{enabled:true}));
 assert.equal(calls.filter(x=>x[0]==='rpc').length,0);
 for(const [mode,status] of [['stale',409],['denied',403],['conflict',409]]){
  const {subject:bad}=client({mode});
  await assert.rejects(()=>bad.delete(detail,column,'DELETE Status I',{enabled:true}),
   err=>err.status===status&&err.schemaOutcomeUncertain!==true);
 }
});
test('lost response and malformed receipt are uncertain, never automatically retried',async()=>{
 for(const mode of ['network','invalid']){
  const {subject,calls}=client({mode});
  await assert.rejects(()=>subject.delete(detail,column,'DELETE Status I',{enabled:true}),
   err=>err.schemaOutcomeUncertain===true&&/Do not retry/.test(err.message));
  assert.equal(calls.filter(x=>x[0]==='rpc').length,1);
 }
});
test('SQLSTATE errors are translated without leaking raw server details',()=>{
 for(const [code,status] of [['42501',403],['40001',409],['23503',409],
  ['23505',409],['22023',400]]){
  const e=explainColumnDeleteError(new ApiError('private detail',400,code));
  assert.equal(e.status,status);
  assert.doesNotMatch(e.message,/private detail/);
 }
});
test('UI accurately reports populated column and keeps recovery disabled until activation',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const inline=readFileSync('frontend/board-inline-context.js','utf8');
 assert.match(app,/const blocked=storedCount>0&&!BOARD_COLUMN_RECOVERY_ENABLED/);
 assert.match(app,/submitDisabled:blocked/);
 assert.match(app,/Deletion unavailable/);
 assert.match(app,/boardColumnRecovery\.delete\(fresh,target,confirmation\)/);
 assert.match(app,/boardColumnRecovery\.restore\(fresh,entry\)/);
 assert.match(app,/renderBoardColumnRecoveryList\(boardHistory\.recoveries\)/);
 assert.match(inline,/\.filter\(x=>x.column_id===columnId\)\.length/);
});

test('specific backend deletion failures have accurate, actionable classifications',()=>{
 const reasons=[
  ['COL_DELETE_PROTECTED_BOARD','42501',403,'archived or application-protected'],
  ['COL_RESTORE_PROTECTED_BOARD','42501',403,'archived or application-protected'],
  ['COL_DELETE_PROTECTED_COLUMN','42501',403,'protected'],
  ['COL_RESTORE_SNAPSHOT_INTEGRITY','42501',403,'protected'],
  ['COL_RESTORE_SNAPSHOT_UNAVAILABLE','42501',409,'no pending recovery snapshot'],
  ['COL_DELETE_BOARD_NOT_FOUND','42501',404,'Board is unavailable'],
  ['COL_RESTORE_BOARD_NOT_FOUND','42501',404,'Board is unavailable'],
  ['COL_DELETE_FOREIGN_ITEM_BOUNDARY','42501',409,'invalid board relationships'],
  ['COL_DELETE_CONFIRMATION_REQUIRED','22023',400,'confirmation did not match']
 ];
 for(const [reason,sqlstate,status,explanation] of reasons){
  const result=explainColumnDeleteError(new ApiError(reason,400,sqlstate));
  assert.equal(result.status,status,reason);
  assert.match(result.message,new RegExp(explanation,'i'),reason);
  assert.doesNotMatch(result.message,/private recovery tables|SQLSTATE|secret/);
 }
 const legacyNonempty=explainColumnDeleteError(new ApiError(
  'Column contains values. Remove or migrate those values before deleting.',
  400,'23503'));
 assert.equal(legacyNonempty.status,409);
 assert.match(legacyNonempty.message,/Empty-only deletion was safely denied/);
 assert.match(legacyNonempty.message,/recoverable deletion when activated/);
 const permission=explainColumnDeleteError(new ApiError(
  'COL_DELETE_AUTHORIZATION_DENIED',403,'42501'));
 assert.equal(permission.status,403);
 assert.match(permission.message,/signed session/);
});
