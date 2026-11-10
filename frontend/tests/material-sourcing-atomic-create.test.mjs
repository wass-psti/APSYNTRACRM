import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMaterialSourcingAtomic} from '../material-sourcing-atomic-create.js';
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
   if(name==='mrh_sourcing_sensitive_read')return {'Buying Price':{value:12,revision:1}};
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
