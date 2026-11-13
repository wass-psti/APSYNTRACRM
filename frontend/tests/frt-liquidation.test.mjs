import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateFRTReceipts,loadFRTLiquidation,submitFRTLiquidation} from '../frt-liquidation.js';
import {renderFRTLiquidationForm} from '../frt-liquidation-ui.js';
const actor='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const requestId='33333333-3333-4333-8333-333333333333';
const submissionKey='44444444-4444-4444-8444-444444444444';
const items=[
 {description:'Travel expenses',receiptDate:'2026-11-12',amount:'18.25',orInvoiceNo:'OR-1'},
 {description:'Materials',receiptDate:'2026-11-13',amount:'31.75',orInvoiceNo:'INV-2'}
];
const snapshot={workspaceId:ws,requestId,eligible:true,revision:null,
 requestedAmount:'100.00',spentAmount:'0.00',remainingAmount:'100.00',reconciliationState:'NOT_SUBMITTED',items:[]};
function fixture({foreign=false,denied=false,stale=false,readOnly=false}={}){
 const calls=[];let stored=snapshot,revisionCount=0,receiptKey='';
 const auth={userId:actor,async getVerifiedUser(){return {id:actor};}};
 const api={async context(){return {user_id:actor,workspace_id:ws,profile:{status:'active'}};},
 async rpc(name,args){calls.push(name);
  if(name==='frt_bootstrap')return {membership:{user_id:actor,workspace_id:ws,
   status:'active',enabled:true,role:'REQUESTOR'}};
  if(name==='frt_liquidation_snapshot')return foreign?{...stored,workspaceId:actor}:stored;
  if(name==='frt_submit_liquidation_v2'){
   if(denied)throw Object.assign(new Error('Forbidden'),{status:403});
   if(stale)throw Object.assign(new Error('Stale'),{code:'40001'});
   if(readOnly)throw Error('Uncertain');
   if(receiptKey!==args.p_payload.submissionKey){
    revisionCount++;receiptKey=args.p_payload.submissionKey;
    stored={...stored,revision:'2026-11-13 12:00:00+00',items:args.p_payload.items,
     spentAmount:'50.00',remainingAmount:'50.00',reconciliationState:'UNLIQUIDATED',liquidationStatus:'SUBMITTED'};
   }
   return {ok:true,revision:stored.revision,spentAmount:stored.spentAmount,
    remainingAmount:stored.remainingAmount,replayed:revisionCount!==1};
  }
  throw Error('Unexpected RPC '+name);
 }};
 return {auth,api,calls,get mutations(){return calls.filter(x=>x==='frt_submit_liquidation_v2').length;}};
}
test('multiple receipts reconcile decimal cents without floating point loss',()=>{
 assert.deepEqual(validateFRTReceipts(items),{
  items:[{description:'Travel expenses',vendor:'',orInvoiceNo:'OR-1',receiptDate:'2026-11-12',amount:'18.25'},
   {description:'Materials',vendor:'',orInvoiceNo:'INV-2',receiptDate:'2026-11-13',amount:'31.75'}],
  total:'50.00'});
});
test('invalid dates, amounts, references, and zero receipts are rejected',()=>{
 for(const invalid of [[],[{...items[0],amount:'0'}],
  [{...items[0],amount:'-1'}],[{...items[0],amount:'1.234'}],
  [{...items[0],receiptDate:'2026-02-30'}],
  [{...items[0],description:' '}], [{...items[0],orInvoiceNo:'x'.repeat(151)}]])
  assert.throws(()=>validateFRTReceipts(invalid));
});
test('signed read, two-item persistence, verified readback and exact retry',async()=>{
 const f=fixture();
 const data=await loadFRTLiquidation({...f,workspaceId:ws,requestId,allowedRequestIds:[requestId]});
 const params={...f,workspaceId:ws,requestId,allowedRequestIds:[requestId],
  snapshot:data,items,submissionKey};
 const result=await submitFRTLiquidation(params);
 assert.equal(result.items.length,2);
 assert.equal(result.remainingAmount,'50.00');
 const replay=await submitFRTLiquidation(params);
 assert.equal(replay.revision,result.revision);
 assert.equal(f.mutations,2);
});
test('foreign workspace response, unlisted request, signed denial, and stale revision never succeed',async()=>{
 const f=fixture({foreign:true});
 await assert.rejects(()=>loadFRTLiquidation({...f,workspaceId:ws,requestId,allowedRequestIds:[requestId]}),/contract/i);
 const p={...fixture({denied:true}),workspaceId:ws,requestId,allowedRequestIds:[requestId],
  snapshot,items,submissionKey};
 await assert.rejects(()=>submitFRTLiquidation(p));
 const s={...fixture({stale:true}),workspaceId:ws,requestId,allowedRequestIds:[requestId],
  snapshot,items,submissionKey};
 await assert.rejects(()=>submitFRTLiquidation(s),/changed/i);
 const missing=fixture();
 await assert.rejects(()=>loadFRTLiquidation({...missing,workspaceId:ws,requestId,allowedRequestIds:[]}));
 assert.equal(missing.calls.length,0);
});
test('HTML escapes receipt purpose and does not invent banking release',()=>{
 const html=renderFRTLiquidationForm({...snapshot,items:[{...items[0],description:'<img src=x>'}]});
 assert.doesNotMatch(html,/<img src=x>/);
 assert.match(html,/&lt;img src=x&gt;/);
 assert.doesNotMatch(html,/Bank transferred|Released amount/i);
});
test('migration enforces transaction, row lock, exact replay, revision and signed policy without legacy revocation',()=>{
 const sql=readFileSync(new URL('../../supabase/migrations/20261113170000_frt_wf02_signed_liquidation.sql',import.meta.url),'utf8');
 for(const required of ['BEGIN;','COMMIT;','FOR UPDATE','submission_key=v_key',
  "errcode='40001'",'private.frt_current_role','LIQUIDATION_SUBMITTED',
  'frt_liquidation_snapshot','frt_submit_liquidation_v2'])
  assert.ok(sql.includes(required),required);
 assert.doesNotMatch(sql,/REVOKE EXECUTE ON FUNCTION public\.frt_submit_liquidation\(/);
});
