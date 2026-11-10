import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MATERIAL_SOURCING_BOARD_ID} from '../material-sourcing-schema-plan.js';
import {readMaterialBoardItemTasks,saveMaterialBoardItemTask} from '../material-sourcing-board-tasks.js';
import {readProtectedSourcingItem,revalidateMaterialSourcingSession} from '../material-sourcing-application.js';

const actor='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const item='33333333-3333-4333-8333-333333333333';
const task='44444444-4444-4444-8444-444444444444';
function client({role='ADMIN',switchWorkspace=false,revoke=false}={}){
 let verifiedCalls=0,bootstrap=0,contextCalls=0;
 const auth={isSignedIn:true,userId:actor,getVerifiedUser:async()=>{verifiedCalls++;return {id:actor}}};
 const api={
  context:async()=>{contextCalls++;return {user_id:actor,workspace_id:switchWorkspace&&contextCalls>1?'55555555-5555-4555-8555-555555555555':ws,profile:{status:'active'}}},
  allowed:async()=>true,
  rpc:async(name,args)=>{
   if(name==='material_request_hub_bootstrap'){bootstrap++;return {workspaceId:ws,role}}
   if(revoke){auth.isSignedIn=false}
   if(name==='mrh_board_item_tasks_read')return {tasks:[{id:task,title:'Recorded',status:'done',revision:2}]};
   if(name==='mrh_board_item_tasks_write')return {id:task,title:args.p_title,status:args.p_status,revision:3};
   if(name==='mrh_sourcing_sensitive_read')return {'Buying Price':{value:5,revision:1}};
   throw new Error('Unexpected RPC: '+name);
  }
 };
 return {options:{api,auth,workspaceId:ws,boardId:MATERIAL_SOURCING_BOARD_ID,itemId:item},
  stats:()=>({bootstrap,verifiedCalls,contextCalls})};
}
test('task read performs only one role preflight, with protected response revalidation',async()=>{
 const f=client();
 const rows=await readMaterialBoardItemTasks(f.options);
 assert.equal(rows[0].revision,2);
 assert.equal(f.stats().bootstrap,1);
 assert.equal(f.stats().verifiedCalls,2);
 assert.equal(f.stats().contextCalls,2);
});
test('task write also performs one role preflight and retains revision CAS',async()=>{
 const f=client();
 const result=await saveMaterialBoardItemTask(f.options,{id:task,title:'Recorded',status:'done',revision:2});
 assert.equal(result.revision,3);
 assert.equal(f.stats().bootstrap,1);
});
test('protected sourcing fields use one role preflight and preserve values',async()=>{
 const f=client();
 const result=await readProtectedSourcingItem(f.options);
 assert.equal(result['Buying Price'].value,5);
 assert.equal(f.stats().bootstrap,1);
});
test('session revocation or workspace switching after RPC drops task and protected values',async()=>{
 for(const flags of [{revoke:true},{switchWorkspace:true}]){
  const f=client(flags);
  await assert.rejects(()=>readMaterialBoardItemTasks(f.options));
  const protectedClient=client(flags);
  await assert.rejects(()=>readProtectedSourcingItem(protectedClient.options));
 }
});
test('non-admin role is denied before task RPC despite simplified postcheck',async()=>{
 const f=client({role:'VIEWER'});
 await assert.rejects(()=>readMaterialBoardItemTasks(f.options));
 assert.equal(f.stats().bootstrap,1);
});
test('revalidation refuses wrong actor and no longer depends on domain bootstrap',async()=>{
 const f=client();
 await assert.rejects(()=>revalidateMaterialSourcingSession(f.options,'55555555-5555-4555-8555-555555555555'));
 assert.equal(f.stats().bootstrap,0);
});
test('normal board UI no longer exposes engineering readiness controls',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/mrh-check-readiness|mrhReadiness|Signed Material Sourcing readiness/);
 assert.match(source,/data-action="mrh-new-part"/);
 assert.match(source,/readMaterialBoardItemTasks\(input\)/);
});
