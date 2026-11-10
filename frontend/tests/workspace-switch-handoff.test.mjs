import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 normalizeServerWorkspaceCatalog,requestSignedWorkspaceSwitch,
 WS01_SWITCHING_ENABLED
} from '../workspace-ui.js';

const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const primary='00000000-0000-4000-8000-000000000001';
const shared='00000000-0000-4000-8000-000000000002';
const outside='00000000-0000-4000-8000-000000000003';
const verified=()=>normalizeServerWorkspaceCatalog({
 schemaVersion:1,userId:actor,activeWorkspaceId:primary,rows:[
  {id:primary,name:'Current',relation:'member',privacy:'closed',active:true},
  {id:shared,name:'Other authorized workspace',relation:'owner',privacy:'open',active:false}
 ]
},{userId:actor,workspaceId:primary});
const receipt=()=>({
 workspaceId:shared,previousWorkspaceId:primary,switched:true
});

test('staged workspace switching binds to signed server selection without local scope changes',()=>{
 assert.equal(WS01_SWITCHING_ENABLED,true);
 const ui=readFileSync('frontend/workspace-ui.js','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(ui,/data-ws01-action="select"/);
 assert.match(ui,/data-ws01-action="select">Switch workspace/);
 assert.match(ui,/Switch workspace — unavailable/);
 assert.match(ui,/options\.switchingEnabled===true/);
 assert.match(ui,/typeof options\.onWorkspaceSwitched==='function'/);
 assert.match(app,/switchingEnabled:WS01_SWITCHING_ENABLED/);
 assert.match(app,/onWorkspaceSwitched:\(\)=>\{/);
 assert.match(app,/location\.reload\(\)/);
 assert.match(ui,/WS01_SWITCHING_ENABLED=true/);
 assert.match(app,/switchingEnabled:WS01_SWITCHING_ENABLED/);
});

test('fresh signed catalog must be checked before CAS RPC and reload receipt',async()=>{
 const calls=[];
 const result=await requestSignedWorkspaceSwitch({
  workspaceId:shared,expectedWorkspaceId:primary,
  lifecycle:{
   discover:async()=>{calls.push('discover');return verified();},
   select:async(target,expected)=>{
    calls.push('select');assert.equal(target,shared);assert.equal(expected,primary);
    return receipt();
   }
  }
 });
 assert.deepEqual(calls,['discover','select']);
 assert.deepEqual(result,receipt());
});

test('stale current scope, unsupported targets and unsigned catalog never invoke select',async()=>{
 const cases=[
  {name:'missing signed member discovery',catalog:{status:'UNAVAILABLE',rows:[]},target:shared,expected:primary},
  {name:'missing target member',catalog:verified(),target:outside,expected:primary},
  {name:'stale expected scope',catalog:verified(),target:shared,expected:outside},
  {name:'current workspace target',catalog:verified(),target:primary,expected:primary},
  {name:'missing active member',catalog:{...verified(),rows:verified().rows.filter(r=>!r.active)},target:shared,expected:primary},
  {name:'unverified foreign row',catalog:{...verified(),rows:[...verified().rows,{
   id:outside,active:false,verifiedScope:'SIGNED_CURRENT_ONLY'}]},target:outside,expected:primary}
 ];
 for(const c of cases){
  let selects=0;
  await assert.rejects(()=>requestSignedWorkspaceSwitch({
   workspaceId:c.target,expectedWorkspaceId:c.expected,
   lifecycle:{discover:async()=>c.catalog,select:async()=>{selects++;return receipt();}}
  }),undefined,c.name);
  assert.equal(selects,0,c.name);
 }
});

test('missing lifecycle functions and malformed scope fail closed without an RPC',async()=>{
 for(const request of [
  {workspaceId:'not-a-uuid',expectedWorkspaceId:primary,lifecycle:{}},
  {workspaceId:shared,expectedWorkspaceId:primary,lifecycle:{}},
  {workspaceId:shared,expectedWorkspaceId:primary,lifecycle:{discover:async()=>verified()}},
  {workspaceId:shared,expectedWorkspaceId:primary,lifecycle:{select:async()=>receipt()}}
 ])await assert.rejects(requestSignedWorkspaceSwitch(request));
});

test('malformed or forged selection receipts do not trigger confirmed transition',async()=>{
 for(const bad of [null,{...receipt(),workspaceId:outside},
  {...receipt(),previousWorkspaceId:outside},{...receipt(),switched:false}]){
  await assert.rejects(()=>requestSignedWorkspaceSwitch({
   workspaceId:shared,expectedWorkspaceId:primary,
   lifecycle:{discover:async()=>verified(),select:async()=>bad}
  }),/could not be verified/);
 }
});

test('server read or write denial is propagated without silently selecting locally',async()=>{
 const denied=Object.assign(new Error('Denied by authoritative server'),{status:403});
 let selects=0;
 await assert.rejects(()=>requestSignedWorkspaceSwitch({
  workspaceId:shared,expectedWorkspaceId:primary,
  lifecycle:{discover:async()=>{throw denied;},select:async()=>{selects++;}}
 }),err=>err===denied);
 assert.equal(selects,0);
 await assert.rejects(()=>requestSignedWorkspaceSwitch({
  workspaceId:shared,expectedWorkspaceId:primary,
  lifecycle:{discover:async()=>verified(),select:async()=>{selects++;throw denied;}}
 }),err=>err===denied);
 assert.equal(selects,1);
});
