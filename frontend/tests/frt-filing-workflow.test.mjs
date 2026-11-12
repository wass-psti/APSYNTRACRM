import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSignedFRTRequest,updateSignedFRTFiling} from '../frt-filing-workflow.js';
const user='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const request='33333333-3333-4333-8333-333333333333';
const data={title:'New signed FRT request',department:'Operations',fundSource:'Company funds',
 description:'For needed company supplies',dateNeeded:'2026-11-20',category:'Supplies',amount:'1200.25'};
function fixture({deny=false,wrongContext=false,wrongCompany=false,
 stale=false,missingReceipt=false,readMismatch=false,
 uncertainCreate=false,readErrorAfterCreate=false}={}){
 const calls=[];let filing='NOT_FILED',created=false;
 const auth={userId:user,async getVerifiedUser(){return{id:user};}};
 const api={async context(){return {user_id:user,workspace_id:wrongContext?request:workspace,
 profile:{status:'active'}};},async rpc(name,args){
  calls.push({name,args});
  if(name==='frt_bootstrap')return {membership:{user_id:user,workspace_id:workspace,
   enabled:true,status:'active',role:'GENERAL_MANAGER'},companies:[{code:wrongCompany?'OTHER':'WASS',name:'WASS'}]};
  if(name==='frt_create_request'){
   if(deny)throw Object.assign(Error('Server denied'),{status:403});
   if(uncertainCreate)throw Object.assign(Error('Network timeout'),{status:503});
   created=true;
   return missingReceipt?{}:{id:request,workspace_id:workspace,requestor_id:user,
    title:data.title,filing_status:'NOT_FILED'};
  }
  if(name==='frt_board_list_safe'){
   if(readErrorAfterCreate)throw Object.assign(Error('Network unavailable'),{status:503});
   return [{id:request,filing_status:readMismatch?'FILED':filing}];
  }
  if(name==='frt_set_request_filing_status'){
   if(deny)throw Object.assign(Error('Server denied'),{status:403});
   if(!stale)filing=args.p_next_status;
   return {ok:true,requestId:request,filingStatus:args.p_next_status};
  }
  throw Error('Unexpected '+name);
 }};
 return {api,auth,calls,get created(){return created;}};
}
const scope=f=>({...f,workspaceId:workspace,companyCode:'WASS',role:'GENERAL_MANAGER'});
test('new request uses existing signed domain create exactly once and verifies Not Filed in list',async()=>{
 const f=fixture();const result=await createSignedFRTRequest({...scope(f),data});
 assert.deepEqual(result,{status:'SAVED',requestId:request,filingStatus:'NOT_FILED'});
 const call=f.calls.find(x=>x.name==='frt_create_request');
 assert.deepEqual(call.args,{p_workspace_id:workspace,p_payload:{
  company:'WASS',title:data.title,department:data.department,
  fundSource:data.fundSource,description:data.description,dateNeeded:data.dateNeeded,
  items:[{category:'Supplies',amount:1200.25}]}});
 assert.equal(f.calls.filter(x=>x.name==='frt_create_request').length,1);
 assert.equal(f.calls.filter(x=>x.name==='frt_board_list_safe').length,1);
});
test('filing toggle calls server atomic compare-and-swap once and verifies readback',async()=>{
 const f=fixture();const result=await updateSignedFRTFiling({...scope(f),requestId:request,
  expectedStatus:'NOT_FILED',nextStatus:'FILED',listedRequestIds:[request]});
 assert.deepEqual(result,{status:'SAVED',filingStatus:'FILED'});
 assert.deepEqual(f.calls.find(x=>x.name==='frt_set_request_filing_status').args,{
  p_workspace_id:workspace,p_request_id:request,p_company:'WASS',
  p_expected_status:'NOT_FILED',p_next_status:'FILED'});
 assert.equal(f.calls.filter(x=>x.name==='frt_board_list_safe').length,2);
});
test('bad form values, missing signed scope or foreign company never call creation RPC',async()=>{
 for(const [options,invalid] of [[{}, {...data,amount:'-1'}],
  [{wrongContext:true},data],[{wrongCompany:true},data],
  [{}, {...data,dateNeeded:'2026-02-30'}],
  [{}, {...data,amount:'1.001'}]]){
  const f=fixture(options);
  await assert.rejects(()=>createSignedFRTRequest({...scope(f),data:invalid}));
  assert.equal(f.calls.filter(x=>x.name==='frt_create_request').length,0);
 }
});
test('denied or uncertain creation never retries the transaction',async()=>{
 for(const options of [{deny:true},{missingReceipt:true}]){
  const f=fixture(options);
  await assert.rejects(()=>createSignedFRTRequest({...scope(f),data}));
  assert.equal(f.calls.filter(x=>x.name==='frt_create_request').length,1);
 }
});
test('ambiguous create and failed post-save readback disable resubmission and never retry',async()=>{
 for(const options of [{uncertainCreate:true},{readErrorAfterCreate:true},{missingReceipt:true}]){
  const f=fixture(options);
  await assert.rejects(()=>createSignedFRTRequest({...scope(f),data}),err=>{
   assert.equal(err.schemaOutcomeUncertain,true);
   return true;
  });
  assert.equal(f.calls.filter(x=>x.name==='frt_create_request').length,1);
 }
});
test('stale, mismatched readback, and denied filing never claim success or retry',async()=>{
 for(const options of [{stale:true},{readMismatch:true},{deny:true}]){
  const f=fixture(options);
  await assert.rejects(()=>updateSignedFRTFiling({...scope(f),requestId:request,
   expectedStatus:'NOT_FILED',nextStatus:'FILED',listedRequestIds:[request]}));
  assert.ok(f.calls.filter(x=>x.name==='frt_set_request_filing_status').length<=1);
 }
});
test('filing mutation requires current signed list, correct company and distinct statuses',async()=>{
 for(const [options,kwargs] of [
  [{},{requestId:request,expectedStatus:'NOT_FILED',nextStatus:'FILED',listedRequestIds:[]}],
  [{wrongContext:true},{requestId:request,expectedStatus:'NOT_FILED',nextStatus:'FILED',listedRequestIds:[request]}],
  [{wrongCompany:true},{requestId:request,expectedStatus:'NOT_FILED',nextStatus:'FILED',listedRequestIds:[request]}],
  [{},{requestId:request,expectedStatus:'FILED',nextStatus:'FILED',listedRequestIds:[request]}]]){
  const f=fixture(options);
  await assert.rejects(()=>updateSignedFRTFiling({...scope(f),...kwargs}));
  assert.equal(f.calls.filter(x=>x.name==='frt_set_request_filing_status').length,0);
 }
});
test('existing Finance UI wires New Request and clickable Filed, never privileged service role',()=>{
 const ui=readFileSync(new URL('../frt-finance-ui.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(ui,/data-action="frt-filing-toggle"/);
 assert.match(ui,/Not Filed/);
 assert.match(app,/case 'frt-filing-toggle':/);
 assert.match(app,/createSignedFRTRequest/);
 assert.match(app,/updateSignedFRTFiling/);
 assert.match(app,/submitLabel:'Submit Fund Request'/);
 assert.doesNotMatch(ui+app,/SUPABASE_SERVICE_ROLE_KEY|supabaseAdminClient/);
});
