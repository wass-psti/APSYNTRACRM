import test from 'node:test';
import assert from 'node:assert/strict';
import {executeFRTDomainAction,frtActionSpec} from '../frt-board-domain-actions.js';
import {projectFRTRequestDetail} from '../frt-finance-workflow.js';
const user='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333';
const codes=['approve','approve/revoke','reject','transfer','transfer/revoke','close','archive','liquidation/approve'];
const raw={id,workspace_id:ws,company_code:'PSTI',voucher_no:'FRT-1',title:'Test FRT',
 date_needed:'2026-11-12',status:'PENDING_APPROVAL',liquidation_status:'NOT_SUBMITTED',
 finance_approved_at:null,transfer_confirmed_at:null,closed_at:null,archived_at:null,
 workflow:codes.map(code=>({code,eligible:['approve','reject'].includes(code),
 authority:'SERVER_ROLE_AND_LIFECYCLE_PREVIEW_ONLY'}))};
const existingDetail=projectFRTRequestDetail(raw,{requestId:id,companyCode:'PSTI',workspaceId:ws,role:'FINANCE_APPROVER'});
function fixture({role='FINANCE_APPROVER',changed=false,denied=false,receipt={ok:true},expired=false}={}){
 const calls=[];let reads=0;
 const auth={userId:user,async getVerifiedUser(){return {id:user};}};
 const api={async context(){return {user_id:user,workspace_id:ws,profile:{status:'active'}};},
  async rpc(name,args){calls.push({name,args});
   if(name==='frt_bootstrap')return {membership:{user_id:user,workspace_id:ws,
    status:'active',enabled:true,role},companies:[{code:'PSTI'}]};
   if(name==='frt_restricted_request_detail'){
    reads++;return changed?{...raw,status:'REJECTED'}:raw;
   }
   if(name==='frt_request_action'){
    if(denied)throw Object.assign(new Error('denied'),{status:403});
    if(expired)throw Error('network lost');
    return receipt;
   }
   throw Error('Unexpected '+name);
  }};
 return {auth,api,calls,get reads(){return reads;}};
}
const run=(f,patch={})=>executeFRTDomainAction({...f,requestId:id,workspaceId:ws,
 companyCode:'PSTI',role:'FINANCE_APPROVER',allowedRequestIds:[id],
 existingDetail,action:'approve',...patch});
test('only explicit domain RPC action after signed fresh detail and verified candidate',async()=>{
 const f=fixture();const result=await run(f);
 assert.deepEqual(result,{status:'SENT_AND_ACKNOWLEDGED',action:'approve'});
 assert.deepEqual(f.calls.map(c=>c.name),['frt_bootstrap','frt_restricted_request_detail','frt_request_action']);
 assert.deepEqual(f.calls.at(-1).args,{p_workspace_id:ws,p_request_id:id,
  p_action:'approve',p_payload:{}});
});
test('no decorative status writes, archive or unfamiliar actions',async()=>{
 for(const code of ['Done','Working on it','archive','status:update','unknown']){
  const f=fixture();await assert.rejects(()=>run(f,{action:code}));
  assert.equal(f.calls.some(x=>x.name==='frt_request_action'),false);
 }
 assert.equal(frtActionSpec('archive'),null);
});
test('unlisted request, missing candidate and changed lifecycle are rejected before mutation',async()=>{
 for(const patch of [{allowedRequestIds:[]},
  {existingDetail:{...existingDetail,detail:{...existingDetail.detail,workflow:[]}}}]){
  const f=fixture();await assert.rejects(()=>run(f,patch));
  assert.equal(f.calls.length,0);
 }
 const f=fixture({changed:true});await assert.rejects(()=>run(f));
 assert.equal(f.calls.some(x=>x.name==='frt_request_action'),false);
});
test('signed membership and role mismatch deny action',async()=>{
 const f=fixture({role:'REQUESTOR'});await assert.rejects(()=>run(f));
 assert.equal(f.calls.some(x=>x.name==='frt_request_action'),false);
});
test('sensitive rejection requires a bounded reason and never sends unrelated payload',async()=>{
 for(const reason of ['', 'no', 'x'.repeat(501)]){
  const f=fixture();await assert.rejects(()=>run(f,{action:'reject',reason}));
  assert.equal(f.calls.some(x=>x.name==='frt_request_action'),false);
 }
 const f=fixture();await run(f,{action:'reject',reason:'Ineligible request'});
 assert.deepEqual(f.calls.at(-1).args.p_payload,{reason:'Ineligible request'});
});
test('denied, failed and ambiguous financial actions are never silently retried',async()=>{
 for(const config of [{denied:true},{expired:true},{receipt:{}}]){
  const f=fixture(config);await assert.rejects(()=>run(f));
  assert.equal(f.calls.filter(x=>x.name==='frt_request_action').length,1);
 }
});
