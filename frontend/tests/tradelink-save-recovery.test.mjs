import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ApiError} from '../session.js';
import {initialTradeLinkDraftView,tradeLinkDraftSaveFailureMessage,reconcileTradeLinkSavedListing,tradeLinkSaveDefinitelyRejected} from '../tradelink-draft-workspace.js';
import {tradeLinkSavedDraftMatches} from '../tradelink-domain-client.js';

import {TradeLinkRecoveryController} from '../tradelink/draft-recovery-controller.js';
import {captureRecoveryFields} from '../tradelink/draft-recovery-state.js';
const source=readFileSync('frontend/app.js','utf8');
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const item='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ws='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const draft={documentType:'quotation',documentNumber:'',customerName:'Disposable customer'};
const receipt={documentId:id,boardItemId:item,revision:1,documentNumber:'Q-011130',state:'for-approval',operation:'create',idempotent:false};
const record={id,board_item_id:item,document_type:'quotation',document_number:receipt.documentNumber,revision:1,workflow_state:'for-approval',archived_at:null,created_at:'2026-11-24T00:00:00Z',updated_at:'2026-11-24T00:00:00Z',content:{...draft,documentNumber:receipt.documentNumber}};
function harness(enabled=false){
 const state={context:{workspace_id:ws},tradeLinkDraft:initialTradeLinkDraftView()};
 const calls={save:[],read:0,list:0,board:0};
 const failures={save:null,read:null,list:null,board:null,storage:false,lost:false};
 const stored=new Map(),committed=new Map();
 const instanceId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 const identity={userId:id,workspaceId:ws,documentType:'quotation',instanceId};
 const store={async save(snapshot){if(failures.storage)throw Error('storage unavailable');stored.set(snapshot.key,structuredClone(snapshot));},async remove(user,workspace,type,instance,version){const key=[user,workspace,type,instance].join(':');if(stored.get(key)?.version!==version)return false;stored.delete(key);return true;}};
 const controller=new TradeLinkRecoveryController({store});
 const api={
  async save(command){calls.save.push(structuredClone(command));if(enabled){assert.ok([...stored.values()][0]?.pendingSave,'durable checkpoint before mutation');}
   if(failures.save)throw failures.save;
   if(committed.has(command.documentId))assert.deepEqual(committed.get(command.documentId),command);
   else committed.set(command.documentId,structuredClone(command));
   if(failures.lost)throw new ApiError('lost response',0,'REQUEST_TIMEOUT');
   return receipt;},
  async read(){calls.read++;if(failures.read)throw failures.read;return record;},
  async list(){calls.list++;if(failures.list)throw failures.list;return {status:'AUTHORIZED_READ',rows:[]};},
  async boardProjection(){calls.board++;if(failures.board)throw failures.board;return {board:{workspace_id:ws},items:[{id:item,title:receipt.documentNumber}]};}
 };
 const location={hash:''};
 const code=source.slice(source.indexOf('async function commitTradeLinkDraft(form)'),source.indexOf('/** Advisory readiness preview;'));
 const deps={tradeLinkRecoveryEnabled:enabled,tradeLinkRecoveryEditor:enabled?{id:instanceId}:null,tradeLinkRecovery:controller,captureRecoveryFields,captureTradeLinkRecovery:(fields,lines)=>controller.capture(identity,fields,lines),state,routeSerial:1,auth:{userId:id},tradeLinkDraftRoute:()=>true,tradeLinkDraftReady:()=>true,tradeLinkCanCreate:()=>true,FormData:class{constructor(form){return form;}},prepareTradeLinkDraftCommand:()=>({documentId:id,expectedRevision:0,draft,pendingCreateDraft:draft}),snapshotTradeLinkDraftLineItems:()=>[],render:()=>{},ApiError,tradeLinkDraftWorkspace:api,tradeLinkSavedDraftMatches,reconcileTradeLinkSavedListing,initialTradeLinkDraftView,tradeLinkDraftSaveFailureMessage,tradeLinkSaveDefinitelyRejected,toast:()=>{},location,tradeLinkApplicationHref:()=> '#/tradelink/documents'};
 const run=new Function(...Object.keys(deps),code+';return commitTradeLinkDraft;')(...Object.values(deps));
 const form=new Map([['documentStatus','for-approval'],['documentType','quotation'],['customerName','Disposable customer']]);
 return {state,calls,failures,location,run:()=>run(form),form,stored,committed,controller};
}
test('definitive reviewer rejection releases pending create state',async()=>{
 const h=harness();h.failures.save=new ApiError('Two different assigned TradeLink reviewers are required',400,'22023');
 await h.run();assert.equal(h.state.tradeLinkDraft.pendingCreateId,null);assert.match(h.state.tradeLinkDraft.error,/two different/i);
});
test('confirmed mutation followed by failed listing retries verification without resaving',async()=>{
 const h=harness();h.failures.list=new ApiError('timeout',0,'REQUEST_TIMEOUT');await h.run();
 assert.match(h.state.tradeLinkDraft.error,/Document saved/);h.failures.list=null;await h.run();
 assert.equal(h.calls.save.length,1);assert.equal(h.location.hash,'#/tradelink/documents');
});
test('unknown response preserves original status even when form status changes',async()=>{
 const h=harness();h.failures.save=new ApiError('timeout',0,'REQUEST_TIMEOUT');await h.run();
 h.form.set('documentStatus','draft');h.failures.save=null;await h.run();
 assert.equal(h.calls.save[1]?.initialState,'for-approval');assert.equal(h.calls.save[1]?.documentId,id);
});

test('durable checkpoint failure sends zero mutation requests; retry preserves identity',async()=>{
 const h=harness(true);h.failures.storage=true;await h.run();assert.equal(h.calls.save.length,0);assert.match(h.state.tradeLinkDraft.error,/No new save request/);
 h.failures.storage=false;await h.run();assert.equal(h.calls.save.length,1);assert.equal(h.stored.size,0);
});
test('lost response after simulated commit replays exact command without second document',async()=>{
 const h=harness(true);h.failures.lost=true;await h.run();
 assert.equal(h.committed.size,1);assert.equal([...h.stored.values()][0].pendingSave.command.documentId,id);
 h.failures.lost=false;await h.run();assert.equal(h.committed.size,1);assert.deepEqual(h.calls.save[0],h.calls.save[1]);assert.equal(h.stored.size,0);
});
test('durable receipt survives failed readback; retry performs no mutation',async()=>{
 const h=harness(true);h.failures.list=new ApiError('timeout',0,'REQUEST_TIMEOUT');await h.run();
 assert.deepEqual([...h.stored.values()][0].pendingSave.receipt,receipt);
 h.failures.list=null;await h.run();assert.equal(h.calls.save.length,1);assert.equal(h.stored.size,0);
});
test('definitive rejection preserves raw inputs and removes pending command',async()=>{
 const h=harness(true);h.failures.save=new ApiError('Two different assigned TradeLink reviewers are required',400,'22023');await h.run();
 assert.equal(h.state.tradeLinkDraft.pendingSave,null);assert.equal([...h.stored.values()][0].pendingSave,undefined);assert.equal([...h.stored.values()][0].fields.customerName,'Disposable customer');
});
