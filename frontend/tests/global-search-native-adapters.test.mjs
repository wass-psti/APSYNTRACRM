import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotReader,createNativeSearchAdapter,normalizeNativeSearchResult} from '../global-search-adapters.js';
import {searchFRTRequestsReadOnly} from '../frt-finance-readonly.js';

const user='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const companies=[{code:'PSTI',name:'Process Solutions'},{code:'WASS',name:'Watchdog'}];

test('FRT native search uses bounded company-scoped safe reads and never the legacy list RPC',async()=>{
 const calls=[];
 const auth={userId:user,async getVerifiedUser(){return {id:user};}};
 const api={
  async context(){return {user_id:user,workspace_id:workspace,profile:{status:'active'}};},
  async rpc(name,args){
   calls.push({name,args});
   if(name==='frt_bootstrap')return {membership:{user_id:user,workspace_id:workspace,
    enabled:true,status:'active',role:'GENERAL_MANAGER'},companies};
   if(name==='frt_board_list_safe')return [{
    id:name==='frt_board_list_safe'?(args.p_company==='PSTI'?'33333333-3333-4333-8333-333333333333':'44444444-4444-4444-8444-444444444444'):'',
    workspace_id:workspace,company_code:args.p_company,voucher_no:'FRT-'+args.p_company,
    title:'Pump station funding',status:'PENDING_APPROVAL',date_needed:'2026-11-20',
    filing_status:'NOT_FILED',total_amount:999999,requestor:'Not returned'
   }];
   throw new Error('Unexpected RPC '+name);
  }
 };
 const rows=await searchFRTRequestsReadOnly({auth,api,query:'pump station',limit:2});
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(row=>row.companyCode),['PSTI','WASS']);
 assert.ok(rows.every(row=>!('total_amount' in row)&&!('requestor' in row)));
 assert.deepEqual(calls.map(call=>call.name),[
  'frt_bootstrap','frt_board_list_safe','frt_board_list_safe'
 ]);
 assert.ok(calls.slice(1).every(call=>call.args.p_search==='pump station'));
 assert.ok(!calls.some(call=>call.name==='frt_list_requests'));
});

test('FRT native search returns immediately for short queries without touching APIs',async()=>{
 let calls=0;
 const result=await searchFRTRequestsReadOnly({auth:{},api:{rpc(){calls++;}},query:'x'});
 assert.deepEqual(result,[]);
 assert.equal(calls,0);
});

test('snapshot reader shares in-flight reads and reuses only the matching signed scope',async()=>{
 let reads=0;
 const reader=createSnapshotReader(async()=>({sequence:++reads}),{ttlMs:10000,maxEntries:2});
 const scope={userId:user,workspaceId:workspace,boardId:'board-a'};
 const [first,second]=await Promise.all([reader(scope),reader(scope)]);
 assert.equal(reads,1);
 assert.equal(first.sequence,1);
 assert.equal(second.sequence,1);
 assert.equal((await reader(scope)).sequence,1);
 assert.equal((await reader({...scope,boardId:'board-b'})).sequence,2);
});

test('native adapter preserves application identity and bounded navigation metadata',()=>{
 const adapter=createNativeSearchAdapter({
  id:'frt-requests',applicationId:'frt',name:'Fund Release Tracker',
  recordType:'Funding request',read:async()=>[],getId:row=>row.id,
  getTitle:row=>row.title,getNavigationScope:row=>row.companyCode,
  getHref:()=> '#/boards/finance'
 });
 const result=normalizeNativeSearchResult(adapter,{
  id:'request-1',title:'Pump station funding',companyCode:'PSTI'
 },'pump station');
 assert.equal(result.applicationId,'frt');
 assert.equal(result.navigationScope,'PSTI');
 assert.equal(result.query,'pump station');
 assert.equal(result.href,'#/boards/finance');
});
