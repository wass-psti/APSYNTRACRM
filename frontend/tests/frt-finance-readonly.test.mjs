import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadFRTFinanceReadOnly} from '../frt-finance-readonly.js';
import {renderFRTFinanceReadOnly} from '../frt-finance-ui.js';
const user='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const record='33333333-3333-4333-8333-333333333333';
function fixture({denied=false,wrongMember=false,stale=false,badCount=false,
 companies=[{code:'PSTI',name:'Process Solutions Technology Inc.'},{code:'WASS',name:'Watchdog'}],
 rows=[{id:record,voucher_no:'FRT-01',title:'Operational request',
 status:'PENDING_APPROVAL',date_needed:'2026-11-02',filing_status:'NOT_FILED',company_code:'PSTI',
 total_amount:10000,requestor:'private person',requestor_email:'secret@example.org'}]}={}){
 const calls=[];let verifications=0;
 const auth={userId:user,async getVerifiedUser(){verifications++;return {
  id:stale&&verifications>1?'44444444-4444-4444-8444-444444444444':user
 };}};
 const api={
  async context(){calls.push('context');return {
   user_id:user,workspace_id:ws,profile:{status:'active'}
  };},
  async rpc(name,args){
   calls.push({name,args});
   if(name==='frt_bootstrap'){
    if(denied)throw Object.assign(Error('internal secret'),{status:403});
    return {membership:{workspace_id:ws,user_id:wrongMember?record:user,
      role:'FINANCE_APPROVER',enabled:true,status:'active',
      email:'secret@example.org'},companies};
   }
   if(name==='frt_board_dashboard_safe'){
    return {total_requests:badCount?'1':1,pending:1,in_progress:0,
     completed:0,pending_liquidation_count:0,total_amount:100000,
     released:999999,monthly_trend:[],top_categories:[]};
   }
   if(name==='frt_board_list_safe')return rows;
   throw Error('Unexpected RPC '+name);
  }
 };
 return {auth,api,calls};
}
test('authorized FRT board integration reads only signed domain RPCs and removes secret finance fields',async()=>{
 const f=fixture();
 const report=await loadFRTFinanceReadOnly(f);
 assert.equal(report.status,'PASS');
 assert.equal(report.role,'FINANCE_APPROVER');
 assert.equal(report.companyCode,'PSTI');
 assert.equal(report.summary.total_requests,1);
 assert.equal(report.requests.length,1);
 assert.deepEqual(f.calls.filter(x=>typeof x==='object').map(x=>x.name),
   ['frt_bootstrap','frt_board_dashboard_safe','frt_board_list_safe']);
 assert.ok(!f.calls.some(x=>typeof x==='object'&&/create|update|delete|admin_set|request_action/i.test(x.name)));
 assert.equal(report.writesAttempted,0);
 const out=JSON.stringify(report);
 assert.doesNotMatch(out,/secret@example|requestor|total_amount|100000|999999|amount|attachments/i);
 assert.deepEqual(report.requests[0],{
  requestId:record,voucher:'FRT-01',title:'Operational request',status:'PENDING_APPROVAL',
  dateNeeded:'2026-11-02',filingStatus:'NOT_FILED'
 });
});
test('company selection must match a signed FRT bootstrap company before data calls',async()=>{
 const f=fixture();
 const response=await loadFRTFinanceReadOnly({...f,companyCode:'OTHER'});
 assert.equal(response.status,'BLOCKED');
 assert.equal(response.reason,'UNAUTHORIZED_COMPANY_SELECTION');
 assert.deepEqual(f.calls.filter(x=>typeof x==='object').map(x=>x.name),['frt_bootstrap']);
});
test('valid company switching sends exact workspace/company filters to existing RPCs',async()=>{
 const f=fixture({rows:[]});
 const r=await loadFRTFinanceReadOnly({...f,companyCode:'WASS'});
 assert.equal(r.status,'PASS');
 assert.equal(r.companyCode,'WASS');
 assert.deepEqual(f.calls.filter(x=>typeof x==='object'&&x.name==='frt_board_dashboard_safe')[0].args,
  {p_workspace_id:ws,p_company:'WASS'});
 assert.deepEqual(f.calls.filter(x=>typeof x==='object'&&x.name==='frt_board_list_safe')[0].args,
  {p_workspace_id:ws,p_company:'WASS',p_search:''});
});
test('signed denial and mismatched membership fail closed',async()=>{
 const denied=await loadFRTFinanceReadOnly(fixture({denied:true}));
 assert.equal(denied.status,'BLOCKED');
 assert.equal(denied.reason,'FRT_ACCESS_DENIED');
 const f=fixture({wrongMember:true});
 const invalid=await loadFRTFinanceReadOnly(f);
 assert.equal(invalid.status,'BLOCKED');
 assert.equal(invalid.reason,'FRT_ROLE_OR_COMPANY_CONTRACT_INVALID');
 assert.ok(!f.calls.some(x=>typeof x==='object'&&x.name==='frt_board_dashboard_safe'));
});
test('stale identity, invalid counts, mismatched company and unexpected rows cannot PASS',async()=>{
 const stale=await loadFRTFinanceReadOnly(fixture({stale:true}));
 assert.equal(stale.reason,'SIGNED_CONTEXT_CHANGED');
 const bad=await loadFRTFinanceReadOnly(fixture({badCount:true}));
 assert.equal(bad.reason,'FRT_FINANCE_READ_CONTRACT_INVALID');
 const crossed=await loadFRTFinanceReadOnly(fixture({rows:[{
  id:record,voucher_no:'X',title:'Private',status:'DONE',
  date_needed:null,company_code:'WASS'}]}));
 assert.equal(crossed.reason,'FRT_REQUEST_ROW_CONTRACT_INVALID');
});
test('empty company list is a safe empty state, never a fabricated finance amount',async()=>{
 const f=fixture({companies:[]});
 const r=await loadFRTFinanceReadOnly(f);
 assert.equal(r.status,'PASS');
 assert.equal(r.summary,null);
 assert.deepEqual(r.companies,[]);
 assert.ok(!f.calls.some(x=>typeof x==='object'&&x.name==='frt_board_dashboard_safe'));
});
test('FRT board UI escapes names, company codes, vouchers and status',()=>{
 const html=renderFRTFinanceReadOnly({result:{
  status:'PASS',role:'FINANCE_APPROVER',
  companies:[{code:'PSTI',name:'<img onerror=alert(1)>'}],companyCode:'PSTI',
  summary:{total_requests:1,pending:0,in_progress:0,completed:0,
   pending_liquidation_count:0},
  requests:[{voucher:'<svg onload=alert(1)>',title:'A & B',
   status:'<script>alert(1)</script>',dateNeeded:'2026-11-02'}]
 }});
 assert.match(html,/&lt;img onerror/);
 assert.match(html,/&lt;svg onload/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/A &amp; B/);
 assert.doesNotMatch(html,/<script>|<svg onload|<img onerror/);
 assert.doesNotMatch(html,/bank account|1000000|requestor_email/i);
});
test('blocked board UI never renders request content or permission-changing controls',()=>{
 const html=renderFRTFinanceReadOnly({result:{status:'BLOCKED',
  reason:'FRT_ACCESS_DENIED',requests:[{title:'DO_NOT_RENDER'}]}});
 assert.match(html,/FRT_ACCESS_DENIED/);
 assert.doesNotMatch(html,/DO_NOT_RENDER|data-action="frt-create|data-action="frt-update/);
});
test('SEC12 is attached only to the existing named FRT board and keeps no finance data after logout',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/moduleByBoardName\(b\.name\)\?\.key==='frt'/);
 assert.match(app,/loadFRTFinanceReadOnly\(\{auth,api:db,companyCode\}\)/);
 assert.match(app,/state\.frtFinance=null;state\.frtFinanceBusy=false/);
 assert.match(app,/case 'frt-finance-company'/);
 assert.doesNotMatch(app,/service_role|secretKey|supabaseAdminClient/i);
});


