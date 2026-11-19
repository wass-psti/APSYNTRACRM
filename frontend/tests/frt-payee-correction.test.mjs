import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadFRTPayeeCorrection,saveFRTPayeeCorrection,validFRTPayee} from '../frt-payee-correction.js';
import {renderFRTFinanceReadOnly} from '../frt-finance-ui.js';
const actor='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333';
const voucher='DV-WASS-202611-001';
function fixture({role='GENERAL_MANAGER',stale=false,denied=false,invalidReceipt=false,
 postMismatch=false,approved=false,notListed=false,initialPayee='None'}={}){
 let payee=initialPayee;const calls=[];let checks=0;
 const auth={userId:actor,async getVerifiedUser(){checks++;return {id:stale&&checks>2?'44444444-4444-4444-8444-444444444444':actor};}};
 const api={async context(){return {user_id:actor,workspace_id:ws,profile:{status:'active'}};},
  async rpc(name,args){calls.push({name,args});
   if(name==='frt_bootstrap')return {membership:{user_id:actor,workspace_id:ws,enabled:true,status:'active',role},companies:[{code:'WASS'}]};
   if(name==='frt_restricted_request_detail')return {id,workspace_id:ws,company_code:'WASS',archived_at:null,
    voucher_no:voucher,status:'PENDING_APPROVAL',finance_approved_at:approved?'2026-11-19T00:00:00Z':null,
    transfer_confirmed_at:null,liquidation_status:'NOT_SUBMITTED',voucher:{payee:payee}};
   if(name==='frt_correct_request_payee_cas'){
    if(denied)throw Object.assign(Error('Denied'),{status:403});
    if(!postMismatch)payee=args.p_next_payee;
    return invalidReceipt?{}:{ok:true,requestId:id,voucherNumber:voucher,payee:args.p_next_payee};
   }
   throw Error('Unexpected '+name);
  }};
 return {auth,api,calls,requestId:id,workspaceId:ws,companyCode:'WASS',role,expectedVoucher:voucher,
  listedRequestIds:notListed?[]:[id]};
}
test('real payee required; placeholder and ambiguous values rejected',()=>{
 for(const x of ['', ' ', 'None','N/A','unknown','not recorded','X', 'Y'.repeat(181)])assert.equal(validFRTPayee(x),false);
 for(const x of ['ABC Supplier','Ma. Elizabeth L. Cataytay'])assert.equal(validFRTPayee(x),true);
});
test('signed payee correction calls only narrow CAS once and re-reads persisted result',async()=>{
 const f=fixture();const snapshot=await loadFRTPayeeCorrection(f);
 const output=await saveFRTPayeeCorrection({...f,snapshot,nextPayee:'  ABC Supplier  '});
 assert.deepEqual(output,{status:'SAVED',payee:'ABC Supplier',voucherNumber:voucher});
 const mutations=f.calls.filter(x=>x.name==='frt_correct_request_payee_cas');
 assert.equal(mutations.length,1);
 assert.deepEqual(mutations[0].args,{p_workspace_id:ws,p_request_id:id,p_expected_payee:'None',p_next_payee:'ABC Supplier'});
 assert.doesNotMatch(JSON.stringify(f.calls),/frt_update_request\b|frt_request_action\b|service_role|accounting_lines|p_payload/);
});
test('unchanged payee is a no-write outcome',async()=>{
 const f=fixture({initialPayee:'ABC Supplier'});const snapshot=await loadFRTPayeeCorrection(f);
 assert.equal((await saveFRTPayeeCorrection({...f,snapshot,nextPayee:'ABC Supplier'})).status,'UNCHANGED');
 assert.equal(f.calls.some(x=>x.name==='frt_correct_request_payee_cas'),false);
});
test('not-listed, wrong role, and approved request block before mutation',async()=>{
 for(const opts of [{notListed:true},{role:'REQUESTOR'},{approved:true}]){
  const f=fixture(opts);
  await assert.rejects(()=>loadFRTPayeeCorrection(f));
  assert.equal(f.calls.some(x=>x.name==='frt_correct_request_payee_cas'),false);
 }
});
test('invalid input, expired session, denied write and uncertain response do not retry',async()=>{
 for(const opts of [{stale:true},{denied:true},{invalidReceipt:true},{postMismatch:true}]){
  const f=fixture(opts);const snapshot=await loadFRTPayeeCorrection(f);
  await assert.rejects(()=>saveFRTPayeeCorrection({...f,snapshot,nextPayee:'ABC Supplier'}));
  assert.ok(f.calls.filter(x=>x.name==='frt_correct_request_payee_cas').length<=1);
 }
 const f=fixture();const snapshot=await loadFRTPayeeCorrection(f);
 await assert.rejects(()=>saveFRTPayeeCorrection({...f,snapshot,nextPayee:'unknown'}));
 assert.equal(f.calls.some(x=>x.name==='frt_correct_request_payee_cas'),false);
});
test('UI exposes payee-only correction for finance roles and pending request',()=>{
 const result={status:'PASS',role:'GENERAL_MANAGER',companyCode:'WASS',companies:[{code:'WASS',name:'WASS'}],
  summary:{total_requests:1,pending:1},requests:[{requestId:id,voucher,title:'Original',status:'PENDING_APPROVAL',dateNeeded:'2026-11-20'}]};
 assert.match(renderFRTFinanceReadOnly({result}),/data-action="frt-payee-correct"/);
 assert.doesNotMatch(renderFRTFinanceReadOnly({result:{...result,role:'REQUESTOR'}}),/data-action="frt-payee-correct"/);
 const disabled=renderFRTFinanceReadOnly({result:{...result,requests:[{...result.requests[0],status:'DONE'}]}});
 assert.match(disabled,/data-action="frt-payee-correct"[^>]*disabled/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'frt-payee-correct'/);
 assert.match(app,/fundTracker\.savePayeeCorrection/);
});
test('migration isolates single payee field with CAS, audit and existing finance roles only',()=>{
 const sql=readFileSync(new URL('../../supabase/migrations/20261119090447_cp_frt_flow03l_payee_correction_activation.sql',import.meta.url),'utf8');
 assert.match(sql,/r\.recipient_name IS NOT DISTINCT FROM p_expected_payee/);
 assert.match(sql,/status='PENDING_APPROVAL'/);
 assert.match(sql,/REQUEST_PAYEE_CORRECTED/);
 assert.match(sql,/frt_request_accounting_lines/);
 assert.doesNotMatch(sql,/UPDATE\s+public\.frt_voucher_counters|INSERT\s+INTO\s+public\.frt_requests/i);
 assert.match(sql,/FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER/);
});
