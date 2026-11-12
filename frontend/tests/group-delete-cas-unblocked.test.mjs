import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DomainApi} from '../data.js';
const BOARD='30000000-0000-4000-8000-000000000001';
const GROUP='60000000-0000-4000-8000-000000000001';
const REVISION='2026-11-12T02:00:00.000Z';
const group=()=>({id:GROUP,board_id:BOARD,title:'Empty group',updated_at:REVISION});
function client(response={boardId:BOARD,groupId:GROUP,action:'delete_empty',updatedAt:null}){
 const calls=[];
 const api=new DomainApi({authorized:async(path,request)=>{
  calls.push({path,request});
  if(response instanceof Error)throw response;
  return response;
 }});
 return {api,calls};
}
test('ordinary empty group deletion uses one signed revision CAS, never unsafe cascading RPC',async()=>{
 const {api,calls}=client();
 const receipt=await api.deleteEmptyGroupCas(BOARD,group());
 assert.equal(receipt.action,'delete_empty');
 assert.equal(calls.length,1);
 assert.equal(calls[0].path,'/rest/v1/rpc/wm_board_group_cas');
 assert.deepEqual(calls[0].request.body,{
  p_board_id:BOARD,p_group_id:GROUP,p_expected_updated_at:REVISION,
  p_action:'delete_empty',p_title:null});
});
test('invalid, foreign or stale group identity prevents all signed writes',async()=>{
 const {api,calls}=client();
 for(const invalid of [{...group(),id:'invalid'},
  {...group(),board_id:'40000000-0000-4000-8000-000000000001'},
  {...group(),updated_at:'invalid'},null]){
  await assert.rejects(()=>api.deleteEmptyGroupCas(BOARD,invalid));
 }
 assert.equal(calls.length,0);
});
test('reject uncertain delete receipts and server denial without fallback or retry',async()=>{
 for(const reply of [{boardId:BOARD,groupId:GROUP,action:'delete_empty'},
  {boardId:BOARD,groupId:GROUP,action:'rename',updatedAt:null},
  {boardId:BOARD,groupId:GROUP,action:'delete_empty',updatedAt:REVISION},
  {boardId:'40000000-0000-4000-8000-000000000001',groupId:GROUP,action:'delete_empty',updatedAt:null},
  Object.assign(new Error('Protected group'),{status:403})]){
  const {api,calls}=client(reply);
  await assert.rejects(()=>api.deleteEmptyGroupCas(BOARD,group()));
  assert.equal(calls.length,1);
 }
});
test('group delete UI does not require bulk activation and checks authoritative empty group before confirmation',()=>{
 const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const heading=src.slice(src.indexOf('function groupHeading('),src.indexOf('function row01AcceptancePanel('));
 const handler=src.slice(src.indexOf("case 'group-delete-empty':{"),src.indexOf("case 'bulk-clear':{"));
 assert.match(heading,/data-action="group-delete-empty"/);
 assert.match(heading,/Delete group<\/button>/);
 assert.doesNotMatch(heading,/Delete group — protected|Permanent deletion — approval required/);
 assert.doesNotMatch(handler,/bulkReadyFor|ensureSignedBulkReady|boardBulkClient/);
 assert.match(handler,/await db\.board\(boardId\)/);
 assert.match(handler,/fresh\.items\?\.some\(item=>item\.group_id===candidate\.id\)/);
 assert.match(handler,/fresh\.groups\.length<=1/);
 assert.match(handler,/await db\.deleteEmptyGroupCas\(boardId,candidate\)/);
 assert.match(handler,/persisted\.groups\?\.some\(g=>g\.id===candidate\.id\)/);
 assert.match(handler,/Group deleted and verified/);
 assert.doesNotMatch(handler,/wm_delete_board_group|db\.deleteBoardItem/);
});