test('SEC14 safe dashboard/list never downgrade to financial-data-bearing legacy RPCs',async()=>{
 const f=fixture();
 const original=f.api.rpc.bind(f.api),requested=[];
 f.api.rpc=async(name,args)=>{
  requested.push(name);
  if(name==='frt_board_dashboard_safe')return {
   total_requests:1,pending:1,in_progress:0,completed:0,pending_liquidation_count:0
  };
  if(name==='frt_board_list_safe')return [{
   id:record,company_code:'PSTI',voucher_no:'SAFE-1',
   title:'Approved visibility',status:'PENDING_APPROVAL',date_needed:'2026-11-02',filing_status:'NOT_FILED'
  }];
  if(name==='frt_bootstrap')return original(name,args);
  throw Error('Forbidden legacy financial RPC: '+name);
 };
 const response=await loadFRTFinanceReadOnly(f);
 assert.equal(response.status,'PASS');
 assert.equal(response.requests.length,1);
 assert.deepEqual(requested,['frt_bootstrap','frt_board_dashboard_safe','frt_board_list_safe']);
 assert.equal(response.writesAttempted,0);
});

test('SEC14 unavailable safe endpoint fails closed without a legacy fallback',async()=>{
 const f=fixture();const calls=[];
 const original=f.api.rpc.bind(f.api);
 f.api.rpc=async(name,args)=>{
  calls.push(name);
  if(name==='frt_bootstrap')return original(name,args);
  throw Object.assign(Error('RPC missing'),{code:'PGRST202'});
 };
 const response=await loadFRTFinanceReadOnly(f);
 assert.equal(response.status,'BLOCKED');
 assert.equal(response.reason,'FRT_READONLY_RPC_MISSING');
 assert.ok(!calls.includes('frt_dashboard'));
 assert.ok(!calls.includes('frt_list_requests'));
});

test('SEC14 production board entry always requests server-restricted reads',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const matches=[...app.matchAll(/loadFRTFinanceReadOnly\(\{auth,api:db,companyCode\}\)/g)];
 assert.equal(matches.length,1);
 assert.doesNotMatch(readFileSync(new URL('../frt-finance-readonly.js',import.meta.url),'utf8'),
  /frt_list_requests|frt_dashboard|secureContracts/);
});
