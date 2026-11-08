import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {
 TL03_DOMAIN_READS_ENABLED,TL03_DOMAIN_WRITES_ENABLED,TradeLinkDomainClient,
 validateTradeLinkDraftEnvelope,normalizeTradeLinkDomainReceipt,
 normalizeTradeLinkDomainRow
} from '../tradelink-domain-client.js';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const item='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const workspace='00000000-0000-4000-8000-000000000001';
const draft={documentType:'quotation',documentNumber:'Q-000001',
 currency:'PHP',vatType:'12',items:[{
  id:'line-1',kind:'item',description:'Source item',quantity:1,unit:'pc',unitPrice:100
 }]};
test('document contract matches the six source types and denies mutable server fields',()=>{
 for(const type of ['esi','packing','delivery','payment','quotation','po'])
  assert.equal(validateTradeLinkDraftEnvelope({...draft,documentType:type}).documentType,type);
 for(const bad of [{...draft,documentType:'new'},
  {...draft,documentNumber:'<script>'},
  {...draft,workflow:{state:'approved'}},
  {...draft,status:'Approved'},
  {...draft,approvedAt:'2026-11-05'},
  {...draft,role:'system-admin'},
  {...draft,items:Array.from({length:101},()=>({}))}])
  assert.throws(()=>validateTradeLinkDraftEnvelope(bad));
});
test('server revision and item-link receipts are mandatory',()=>{
 const receipt={documentId:id,boardItemId:item,revision:1,state:'draft',
  operation:'create',idempotent:false};
 assert.deepEqual(normalizeTradeLinkDomainReceipt(receipt,id,'create'),receipt);
 assert.equal(normalizeTradeLinkDomainReceipt({...receipt,idempotent:true},id,'create').idempotent,true);
 for(const wrong of [{...receipt,boardItemId:'bad'},
  {...receipt,documentId:workspace},{...receipt,revision:0},
  {...receipt,operation:'update'},{...receipt,state:'approved'}])
  assert.throws(()=>normalizeTradeLinkDomainReceipt(wrong,id,'create'));
});
test('foreign workspace, board or unknown document states fail closed',()=>{
 const row={id,board_id:TRADELINK_BOARD_ID,workspace_id:workspace,
  board_item_id:item,document_type:'quotation',workflow_state:'draft',
  revision:1,content:draft};
 assert.equal(normalizeTradeLinkDomainRow(row,workspace,id),row);
 for(const changed of [{...row,workspace_id:id},
  {...row,board_id:id},{...row,revision:-1},
  {...row,workflow_state:'for-approval'},{...row,content:[]}])
  assert.throws(()=>normalizeTradeLinkDomainRow(changed,workspace,id));
});
test('read and write operations require a complete signed authorization client',async()=>{
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
 let invoked=0;
 const client=new TradeLinkDomainClient({
  auth:{getVerifiedUser:async()=>{invoked++;throw Error('Unexpected signed access');}},
  api:{rpc:async()=>{invoked++;throw Error('Unexpected network call');}}
 });
 await assert.rejects(()=>client.list(),/Signed TradeLink domain API unavailable/);
 await assert.rejects(()=>client.read(id),/Signed TradeLink domain API unavailable/);
 await assert.rejects(()=>client.commit({documentId:id,expectedRevision:0,
  operation:'create',draft}),/Signed TradeLink domain API unavailable/);
 assert.equal(invoked,0);
});
test('no source local-first fallback, duplicated auth or privileged client credentials',()=>{
 const source=readFileSync('frontend/tradelink-domain-client.js','utf8');
 assert.match(source,/getVerifiedUser/);
 assert.match(source,/TRADELINK_BOARD_ID/);
 assert.match(source,/await this\.api\.allowed\(TRADELINK_BOARD_ID,'manage'\)/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|service_role|sb_secret|fetch\(/);
});


test('CAS receipts must advance by exactly one; only revision-one identical create may be idempotent',()=>{
 const first={documentId:id,boardItemId:item,revision:1,state:'draft',
  operation:'create',idempotent:false};
 assert.equal(normalizeTradeLinkDomainReceipt(first,id,'create',0).revision,1);
 assert.equal(normalizeTradeLinkDomainReceipt({...first,idempotent:true},id,'create',0).revision,1);
 for(const invalid of [
  [{...first,revision:3},'create',0],
  [{...first,idempotent:true,revision:2},'create',0],
  [{...first,idempotent:true,operation:'update'},'update',1],
  [{...first,operation:'update',revision:4},'update',1],
  [{...first,operation:'archive',revision:2},'archive',9]
 ])assert.throws(()=>normalizeTradeLinkDomainReceipt(invalid[0],id,invalid[1],invalid[2]),/mismatch/);
 assert.throws(()=>validateTradeLinkDraftEnvelope({...draft,documentNumber:'Q-000001 '}),/Invalid/);
});
