import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeHulyIssueGateway,HULY_TX_CREATE,HULY_TX_UPDATE,HULY_ISSUE } from '../dist/src/native-huly.js';
import { createHulyRequestHandler } from '../dist/src/http-handler.js';
import { Denied,VersionConflict } from '../dist/src/sb02.js';
const U='11111111-1111-4111-8111-111111111111',W='22222222-2222-4222-8222-222222222222',B='33333333-3333-4333-8333-333333333333';
const base={_id:'tx1',space:'core:space:Tx',modifiedBy:U,modifiedOn:1700000000000,objectClass:HULY_ISSUE,objectSpace:'tracker:space:Project',objectId:'Issue.1'};
const create={...base,_class:HULY_TX_CREATE,attributes:{title:'Issue',status:'tracker:status:Todo',priority:2,description:null}};
const update={...base,_class:HULY_TX_UPDATE,operations:{title:'Updated'}};
const existing={id:'huly.issue.Issue.1',boardId:B,workspaceId:W,revision:3,payload:{kind:'huly.tracker.Issue',format:1,snapshot:{_id:'Issue.1',_class:HULY_ISSUE,space:base.objectSpace,title:'Issue',status:'tracker:status:Todo',priority:2}}};
function setup(config={}){
  const seen={writes:0,reads:0,ops:null};
  const identity={async verify(){return {id:U}}};
  const documents={async read(){seen.reads++;return config.missing?null:existing}};
  const atomic={async commit(_token,_workspace,_board,ops){seen.writes++;seen.ops=ops;if(config.conflict)throw new VersionConflict();return ops.map(x=>({id:x.documentId,boardId:B,workspaceId:W,revision:4}));}};
  return {native:new NativeHulyIssueGateway(identity,documents,atomic),seen};
}
test('native create projects Huly Issue to scoped RPC',async()=>{
  const {native,seen}=setup();const r=await native.commit('signed',W,B,[create]);
  assert.equal(r.applied,1);assert.equal(seen.ops[0].action,'create');
  assert.equal(seen.ops[0].payload.snapshot._class,HULY_ISSUE);
});
test('native update performs RLS read and optimistic revision',async()=>{
  const {native,seen}=setup();await native.commit('signed',W,B,[update]);
  assert.equal(seen.reads,1);assert.equal(seen.ops[0].expectedRevision,3);
  assert.equal(seen.ops[0].payload.snapshot.title,'Updated');
});
test('unsupported remove and mixin fail closed',async()=>{
  const {native,seen}=setup();
  for(const name of ['core:class:TxRemoveDoc','core:class:TxMixin'])
    await assert.rejects(()=>native.commit('signed',W,B,[{...create,_class:name}]),Denied);
  assert.equal(seen.writes,0);
});
test('actor mismatch and attached collections cannot be used',async()=>{
  const {native}=setup();
  await assert.rejects(()=>native.commit('signed',W,B,[{...create,modifiedBy:W}]),Denied);
  await assert.rejects(()=>native.commit('signed',W,B,[{...create,collection:'subIssues'}]),Denied);
});
test('unsupported update operators and metadata edits rejected',async()=>{
  const {native,seen}=setup();
  await assert.rejects(()=>native.commit('signed',W,B,[{...update,operations:{$inc:{priority:1}}}]),Denied);
  await assert.rejects(()=>native.commit('signed',W,B,[{...update,operations:{_id:'other'}}]),Denied);
  assert.equal(seen.writes,0);
});
test('duplicate documents fail before RPC',async()=>{
  const {native,seen}=setup();await assert.rejects(()=>native.commit('signed',W,B,[create,create]),Denied);
  assert.equal(seen.writes,0);
});
test('missing update rejects and stale revisions propagate',async()=>{
  await assert.rejects(()=>setup({missing:true}).native.commit('signed',W,B,[update]),Denied);
  await assert.rejects(()=>setup({conflict:true}).native.commit('signed',W,B,[update]),VersionConflict);
});
test('invalid Huly Issue status and priority rejected',async()=>{
  await assert.rejects(()=>setup().native.commit('signed',W,B,[{...create,attributes:{...create.attributes,priority:9}}]),TypeError);
  await assert.rejects(()=>setup().native.commit('signed',W,B,[{...update,operations:{status:null}}]),TypeError);
});
test('HTTP native transaction route requires signed user',async()=>{
  const {native}=setup();const handler=createHulyRequestHandler({},undefined,native);
  const uri='http://127.0.0.1:5173/api/v1/huly/boards/'+B+'/native-transactions?workspace_id='+W;
  assert.equal((await handler(new Request(uri,{method:'POST'}))).status,401);
  const r=await handler(new Request(uri,{method:'POST',headers:{authorization:'Bearer signed','content-type':'application/json'},body:JSON.stringify({txes:[create]})}));
  assert.equal(r.status,200);assert.equal((await r.json()).applied,1);
});
