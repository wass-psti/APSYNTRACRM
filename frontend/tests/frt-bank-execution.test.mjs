import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {describeFRTBankExecution,loadFRTBankExecution,recordFRTBankExecution} from '../frt-bank-execution.js';
const ws='22222222-2222-4222-8222-222222222222',req='33333333-3333-4333-8333-333333333333',actor='11111111-1111-4111-8111-111111111111';
function setup({role='FINANCE_MANAGER',foreign=false}={}){
 let current={workspaceId:ws,requestId:req,eligible:true,recorded:false,executedAt:null,deadlineAt:null,source:'NO_BANK_EXECUTION'};
 let writes=0;
 const auth={userId:actor,async getVerifiedUser(){return {id:actor}}};
 const api={async context(){return {user_id:actor,workspace_id:ws,profile:{status:'active'}}},async rpc(name,args){
  if(name==='frt_bootstrap')return {membership:{user_id:actor,workspace_id:ws,status:'active',enabled:true,role}};
  if(name==='frt_bank_execution_snapshot')return foreign?{...current,workspaceId:actor}:current;
  if(name==='frt_record_bank_execution'){
   writes++;
   current={...current,recorded:true,source:'STAFF_RECORDED_BANK_EVIDENCE',
    executedAt:args.p_payload.executedAt,bankName:args.p_payload.bankName,
    transactionReference:args.p_payload.transactionReference,
    deadlineAt:new Date(Date.parse(args.p_payload.executedAt)+3*86400000).toISOString()};
   return {ok:true,executedAt:current.executedAt,deadlineAt:current.deadlineAt};
  }
  throw Error(name);
 }};
 return {auth,api,workspaceId:ws,requestId:req,allowedRequestIds:[req],get writes(){return writes}};
}
test('deadline absent until a separate bank execution exists',async()=>{
 const f=setup(),s=await loadFRTBankExecution(f);
 assert.equal(s.deadlineAt,null);
 assert.match(describeFRTBankExecution(s),/unavailable/);
});
test('finance bank entry confirms readback and deadline from executed time',async()=>{
 const f=setup(),snapshot=await loadFRTBankExecution(f);
 const record=await recordFRTBankExecution({...f,snapshot,bankName:'Bank X',
  transactionReference:'TX-001',executedAt:'2026-11-13T09:00:00Z'});
 assert.equal(record.deadlineAt,'2026-11-16T09:00:00.000Z');
 assert.equal(f.writes,1);
 assert.equal(describeFRTBankExecution(record,Date.parse('2026-11-16T10:00:00Z')),'Liquidation overdue');
});
test('requestor and foreign workspace denied without writes',async()=>{
 const f=setup({role:'REQUESTOR'}),snapshot=await loadFRTBankExecution(f);
 await assert.rejects(()=>recordFRTBankExecution({...f,snapshot,bankName:'Bank',
  transactionReference:'TX',executedAt:'2026-11-13T09:00:00Z'}),/Finance role/);
 assert.equal(f.writes,0);
 await assert.rejects(()=>loadFRTBankExecution(setup({foreign:true})),/contract/);
});
test('migration contains authenticated-only signed and audited bank event, not GM transfer inference',()=>{
 const file=readdirSync(new URL('../../supabase/migrations/',import.meta.url)).find(x=>x.includes('frt_wf03_authoritative_bank_execution.sql'));
 const sql=readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8');
 for(const v of ['frt_bank_executions','frt_record_bank_execution','frt_bank_execution_snapshot','BANK_EXECUTION_RECORDED','private.frt_current_role',"interval '3 days'",'ENABLE ROW LEVEL SECURITY','FOR UPDATE'])
  assert.ok(sql.includes(v),v);
 assert.doesNotMatch(sql,/ALTER TABLE public\.frt_requests/);
});
