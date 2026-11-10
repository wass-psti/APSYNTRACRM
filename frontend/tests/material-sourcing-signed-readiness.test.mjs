import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectMaterialSourcingSignedReadiness} from '../material-sourcing-application.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP,
 MATERIAL_SOURCING_EXISTING,MATERIAL_SOURCING_ADDITIONS} from '../material-sourcing-schema-plan.js';
const user='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const item='33333333-3333-4333-8333-333333333333';
const uuid=n=>'44444444-4444-4444-8444-'+String(n).padStart(12,'0');
function fixture({role='ADMIN',hasItem=false,wrongWorkspace=false,denied=false,groupTitle='Main group',publicCount=0,invalidType=false}={}){
 const auth={userId:user,isSignedIn:true,getVerifiedUser:async()=>({id:user})};
 const calls=[];
 const columns=MATERIAL_SOURCING_EXISTING.map((f,i)=>({
  id:uuid(i),name:f.name,data_type:f.type,visible:true,position:i,
  column_key:'domain_'+i
 }));
 for(const [i,f] of MATERIAL_SOURCING_ADDITIONS.filter(f=>f.exposure==='ordinary').entries()){
  if(i>=publicCount)break;
  columns.push({id:uuid(i+10),name:f.name,
   data_type:invalidType&&i===0?'number':f.type,
   column_key:'custom:'+uuid(i+20),visible:true,position:8+i});
 }
 const api={
  context:async()=>({user_id:user,workspace_id:workspace,profile:{status:'active'}}),
  allowed:async()=>!denied,
  board:async()=>({board:{id:MATERIAL_SOURCING_BOARD_ID,
   name:'Material Request Hub',status:'active',
   workspace_id:wrongWorkspace?uuid(70):workspace},
   groups:[{...MATERIAL_SOURCING_GROUP,title:groupTitle}],
   columns,items:hasItem?[{id:item,group_id:MATERIAL_SOURCING_GROUP.id,title:'PART-A'}]:[]}),
  rpc:async(name)=>{
   calls.push(name);
   if(name==='material_request_hub_bootstrap')return {workspaceId:workspace,role};
   if(name==='mrh_sourcing_sensitive_read')
    return {'Buying Price':{value:123,revision:1}};
   throw Error('Unexpected RPC');
  }
 };
 return {api,auth,calls};
}
test('readiness against empty original board reports zero writes and pending item acceptance',async()=>{
 const f=fixture();
 const report=await inspectMaterialSourcingSignedReadiness(f);
 assert.equal(report.status,'SIGNED_READINESS_VERIFIED');
 assert.equal(report.originalGroup,'VERIFIED');
 assert.equal(report.publicColumnsVerified,0);
 assert.equal(report.publicColumnsExpected,6);
 assert.equal(report.privateRead,'NO_PERSISTED_ITEM');
 assert.equal(report.productionWriteAcceptance,'NOT_EXECUTED');
 assert.equal(report.crossRoleDenial,'NOT_EXECUTED');
 assert.equal(report.writesPerformed,0);
 assert.deepEqual(f.calls,['material_request_hub_bootstrap']);
 assert.ok(!JSON.stringify(report).includes(user));
});
test('six trusted ordinary columns and persisted item can be validated without values in receipt',async()=>{
 const f=fixture({hasItem:true,publicCount:6});
 const report=await inspectMaterialSourcingSignedReadiness(f);
 assert.equal(report.publicColumnsVerified,6);
 assert.equal(report.privateRead,'SIGNED_READ_VERIFIED');
 assert.equal(report.itemCount,1);
 assert.ok(f.calls.includes('mrh_sourcing_sensitive_read'));
 assert.ok(!JSON.stringify(report).includes('Buying Price'));
 assert.ok(!JSON.stringify(report).includes('123'));
});
test('a wrong group, foreign workspace, denied role, and board denial stop private reads',async()=>{
 for(const options of [{role:'REQUESTOR'},{denied:true},
  {wrongWorkspace:true},{groupTitle:'Engineering Services'}]){
  const f=fixture({...options,hasItem:true});
  await assert.rejects(()=>inspectMaterialSourcingSignedReadiness(f));
  assert.ok(!f.calls.includes('mrh_sourcing_sensitive_read'));
 }
});
test('type drift never passes as an approved public sourcing column',async()=>{
 const f=fixture({publicCount:6,invalidType:true});
 const result=await inspectMaterialSourcingSignedReadiness(f);
 assert.equal(result.publicColumnsVerified,5);
});
test('on-demand UI reports statuses without protected values or silent writes',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/data-action="mrh-check-readiness"/);
 assert.doesNotMatch(source,/Signed Material Sourcing readiness<\/strong>/);
 assert.doesNotMatch(source,/production write acceptance: NOT EXECUTED/);
});
