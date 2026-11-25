import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {renderTradeLinkDocumentRepository,initialTradeLinkDraftView} from '../tradelink-draft-workspace.js';
import {renderTradeLinkActivity} from '../tradelink-activity.js';
import {renderTradeLinkAnalytics} from '../tradelink-analytics.js';
import {renderTradeLinkApplication} from '../tradelink-application.js';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';

const workspaceId='00000000-0000-4000-8000-000000000001';
const documentId='17fb2227-a0b0-4ff0-9e58-105640d719a7';
const boardItemId='8dea0a2f-e8f2-4a16-aacd-fe370bfd7f10';
const detail={
 board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',
  status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 groups:[],columns:[],items:[]
};
const listed={
 documentId,boardItemId,documentNumber:'Q-2026-001',
 clientName:'Example Industrial Supply',documentType:'quotation',
 workflowState:'approved',revision:2,archived:false,hidden:false,
 createdAt:'2026-11-24T01:00:00Z',updatedAt:'2026-11-25T02:00:00Z',
 createdByActor:true,assignedStage:null,primaryAt:null,secondaryAt:null
};
const analytics={
 generatedAt:'2026-11-25T03:00:00Z',
 documentCounts:[
  {documentType:'quotation',workflowState:'approved',count:2},
  {documentType:'esi',workflowState:'approved',count:1}
 ],
 quotationPerformance:[
  {workflowState:'won',currency:'PHP',count:1,total:5000},
  {workflowState:'lost',currency:'USD',count:1,total:2000}
 ],
 quotationCommercialStatus:[
  {quoteStatus:'Sent',currency:'PHP',count:1,total:5000}
 ],
 taxSummary:[
  {currency:'PHP',vatType:'12',invoiceCount:1,taxable:1000,vat:120,total:1120}
 ],
 aging:{
  available:true,reason:'Aging is calculated from approved ESI invoices and matched cash receipts.',
  buckets:[{currency:'PHP',bucket:'Current',invoiceCount:1,outstanding:1000}],
  unallocatedReceipts:[],excessPayments:[],pendingChequeReceipts:[],
  excludedWithoutDueDate:0
 }
};

test('All Documents receives the light-mode screen identity and retains existing repository actions',()=>{
 const view={
  ...initialTradeLinkDraftView(),
  status:'AUTHORIZED_READ',
  rows:[listed],
  selectedDocumentIds:[documentId],
  listFilters:{query:'',documentType:'all',workflowState:'all',archiveMode:'active',
   visibilityMode:'visible',sortBy:'createdAt',sortDirection:'desc'}
 };
 const html=renderTradeLinkDocumentRepository({
  detail,workspaceId,view,canManage:true,canCreate:true
 });
 assert.match(html,/data-tl-screen="documents"/);
 for(const action of [
  'tradelink-documents-refresh','tradelink-documents-export-selection',
  'tradelink-documents-delete-selection','tradelink-documents-hide-selection',
  'tradelink-documents-unhide-selection','tradelink-documents-clear-selection'
 ])assert.ok(html.includes(action),action);
 assert.match(html,/data-tradelink-domain-filter/);
 assert.match(html,/More filters and sorting/);
 assert.match(html,/Q-2026-001/);
 assert.match(html,/Example Industrial Supply/);
 assert.match(html,/class="tl-ref-client-name" title="Example Industrial Supply"/);
 assert.match(html,/class="tl-ref-cell-truncate"/);
});

test('Activity timeline preserves event order, timestamps, actors, escaping and the existing refresh action',()=>{
 const html=renderTradeLinkActivity({events:[
  {id:9,event_type:'document.saved',message:'Revision saved',actor_name:'Operations User',
   created_at:'2026-11-25T03:00:00Z'},
  {id:8,event_type:'document.approved',message:'<script>alert(1)</script>',
   actor_name:'Reviewer',created_at:'2026-11-24T03:00:00Z'}
 ]});
 assert.match(html,/data-tl-screen="activity"/);
 assert.match(html,/tl-activity-timeline/);
 assert.match(html,/tl-activity-card/);
 assert.match(html,/document\.saved/);
 assert.match(html,/document\.approved/);
 assert.ok(html.indexOf('document.saved')<html.indexOf('document.approved'));
 assert.match(html,/datetime="2026-11-25T03:00:00Z"/);
 assert.match(html,/Recorded by Operations User/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/data-action="tradelink-activity-refresh"/);
 assert.match(html,/Latest 2 authorized application events/);
});

