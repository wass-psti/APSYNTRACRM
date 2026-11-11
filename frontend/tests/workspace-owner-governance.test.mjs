import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 WS10_CREATION_AUTH_ENABLED,WS10_OWNERSHIP_TRANSFER_ENABLED,
 normalizeWorkspaceCreatorReadiness,validateOwnershipTransfer,
 WorkspaceOwnerGovernanceClient
} from '../workspace-owner-governance.js';
import {workspaceCreationUiReady} from '../workspace-ui.js';

const actor='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const target='33333333-3333-4333-8333-333333333333';
const requestId='44444444-4444-4444-8444-444444444444';
const receipt={schemaVersion:1,status:'SIGNED_CREATOR_POLICY',
 actorId:actor,workspaceId:ws,revision:1,canCreate:true,canTransfer:false};
const identity={user_id:actor,workspace_id:ws,profile:{status:'active'}};

test('new creator and ownership transfer transports are both disabled by default',()=>{
 assert.equal(WS10_CREATION_AUTH_ENABLED,false);
 assert.equal(WS10_OWNERSHIP_TRANSFER_ENABLED,false);
 assert.equal(workspaceCreationUiReady({}),false);
 assert.equal(workspaceCreationUiReady({selectorSession:{creatorRights:{
  status:'SIGNED_CREATOR_POLICY',canCreate:true
 }},creationLifecycle:{create:async()=>{}}}),true);
 assert.equal(workspaceCreationUiReady({selectorSession:{catalog:{rows:[{
  id:ws,relation:'owner'}]}},creationLifecycle:{create:async()=>{}}}),false);
});
test('signed creator receipt must exactly bind actor, current workspace and revision',()=>{
 const good=normalizeWorkspaceCreatorReadiness(receipt,{actorId:actor,workspaceId:ws});
 assert.equal(good.canCreate,true);
 assert.ok(Object.isFrozen(good));
 for(const bad of [
  null,{}, {...receipt,actorId:target}, {...receipt,workspaceId:target},
  {...receipt,revision:0},{...receipt,canCreate:'true'},
  {...receipt,canTransfer:1},{...receipt,status:'admin'}
 ]){
  assert.equal(normalizeWorkspaceCreatorReadiness(bad,{actorId:actor,workspaceId:ws}).canCreate,false);
 }
});
test('restricted creator cannot call the legacy creation RPC through governance client',async()=>{
 let called=0;
 const client=new WorkspaceOwnerGovernanceClient({
  auth:{userId:actor,getVerifiedUser:async()=>({id:actor})},
  api:{context:async()=>identity,rpc:async()=>{called++;return {};}}
 });
 assert.equal((await client.readiness()).canCreate,false);
 await assert.rejects(client.create({name:'A workspace',privacy:'closed',requestId}),
  /not activated/);
 await assert.rejects(client.transferOwnership({
  workspaceId:ws,targetUserId:target,requestId,expectedRevision:1
 }),/not activated/);
 assert.equal(called,0);
});
test('signed permission check explicitly returns DENY for missing or inconsistent server result',async()=>{
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={context:async()=>identity,
  rpc:async()=>({...receipt,workspaceId:target})};
 const client=new WorkspaceOwnerGovernanceClient({auth,api,creationEnabled:true});
 assert.equal((await client.readiness()).canCreate,false);
 await assert.rejects(client.create({name:'A workspace',privacy:'closed',requestId}),
  /permission not granted/);
});
test('restricted client uses only signed, owner-gated creation RPC with normalized receipt',async()=>{
 const requests=[];
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={context:async()=>identity,
  rpc:async(name,args)=>{
   requests.push({name,args});
   if(name==='wm_ws10_creator_readiness')return receipt;
   if(name==='wm_ws10_create_restricted')return {
    schemaVersion:1,workspaceId:target,relation:'owner',privacy:'closed',
    idempotent:false,active:false
   };
   throw Error('Unexpected RPC: '+name);
  }};
 const client=new WorkspaceOwnerGovernanceClient({auth,api,creationEnabled:true});
 const response=await client.create({name:'Workshop',privacy:'closed',requestId});
 assert.equal(response.workspaceId,target);
 assert.equal(response.relation,'owner');
 assert.equal(response.active,false);
 assert.deepEqual(requests.map(r=>r.name),[
  'wm_ws10_creator_readiness','wm_ws10_create_restricted'
 ]);
 assert.equal(requests[1].args.p_request_id,requestId);
});
test('transfers require exact target and optimistic ownership revision',()=>{
 const input={workspaceId:ws,targetUserId:target,requestId,expectedRevision:2};
 const normalized=validateOwnershipTransfer(input);
 assert.deepEqual(normalized,{...input,resourceKind:'workspace'});
 for(const bad of [
  {...input,expectedRevision:0},{...input,targetUserId:'client@example.test'},
  {...input,resourceKind:'application',moduleKey:'../../admin'},
  {...input,resourceKind:'board'},
  {...input,resourceKind:'workspace',moduleKey:'timetracker'}
 ]){
  assert.equal(validateOwnershipTransfer(bad),null);
 }
 assert.deepEqual(validateOwnershipTransfer({
  ...input,resourceKind:'application',moduleKey:'timetracker'
 }),{...input,resourceKind:'application',moduleKey:'timetracker'});
});
test('workspaces cannot be created merely because a user owns personal Main Workspace',()=>{
 const ui=readFileSync('frontend/workspace-ui.js','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 const sql=readFileSync('sql/ws10-restricted-workspace-ownership-CANDIDATE-NOT-APPLIED.sql','utf8');
 assert.match(ui,/rights\?\.status==='SIGNED_CREATOR_POLICY'/);
 assert.match(ui,/readCreationRights/);
 assert.match(app,/workspaceOwnerGovernance\.readiness\(\)/);
 assert.match(app,/creationLifecycle:workspaceOwnerGovernance/);
 assert.match(sql,/creator_kind IN\('it_admin','approved_owner'\)/);
 assert.match(sql,/creation_enabled boolean NOT NULL DEFAULT false/);
 assert.match(sql,/transfer_enabled boolean NOT NULL DEFAULT false/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.wm_ws10_create_restricted/);
 assert.match(sql,/private\.ws01_signed_actor_session/);
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION public\.wm_ws10_create_restricted/);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.wm_ws01_create/);
});
test('empty workspace overview already renders an empty-state without dummy boards',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/Start with your first board/);
 assert.match(app,/Create a board to organize tasks and updates/);
 assert.match(app,/receipt\.workspaceId/); // board creation receipt remains source-bound elsewhere
 const ui=readFileSync('frontend/workspace-ui.js','utf8');
 assert.match(ui,/Open workspace/);
 assert.match(ui,/newWorkspaceId=result\.receipt\?\.workspaceId/);
 assert.match(ui,/requestSignedWorkspaceSwitch/);
 assert.match(ui,/location/);
});
