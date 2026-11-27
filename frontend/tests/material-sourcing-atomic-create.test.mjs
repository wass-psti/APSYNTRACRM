import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMaterialSourcingAtomic,retainMaterialCreatePlan,createMaterialWithRecovery,recoverMaterialCreation,materialCreationRecoveryKey,MATERIAL_SOURCING_DURABLE_CREATE_ENABLED} from '../material-sourcing-atomic-create.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP} from '../material-sourcing-schema-plan.js';
const actor='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const item='33333333-3333-4333-8333-333333333333';
const request='44444444-4444-4444-8444-444444444444';
const column='55555555-5555-4555-8555-555555555555';
const plan={partNumber:'PART-101',ordinary:[{columnId:column,name:'Quantity',value:3}],
 protectedValues:[{name:'Buying Price',value:12}]};
function fixture({role='ADMIN',switchWorkspace=false,foreignValue=false,anonymous=false,invalidReceipt=false}={}){
 let contextCount=0,reads=0;
 const calls=[];
 const auth={userId:actor,isSignedIn:!anonymous,getVerifiedUser:async()=>({id:actor})};
 const api={
  context:async()=>({user_id:actor,workspace_id:switchWorkspace&&++contextCount>=2?
   '99999999-9999-4999-8999-999999999999':workspace,profile:{status:'active'}}),
  allowed:async()=>true,
  rpc:async(name,args)=>{
   calls.push([name,args]);
   if(name==='material_request_hub_bootstrap')return {workspaceId:workspace,role};
   if(name==='mrh_create_material_atomic')return {item_id:invalidReceipt?'invalid':item,request_id:request,created:true};
   if(name==='mrh_sourcing_board_viewer_read')return {'Buying Price':{value:12,revision:1}};
   throw new Error('Unexpected '+name);
  },
  board:async()=>{reads++;return {
   board:{id:MATERIAL_SOURCING_BOARD_ID,workspace_id:workspace},
   groups:[MATERIAL_SOURCING_GROUP],
   items:[{id:item,group_id:MATERIAL_SOURCING_GROUP.id,title:plan.partNumber}],
   values:[{item_id:item,column_id:column,value:foreignValue?99:3}]
  }}
 };
 return {options:{api,auth,workspaceId:workspace,requestId:request,plan},calls,getReads:()=>reads};
}
test('atomic create sends one RPC and verifies public plus private values',async()=>{
 const f=fixture();
 const created=await createMaterialSourcingAtomic(f.options);
 assert.equal(created.itemId,item);
 assert.equal(created.created,true);
 assert.equal(f.calls.filter(([n])=>n==='mrh_create_material_atomic').length,1);
 const fields=f.calls.find(([n])=>n==='mrh_create_material_atomic')[1];
 assert.deepEqual(fields.p_public_fields,[{name:'Quantity',value:3}]);
 assert.deepEqual(fields.p_private_fields,{'Buying Price':12});
 assert.equal(fields.p_request_id,request);
 assert.equal(f.getReads(),1);
});
test('denies nonadmin and unsigned sessions before any atomic RPC',async()=>{
 for(const options of [{role:'VIEWER'},{anonymous:true}]){
  const f=fixture(options);
  await assert.rejects(()=>createMaterialSourcingAtomic(f.options));
  assert.equal(f.calls.filter(([n])=>n==='mrh_create_material_atomic').length,0);
 }
});
test('invalid receipt, foreign board value or swapped workspace cannot claim success',async()=>{
 for(const options of [{invalidReceipt:true},{foreignValue:true},{switchWorkspace:true}]){
  const f=fixture(options);
  await assert.rejects(()=>createMaterialSourcingAtomic(f.options));
 }
});
test('migration binds exact board/group and protects idempotent private request table',()=>{
 const sql=readFileSync(new URL('../../sql/mrh-atomic-material-create-PRODUCTION-ACTIVATED-20261111.sql',import.meta.url),'utf8');
 assert.match(sql,/create table private\.mrh_material_create_requests/);
 assert.match(sql,/force row level security/);
 assert.match(sql,/v_group constant uuid/);
 assert.match(sql,/Main group/);
 assert.match(sql,/public\.wm_add_board_item/);
 assert.match(sql,/public\.wm_set_board_cell_if_current/);
 assert.match(sql,/public\.mrh_sourcing_sensitive_write/);
 assert.match(sql,/payload_fingerprint/);
 assert.match(sql,/v_existing\.actor_id<>v_actor/);
 assert.match(sql,/grant execute on function public\.mrh_create_material_atomic.*authenticated/);
 assert.doesNotMatch(sql,/^\s*(?:delete|update|truncate|drop)\s+public\.(?:work_board|workspaces|profiles)/im);
});

