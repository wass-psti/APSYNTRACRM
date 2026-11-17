import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 TradeLinkNativeClient,TradeLinkDomainClient,
 TL03_DOMAIN_READS_ENABLED,TL03_DOMAIN_WRITES_ENABLED,
 TL03_ANALYTICS_ENABLED,TL03_AUTOMATIC_NUMBERING_ENABLED,
 TL03_WORKFLOW_SUBMIT_ENABLED,TL03_WORKFLOW_REVIEW_ENABLED,
 TL03_WORKFLOW_DECISION_ENABLED,TL03_WORKFLOW_OPERATIONAL_ENABLED,
 TL03_DUAL_REVIEW_ENABLED,TL03_PDF_STAGE_ENABLED,
 validateTradeLinkDraftEnvelope,normalizeTradeLinkDomainRow
} from '../tradelink-native.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const workspace='00000000-0000-4000-8000-000000000001';

test('native entrypoint is the existing canonical TradeLink domain client, not a duplicate API implementation',()=>{
 assert.equal(TradeLinkNativeClient,TradeLinkDomainClient);
 assert.equal(typeof TradeLinkNativeClient.prototype.session,'function');
 assert.equal(typeof TradeLinkNativeClient.prototype.list,'function');
 assert.equal(typeof TradeLinkNativeClient.prototype.searchPage,'function');
 assert.equal(typeof TradeLinkNativeClient.prototype.read,'function');
 assert.equal(typeof TradeLinkNativeClient.prototype.revisionBundle,'function');
 assert.equal(typeof TradeLinkNativeClient.prototype.commit,'function');
 assert.equal(typeof TradeLinkNativeClient.prototype.recordReviewStage,'function');
 assert.equal(TRADELINK_BOARD_ID,'264ca40d-6e4a-4e4f-97e6-3bd77c97cd88');
});

test('native adapter preserves existing TradeLink capability gates without silently activating staged workflows',()=>{
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
 assert.equal(TL03_ANALYTICS_ENABLED,true);
 assert.equal(TL03_DUAL_REVIEW_ENABLED,true);
 assert.equal(TL03_AUTOMATIC_NUMBERING_ENABLED,true);
 assert.equal(TL03_WORKFLOW_SUBMIT_ENABLED,true);
 assert.equal(TL03_WORKFLOW_REVIEW_ENABLED,false);
 assert.equal(TL03_WORKFLOW_DECISION_ENABLED,false);
 assert.equal(TL03_WORKFLOW_OPERATIONAL_ENABLED,false);
 assert.equal(TL03_PDF_STAGE_ENABLED,false);
});

test('native domain projections continue validating source document types and signed workspace identity',()=>{
 const base={documentType:'quotation',documentNumber:'Q-000001',
  currency:'PHP',vatType:'12',items:[{id:'line-1',kind:'item',
   description:'Source item',quantity:1,unit:'pc',unitPrice:100}]};
 for(const type of ['esi','packing','delivery','payment','quotation','po'])
  assert.equal(validateTradeLinkDraftEnvelope({...base,documentType:type}).documentType,type);
 const row={id,board_id:TRADELINK_BOARD_ID,workspace_id:workspace,
  board_item_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  document_type:'quotation',workflow_state:'draft',revision:1,content:base};
 assert.equal(normalizeTradeLinkDomainRow(row,workspace,id),row);
 assert.throws(()=>normalizeTradeLinkDomainRow({...row,workspace_id:id},workspace,id));
});

test('TradeLink Draft orchestration now consumes the native adapter entrypoint while keeping one host-owned workspace controller',()=>{
 const source=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 assert.match(source,/TradeLinkNativeClient/);
 assert.match(source,/new TradeLinkNativeClient\(/);
 assert.doesNotMatch(source,/new TradeLinkDomainClient\(/);
});
