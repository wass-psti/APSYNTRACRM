import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadFRTPersonAssignment,saveFRTPersonAssignment} from '../frt-board-person-assignment.js';
import {renderFRTFinanceReadOnly} from '../frt-finance-ui.js';
const user='11111111-1111-4111-8111-111111111111',
 ws='22222222-2222-4222-8222-222222222222',
 id='33333333-3333-4333-8333-333333333333',
 member='44444444-4444-4444-8444-444444444444';
function fixture({role='FINANCE_MANAGER',denied=false,wrongWorkspace=false,
  stale=false,receiptMismatch=false,postMismatch=false,foreignMember=false}={}){
 const calls=[];let assigneeId=null,readCount=0;
 const auth={userId:user,async getVerifiedUser(){return {id:user};}};
 const api={async context(){return {user_id:user,
  workspace_id:wrongWorkspace?'55555555-5555-4555-8555-555555555555':ws,
  profile:{status:'active'}};},async rpc(name,args){
   calls.push({name,args});
   if(name==='frt_bootstrap')return {membership:{workspace_id:ws,
    user_id:user,role,status:'active',enabled:true},companies:[{code:'PSTI'}]};
   if(name==='frt_assignable_people')return [{id:member,name:'Workspace teammate'}];
   if(name==='frt_restricted_request_detail')return {id,workspace_id:ws,
    company_code:'PSTI',archived_at:null};
   if(name==='frt_request_assignment'){
    readCount++;return {requestId:id,assigneeId:postMismatch&&readCount>2?null:assigneeId};
   }
   if(name==='frt_assign_request_person'){
    if(denied)throw Object.assign(Error('Denied'),{status:403});
    if(!stale)assigneeId=args.p_assignee_id;
    return {ok:!receiptMismatch,requestId:id,
     assigneeId:receiptMismatch?'00000000-0000-4000-8000-000000000000':args.p_assignee_id};
   }
   throw Error('Unexpected '+name);
  }};
 return {auth,api,calls};
}
const load=f=>loadFRTPersonAssignment({...f,requestId:id,workspaceId:ws,
 companyCode:'PSTI',role:'FINANCE_MANAGER',listedRequestIds:[id]});
test('signed workspace member directory and null assignment load without exposing other profiles',async()=>{
 const f=fixture();const snapshot=await load(f);
 assert.equal(snapshot.assigneeId,null);
 assert.deepEqual(snapshot.people,[{id:member,name:'Workspace teammate'}]);
 assert.equal(f.calls.some(x=>x.name==='frt_assign_request_person'),false);
});
test('person assignment uses same-workspace CAS, signed request list and reread',async()=>{
 const f=fixture();const snapshot=await load(f);
 const receipt=await saveFRTPersonAssignment({...f,snapshot,nextAssigneeId:member,
  listedRequestIds:[id]});
 assert.deepEqual(receipt,{status:'SAVED',assigneeId:member});
 assert.deepEqual(f.calls.find(x=>x.name==='frt_assign_request_person').args,{
  p_workspace_id:ws,p_request_id:id,p_expected_assignee_id:null,p_assignee_id:member});
 assert.equal(f.calls.filter(x=>x.name==='frt_request_assignment').length,3);
 assert.equal((await load(f)).assigneeId,member);
});
test('no change does not mutate, invalid or foreign members never write',async()=>{
 const f=fixture();const snap=await load(f);
 const result=await saveFRTPersonAssignment({...f,snapshot:snap,
  nextAssigneeId:null,listedRequestIds:[id]});
 assert.equal(result.status,'UNCHANGED');
 for(const candidate of [user,'invalid',undefined]){
  await assert.rejects(()=>saveFRTPersonAssignment({...f,snapshot:snap,
   nextAssigneeId:candidate,listedRequestIds:[id]}));
 }
 assert.equal(f.calls.some(x=>x.name==='frt_assign_request_person'),false);
});
test('foreign workspace and requestor role are denied without write',async()=>{
 for(const opts of [{wrongWorkspace:true},{role:'REQUESTOR'}]){
  const f=fixture(opts);await assert.rejects(()=>load(f));
  assert.equal(f.calls.some(x=>x.name==='frt_assign_request_person'),false);
 }
});
test('denied, inconsistent receipt or post-save reread never claims persistence',async()=>{
 for(const opts of [{denied:true},{receiptMismatch:true},{postMismatch:true}]){
  const f=fixture(opts),snapshot=await load(f);
  await assert.rejects(()=>saveFRTPersonAssignment({...f,snapshot,
   nextAssigneeId:member,listedRequestIds:[id]}));
  assert.equal(f.calls.filter(x=>x.name==='frt_assign_request_person').length,1);
 }
});
test('FRT person button is limited to existing finance correction roles',()=>{
 const result={status:'PASS',role:'FINANCE_MANAGER',companyCode:'PSTI',
  companies:[{code:'PSTI',name:'PSTI'}],summary:{total_requests:1,pending:1,
  in_progress:0,completed:0,pending_liquidation_count:0},requests:[{
   requestId:id,voucher:'QA',title:'Test',status:'PENDING_APPROVAL',dateNeeded:'2026-11-12'}]};
 const html=renderFRTFinanceReadOnly({result});
 assert.match(html,/data-action="frt-person-edit"/);
 assert.doesNotMatch(renderFRTFinanceReadOnly({result:{...result,role:'REQUESTOR'}}),
  /data-action="frt-person-edit"/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'frt-person-edit'/);
 assert.match(app,/saveFRTPersonAssignment/);
 assert.match(app,/loadFRTPersonAssignment/);
});
