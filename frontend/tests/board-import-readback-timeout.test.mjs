import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthClient} from '../session.js';
import {DomainApi} from '../data.js';
const boardId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const storage={setItem(){},removeItem(){},getItem(){return null;}};
test('import verification read extends only exact signed board/reference read deadlines',async()=>{
 const calls=[];
 const fetchImpl=async(url,init)=>{
  const name=url.split('/').pop();
  calls.push({name,signal:init.signal});
  await new Promise(resolve=>setTimeout(resolve,28));
  const data=name==='wm_get_board_shell'?{board:{id:boardId},
   groups:[],members:[],columns:[]}:
   name==='wm_get_board_items_page'?{items:[],values:[],has_more:false,next_cursor:null}:[];
  return new Response(JSON.stringify(data),{status:200});
 };
 const auth=new AuthClient({storage,fetchImpl,requestTimeoutMs:15});
 auth.save({access_token:'token',refresh_token:'refresh',expires_in:3600,user:{id:userId}});
 const api=new DomainApi(auth);
 const result=await api.board(boardId,{importVerification:true});
 assert.equal(result.board.id,boardId);
 assert.deepEqual(calls.map(c=>c.name),['wm_get_board_shell','wm_get_board_items_page','wm_import_extended_refs_read']);
 assert.ok(calls.every(c=>!c.signal.aborted),'verification reads should retain bounded deadline');
 await assert.rejects(()=>api.board(boardId),error=>error.code==='REQUEST_TIMEOUT');
 await assert.rejects(()=>auth.call('/rest/v1/rpc/wm_import_board_wizard_atomic',{
  method:'POST',body:{},accessToken:'token',readTimeoutMs:30000
 }),error=>error.code==='REQUEST_TIMEOUT');
 assert.equal(calls.filter(c=>c.name==='wm_import_board_wizard_atomic').length,1);
});
test('deadline override is not honored for near-name or unrelated RPC calls',async()=>{
 const auth=new AuthClient({storage,requestTimeoutMs:15,
  fetchImpl:async()=>{await new Promise(resolve=>setTimeout(resolve,28));
   return new Response('{}',{status:200});}});
 auth.save({access_token:'token',refresh_token:'refresh',expires_in:3600,user:{id:userId}});
 await assert.rejects(()=>auth.call('/rest/v1/rpc/wm_get_board_shell_not_allowed',{
  method:'POST',accessToken:'token',readTimeoutMs:30000
 }),error=>error.code==='REQUEST_TIMEOUT');
 await assert.rejects(()=>auth.call('/rest/v1/rpc/wm_get_board_shell',{
  method:'GET',accessToken:'token',readTimeoutMs:30000
 }),error=>error.code==='REQUEST_TIMEOUT');
});
