import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {initialTradeLinkDraftView,renderTradeLinkDocumentRepository,
 tradeLinkUpdatedDateMatches,updateTradeLinkDraftListUI}
 from '../tradelink-draft-workspace.js';

const workspace='00000000-0000-4000-8000-000000000001';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,
 name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 groups:[],items:[],columns:[]};
const row={documentId:id,boardItemId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 documentNumber:'Q-001',documentType:'quotation',revision:2,workflowState:'draft',
 archived:false,updatedAt:'2026-11-08T22:12:00+08:00'};
const render=(canManage=true)=>renderTradeLinkDocumentRepository({
 detail,workspaceId:workspace,canManage,
 view:{...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[row]}
});

test('reference All Documents uses real signed row fields, compact menu, and no fabricated totals',()=>{
 const html=render();
 assert.match(html,/<h2 id="tl-domain-repository-title">All Documents/);
 assert.match(html,/tl-ref-count-badge">1<\/span>/);
 assert.match(html,/Create New Document/);
 assert.match(html,/href="#\/boards\/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88\/tradelink">Dashboard/);
 assert.match(html,/data-action="tradelink-documents-refresh"/);
 assert.match(html,/data-tradelink-domain-record/);
 assert.match(html,/id="tl-select-visible-documents"/);
 assert.match(html,/data-tl-select-document/);
 assert.match(html,/data-tl-selected-count/);
 assert.match(html,/data-action="tradelink-documents-clear-selection"/);
 assert.match(html,/data-tradelink-action-menu/);
 assert.match(html,/popovertarget="tl-doc-menu-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"/);
 assert.match(html,/data-action="tradelink-document-open"/);
 assert.match(html,/data-action="tradelink-document-print"/);
 assert.match(html,/data-action="tradelink-draft-archive"/);
 assert.match(html,/data-tradelink-document-edit/);
 assert.match(html,/Workflow Status/);
 assert.match(html,/tl-doc-status--draft/);
 assert.match(html,/Nov 08, 2026/);
 assert.match(html,/Quotation/);
 assert.doesNotMatch(html,/₱18,520|Watchdog Automation Sales and Services|Q-011692|100 documents|Auto-sync enabled/);
 assert.doesNotMatch(html,/data-action="tradelink-document-delete"|data-action="tradelink-export-excel"/);
});

test('reference controls use a bounded updatedAt range, not a fabricated document issue date',()=>{
 assert.equal(tradeLinkUpdatedDateMatches(row.updatedAt,'2026-11-08','2026-11-08'),true);
 assert.equal(tradeLinkUpdatedDateMatches(row.updatedAt,'2026-11-09',''),false);
 assert.equal(tradeLinkUpdatedDateMatches(row.updatedAt,'','2026-11-07'),false);
 assert.equal(tradeLinkUpdatedDateMatches('bad','2026-11-08','2026-11-08'),false);
 assert.equal(tradeLinkUpdatedDateMatches('bad','',''),true);
 const html=render();
 for(const preset of ['today','week','month','30','clear'])
  assert.match(html,new RegExp('data-range="'+preset+'"'));
 assert.match(html,/Updated date \(UTC · current page only\)/);
 assert.match(html,/id="tl-doc-updated-start"[^>]+data-tl-updated-start/);
 assert.match(html,/id="tl-doc-updated-end"[^>]+data-tl-updated-end/);
 assert.match(html,/data-action="tradelink-documents-apply-dates"/);
 assert.match(html,/More filters and sorting/);
 assert.match(html,/name="archiveMode"/);
 assert.match(html,/name="sortBy"/);
 const source=readFileSync('frontend/app.js','utf8');
 assert.match(source,/case 'tradelink-documents-apply-dates':/);
 assert.match(source,/state\.tradeLinkDraft\?\.status!=='AUTHORIZED_READ'/);
 assert.doesNotMatch(source.slice(source.indexOf("case 'tradelink-documents-date':"),
  source.indexOf("case 'tradelink-documents-module':")),/localStorage|\.rpc\(/);
});

test('date filter changes only locally loaded, signed record visibility',()=>{
 const fakeRow=(date)=>({hidden:false,dataset:{documentNumber:'Q-001',documentType:'quotation',
  workflowState:'draft',archived:'false',updatedAt:date}});
 const included=fakeRow('2026-11-08T06:00:00Z');
 const excluded=fakeRow('2026-11-06T06:00:00Z');
 const start={value:'2026-11-08'},end={value:'2026-11-09'};
 const count={textContent:''},empty={hidden:true},ordered=[];
 const container={
  querySelectorAll:()=>[included,excluded],
  querySelector(selector){
   if(selector==='[data-tl-updated-start]')return start;
   if(selector==='[data-tl-updated-end]')return end;
   if(selector==='[data-tradelink-domain-count]')return count;
   if(selector==='[data-tradelink-domain-no-match]')return empty;
   if(selector==='[data-tradelink-domain-list-body]')return {appendChild:row=>ordered.push(row)};
   return null;
  }
 };
 assert.equal(updateTradeLinkDraftListUI(container,{}),1);
 assert.equal(included.hidden,false);
 assert.equal(excluded.hidden,true);
 assert.equal(count.textContent,'1 of 2 authorized records in this response');
 assert.equal(ordered.length,2);
});

test('denied users cannot see record actions or use document filters',()=>{
 const html=render(false);
 assert.doesNotMatch(html,/data-tradelink-domain-record|tl-doc-menu-bbbbbbbb/);
 assert.doesNotMatch(html,/Create New Document/);
 assert.match(html,/data-action="tradelink-documents-date"[^>]+disabled/);
});
