import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validFRTDate,updateFRTRequestDate} from '../frt-board-date-edit.js';
import {renderFRTFinanceReadOnly} from '../frt-finance-ui.js';
const user='11111111-1111-4111-8111-111111111111',
 ws='22222222-2222-4222-8222-222222222222',
 id='33333333-3333-4333-8333-333333333333';
const fixture=({role='FINANCE_MANAGER',stale=false,denied=false,emptyReceipt=false,
 deniedMembership=false,wrongCompany=false,postMismatch=false}={})=>{
 const calls=[];let currentDate='2026-11-12',checks=0;
 const auth={userId:user,async getVerifiedUser(){checks++;return {
  id:stale&&checks>1?'44444444-4444-4444-8444-444444444444':user};}};
 const api={async context(){calls.push('context');return {user_id:user,workspace_id:ws,profile:{status:'active'}};},
  async rpc(name,args){calls.push({name,args});
   if(name==='frt_bootstrap')return {membership:{enabled:!deniedMembership,status:'active',
    user_id:user,workspace_id:ws,role},companies:[{code:'PSTI'}]};
   if(name==='frt_restricted_request_detail')return {id,workspace_id:ws,
    company_code:wrongCompany?'WASS':'PSTI',archived_at:null,date_needed:currentDate};
   if(name==='frt_update_request'){
    if(denied)throw Object.assign(Error('Denied'),{status:403});
    if(!postMismatch)currentDate=args.p_payload.dateNeeded;
    return emptyReceipt?{}:{ok:true};
   }
   throw Error('unexpected RPC '+name);
  }};
 return {auth,api,calls};
};
const run=fixture=>updateFRTRequestDate({...fixture,requestId:id,workspaceId:ws,
 companyCode:'PSTI',expectedRole:'FINANCE_MANAGER',expectedDate:'2026-11-12',
 nextDate:'2026-11-15',listedRequestIds:[id]});
test('strict valid calendar days with leap year handling',()=>{
 for(const d of ['2026-11-12','2024-02-29','2026-01-31'])assert.equal(validFRTDate(d),true);
 for(const d of ['2026-02-29','2026-13-01','2026-11-31','2026-00-01','2026-01-00','wrong',null])
  assert.equal(validFRTDate(d),false,String(d));
});
test('signed FRT date edit uses existing domain RPC, one field only, then independently verifies persistence',async()=>{
 const f=fixture();const result=await run(f);
 assert.deepEqual(result,{status:'SAVED',dateNeeded:'2026-11-15'});
 assert.deepEqual(f.calls.filter(x=>typeof x==='object').map(x=>x.name),[
  'frt_bootstrap','frt_restricted_request_detail','frt_update_request','frt_restricted_request_detail']);
 assert.deepEqual(f.calls.find(x=>x.name==='frt_update_request').args,{
  p_workspace_id:ws,p_request_id:id,p_payload:{dateNeeded:'2026-11-15'}});
 assert.doesNotMatch(JSON.stringify(f.calls),/service_role|amount|recipientBank|frt_request_action/);
});
test('no-op date change invokes no mutation',async()=>{
 const f=fixture();const result=await updateFRTRequestDate({...f,requestId:id,workspaceId:ws,
  companyCode:'PSTI',expectedRole:'FINANCE_MANAGER',expectedDate:'2026-11-12',
  nextDate:'2026-11-12',listedRequestIds:[id]});
 assert.equal(result.status,'UNCHANGED');
 assert.equal(f.calls.some(x=>x.name==='frt_update_request'),false);
});
test('an existing request without a date can receive one without inventing a previous value',async()=>{
 const f=fixture();const read=f.api.rpc.bind(f.api);
 f.api.rpc=async(name,args)=>{
  const value=await read(name,args);
  if(name==='frt_restricted_request_detail'&&!f.calls.some(x=>x.name==='frt_update_request'))
   return {...value,date_needed:null};
  return value;
 };
 const result=await updateFRTRequestDate({...f,requestId:id,workspaceId:ws,
  companyCode:'PSTI',expectedRole:'FINANCE_MANAGER',expectedDate:null,
  nextDate:'2026-11-15',listedRequestIds:[id]});
 assert.equal(result.status,'SAVED');
});
test('unlisted request, invalid date and unauthorized role are blocked before RPC',async()=>{
 for(const opts of [{listedRequestIds:[]},{nextDate:'2026-02-30'},{expectedRole:'REQUESTOR'}]){
  const f=fixture();await assert.rejects(()=>updateFRTRequestDate({...f,
   requestId:id,workspaceId:ws,companyCode:'PSTI',expectedRole:'FINANCE_MANAGER',
   expectedDate:'2026-11-12',nextDate:'2026-11-15',listedRequestIds:[id],...opts}));
  assert.equal(f.calls.filter(x=>typeof x==='object').length,0);
 }
});
test('expired/changed signed identity, company and member disallow writes',async()=>{
 for(const options of [{stale:true},{deniedMembership:true},{wrongCompany:true}]){
  const f=fixture(options);await assert.rejects(()=>run(f));
  assert.equal(f.calls.some(x=>x.name==='frt_update_request'),false);
 }
});
test('server denied, uncertain receipt, and post-write mismatch never claim success or retry',async()=>{
 for(const options of [{denied:true},{emptyReceipt:true},{postMismatch:true}]){
  const f=fixture(options);await assert.rejects(()=>run(f));
  assert.equal(f.calls.filter(x=>x.name==='frt_update_request').length,1);
 }
});
test('finance status filter is functional for signed rows; date edit appears only for existing domain editor roles',()=>{
 const result={status:'PASS',role:'FINANCE_MANAGER',companyCode:'PSTI',
  companies:[{code:'PSTI',name:'PSTI'}],summary:{total_requests:2,pending:1,
   in_progress:0,completed:1,pending_liquidation_count:0},requests:[
   {requestId:id,voucher:'A',title:'First',status:'PENDING_APPROVAL',dateNeeded:'2026-11-12'},
   {requestId:'55555555-5555-4555-8555-555555555555',voucher:'B',title:'Second',status:'DONE',dateNeeded:'2026-11-13'}]};
 const html=renderFRTFinanceReadOnly({result,statusFilter:'PENDING_APPROVAL'});
 assert.match(html,/id="frt-status-filter"/);
 assert.match(html,/data-action="frt-date-edit"/);
 assert.match(html,/First/);assert.doesNotMatch(html,/>Second</);
 const viewer=renderFRTFinanceReadOnly({result:{...result,role:'REQUESTOR'}});
 assert.doesNotMatch(viewer,/data-action="frt-date-edit"/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/Open signed FRT requests and date editing/);
 assert.match(app,/case 'frt-date-edit'/);
 assert.match(app,/await updateFRTRequestDate\(/);
 assert.match(app,/await loadFRTFinance\(companyCode\)/);
});
