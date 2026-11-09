import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {renderTradeLinkDocumentRepository,initialTradeLinkDraftView}
 from '../tradelink-draft-workspace.js';

const workspace='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,
 name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 groups:[],items:[],columns:[]};

test('authorized All Documents renders seven module filter tabs with selected state',()=>{
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
  listFilters:{query:'',documentType:'quotation',workflowState:'all',archiveMode:'active',
   sortBy:'documentNumber',sortDirection:'asc'}};
 const html=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view,canManage:true});
 assert.match(html,/aria-label="Filter documents by module"/);
 assert.equal((html.match(/data-action="tradelink-documents-module"/g)||[]).length,7);
 assert.match(html,/data-module="quotation" aria-current="true"/);
 assert.match(html,/data-module="esi"/);
 assert.match(html,/data-module="all"/);
 assert.match(html,/data-tradelink-domain-filter/);
});
test('unauthorized list cannot activate module filtering or show document data',()=>{
 const html=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  canManage:false});
 assert.equal((html.match(/data-action="tradelink-documents-module"/g)||[]).length,7);
 assert.equal((html.match(/data-action="tradelink-documents-module"[^>]*disabled/g)||[]).length,7);
 const foreign=renderTradeLinkDocumentRepository({detail,workspaceId:
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',canManage:true});
 assert.doesNotMatch(foreign,/data-action="tradelink-documents-module"/);
});
test('module click uses existing normalized bounded filters and authorized page loading',()=>{
 const source=readFileSync('frontend/app.js','utf8');
 const fragment=source.split("case 'tradelink-documents-module':{")[1]
  ?.split("case 'tradelink-documents-search':{")[0]||'';
 assert.match(fragment,/tradeLinkAuthorizedListRoute/);
 assert.match(fragment,/TL03_DOMAIN_READS_ENABLED/);
 assert.match(fragment,/state\.boardManage/);
 assert.match(fragment,/normalizeTradeLinkDraftListFilters/);
 assert.match(fragment,/button\.dataset\.module/);
 assert.match(fragment,/await loadTradeLinkDrafts\(routeSerial/);
 assert.match(fragment,/cursor:null,history:\[\],pageIndex:0,filters:selected/);
 assert.match(fragment,/render\(\)/);
 assert.doesNotMatch(fragment,/api\.rpc|localStorage|sessionStorage/);
 const css=readFileSync('frontend/tradelink-reference-ui.css','utf8');
 assert.match(css,/\.tl-reference-portal \.tl-reference-document-filter-tabs/);
 assert.match(css,/overflow-x:auto/);
 assert.match(css,/:focus-visible/);
});
