import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readMaterialBoardItemTasks,saveMaterialBoardItemTask,renderMaterialBoardItemTasks} from '../material-sourcing-board-tasks.js';
import {MATERIAL_SOURCING_BOARD_ID} from '../material-sourcing-schema-plan.js';
const user='11111111-1111-4111-8111-111111111111';
const workspace='00000000-0000-4000-8000-000000000001';
const item='33333333-3333-4333-8333-333333333333';
const task='44444444-4444-4444-8444-444444444444';
const payload={id:task,title:'Check delivery',status:'working_on_it',revision:1};
function fixture({role='ADMIN',permissions=true,returnTasks=[payload]}={}){
 const calls=[];
 let signed=true;
 const auth={isSignedIn:true,userId:user,getVerifiedUser:async()=>({id:user})};
 const api={
  context:async()=>({user_id:user,workspace_id:workspace,profile:{status:'active'}}),
  allowed:async()=>permissions,
  rpc:async(name,args)=>{
   calls.push([name,args]);
   if(name==='material_request_hub_bootstrap')return {workspaceId:workspace,role};
   if(name==='mrh_board_item_tasks_read')return {tasks:returnTasks};
   if(name==='mrh_board_item_tasks_write')return {id:task,title:args.p_title,status:args.p_status,
    revision:args.p_expected_revision===null?1:args.p_expected_revision+1};
   throw Error('unexpected RPC: '+name);
  }
 };
 return {options:{auth,api,boardId:MATERIAL_SOURCING_BOARD_ID,workspaceId:workspace,itemId:item},calls};
}
test('verified tasks only from signed board-item RPC, not legacy material id',async()=>{
 const {options,calls}=fixture();
 const tasks=await readMaterialBoardItemTasks(options);
 assert.equal(tasks.length,1);
 assert.deepEqual(tasks[0],payload);
 assert.ok(calls.some(([name,args])=>name==='mrh_board_item_tasks_read'&&args.p_item_id===item));
 assert.ok(calls.every(([name])=>!name.startsWith('material_tracker_')));
});
test('write includes CAS and authoritative receipt; stale server response denied',async()=>{
 const {options,calls}=fixture();
 const result=await saveMaterialBoardItemTask(options,{id:task,title:' Check delivery ',status:'done',revision:1});
 assert.equal(result.revision,2);
 const rpc=calls.find(([name])=>name==='mrh_board_item_tasks_write')[1];
 assert.equal(rpc.p_item_id,item);
 assert.equal(rpc.p_task_id,task);
 assert.equal(rpc.p_expected_revision,1);
 assert.equal(rpc.p_title,'Check delivery');
 const created=await saveMaterialBoardItemTask(options,{title:'New task'});
 assert.equal(created.revision,1);
});
test('no write for missing signed role, edit access, identity or stale revision',async()=>{
 for(const flags of [{role:'VIEWER'},{permissions:false}]){
  const {options,calls}=fixture(flags);
  await assert.rejects(()=>saveMaterialBoardItemTask(options,{title:'Denied'}));
  assert.equal(calls.filter(([name])=>name==='mrh_board_item_tasks_write').length,0);
 }
 const {options,calls}=fixture();
 for(const input of [{id:task,title:'Bad',revision:null},{title:' '},
  {title:'Good',status:'unapproved'},{id:task,title:'Bad',revision:0}]){
  await assert.rejects(()=>saveMaterialBoardItemTask(options,input));
 }
 assert.equal(calls.filter(([name])=>name==='mrh_board_item_tasks_write').length,0);
 options.auth.isSignedIn=false;
 await assert.rejects(()=>readMaterialBoardItemTasks(options));
});
test('reject malformed, duplicate or oversized read responses',async()=>{
 for(const rows of [[{...payload,revision:-1}], [payload,payload],Array(101).fill(payload),
  [{...payload,title:'<script>x</script>',revision:1}, {...payload,id:'wrong'}]]){
  const {options}=fixture({returnTasks:rows});
  await assert.rejects(()=>readMaterialBoardItemTasks(options));
 }
});
test('rendering escapes malicious task name and limits updates to authorized editable state',()=>{
 const html=renderMaterialBoardItemTasks([{...payload,title:'<img src=x onerror=alert(1)>'}],{editable:false});
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img|type="submit"|Add task/);
 const writable=renderMaterialBoardItemTasks([payload],{editable:true});
 assert.match(writable,/data-mrh-board-task/);
 assert.match(writable,/data-revision="1"/);
 assert.match(writable,/Add task/);
});
test('Material Tracker drawer uses only the new board task contract with fail-closed states',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/readMaterialBoardItemTasks\(input\)/);
 assert.match(app,/saveMaterialBoardItemTask\(input,/);
 assert.match(app,/taskRequested=true;await refreshTasks\(\)/);
 assert.match(app,/!current\(\)\|\|taskBusy/);
 assert.match(app,/Task write not confirmed/);
 assert.match(app,/if\(!await refreshTasks\(\)\)throw new ApiError/);
 assert.match(app,/form\.querySelectorAll\('button,input,select'\)/);
 assert.match(app,/No task changes were made/);
});
