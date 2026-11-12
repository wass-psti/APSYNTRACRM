import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runSEC14SignedRead,sanitizeSEC14SignedRead}
 from '../frt-sec14-signed-acceptance.js';
import {renderSecurityAcceptance} from '../board-security-ui.js';
const uid='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333';
const codes=['approve','approve/revoke','reject','transfer',
 'transfer/revoke','close','archive','liquidation/approve'];
const context={user_id:uid,workspace_id:ws,profile:{status:'active',platform_role:'employee'}};
function fixture({hasRequest=false,denied=false,changed=false,invalid=false,
 secondCompany=false,secondOnly=false,denySecond=false,noCompanies=false,
 summaryMismatch=false}={}){
 const calls=[];let n=0;
 const auth={userId:uid,async getVerifiedUser(){
  n++;return {id:changed&&n>1?id:uid};
 }};
 const api={async context(){calls.push('context');return context;},
  async rpc(name,args){
   calls.push(name);
   if(name==='frt_bootstrap'){
    if(denied)throw Object.assign(Error('private account'),{status:403});
    return {membership:{workspace_id:ws,user_id:uid,role:'FINANCE_APPROVER',
     enabled:true,status:'active',email:'private@example.org'},
     companies:noCompanies?[]:secondCompany?
      [{code:'PSTI',name:'PSTI'},{code:'WASS',name:'WASS'}]:
      [{code:'PSTI',name:'PSTI'}]};
   }
   if(denySecond&&args?.p_company==='WASS')
    throw Object.assign(Error('private read denied'),{status:403});
   const visible=hasRequest&&(!secondOnly||args?.p_company==='WASS');
   if(name==='frt_board_dashboard_safe')return {
    total_requests:visible||summaryMismatch?1:0,pending:visible||summaryMismatch?1:0,
    in_progress:0,completed:0,pending_liquidation_count:0};
   if(name==='frt_board_list_safe')return visible?[{
    id,company_code:args.p_company,voucher_no:'FRT-01',
    title:'Approved visibility',status:'PENDING_APPROVAL',date_needed:'2026-11-15',filing_status:'NOT_FILED'
   }]:[];
   if(name==='frt_restricted_request_detail')return {
    id,workspace_id:ws,company_code:secondOnly?'WASS':'PSTI',
    voucher_no:'FRT-01',title:'Approved visibility',
    date_needed:'2026-11-15',status:'PENDING_APPROVAL',
    liquidation_status:'NOT_SUBMITTED',finance_approved_at:null,
    transfer_confirmed_at:null,closed_at:null,archived_at:null,
    workflow:codes.map(code=>({code,eligible:!invalid&&
      ['approve','reject'].includes(code),
      authority:invalid?'NOT_VERIFIED_FOR_EXECUTION':'SERVER_ROLE_AND_LIFECYCLE_PREVIEW_ONLY'}))
   };
   throw Error('Unexpected RPC '+name);
  }
 };
 return {auth,api,calls};
}
test('SEC14 signed empty finance domain is PENDING, never a fabricated detail PASS',async()=>{
 const f=fixture();
 const r=await runSEC14SignedRead(f);
 assert.equal(r.status,'PENDING');
 assert.equal(r.reason,'NO_EXISTING_FRT_REQUEST');
 assert.deepEqual(r.checks.map(x=>x.status),['PASS','PASS','PENDING','PASS']);
 assert.ok(!f.calls.includes('frt_restricted_request_detail'));
 assert.ok(f.calls.includes('frt_board_list_safe'));
 assert.ok(f.calls.includes('frt_board_dashboard_safe'));
 assert.equal(r.writesAttempted,0);
 assert.equal(r.financialWritesVerified,'NOT_VERIFIED');
});
test('SEC14 signed existing request uses only server-restricted detail and valid action preview',async()=>{
 const f=fixture({hasRequest:true});
 const r=await runSEC14SignedRead(f);
 assert.equal(r.status,'PASS');
 assert.equal(r.checks.length,4);
 assert.ok(r.checks.every(x=>x.status==='PASS'));
 assert.deepEqual(f.calls.filter(x=>x!=='context'),
 ['frt_bootstrap','frt_board_dashboard_safe','frt_board_list_safe',
  'frt_bootstrap','frt_restricted_request_detail']);
 assert.ok(!f.calls.some(x=>typeof x==='string'&&
   /^(frt_get_request|frt_list_requests|frt_dashboard|frt_request_action)$/.test(x)));
 const safe=sanitizeSEC14SignedRead(r);
 assert.doesNotMatch(safe,/11111111|22222222|33333333|private@|access_token/i);
 assert.equal(JSON.parse(safe).financialWritesVerified,'NOT_VERIFIED');
});
test('signed access denial and stale identity remain BLOCKED, never PASS',async()=>{
 const denied=await runSEC14SignedRead(fixture({denied:true}));
 assert.equal(denied.status,'BLOCKED');
 assert.equal(denied.reason,'FRT_ACCESS_DENIED');
 const stale=await runSEC14SignedRead(fixture({changed:true}));
 assert.equal(stale.status,'BLOCKED');
 const malformed=await runSEC14SignedRead(fixture({hasRequest:true,invalid:true}));
 assert.equal(malformed.status,'FAIL');
});
test('SEC14 export forces read-only fields and omits supplied private payload',()=>{
 const data=JSON.parse(sanitizeSEC14SignedRead({
  status:'PASS',role:'unknown-admin',checks:[{name:'secret@example.org',status:'PASS'}],
  jwt:'private token',requestId:id,writesAttempted:4,financialWritesVerified:'VERIFIED',
  reason:'raw secret company'
 }));
 assert.equal(data.role,'UNVERIFIED');
 assert.equal(data.checks[0].name,'invalid-check');
 assert.equal(data.writesAttempted,0);
 assert.equal(data.financialWritesVerified,'NOT_VERIFIED');
 assert.equal(data.reason,undefined);
 assert.doesNotMatch(JSON.stringify(data),/private token|secret@example|33333333/);
});
test('SEC14 Security panel escapes signed report, offers copy, and disables duplicate run',()=>{
 const rendered=renderSecurityAcceptance({context,sec14Result:{
  status:'BLOCKED',role:'<img src=x>',reason:'SIGNED_READ_UNAVAILABLE',
  checks:[{name:'<svg onload=x>',status:'BLOCKED'}]
 }});
 assert.match(rendered,/security-sec14-readonly/);
 assert.match(rendered,/security-sec14-copy/);
 assert.match(rendered,/&lt;img src=x&gt;/);
 assert.match(rendered,/&lt;svg onload=x&gt;/);
 assert.doesNotMatch(rendered,/<img src=x>|<svg onload=x>/);
 const disabled=renderSecurityAcceptance({context,sec14Busy:true});
 assert.match(disabled,/data-action="security-sec14-readonly" disabled/);
});
test('SEC14 app clears reports on workspace transitions, signout and stale session',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'security-sec14-readonly'/);
 assert.match(app,/case 'security-sec14-copy'/);
 assert.match(app,/state\.sec14Result=null;state\.sec14RunId\+\+;state\.sec14Busy=false;/);
 assert.match(app,/loadFRTFinanceReadOnly\(\{auth,api:db,companyCode,includeExecutive:state\.frtFinanceSection==='executive'\}\)/);
});

