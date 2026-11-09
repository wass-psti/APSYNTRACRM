import test from 'node:test';
import assert from 'node:assert/strict';
import {DomainApi} from '../data.js';

const BOARD='7af78b3f-67bf-4600-9aa1-9006d19d486e';
const GROUP='180e7ed3-08e8-451a-bc46-fd5b9e54e366';
const STAMP='2026-10-30T05:40:07.705257+00:00';
const AFTER='2026-11-09T08:23:20.120001+00:00';

function signedApi({reply={boardId:BOARD,groupId:GROUP,action:'rename',updatedAt:AFTER}}={}){
 const calls=[];
 const api=new DomainApi({
  authorized:async(path,request)=>{
   calls.push({path,request});
   return typeof reply==='function'?reply(path,request):reply;
  }
 });
 return {api,calls};
}
const group=()=>({id:GROUP,board_id:BOARD,title:'Main group',updated_at:STAMP});

test('CAS group rename uses exact persisted revision, scoped IDs and signed RPC',async()=>{
 const {api,calls}=signedApi();
 const result=await api.updateGroupCas(BOARD,group(),'New group');
 assert.deepEqual(result,{boardId:BOARD,groupId:GROUP,action:'rename',updatedAt:AFTER});
 assert.equal(calls.length,1);
 assert.equal(calls[0].path,'/rest/v1/rpc/wm_board_group_cas');
 assert.equal(calls[0].request.method,'POST');
 assert.deepEqual(calls[0].request.body,{
  p_board_id:BOARD,p_group_id:GROUP,p_expected_updated_at:STAMP,
  p_action:'rename',p_title:'New group'
 });
});

test('CAS trims group names while rejecting invalid, stale or foreign group references',async()=>{
 const {api,calls}=signedApi();
 await api.updateGroupCas(BOARD,group(),'  Renamed  ');
 assert.equal(calls[0].request.body.p_title,'Renamed');
 for(const [badGroup,title] of [
  [{...group(),board_id:'11111111-1111-4111-8111-111111111111'},'Renamed'],
  [{...group(),updated_at:'not-a-date'},'Renamed'],
  [{...group(),id:'invalid'},'Renamed'],
  [group(),' '],
  [group(),'x'.repeat(121)]
 ])await assert.rejects(()=>api.updateGroupCas(BOARD,badGroup,title));
 assert.equal(calls.length,1,'invalid operations must not call the backend');
});

test('CAS rejects unexpected or ambiguous server receipts rather than claiming success',async()=>{
 for(const reply of [
  {boardId:BOARD,groupId:GROUP,action:'rename',updatedAt:null},
  {boardId:'11111111-1111-4111-8111-111111111111',groupId:GROUP,action:'rename',updatedAt:AFTER},
  {boardId:BOARD,groupId:GROUP,action:'delete_empty',updatedAt:AFTER}
 ]){
  const {api,calls}=signedApi({reply});
  await assert.rejects(()=>api.updateGroupCas(BOARD,group(),'Renamed'),/receipt is uncertain/);
  assert.equal(calls.length,1,'never retry a possibly committed mutation');
 }
});

test('denied and stale signed mutations propagate without falling back to legacy writes',async()=>{
 for(const status of [401,403,409]){
  const calls=[];
  const error=Object.assign(new Error('Authorization or revision denied'),{status});
  const api=new DomainApi({authorized:async(path,request)=>{
   calls.push({path,request});
   throw error;
  }});
  await assert.rejects(()=>api.updateGroupCas(BOARD,group(),'Renamed'),err=>err===error);
  assert.equal(calls.length,1);
  assert.match(calls[0].path,/wm_board_group_cas$/);
 }
});
