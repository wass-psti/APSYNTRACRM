import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverScope,AcceptanceBlocked} from '../scripts/sb07-discover-scope.mjs';

const U='11111111-1111-4111-8111-111111111111',W='22222222-2222-4222-8222-222222222222',B='33333333-3333-4333-8333-333333333333';
function response(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});}
function stub({boards=[{id:B,name:'Contacts'}],access=true,uid=U,workspace=W}={}){
 const seen=[];
 const fetchImpl=async(url,opts)=>{
  seen.push({url,opts});
  if(url.endsWith('/auth/v1/user'))return response({id:uid});
  if(url.endsWith('/wm_auth_access_context'))return response({user_id:U,workspace_id:workspace,profile:{status:'active'}});
  if(url.endsWith('/wm_list_boards'))return response(boards);
  if(url.endsWith('/work_board_access'))return response(access);
  throw Error('unexpected endpoint');
 };
 return {fetchImpl,seen};
}
test('CLI discovers active workspace and board from genuine signed RPC responses',async()=>{
 const server=stub();
 const found=await discoverScope({token:'signed.token',fetchImpl:server.fetchImpl});
 assert.deepEqual(found,{userId:U,workspaceId:W,boardId:B,boardName:'Contacts'});
 assert.equal(server.seen.length,4);
 assert.equal(server.seen[0].opts.headers.authorization,'Bearer signed.token');
 assert.deepEqual(JSON.parse(server.seen[3].opts.body),{p_board_id:B,p_required:'view'});
});
test('explicit edit mode requires authoritative edit permission',async()=>{
 const server=stub({access:false});
 await assert.rejects(()=>discoverScope({token:'signed.token',fetchImpl:server.fetchImpl,writeRequested:true,requestedBoardId:B,requestedWorkspaceId:W}),AcceptanceBlocked);
 assert.deepEqual(JSON.parse(server.seen[3].opts.body),{p_board_id:B,p_required:'edit'});
});
test('rejects workspace mismatch, missing boards, and mismatched subject',async()=>{
 await assert.rejects(()=>discoverScope({token:'signed.token',fetchImpl:stub().fetchImpl,requestedWorkspaceId:U}),AcceptanceBlocked);
 await assert.rejects(()=>discoverScope({token:'signed.token',fetchImpl:stub({boards:[]}).fetchImpl}),AcceptanceBlocked);
 await assert.rejects(()=>discoverScope({token:'signed.token',fetchImpl:stub({uid:W}).fetchImpl}),AcceptanceBlocked);
});
test('does not accept fabricated token input or non-HTTPS Supabase project',async()=>{
 await assert.rejects(()=>discoverScope({token:'\nmalformed'}),AcceptanceBlocked);
 await assert.rejects(()=>discoverScope({token:'ok',url:'http://127.0.0.1:5173'}),AcceptanceBlocked);
});
