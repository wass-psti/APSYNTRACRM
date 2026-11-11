import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthClient} from '../session.js';
import {buildImportPlan,executeBoardImport} from '../board-import-core.js';
import {normalizeImportFailure} from '../board-import-errors.js';

const boardId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const actorId='33333333-3333-4333-8333-333333333333';
const groupId='44444444-4444-4444-8444-444444444444';
const revision='2026-11-05T03:00:00.123Z';
const detail={board:{id:boardId,workspace_id:workspaceId,updated_at:revision,
 status:'active',name:'Import verification'},groups:[{id:groupId,title:'Current'}],
 columns:[],items:[],values:[]};
const plan=buildImportPlan({sheet:{headers:['Name'],rows:[['Round-trip probe']]},detail,
 mappings:[{source:'Name',action:'item'}],group:{action:'existing',groupId}});
const memory=()=>({getItem:()=>null,setItem:()=>{},removeItem:()=>{}});

test('malformed atomic import receipt is classified as uncertain and is never blindly retried',async()=>{
 const calls=[];
 const auth=new AuthClient({storage:memory(),fetchImpl:async(url)=>{
  const rpc=url.split('/').pop();calls.push(rpc);
  if(rpc==='wm_board_ui_read')return new Response(JSON.stringify({board_id:boardId}),{
   status:200,headers:{'Content-Type':'application/json'}
  });
  if(rpc==='wm_import_board_wizard_atomic')return new Response('<html>proxy error</html>',{
   status:200,headers:{'Content-Type':'text/html'}
  });
  throw new Error('Unexpected RPC '+rpc);
 }});
 auth.save({access_token:'synthetic-access',refresh_token:'synthetic-refresh',
  expires_in:3600,user:{id:actorId}});
 auth.getVerifiedUser=async()=>({id:actorId});
 const api={
  context:async()=>({user_id:actorId,workspace_id:workspaceId,profile:{status:'active'}}),
  board:async()=>detail,
  allowed:async()=>true,
  rpc:(name,args)=>auth.authorized('/rest/v1/rpc/'+name,{method:'POST',body:args})
 };
 await assert.rejects(()=>executeBoardImport({api,auth,plan}),error=>{
  assert.equal(error.importOutcomeUncertain,true);
  const normalized=normalizeImportFailure(error,'record-write');
  assert.equal(normalized.code,'BIMP_IMPORT_RESPONSE');
  assert.equal(normalized.uncertain,true);
  assert.match(normalized.message,/records may already have been committed/);
  assert.match(normalized.message,/Do not submit again/);
  assert.match(normalized.message,/invalid JSON response/);
  return true;
 });
 assert.deepEqual(calls,['wm_board_ui_read','wm_import_board_wizard_atomic']);
 assert.equal(calls.filter(name=>name==='wm_import_board_wizard_atomic').length,1);
});
