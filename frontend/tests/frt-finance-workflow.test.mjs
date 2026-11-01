import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadFRTRequestDetailReadOnly,projectFRTRequestDetail}
 from '../frt-finance-workflow.js';
import {renderFRTFinanceReadOnly} from '../frt-finance-ui.js';

const user='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333';
const companyCode='PSTI';
const workflowCodes=['approve','approve/revoke','reject','transfer','transfer/revoke',
 'close','archive','liquidation/approve'];
function serverWorkflow(candidates=[]){
 return workflowCodes.map(code=>({code,eligible:candidates.includes(code),
  authority:'SERVER_ROLE_AND_LIFECYCLE_PREVIEW_ONLY'}));
}
const base={id,workspace_id:ws,company_code:companyCode,
 workflow:serverWorkflow(['approve','reject']),
 voucher_no:'FR-001',title:'Funding for supplies',
 status:'PENDING_APPROVAL',liquidation_status:'NOT_SUBMITTED',
 date_needed:'2026-11-03',finance_approved_at:null,transfer_confirmed_at:null,
 closed_at:null,archived_at:null,
 recipient_name:'Confidential Recipient',recipient_bank:'Bank',
 recipient_account:'PRIVATE_ACCOUNT',requestor:'PRIVATE REQUESTOR',
 requestor_email:'private@example.org',total_amount:999999,
 attachments:[{file_name:'PRIVATE FILE'}],items:[{amount:100}],
 audit:[{details:'PRIVATE AUDIT'}],liquidation:{amount:88}};
function fixture({raw=base,role='FINANCE_APPROVER',stale=false,denied=false,
 memberMismatch=false,companyMismatch=false}={}){
 let n=0;
 const calls=[];
 const auth={userId:user,async getVerifiedUser(){
  n++;return {id:stale&&n>1?'44444444-4444-4444-8444-444444444444':user};
 }};
 const api={
  async context(){calls.push('context');return {
   user_id:user,workspace_id:ws,profile:{status:'active'}
  };},
  async rpc(name,args){
   calls.push({name,args});
   if(name==='frt_bootstrap')return {
    membership:{workspace_id:ws,user_id:memberMismatch?id:user,
     role,enabled:true,status:'active'},
    companies:[{code:companyMismatch?'WASS':companyCode,name:'Process Solutions'}]
   };
   if(name==='frt_restricted_request_detail'){
    if(denied)throw Object.assign(Error('Sensitive backend error'),{status:403});
    return raw;
   }
   throw Error('Unexpected '+name);
  }
 };
 return {auth,api,calls};
}
const load=f=>loadFRTRequestDetailReadOnly({...f,workspaceId:ws,
 companyCode,requestId:id,allowedRequestIds:[id],expectedRole:'FINANCE_APPROVER'});