test('SEC14 signed acceptance inspects all authorized companies before marking request detail absent',async()=>{
 const f=fixture({hasRequest:true,secondCompany:true,secondOnly:true});
 const report=await runSEC14SignedRead(f);
 assert.equal(report.status,'PASS');
 assert.deepEqual(report.checks.map(x=>x.status),['PASS','PASS','PASS','PASS']);
 assert.equal(f.calls.filter(x=>x==='frt_board_dashboard_safe').length,2);
 assert.equal(f.calls.filter(x=>x==='frt_board_list_safe').length,2);
 assert.equal(f.calls.filter(x=>x==='frt_restricted_request_detail').length,1);
 assert.equal(report.writesAttempted,0);
});
test('SEC14 signed acceptance refuses partial company inspection or no granted company',async()=>{
 const denied=await runSEC14SignedRead(fixture({secondCompany:true,denySecond:true}));
 assert.equal(denied.status,'BLOCKED');
 assert.equal(denied.reason,'RESTRICTED_COMPANY_READ_FAILED');
 const empty=await runSEC14SignedRead(fixture({noCompanies:true}));
 assert.equal(empty.status,'PENDING');
 assert.equal(empty.reason,'NO_AUTHORIZED_FRT_COMPANY');
 assert.deepEqual(empty.checks.map(x=>x.status),['PASS','PENDING','PENDING','PASS']);
});

test('SEC14 rejects a claimed nonempty financial summary with no matching restricted rows',async()=>{
 const result=await runSEC14SignedRead(fixture({summaryMismatch:true}));
 assert.equal(result.status,'FAIL');
 assert.equal(result.reason,'SUMMARY_LIST_INCONSISTENT');
 assert.equal(result.writesAttempted,0);
 assert.equal(result.financialWritesVerified,'NOT_VERIFIED');
});