test('same-form retry retains the original plan and refuses a different payload or signed scope',()=>{
 const form={};
 const first=retainMaterialCreatePlan(form,plan,'actor:workspace');
 assert.deepEqual(first,plan);
 assert.equal(retainMaterialCreatePlan(form,plan,'actor:workspace'),first);
 assert.throws(()=>retainMaterialCreatePlan(form,{...plan,partNumber:'changed'},'actor:workspace'),/original/);
 assert.throws(()=>retainMaterialCreatePlan(form,plan,'other:workspace'),/original/);
 assert.deepEqual(retainMaterialCreatePlan({}, {...plan,partNumber:'new'},'actor:workspace').partNumber,'new');
});
test('uncertain create response can replay the same request and verifies fresh persisted data',async()=>{
 const f=fixture(),rpc=f.options.api.rpc;
 let tries=0,invalidated=0;
 f.options.api.invalidateBoardCache=()=>{invalidated++;};
 f.options.api.rpc=async(name,args)=>{
  if(name==='mrh_create_material_atomic'){
   assert.equal(args.p_request_id,request);
   if(++tries===1)throw Error('response lost');
   return {item_id:item,request_id:request,created:false};
  }
  return rpc(name,args);
 };
 await assert.rejects(()=>createMaterialSourcingAtomic(f.options),/response lost/);
 const replay=await createMaterialSourcingAtomic(f.options);
 assert.equal(replay.created,false);
 assert.equal(replay.itemId,item);
 assert.equal(tries,2);
 assert.equal(invalidated,1);
});

function recoveryFixture(){
 const f=fixture(),values=new Map(),baseRpc=f.options.api.rpc;
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),
  removeItem:key=>values.delete(key)};
 let committed=false,loseResponse=true,writes=0;
 f.options.api.rpc=async(name,args)=>{
  if(name==='mrh_material_create_receipt')return committed?
   {status:'committed',request_id:args.p_request_id,item_id:item}:
   {status:'unresolved',request_id:args.p_request_id};
  if(name==='mrh_create_material_atomic'){
   writes++;assert.equal(args.p_request_id,request);committed=true;
   if(loseResponse)throw Error('response lost');
   return {item_id:item,request_id:request,created:true};
  }
  return baseRpc(name,args);
 };
 const options={...f.options,storage,locks:null,newRequestId:request,form:{},formRequestId:null};
 return {options,values,getWrites:()=>writes,setCommitted:x=>{committed=x;},setLoseResponse:x=>{loseResponse=x;}};
}
test('durable recovery is enabled after approved backend activation',()=>{
 assert.equal(MATERIAL_SOURCING_DURABLE_CREATE_ENABLED,true);
});
test('lost response survives new form and resolves via receipt without any duplicate write or persisted payload',async()=>{
 const f=recoveryFixture(),key=materialCreationRecoveryKey(actor,workspace);
 await assert.rejects(()=>createMaterialWithRecovery(f.options),/response lost/);
 assert.deepEqual([...f.values.entries()],[[key,request]]);
 const reopened={...f.options,form:{}};
 await assert.rejects(()=>createMaterialWithRecovery(reopened),/Recover previous save/);
 const recovered=await recoverMaterialCreation(reopened);
 assert.equal(recovered.status,'committed');assert.equal(recovered.itemId,item);
 assert.equal(recovered.partNumber,plan.partNumber);
 assert.equal(f.getWrites(),1);assert.equal(f.values.size,0);
});
test('unresolved receipt retains operation ID and permits explicit retry after reload',async()=>{
 const f=recoveryFixture(),key=materialCreationRecoveryKey(actor,workspace);
 f.values.set(key,request);f.setLoseResponse(false);
 const result=await recoverMaterialCreation(f.options);
 assert.equal(result.status,'unresolved');assert.equal(f.values.get(key),request);
 const created=await createMaterialWithRecovery({...f.options,form:{},formRequestId:result.requestId});
 assert.equal(created.itemId,item);assert.equal(f.getWrites(),1);assert.equal(f.values.size,0);
});
test('storage is scoped to account/workspace and unavailable storage prevents an uncertain new write',async()=>{
 const f=recoveryFixture();
 f.values.set(materialCreationRecoveryKey(actor,'99999999-9999-4999-8999-999999999999'),request);
 assert.equal((await recoverMaterialCreation(f.options)).status,'none');
 await assert.rejects(()=>createMaterialWithRecovery({...f.options,storage:null}),/storage/);
 assert.equal(f.getWrites(),0);
});
test('malformed receipt and failed board read preserve recovery identifier',async()=>{
 const f=recoveryFixture(),key=materialCreationRecoveryKey(actor,workspace);
 f.values.set(key,request);const base=f.options.api.rpc;
 f.options.api.rpc=async(name,args)=>name==='mrh_material_create_receipt'?
  {status:'committed',request_id:'wrong',item_id:item}:base(name,args);
 await assert.rejects(()=>recoverMaterialCreation(f.options),/receipt/);
 assert.equal(f.values.get(key),request);
 f.options.api.rpc=base;f.setCommitted(true);
 f.options.api.board=async()=>{throw Error('offline');};
 await assert.rejects(()=>recoverMaterialCreation(f.options),/offline/);
 assert.equal(f.values.get(key),request);
});
test('recovery uses the shared scope lock and identifies archived committed rows without resubmission',async()=>{
 const f=recoveryFixture(),key=materialCreationRecoveryKey(actor,workspace),calls=[];
 f.values.set(key,request);f.setCommitted(true);
 const board=f.options.api.board;
 f.options.api.board=async()=>{const value=await board();value.items[0].archived_at='2026-11-27';return value;};
 const result=await recoverMaterialCreation({...f.options,locks:{request:async(name,task)=>{calls.push(name);return task();}}});
 assert.deepEqual(calls,[key]);assert.equal(result.available,false);assert.equal(result.partNumber,null);
 assert.equal(result.status,'committed');assert.equal(f.getWrites(),0);assert.equal(f.values.size,0);
});
