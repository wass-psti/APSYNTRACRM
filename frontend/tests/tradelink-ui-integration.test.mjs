import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderTradeLinkApplication,TRADELINK_SOURCE_MODULES,
 normalizeTradeLinkSection} from '../tradelink-ui.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';

const workspace='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,
 name:'TradeLink',status:'active',
 description:'[APSYNTRA:MODULE:tradelink:v1] Source-aligned commerce'},
 items:[],columns:[],groups:[]};

test('native UI entrypoint exposes all six source-defined TradeLink document modules',()=>{
 assert.deepEqual(TRADELINK_SOURCE_MODULES.map(row=>row.key),
  ['esi','packing','delivery','payment','quotation','po']);
 for(const module of TRADELINK_SOURCE_MODULES){
  const html=renderTradeLinkApplication({detail,workspaceId:workspace,
   section:module.key,canManage:true});
  assert.match(html,/class="aps-tradelink-app tl-reference-portal"/);
  assert.ok(html.includes(module.label));
 }
});

test('native renderer preserves Create New, All Documents, Activity, Analytics and User Manual navigation',()=>{
 const html=renderTradeLinkApplication({detail,workspaceId:workspace,
  section:'drafts',canManage:true});
 for(const tab of ['create','documents','activity','analytics','manual'])
  assert.match(html,new RegExp('data-tl-tab="'+tab+'"'));
 assert.match(html,/data-tradelink-draft-form/);
 assert.equal(normalizeTradeLinkSection('overview'),'drafts');
});

test('reviewer presentation remains an assigned-document view and does not grant Create New',()=>{
 const html=renderTradeLinkApplication({detail,workspaceId:workspace,
  section:'documents',canManage:false,canReview:true});
 assert.match(html,/data-tl-tab="create"[^>]*aria-disabled="true"/);
 assert.match(html,/All Documents/);
 assert.doesNotMatch(html,/My Assigned Documents/);
 assert.doesNotMatch(html,/data-tradelink-draft-form/);
});

test('TradeLink route, sidebar module, host state and delegated data-action events reuse the existing CRM lifecycle',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const manifest=readFileSync('frontend/board/services/manifest.js','utf8');
 assert.match(app,/from '\.\/tradelink-ui\.js\?v=cp-tl-universal-edit-01k-20261126-01'/);
 assert.match(app,/from '\.\/tradelink-native\.js\?v=cp-tl-universal-edit-01k-20261126-01'/);
 assert.match(app,/if\(parts\[0\]==='tradelink'\)/);
 assert.match(app,/parseTradeLinkApplicationRoute\(parts\)/);
 assert.match(app,/tradeLinkDraft:initialTradeLinkDraftView\(\)/);
 assert.match(app,/root\.addEventListener\('click',event=>/);
 assert.match(app,/root\.addEventListener\('submit',event=>/);
 assert.match(app,/case 'tradelink-draft-submit'/);
 assert.match(manifest,/"key": "tradelink"/);
 assert.match(manifest,/"name": "TradeLink"/);
});

test('existing scoped TradeLink CSS remains in the generated shared stylesheet bundle',()=>{
 assert.ok(STYLE_SOURCES.includes('frontend/tradelink-application.css'));
 assert.equal(STYLE_BUNDLE,'frontend/apsyntra-styles.bundle.css');
 const html=readFileSync('index.html','utf8');
 assert.match(html,/frontend\/apsyntra-styles\.bundle\.css/);
 const css=readFileSync('frontend/tradelink-application.css','utf8');
 assert.match(css,/\.aps-tradelink-app/);
 const pagesSmoke=readFileSync('scripts/pages-smoke.mjs','utf8');
 for(const asset of ['frontend/tradelink-native.js','frontend/tradelink-ui.js',
  'frontend/tradelink-domain-client.js'])assert.ok(pagesSmoke.includes("'"+asset+"'"));
});