test('SEC13 reads existing signed RPC and returns only whitelisted non-financial request details',async()=>{
 const f=fixture();
 const report=await load(f);
 assert.equal(report.status,'PASS');
 assert.equal(report.writesAttempted,0);
 assert.equal(report.detail.status,'PENDING_APPROVAL');
 assert.equal(report.detail.workflow.length,8);
 assert.ok(report.detail.workflow.every(x=>x.authority==='NOT_VERIFIED_FOR_EXECUTION'));
 assert.deepEqual(f.calls.filter(x=>typeof x==='object').map(x=>x.name),['frt_bootstrap','frt_restricted_request_detail']);
 assert.deepEqual(f.calls.find(x=>x.name==='frt_restricted_request_detail').args,{
  p_workspace_id:ws,p_request_id:id
 });
 const text=JSON.stringify(report);
 for(const secret of ['PRIVATE_ACCOUNT','Confidential Recipient','Bank','PRIVATE REQUESTOR',
  'private@example.org','999999','PRIVATE FILE','PRIVATE AUDIT'])
  assert.ok(!text.includes(secret),secret+' leaked');
 assert.doesNotMatch(text,/requestor_email|recipient_account|total_amount|attachments|liquidation.*amount/i);
});
test('requests absent from current signed list are denied before RPC execution',async()=>{
 const f=fixture();
 const report=await loadFRTRequestDetailReadOnly({...f,requestId:id,
  companyCode,workspaceId:ws,allowedRequestIds:[],expectedRole:'FINANCE_APPROVER'});
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.reason,'FRT_REQUEST_NOT_IN_SIGNED_LIST');
 assert.equal(f.calls.length,0);
});
test('workspace and company mismatch from authoritative backend response fail closed',async()=>{
 const wrongWs=await load(fixture({raw:{...base,workspace_id:id}}));
 assert.equal(wrongWs.reason,'FRT_REQUEST_DETAIL_CONTRACT_INVALID');
 const wrongCo=await load(fixture({raw:{...base,company_code:'WASS'}}));
 assert.equal(wrongCo.reason,'FRT_REQUEST_DETAIL_CONTRACT_INVALID');
});
test('a role transition after the signed list prevents reuse of the old workflow snapshot',async()=>{
 const f=fixture({role:'REQUESTOR'});
 const result=await load(f);
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.reason,'FRT_DETAIL_MEMBERSHIP_DENIED');
 assert.ok(!f.calls.some(x=>x.name==='frt_restricted_request_detail'));
});
test('FRT member mismatch and no company access block before request-detail RPC',async()=>{
 for(const arg of [{memberMismatch:true},{companyMismatch:true}]){
  const f=fixture(arg);
  const result=await load(f);
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.reason,'FRT_DETAIL_MEMBERSHIP_DENIED');
  assert.ok(!f.calls.some(x=>x.name==='frt_restricted_request_detail'));
 }
});
test('expired or switched signed session and forbidden backend response are blocked',async()=>{
 const f=fixture({denied:true});
 const denied=await load(f);
 assert.equal(denied.reason,'FRT_DETAIL_ACCESS_DENIED');
 assert.doesNotMatch(JSON.stringify(denied),/Sensitive backend error/);
 const stale=await load(fixture({stale:true}));
 assert.equal(stale.reason,'SIGNED_CONTEXT_CHANGED');
 assert.equal(stale.detail,null);
});
test('unknown lifecycle values and missing server fields cannot produce optimistic workflow candidates',()=>{
 const ctx={requestId:id,companyCode,workspaceId:ws,role:'GENERAL_MANAGER'};
 for(const raw of [
  {...base,status:'UNEXPECTED'},
  {...base,liquidation_status:'INVALID'},
  {...base,finance_approved_at:undefined},
  {...base,date_needed:'not-a-date'},
  {...base,id:ws},
  {...base,closed_at:42},
  null
 ]){
  const projected=projectFRTRequestDetail(raw,ctx);
  assert.equal(projected.status,'BLOCKED');
  assert.equal(projected.detail,null);
 }
});
test('workflow candidates mirror server role/state constraints but never authorize a mutation',()=>{
 const ctx={requestId:id,companyCode,workspaceId:ws,role:'FINANCE_APPROVER'};
 let r=projectFRTRequestDetail(base,ctx);
 const codes=r.detail.workflow.filter(x=>x.candidate).map(x=>x.code);
 assert.deepEqual(codes,['approve','reject']);
 r=projectFRTRequestDetail({...base,status:'DONE',
  finance_approved_at:'2026-11-01T00:00:00Z',
  transfer_confirmed_at:null,liquidation_status:'APPROVED',
  workflow:serverWorkflow(['close'])},ctx);
 assert.deepEqual(r.detail.workflow.filter(x=>x.candidate).map(x=>x.code),['close']);
 r=projectFRTRequestDetail({...base,status:'DONE',
  finance_approved_at:'2026-11-01T00:00:00Z',
  liquidation_status:'SUBMITTED',
  workflow:serverWorkflow(['liquidation/approve'])},ctx);
 assert.deepEqual(r.detail.workflow.filter(x=>x.candidate).map(x=>x.code),['liquidation/approve']);
 const gm={...ctx,role:'GENERAL_MANAGER'};
 r=projectFRTRequestDetail({...base,status:'DONE',
  finance_approved_at:'2026-11-01T00:00:00Z',
  workflow:serverWorkflow(['transfer','archive'])},gm);
 assert.ok(r.detail.workflow.find(x=>x.code==='transfer').candidate);
 assert.ok(r.detail.workflow.find(x=>x.code==='archive').candidate);
 assert.ok(r.detail.workflow.every(x=>x.authority==='NOT_VERIFIED_FOR_EXECUTION'));
});
test('SEC13 detail UI renders escaped fields and informational non-executable workflow rows',()=>{
 const report=projectFRTRequestDetail({...base,title:'<img onerror=alert(1)>',
  voucher_no:'<script>Bad</script>'},{
   requestId:id,companyCode,workspaceId:ws,role:'FINANCE_APPROVER'
  });
 assert.equal(report.status,'PASS');
 const html=renderFRTFinanceReadOnly({
  result:{status:'PASS',companies:[{code:companyCode,name:'PSTI'}],companyCode,
   role:'FINANCE_APPROVER',
   summary:{total_requests:1,pending:1,in_progress:0,completed:0,pending_liquidation_count:0},
   requests:[{requestId:id,title:'<svg onload=alert(1)>',voucher:'V01',
    status:'PENDING_APPROVAL',dateNeeded:'2026-11-03'}]},
  detailResult:report,selectedRequestId:id
 });
 assert.match(html,/data-action="frt-finance-detail"/);
 assert.match(html,/data-action="frt-finance-detail-close"/);
 assert.match(html,/Candidate \(not authorized\)/);
 assert.match(html,/Not verified — read-only/);
 assert.match(html,/&lt;img onerror/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;svg onload/);
 assert.doesNotMatch(html,/<img onerror|<script>Bad|<svg onload/);
 assert.doesNotMatch(html,/PRIVATE_ACCOUNT|private@example.org|999999/);
 assert.doesNotMatch(html,/data-action="frt-finance-approve|data-action="frt-finance-reject|frt_request_action/);
});
test('SEC13 inaccessible detail cannot leak raw request fields or actions',()=>{
 const html=renderFRTFinanceReadOnly({
  result:{status:'PASS',companies:[{code:'PSTI',name:'PSTI'}],companyCode:'PSTI',
   role:'FINANCE_APPROVER',
   summary:{total_requests:0,pending:0,in_progress:0,completed:0,pending_liquidation_count:0},
   requests:[]},
  detailResult:{status:'BLOCKED',reason:'FRT_DETAIL_ACCESS_DENIED',
   detail:{title:'NOT_FOR_DISPLAY'}}
 });
 assert.match(html,/FRT_DETAIL_ACCESS_DENIED/);
 assert.doesNotMatch(html,/NOT_FOR_DISPLAY|financial workflow contract/i);
});
test('SEC13 app binds only the existing finance tab and drops stale details on session changes',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/loadFRTRequestDetailReadOnly\(/);
 assert.match(app,/case 'frt-finance-detail'/);
 assert.match(app,/state\.frtFinanceDetailRevision\+\+/);
 assert.match(app,/state\.frtFinanceDetail=null/);
 assert.match(app,/state\.context\?\.workspace_id===workspace/);
 assert.doesNotMatch(app,/frt_request_action|service_role|supabaseAdminClient/);
});

test('SEC14 rejects unexpected or optimistic server workflow assertions',()=>{
 const ctx={requestId:id,companyCode,workspaceId:ws,role:'REQUESTOR'};
 for(const raw of [
  {...base,workflow:undefined},
  {...base,workflow:serverWorkflow(['approve'])},
  {...base,workflow:[...serverWorkflow()].reverse()},
  {...base,workflow:serverWorkflow().map((x,i)=>i===0?{...x,authority:'EXECUTE_ALLOWED'}:x)}
 ]){
  const out=projectFRTRequestDetail(raw,ctx);
  assert.equal(out.status,'BLOCKED');
 }
});
test('SEC14 client never calls legacy broad FRT request detail',()=>{
 const source=readFileSync(new URL('../frt-finance-workflow.js',import.meta.url),'utf8');
 assert.match(source,/api\.rpc\('frt_restricted_request_detail'/);
 assert.doesNotMatch(source,/api\.rpc\('frt_get_request'/);
});
