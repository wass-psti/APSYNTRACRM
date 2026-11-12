import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ApiError} from '../session.js';
import {probeBulk02SignedSession} from '../board-bulk02-signed-acceptance.js';

const boardId='30000000-0000-4000-8000-000000000001';
const protectedId='30000000-0000-4000-8000-000000000003';
const workspace='10000000-0000-4000-8000-000000000001';
const actor='20000000-0000-4000-8000-000000000001';
const board={id:boardId,workspace_id:workspace,name:'User-created board',status:'active'};
const protectedBoard={id:protectedId,workspace_id:workspace,name:'TimeTracker Attendance',
 status:'active',description:'[APSYNTRA:MODULE:timetracker:v1] Restricted'};
function fake({edit=true,manage=false,protectedVisible=true,wrongActor=false,
 unexpectedSuccess=false,network=false,roleCheckError=false}={}){
 const calls=[];
 let userCalls=0;
 const auth={getVerifiedUser:async()=>{
  userCalls++;
  calls.push('auth');
  return {id:wrongActor&&userCalls===2?protectedId:actor};
 }};
 const api={
  context:async()=>{calls.push('context');return{
   user_id:actor,workspace_id:workspace,profile:{status:'active'}};},
  board:async id=>{calls.push(['board',id]);return{board:{...board},items:[],groups:[]};},
  boards:async()=>{calls.push('boards');return protectedVisible?[board,protectedBoard]:[board];},
  allowed:async (id,role)=>{
   calls.push(['allowed',id,role]);
   if(roleCheckError)throw new ApiError('Service unavailable',503);
   return role==='manage'?manage:edit;
  },
  rpc:async (name,args)=>{
   calls.push(['rpc',name,args]);
   if(network)throw new ApiError('Network unavailable');
   if(unexpectedSuccess)return {applied:1};
   if(name==='wm_board_bulk_mutate'){
    if(args.p_board_id===protectedId)throw new ApiError('Protected',403,'42501');
    if(!edit)throw new ApiError('Permission denied',403,'42501');
    if(args.p_rows?.length===0)throw new ApiError('Invalid batch',400,'22023');
   }
   if(name==='wm_board_group_cas'){
    const authorized=args.p_action==='delete_empty'?manage:edit;
    if(!authorized)throw new ApiError('Permission denied',403,'42501');
    if(args.p_expected_updated_at===null)throw new ApiError('Missing revision',400,'22023');
   }
   throw new Error('A probe must never submit a valid mutation');
  }
 };
 return {auth,api,calls};
}
test('real signed editor preflight verifies server permissions and protected denial without any writes',async()=>{
 const f=fake({edit:true,manage:false});
 const r=await probeBulk02SignedSession({auth:f.auth,api:f.api,board});
 assert.equal(r.status,'PASS');
 assert.equal(r.ready,true);
 assert.equal(r.canManage,false);
 assert.equal(r.checks.length,8);
 assert.ok(r.checks.every(x=>x.status==='PASS'));
 assert.equal(f.calls.filter(x=>Array.isArray(x)&&x[0]==='rpc').length,4);
 assert.ok(f.calls.filter(x=>Array.isArray(x)&&x[0]==='rpc'&&
  x[2]?.p_board_id===boardId&&x[1]==='wm_board_bulk_mutate')
  .every(x=>x[2].p_rows.length===0));
 assert.ok(f.calls.filter(x=>Array.isArray(x)&&x[0]==='rpc'&&
  x[1]==='wm_board_group_cas').every(x=>x[2].p_expected_updated_at===null));
});
test('signed manager preflight verifies distinct manage/delete ceiling',async()=>{
 const f=fake({edit:true,manage:true});
 const r=await probeBulk02SignedSession({auth:f.auth,api:f.api,board});
 assert.equal(r.ready,true);
 assert.equal(r.canManage,true);
 assert.equal(r.status,'PASS');
});
test('genuine signed viewer receives PASS for denied writes but never unlocks controls',async()=>{
 const f=fake({edit:false,manage:false});
 const r=await probeBulk02SignedSession({auth:f.auth,api:f.api,board});
 assert.equal(r.status,'PASS');
 assert.equal(r.ready,false);
 assert.equal(r.canManage,false);
 assert.ok(r.checks.every(x=>x.status==='PASS'));
});
test('unexpectedly successful invalid mutation is a hard FAIL, never ready',async()=>{
 const f=fake({unexpectedSuccess:true});
 const r=await probeBulk02SignedSession({auth:f.auth,api:f.api,board});
 assert.equal(r.status,'FAIL');
 assert.equal(r.ready,false);
 assert.ok(r.checks.some(x=>x.status==='FAIL'));
});
test('network failure and unavailable protected-board evidence are BLOCKED',async()=>{
 const badNetwork=fake({network:true});
 const x=await probeBulk02SignedSession({auth:badNetwork.auth,api:badNetwork.api,board});
 assert.equal(x.status,'BLOCKED');
 assert.equal(x.ready,false);
 const missing=fake({protectedVisible:false});
 const y=await probeBulk02SignedSession({auth:missing.auth,api:missing.api,board});
 assert.equal(y.status,'BLOCKED');
 assert.equal(y.ready,false);
});
test('wrong workspace, protected test board or changed user fails before activation',async()=>{
 const f=fake();
 const wrong={...board,workspace_id:protectedId};
 const result=await probeBulk02SignedSession({auth:f.auth,api:f.api,board:wrong});
 assert.equal(result.ready,false);
 assert.equal(result.status,'FAIL');
 const forbidden=await probeBulk02SignedSession({auth:f.auth,api:f.api,board:protectedBoard});
 assert.equal(forbidden.status,'BLOCKED');
 const session=fake({wrongActor:true});
 const drift=await probeBulk02SignedSession({auth:session.auth,api:session.api,board});
 assert.equal(drift.status,'FAIL');
 assert.equal(drift.ready,false);
});
test('uncertain role capability blocks readiness before any mutation RPC probe',async()=>{
 const f=fake({roleCheckError:true});
 const r=await probeBulk02SignedSession({auth:f.auth,api:f.api,board});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.ready,false);
 assert.equal(f.calls.some(x=>Array.isArray(x)&&x[0]==='rpc'),false);
});
test('browser acceptance remains token-free with a scoped, session-only runtime activation guard',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const source=readFileSync('frontend/board-bulk02-signed-acceptance.js','utf8');
 const client=readFileSync('frontend/board-bulk02-client.js','utf8');
 assert.match(client,/BOARD_BULK02_ENABLED=false/);
 assert.match(app,/function bulkReadyFor\(board\)/);
 assert.match(app,/case 'bulk02-verify'/);
 assert.match(app,/data-action="bulk02-verify"/);
 assert.match(app,/boardBulkClient\.enabled=true/);
 assert.match(app,/function clearBulkActivation\(\)/);
 const logout=app.split("case 'logout':{")[1];
 assert.ok(logout,'Logout handler must exist');
 assert.match(logout,/closeWorkspacePanels\(\);clearBulkActivation\(\)/);
 assert.match(app,/access\.boardId===board\?\.id/);
 assert.match(app,/canManage:result\.canManage/);
 // Empty group deletion uses the already-installed CAS endpoint independently.
 assert.match(app,/await db\.deleteEmptyGroupCas\(boardId,candidate\)/);
 assert.match(source,/p_rows:\[\]/);
 assert.match(source,/p_expected_updated_at:null/);
 assert.doesNotMatch(source,/access_token|refresh_token|navigator\.clipboard|localStorage/);
 assert.doesNotMatch(source,/wm_delete_board_group/);
});

test('generic HTTP 403 without the expected PostgreSQL RBAC code cannot unlock writes',async()=>{
 const f=fake();
 f.api.rpc=async()=>{throw new ApiError('Gateway refusal',403,'');};
 const result=await probeBulk02SignedSession({auth:f.auth,api:f.api,board});
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.ready,false);
 assert.ok(result.checks.some(x=>x.id==='bulk-edit-permission'&&x.status==='BLOCKED'));
});
