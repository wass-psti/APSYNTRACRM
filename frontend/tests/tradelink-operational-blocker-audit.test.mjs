import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileTradeLinkSavedListing} from '../tradelink-draft-workspace.js';

const itemId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const documentId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const record={id:documentId,board_item_id:itemId,revision:2,
 document_number:'Q-2026-001',document_type:'quotation',
 workflow_state:'draft',archived_at:null,updated_at:'2026-11-12T04:00:00Z'};
const receipt={documentId,boardItemId:itemId,revision:2};
const window={status:'AUTHORIZED_READ',rows:Array.from({length:50},(_,i)=>({
 documentId:`cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12,'0')}`,
 boardItemId:`dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12,'0')}`,
 documentNumber:'Q-'+i,documentType:'quotation',workflowState:'draft',
 archived:false,revision:1,updatedAt:'2026-11-11T00:00:00Z'}))};

test('confirmed saved record outside bounded 50-row list appears in All Documents without duplicate writes',()=>{
 const result=reconcileTradeLinkSavedListing(window,record,receipt);
 assert.equal(result.rows.length,50);
 assert.equal(result.rows[0].documentId,documentId);
 assert.equal(result.rows[0].boardItemId,itemId);
 assert.equal(result.rows[0].revision,2);
 assert.equal(result.rows[0].documentNumber,record.document_number);
 assert.equal(window.rows.length,50);
 assert.equal(window.rows.some(row=>row.documentId===documentId),false);
});

test('stale bounded list revision is replaced only with exactly verified signed record',()=>{
 const old={...window.rows[0],documentId,boardItemId:itemId,
  documentNumber:record.document_number,revision:1};
 const result=reconcileTradeLinkSavedListing({...window,rows:[old,...window.rows.slice(1)]},record,receipt);
 assert.equal(result.rows.length,50);
 assert.equal(result.rows.filter(row=>row.documentId===documentId).length,1);
 assert.equal(result.rows[0].revision,2);
});

test('foreign/conflicting summary, missing signed list and forged receipts remain denied',()=>{
 for(const value of [null,{status:'READ_FAILED',rows:[]},
  {status:'AUTHORIZED_READ',rows:null}])
  assert.throws(()=>reconcileTradeLinkSavedListing(value,record,receipt),/reconciliation failed/);
 assert.throws(()=>reconcileTradeLinkSavedListing(window,record,
  {...receipt,boardItemId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}),/reconciliation failed/);
 assert.throws(()=>reconcileTradeLinkSavedListing({status:'AUTHORIZED_READ',rows:[{
  ...window.rows[0],documentId,boardItemId:itemId,documentNumber:'OTHER'}]},record,receipt),/conflicts with saved record/);
 assert.throws(()=>reconcileTradeLinkSavedListing(window,{...record,archived_at:'2026-11-12T04:00:00Z'},receipt),/reconciliation failed/);
});

test('app verifies full saved envelope and Board projection before reconciling bounded list',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const commit=app.indexOf('const receipt=await tradeLinkDraftWorkspace.save(');
 const parity=app.indexOf('!tradeLinkSavedDraftMatches(record,draft)',commit);
 const board=app.indexOf('!board.items?.some(item=>item.id===receipt.boardItemId',parity);
 const reconcile=app.indexOf('const verifiedList=reconcileTradeLinkSavedListing(list,record,receipt)',board);
 const toast=app.indexOf("toast('Document saved. Board item and All Documents verified.')",reconcile);
 assert.ok(commit>=0&&parity>commit&&board>parity&&reconcile>board&&toast>reconcile);
});

test('missing optional server-search RPC is cached only on confirmed missing-function errors',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/let tradeLinkDocumentsPageRpcUnavailable=false/);
 assert.match(app,/if\(!tradeLinkDocumentsPageRpcUnavailable\)/);
 assert.match(app,/if\(err\?\.code!=='PGRST202'&&err\?\.code!=='42883'\)throw err/);
 assert.match(app,/if\(same\(\)\)tradeLinkDocumentsPageRpcUnavailable=true/);
 assert.match(app,/Showing the current signed 50-record response/);
});
