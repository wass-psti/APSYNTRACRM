import test from 'node:test';
import assert from 'node:assert/strict';
import {id,userId,workspaceId} from '../../scripts/fixtures/cp-ms-crm-03-fixture.mjs';
import {compareProcurementQuotes,readProcurement,applyProcurementCommand} from '../apps/MaterialSourcing/procurement-contract.js';
const itemId=id(700),rfqId=id(701),operationId=id(702);
const q={id:id(703),revision:1,quantity:'5',unit_price:'100.25',shipping_total:'10.25',currency:'PHP',shipping_currency:'PHP',tax_basis:'tax_exclusive',issued_on:'2026-11-28',valid_until:'2026-12-31'};
const q2={...q,id:id(704),unit_price:'99.75'};
const options={asOf:'2026-11-28'};
test('exact decimal same-basis quotation totals compare without FX or rounded float arithmetic',()=>{
 assert.deepEqual(compareProcurementQuotes([q,q2],options),{comparable:true,currency:'PHP',taxBasis:'tax_exclusive',totals:[{id:q2.id,quotedTotal:'509.00000000'},{id:q.id,quotedTotal:'511.50000000'}]});
});
test('mixed currencies, shipping bases, tax bases, quantities and expired quotes cannot rank as comparable',()=>{
 for(const change of [{currency:'USD'},{shipping_currency:'EUR'},{tax_basis:'tax_inclusive'},{quantity:'3'},{valid_until:'2026-11-27'},{issued_on:'2026-11-29'}])
  assert.equal(compareProcurementQuotes([q,{...q2,...change}],options).comparable,false);
 assert.equal(compareProcurementQuotes([q],options).comparable,false);
 assert.throws(()=>compareProcurementQuotes([q,{...q2,quantity:'-1'}],options));
});
function fixture(){
 const calls=[];
 const auth={isSignedIn:true,userId,getVerifiedUser:async()=>({id:userId})};
 const row={rfq_id:rfqId,revision:1,command:'create',snapshot:{status:'open',quotes:[],selection:null}};
 const api={context:async()=>({user_id:userId,workspace_id:workspaceId,profile:{status:'active'}}),
  allowed:async()=>true,rpc:async(name,args)=>{
   calls.push([name,args]);
   if(name==='material_request_hub_bootstrap')return {workspaceId,role:'ADMIN'};
   if(name==='mrh_procurement_apply')return {rfq_id:rfqId,operation_id:operationId,revision:1,replayed:false};
   if(name==='mrh_procurement_read')return {item_id:itemId,rows:[row],has_more:false};
   throw Error('unexpected call');
  }};
 return {scope:{api,auth,workspaceId,itemId},calls,row};
}
const command={rfqId,operationId,expectedRevision:0,command:'create',payload:{reference:'RFQ-TEST',issued_on:'2026-11-28',due_on:'2026-12-05'}};
test('candidate signed apply uses reviewed operation ID once and verifies exact historical revision',async()=>{
 const f=fixture(),result=await applyProcurementCommand(f.scope,command);
 assert.equal(result.row.revision,1);
 assert.equal(f.calls.filter(c=>c[0]==='mrh_procurement_apply').length,1);
 assert.equal(f.calls.find(c=>c[0]==='mrh_procurement_apply')[1].p_operation,operationId);
 assert.equal(f.calls.find(c=>c[0]==='mrh_procurement_read')[1].p_before_revision,2);
});
test('failed readback never replays committed mutation',async()=>{
 const f=fixture();f.row.revision=2;
 await assert.rejects(applyProcurementCommand(f.scope,command),/readback unavailable/);
 assert.equal(f.calls.filter(c=>c[0]==='mrh_procurement_apply').length,1);
});
test('invalid selection revision and wrong material page fail closed',async()=>{
 const f=fixture();f.row.snapshot={status:'selected',quotes:[q],selection:{quote_id:q.id,quote_revision:2}};
 await assert.rejects(readProcurement(f.scope),/selected quotation revision/);
});
test('route departure prevents mutation and readback',async()=>{
 const f=fixture();
 await assert.rejects(applyProcurementCommand({...f.scope,isCurrent:()=>false},command),/view changed/);
 assert.equal(f.calls.filter(c=>c[0]==='mrh_procurement_apply').length,0);
});
