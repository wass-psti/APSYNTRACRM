import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {normalizeTradeLinkSection,renderTradeLinkApplication} from '../tradelink-application.js';
import {TL03_DOMAIN_READS_ENABLED,TL03_DOMAIN_WRITES_ENABLED} from '../tradelink-domain-client.js';
import {
 TL03_DRAFT_INTERFACE_ENABLED,initialTradeLinkDraftView,parseTradeLinkDraftForm,
 renderTradeLinkDraftWorkspace,TradeLinkDraftWorkspace,tradeLinkDraftReady
} from '../tradelink-draft-workspace.js';
const workspace='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,
 name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 groups:[],items:[],columns:[]};
const fields=data=>({get:key=>data[key]??null});

test('dark-launch UI is routed inside the existing signed TradeLink app',()=>{
 assert.equal(TL03_DRAFT_INTERFACE_ENABLED,true);
 assert.equal(normalizeTradeLinkSection('drafts'),'drafts');
 const html=renderTradeLinkApplication({detail,workspaceId:workspace,section:'drafts',
  draftView:initialTradeLinkDraftView(),canManage:true});
 assert.match(html,/href="#\/boards\/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88\/tradelink\/drafts"/);
 assert.match(html,/Controlled dark launch/);
 assert.match(html,/data-tradelink-draft-form/);
 assert.match(html,/data-action="tradelink-draft-preview"/);
 assert.match(html,/data-action="tradelink-draft-refresh" disabled/);
 assert.match(html,/type="submit" class="primary" disabled/);
 assert.doesNotMatch(html,/data-action="tradelink-draft-archive"[^>]*>Archive/);
 assert.equal(TL03_DOMAIN_READS_ENABLED,false);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,false);
 assert.equal(tradeLinkDraftReady(),false);
});

test('foreign workspace or an unrelated board renders no usable editor',()=>{
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
 assert.match(html,/Signed TradeLink workspace unavailable/);
 assert.doesNotMatch(html,/data-tradelink-draft-form/);
 const wrong={...detail,board:{...detail.board,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}};
 assert.doesNotMatch(renderTradeLinkDraftWorkspace({detail:wrong,workspaceId:workspace}),/data-tradelink-draft-form/);
});

test('client never contacts auth, boards or RPC while both production flags are disabled',async()=>{
 let calls=0;
 const client=new TradeLinkDraftWorkspace({
  auth:{getVerifiedUser:async()=>{calls++;throw Error('unexpected auth');}},
  api:{rpc:async()=>{calls++;throw Error('unexpected API');}}
 });
 assert.deepEqual(await client.list(),{status:'DARK_LAUNCH',rows:[]});
 await assert.rejects(()=>client.read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),/dark launch/i);
 await assert.rejects(()=>client.save({draft:{documentType:'quotation',documentNumber:'Q-001'}}),/dark launch/i);
 await assert.rejects(()=>client.changeState({
  documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',revision:1,operation:'archive'
 }),/dark launch/i);
 assert.equal(calls,0);
});

test('form parser accepts only bounded source Draft fields and never asserts persistence',()=>{
 const draft=parseTradeLinkDraftForm(fields({documentType:'quotation',documentNumber:'Q-100',
  currency:'PHP',vatType:'12',customerName:'Sample customer',referenceNumber:'REF-7',
  lineDescription:'Sample item',lineQuantity:'2',lineUnitPrice:'150.25',lineUnit:'pc',
  remarks:'Local only'}),{lineId:()=> 'line-001'});
 assert.deepEqual(draft.items,[{id:'line-001',kind:'item',description:'Sample item',
  quantity:2,unitPrice:150.25,unit:'pc'}]);
 assert.equal(draft.documentType,'quotation');
 assert.equal(draft.documentNumber,'Q-100');
 assert.equal(draft.remarks,'Local only');
 assert.equal('status' in draft,false);
 for(const row of [
  {documentType:'unknown',documentNumber:'Q-100'},
  {documentType:'quotation',documentNumber:'<svg onload=alert(1)>'},
  {documentType:'quotation',documentNumber:'Q-100',lineDescription:'One',lineQuantity:'-1',lineUnitPrice:'1'},
  {documentType:'quotation',documentNumber:'Q-100',lineDescription:'One',lineQuantity:'1'},
  {documentType:'quotation',documentNumber:'Q-100',currency:'NOT-CURRENCY'}
 ])assert.throws(()=>parseTradeLinkDraftForm(fields(row)));
});

test('dark launch never renders stale selected document content after read access is disabled',()=>{
 const malicious='"><img src=x onerror=alert(1)>';
 const view={...initialTradeLinkDraftView(),mode:'edit',
  selected:{documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   record:{workflow_state:'draft',revision:2,content:{
    documentType:'quotation',documentNumber:'Q-100',customerName:malicious}}}};
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view,canManage:true});
 assert.doesNotMatch(html,/<img src=x/);
 assert.doesNotMatch(html,/onerror=alert/);
 assert.match(html,/Prepare a Draft/);
 assert.match(html,/type="submit" class="primary" disabled/);
 assert.doesNotMatch(html,/saved successfully/i);
});

test('unsaved local input survives UI redraw but stale signed edit content is redacted',()=>{
 const staged={...initialTradeLinkDraftView(),formValues:{
  documentType:'quotation',documentNumber:'Q-LOCAL-42',customerName:'Customer & Partner',
  remarks:'Only in memory'}};
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view:staged,canManage:true});
 assert.match(html,/value="Q-LOCAL-42"/);
 assert.match(html,/Customer &amp; Partner/);
 assert.match(html,/Only in memory/);
 const revoked={...staged,mode:'edit',selected:{documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  record:{workflow_state:'draft',revision:2,content:{documentType:'quotation',
    documentNumber:'Q-SECRET',customerName:'Restricted record'}}},
  formValues:{...staged.formValues,customerName:'Restricted record'}};
 const denied=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view:revoked,canManage:false});
 assert.doesNotMatch(denied,/Restricted record|Q-SECRET/);
 assert.match(denied,/type="submit" class="primary" disabled/);
});

test('app integration is session-cleared and route-scoped, with no new credentials or storage',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const source=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 assert.match(app,/tradeLinkDraftRoute\(\)/);
 assert.match(app,/loadTradeLinkDrafts\(seq\)/);
 assert.match(app,/parseTradeLinkDraftForm\(new FormData\(form\)\)/);
 assert.match(app,/case 'tradelink-draft-preview'/);
 assert.match(app,/case 'tradelink-draft-archive'/);
 assert.match(app,/\!tradeLinkDraftReady\(\)/);
 assert.match(app,/state\.tradeLinkDraft=initialTradeLinkDraftView\(\)/);
 assert.match(app,/captureTradeLinkDraftFields\(event\)/);
 assert.match(app,/state\.context\?\.user_id===auth\.userId/);
 assert.match(app,/event\.target\.matches\('\[data-tradelink-draft-form\]'\)/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|service_role|sb_secret|fetch\(/);
 assert.doesNotMatch(source,/\b(?:indexedDB|setItem|document\.cookie)\b/);
});
