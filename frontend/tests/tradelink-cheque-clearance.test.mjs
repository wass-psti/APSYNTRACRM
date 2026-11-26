import test from 'node:test';
import assert from 'node:assert/strict';
import {TradeLinkDomainClient} from '../tradelink-domain-client.js';
import {renderTradeLinkChequeClearance} from '../tradelink-draft-workspace.js';
const documentId='00000000-0000-4000-8000-000000000003';
const input={documentId,expectedRevision:1};
const stamp='2026-11-26T03:00:00Z';
test('signed client reads and records clearance using revision-bound RPCs',async()=>{
 const calls=[];
 const client=new TradeLinkDomainClient({api:{rpc:async(name,args)=>{
  calls.push({name,args});
  return {documentId,revision:1,clearedAt:name==='tl03_cheque_clearance_status'?null:stamp,idempotent:false};
 }}});
 client.session=async()=>({});
 assert.equal((await client.chequeClearance(input)).clearedAt,null);
 assert.equal((await client.chequeClearance({...input,record:true})).clearedAt,stamp);
 assert.deepEqual(calls.map(x=>x.name),['tl03_cheque_clearance_status','tl03_record_cheque_clearance']);
 assert.equal(calls[0].args.p_expected_revision,1);
});
test('clearance rejects mismatched revision and missing write timestamp',async()=>{
 let reply={documentId,revision:2,clearedAt:stamp};
 const client=new TradeLinkDomainClient({api:{rpc:async()=>reply}});
 client.session=async()=>({});
 await assert.rejects(()=>client.chequeClearance(input));
 reply={documentId,revision:1,clearedAt:null,idempotent:false};
 await assert.rejects(()=>client.chequeClearance({...input,record:true}));
});
test('interface distinguishes unavailable, pending, busy and persisted clearance',()=>{
 const record={id:documentId,revision:1,document_type:'payment',workflow_state:'closed',content:{chequeAmount:20000}};
 assert.doesNotMatch(renderTradeLinkChequeClearance(record,null),/data-action=/);
 const pending={documentId,revision:1,clearedAt:null};
 assert.match(renderTradeLinkChequeClearance(record,pending),/Record Bank Clearance/);
 assert.match(renderTradeLinkChequeClearance(record,pending,true),/disabled/);
 assert.match(renderTradeLinkChequeClearance(record,{...pending,clearedAt:stamp}),/Cleared/);
 assert.doesNotMatch(renderTradeLinkChequeClearance(record,{...pending,revision:2}),/data-action=/);
 assert.equal(renderTradeLinkChequeClearance({...record,workflow_state:'draft'},pending),'');
});