test('Activity loading, empty and error states remain explicit and accessible',()=>{
 const loading=renderTradeLinkActivity({busy:true,events:[]});
 assert.match(loading,/tl-activity-loading/);
 assert.match(loading,/role="status"/);
 assert.match(loading,/tradelink-activity-refresh" disabled/);
 const empty=renderTradeLinkActivity({events:[]});
 assert.match(empty,/tl-activity-empty/);
 const error=renderTradeLinkActivity({error:'Service unavailable',events:[]});
 assert.match(error,/tl-activity-error/);
 assert.match(error,/role="alert"/);
});

test('Analytics keeps signed aggregate figures, currency-separated values and financial tables',()=>{
 const html=renderTradeLinkAnalytics({summary:analytics,enabled:true});
 assert.match(html,/data-tl-screen="analytics"/);
 assert.match(html,/aria-label="Key performance indicators"/);
 for(const key of ['documents','quotations','won','lost','win-rate','tax-invoices'])
  assert.ok(html.includes('data-tl-kpi="'+key+'"'),key);
 assert.match(html,/PHP/);
 assert.match(html,/USD/);
 assert.match(html,/Accounts Receivable Aging/);
 assert.match(html,/Quotation commercial status/);
 assert.match(html,/Quotation workflow by currency/);
 assert.match(html,/Tax summary/);
 assert.equal((html.match(/tl-analytics-table-section tl-analytics-card/g)||[]).length,3);
 assert.match(html,/class="numeric"/);
 assert.match(html,/datetime="2026-11-25T03:00:00Z"/);
 assert.match(html,/data-action="tradelink-analytics-refresh"/);
 assert.doesNotMatch(html,/Combined currency total|FX conversion/);
});

test('Analytics empty, loading and failure states remain truthful',()=>{
 const loading=renderTradeLinkAnalytics({busy:true,enabled:true});
 assert.match(loading,/tl-analytics-loading/);
 assert.match(loading,/role="status"/);
 const failure=renderTradeLinkAnalytics({error:'RPC unavailable',enabled:true});
 assert.match(failure,/tl-analytics-error/);
 assert.match(failure,/role="alert"/);
 const unavailable=renderTradeLinkAnalytics({enabled:false});
 assert.match(unavailable,/prepared but not activated/);
 assert.doesNotMatch(unavailable,/data-tl-kpi=/);
});

test('All three screens use the same scoped light-mode refresh stylesheet and responsive breakpoints',()=>{
 const css=readFileSync('frontend/tradelink-ui-refresh.css','utf8');
 const manifest=readFileSync('scripts/priority5-style-manifest.mjs','utf8');
 assert.ok(STYLE_SOURCES.includes('frontend/tradelink-ui-refresh.css'));
 assert.equal(STYLE_BUNDLE,'frontend/apsyntra-styles.bundle.css');
 assert.ok(
  STYLE_SOURCES.indexOf('frontend/tradelink-ui-refresh.css')>
  STYLE_SOURCES.indexOf('frontend/tradelink-reference-ui.css')
 );
 assert.ok(
  STYLE_SOURCES.indexOf('frontend/tradelink-ui-refresh.css')<
  STYLE_SOURCES.indexOf('frontend/select-experience.css')
 );
 for(const selector of [
  '.tl-document-repository','.tl-reference-document-filter-tabs',
  '.tl-ref-cell-truncate','.tl-ref-client-name','.tl-ref-workflow-status',
  '.tl-reference-document-datebar','.tl-ref-selection-controls',
  '.tl-activity-timeline','.tl-activity-card','.tl-analytics-kpis',
  '.tl-analytics-card','.tl-analytics-table'
 ])assert.ok(css.includes(selector),selector);
 assert.ok(css.includes('container-type:inline-size'));
 assert.ok(css.includes('container-name:tradelink-analytics'));
 assert.ok(css.includes('@container tradelink-analytics (max-width:900px)'));
 assert.ok(css.includes('@container tradelink-analytics (max-width:560px)'));
 for(const key of ['documents','quotations','won','lost','win-rate','tax-invoices'])
  assert.ok(css.includes('data-tl-kpi="'+key+'"'),key);
 assert.ok(css.includes('min-width:620px'));
 assert.ok(css.includes('tl-analytics-aging>p:last-child'));
 assert.ok(css.includes('data-tl-section="documents"'));
 assert.ok(css.includes('@media(max-width:1000px)'));
 assert.ok(css.includes('@media(max-width:850px)'));
 assert.ok(css.includes('@media(max-width:620px)'));
 assert.ok(css.includes('color-scheme:light'));
 assert.ok(css.includes('prefers-reduced-motion:reduce'));
 assert.ok(css.includes('min-width:1328px'));
 assert.ok(css.includes('table-layout:fixed'));
 assert.ok(css.includes('position:sticky'));
 assert.ok(css.includes('grid-template-columns:max-content minmax(0,1fr) max-content minmax(0,1fr)'));
 assert.doesNotMatch(css,/data-aps-monday-theme|crm-native-|dark-mode/i);
 assert.match(manifest,/frontend\/tradelink-ui-refresh\.css/);
});

test('Activity and Analytics remain in their existing TradeLink routes and signed application shell',()=>{
 const activity=renderTradeLinkApplication({
  detail,workspaceId,section:'activity',activity:{events:[]}
 });
 const reports=renderTradeLinkApplication({
  detail,workspaceId,section:'analytics',analytics,analyticsEnabled:true
 });
 assert.match(activity,/data-tl-section="activity"/);
 assert.match(reports,/data-tl-section="analytics"/);
 assert.match(activity,/data-tl-tab="activity"[^>]*aria-current="page"/);
 assert.match(reports,/data-tl-tab="analytics"[^>]*aria-current="page"/);
 assert.match(activity,/tl-activity-timeline/);
 assert.match(reports,/tl-analytics-kpis/);
});
