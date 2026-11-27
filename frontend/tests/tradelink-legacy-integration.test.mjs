import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {serializeTradeLinkDocumentCsv} from '../tradelink-draft-workspace.js';
import {normalizeTradeLinkAnalyticsSummary,summarizeTradeLinkAnalytics,
 renderTradeLinkAnalytics} from '../tradelink-analytics.js';
import {normalizeTradeLinkSection,renderTradeLinkApplication} from '../tradelink-application.js';
import {TRADELINK_CURRENCIES} from '../tradelink-finance.js';

const summary={
 generatedAt:'2026-11-16T06:00:00.000Z',
 documentCounts:[
  {documentType:'quotation',workflowState:'won',count:2},
  {documentType:'quotation',workflowState:'lost',count:1},
  {documentType:'esi',workflowState:'approved',count:3}
 ],
 quotationPerformance:[
  {workflowState:'won',currency:'PHP',count:2,total:25000},
  {workflowState:'lost',currency:'USD',count:1,total:500}
 ],
 quotationCommercialStatus:[
  {quoteStatus:'Accepted',currency:'PHP',count:1,total:12000},
  {quoteStatus:'Declined',currency:'USD',count:1,total:500}
 ],
 taxSummary:[{currency:'PHP',vatType:'12',invoiceCount:3,
  taxable:10000,vat:1200,total:11200}],
 aging:{available:false,reason:'Aging requires invoice due dates and payment allocations.'}
};
const record={documentNumber:'Q-11131',clientName:'Example Client',
 documentType:'quotation',workflowState:'won',revision:3,
 createdAt:'2026-11-16T04:00:00.000Z',
 updatedAt:'2026-11-16T05:00:00.000Z',archived:false};

test('legacy currencies include every currency named by the supplied workflow',()=>{
 for(const code of ['PHP','USD','EUR','JPY','SAR','SGD','AUD'])
  assert.ok(TRADELINK_CURRENCIES.includes(code),code);
});

test('analytics aggregate normalizer validates bounded aggregate-only rows',()=>{
 const normalized=normalizeTradeLinkAnalyticsSummary(summary);
 assert.deepEqual(normalized.documentCounts,summary.documentCounts);
 assert.deepEqual(summarizeTradeLinkAnalytics(normalized),{
  documents:6,quoteCount:3,won:2,lost:1,winRate:2/3,taxInvoices:3,
  agingAvailable:false
 });
});

test('analytics normalizer rejects invalid types, currencies, amounts and timestamps',()=>{
 assert.throws(()=>normalizeTradeLinkAnalyticsSummary({...summary,generatedAt:'invalid'}));
 assert.throws(()=>normalizeTradeLinkAnalyticsSummary({...summary,documentCounts:[
  {documentType:'other',workflowState:'won',count:1}]}));
 assert.throws(()=>normalizeTradeLinkAnalyticsSummary({...summary,quotationPerformance:[
  {workflowState:'won',currency:'BTC',count:1,total:10}]}));
 assert.throws(()=>normalizeTradeLinkAnalyticsSummary({...summary,taxSummary:[
  {currency:'PHP',vatType:'12',invoiceCount:1,taxable:-1,vat:0,total:0}]}));
});

test('analytics UI shows signed quotation and tax summaries without customer-level data',()=>{
 const html=renderTradeLinkAnalytics({summary,enabled:true});
 assert.match(html,/Analytics &amp; Dashboards/);
 assert.match(html,/Quotation workflow outcomes/);
 assert.match(html,/Quotation commercial status/);
 assert.match(html,/Tax summary/);
 assert.match(html,/Win rate/);
 assert.match(html,/11,200\.00 PHP/);
 assert.match(html,/Accepted/);
 assert.match(html,/Aging requires invoice due dates and payment allocations/);
 assert.doesNotMatch(html,/customerName|customerEmail|Synthetic buyer/);
});


test('new analytics schema separates quotation commercial status and exposes bounded aging aggregates',()=>{
 const current={...summary,quotationCommercialStatus:[
  {quoteStatus:'Sent',currency:'PHP',count:1,total:1200}],
  aging:{available:true,reason:'Cash receipts only; exact reference and currency.',
   buckets:[{currency:'PHP',bucket:'1-30 days',invoiceCount:1,outstanding:808}],
   unallocatedReceipts:[{currency:'USD',count:1,amount:50}],
   excessPayments:[{currency:'PHP',count:1,amount:20}],
   pendingChequeReceipts:[{currency:'PHP',count:1,amount:300}],
   excludedWithoutDueDate:2}};
 const normalized=normalizeTradeLinkAnalyticsSummary(current);
 assert.equal(normalized.aging.available,true);
 assert.equal(normalized.aging.buckets[0].outstanding,808);
 assert.equal(normalized.aging.pendingChequeReceipts[0].amount,300);
 assert.equal(normalized.aging.excessPayments[0].amount,20);
 assert.equal(normalized.aging.excludedWithoutDueDate,2);
 const html=renderTradeLinkAnalytics({summary:current,enabled:true});
 assert.match(html,/Accounts Receivable Aging/);
 assert.match(html,/1-30 days/);
 assert.match(html,/Cheque receipts pending bank clearance/);
 assert.match(html,/Excess cash payments/);
 assert.match(html,/exact reference and currency/);
 assert.throws(()=>normalizeTradeLinkAnalyticsSummary({...current,aging:{...current.aging,
  buckets:[{currency:'PHP',bucket:'31-90 days',invoiceCount:1,outstanding:1}]}}));
});

test('read-only analytics is activated while automatic production numbering remains off',()=>{
 const client=readFileSync('frontend/tradelink-domain-client.js','utf8');
 assert.match(client,/export const TL03_ANALYTICS_ENABLED=true/);
 assert.match(client,/tl03_document_create/);
 assert.match(client,/TL03_AUTOMATIC_NUMBERING_ENABLED=true/);
 const migration=readFileSync('supabase/migrations/20261116070000_cp_tl_legacy_numbering_dates_aging.sql','utf8');
 for(const pattern of [
  /CREATE TABLE private\.tradelink_document_sequences/,
  /FOR UPDATE/,
  /pg_advisory_xact_lock/,
  /candidate numeric/,
  /tradelink_document_number_immutable/,
  /cannot be changed after creation/,
  /private\.tl03_save\(p_board_id,p_document_id,0,'create'/,
  /GRANT EXECUTE[\s\S]*TO authenticated/,
  /CREATE OR REPLACE FUNCTION public\.tl03_analytics_summary/,
  /'quotationCommercialStatus'/,
  /'pendingChequeReceipts'/,
  /'excessPayments'/,
  /'excludedWithoutDueDate'/,
  /d\.workspace_id=public\.current_workspace_id\(auth\.uid\(\)\)/,
  /SECURITY INVOKER/,
  /SET search_path=''/
 ])assert.match(migration,pattern);
 assert.doesNotMatch(migration,/DROP TABLE|DROP POLICY|CREATE ROLE|ALTER ROLE|service_role/);
});

test('analytics UI does not fabricate metrics while the aggregate RPC is inactive',()=>{
 const html=renderTradeLinkAnalytics({enabled:false});
 assert.match(html,/prepared but not activated/);
 assert.doesNotMatch(html,/0\.0%|100\.0%/);
});

test('analytics empty and failure states expose a retry without fabricating metrics',()=>{
 const empty=renderTradeLinkAnalytics({enabled:true});
 assert.match(empty,/No analytics response is currently loaded/);
 assert.match(empty,/data-action=\"tradelink-analytics-refresh\"/);
 const failed=renderTradeLinkAnalytics({enabled:true,error:'Network unavailable'});
 assert.match(failed,/role=\"alert\"/);
 assert.match(failed,/Network unavailable/);
 assert.match(failed,/Retry analytics/);
 assert.doesNotMatch(failed,/0\.0%|100\.0%/);
});

test('TradeLink analytics route is available without changing document routes',()=>{
 assert.equal(normalizeTradeLinkSection('analytics'),'analytics');
 assert.equal(normalizeTradeLinkSection('documents'),'documents');
 assert.equal(normalizeTradeLinkSection('quotation'),'quotation');
 const app=readFileSync('frontend/tradelink-application.js','utf8');
 assert.match(app,/data-tl-tab="analytics"/);
 assert.match(app,/renderTradeLinkAnalytics\(/);
 assert.match(app,/analyticsEnabled=false/);
});

test('selected-document CSV is bounded, quoted and contains metadata only',()=>{
 const csv=serializeTradeLinkDocumentCsv([record]);
 assert.match(csv,/"Document Number","Client Name","Document Type","Created At","Workflow Status","Revision","Last Updated","Archived"/);
 assert.match(csv,/"Q-11131","Example Client","quotation","2026-11-16T04:00:00.000Z","won","3"/);
 assert.ok(csv.endsWith('\r\n'));
 assert.doesNotMatch(csv,/customerName|customerEmail|content|workspace_id/);
 const escaped=serializeTradeLinkDocumentCsv([{...record,documentNumber:'Q,"11131'}]);
 assert.match(escaped,/"Q,""11131"/);
 assert.throws(()=>serializeTradeLinkDocumentCsv(Array.from({length:51},()=>record)),/50/);
 assert.throws(()=>serializeTradeLinkDocumentCsv([{...record,revision:0}]),/invalid/i);
});

test('selected-document CSV covers every source document type with stable metadata columns',()=>{
 const types=['esi','quotation','delivery','packing','payment','po'];
 const records=types.map((documentType,index)=>({...record,
  documentNumber:'TL-CSV-'+documentType.toUpperCase(),documentType,
  workflowState:'draft',revision:index+1,
  updatedAt:'2026-11-17T06:00:00.000Z',archived:false}));
 const csv=serializeTradeLinkDocumentCsv(records);
 const lines=csv.trimEnd().split('\r\n');
 assert.equal(lines.length,types.length+1);
 assert.equal(lines[0],'"Document Number","Client Name","Document Type","Created At","Workflow Status","Revision","Last Updated","Archived"');
 for(const type of types){
  assert.ok(lines.some(line=>line.includes('"'+type+'"')),type);
 }
 assert.doesNotMatch(csv,/customerName|customerEmail|content|workspace_id|lineItems/);
});

test('All Documents wires export only to signed selected records retained across pages',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'tradelink-documents-export-selection'/);
 assert.match(app,/exportTradeLinkDocumentSelection\(/);
 const selection=app.slice(app.indexOf('function updateTradeLinkDocumentSelection('),app.indexOf('function exportTradeLinkDocumentSelection('));
 assert.match(selection,/state\.tradeLinkDraft\.rows\.filter\(row=>pageIds\.has\(row\.documentId\)\)/);
 assert.match(selection,/rows\.filter\(row=>!row\.hidden&&\s*row\.querySelector\('\[data-tl-select-document\]'\)\?\.checked\)/);
 assert.match(selection,/mergeTradeLinkDocumentSelection\(\s*state\.tradeLinkDraft\.selectedDocuments,pageRows,checkedIds,50\)/);
 const exporter=app.slice(app.indexOf('function exportTradeLinkDocumentSelection('),app.indexOf('function captureTradeLinkDraftListFilters('));
 assert.match(exporter,/!state\.boardManage\|\|state\.tradeLinkDraft\?\.status!=='AUTHORIZED_READ'/);
 assert.match(exporter,/Array\.isArray\(state\.tradeLinkDraft\.selectedDocuments\)/);
 assert.match(exporter,/if\(!records\.length\|\|records\.length>50\)return false/);
 assert.match(exporter,/serializeTradeLinkDocumentCsv\(records\)/);
 const workspace=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 assert.match(workspace,/data-action="tradelink-documents-export-selection".*selectedCount&&!busy/);
});

test('analytics requests release stale busy state and retry the current route after overlapping navigation',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const start=app.indexOf('async function loadTradeLinkAnalytics(');
 const end=app.indexOf('async function loadTimeTracker(',start);
 const loader=app.slice(start,end);
 assert.match(app,/tradeLinkAnalyticsRunId:0/);
 assert.match(loader,/const run=\+\+state\.tradeLinkAnalyticsRunId/);
 assert.match(loader,/if\(run===state\.tradeLinkAnalyticsRunId\)/);
 assert.match(loader,/state\.tradeLinkAnalyticsBusy=false/);
 assert.match(loader,/routeStillAnalytics&&seq!==routeSerial/);
 assert.match(loader,/auth\.userId===userId/);
 assert.match(app,/state\.tradeLinkSection!=='analytics'\)\{/);
 assert.match(app,/state\.tradeLinkAnalytics=null;state\.tradeLinkAnalyticsError=''/);
 assert.match(app,/!state\.tradeLinkAnalytics&&!state\.tradeLinkAnalyticsError/);
 const finalBoardLoad=app.slice(app.indexOf("if(tab==='tradelink'&&state.tradeLinkSection==='analytics'&&"),
  app.indexOf("if(tab==='tradelink'&&['drafts','documents']",app.indexOf("if(tab==='tradelink'&&state.tradeLinkSection==='analytics'&&")));
 assert.match(finalBoardLoad,/!state\.tradeLinkAnalyticsBusy/);
 assert.match(finalBoardLoad,/!state\.tradeLinkAnalytics&&!state\.tradeLinkAnalyticsError/);
});

test('analytics RPC remains on the existing signed manager path with no new role or grant layer',()=>{
 const client=readFileSync('frontend/tradelink-domain-client.js','utf8');
 assert.match(client,/export const TL03_ANALYTICS_ENABLED=true/);
 assert.match(client,/if\(!TL03_ANALYTICS_ENABLED\)[\s\S]*?deny\(/);
 const migration=readFileSync('supabase/migrations/20261116062500_cp_tl_legacy_analytics_summary.sql','utf8');
 assert.match(migration,/private\.tl03_can_manage\(p_board_id\)/);
 assert.match(migration,/SECURITY INVOKER/);
 assert.match(migration,/GRANT EXECUTE[\s\S]*TO authenticated/);
 assert.match(migration,/FROM PUBLIC,anon,authenticated/);
 assert.match(migration,/aging cannot be calculated yet/i);
 assert.doesNotMatch(migration,/CREATE ROLE|ALTER ROLE|ENABLE ROW LEVEL SECURITY|CREATE POLICY|DROP POLICY/i);
});

test('TradeLink printable output follows the official A4 template page size',()=>{
 const css=readFileSync('frontend/tradelink-application.css','utf8');
 assert.match(css,/@page\{size:A4/);
 assert.doesNotMatch(css,/@page\{size:Letter/);
 const output=readFileSync('frontend/tradelink-saved-document-output.js','utf8');
 assert.match(output,/Print \/ Save as PDF/);
});

test('cross-page selection retains only signed page rows, removes deselected rows and enforces the 50-record cap',async()=>{
 const {mergeTradeLinkDocumentSelection}=await import('../tradelink-draft-workspace.js');
 const makeRow=n=>({documentId:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),revision:1});
 const first=makeRow(1),second=makeRow(2),foreign=makeRow(3);
 const result=mergeTradeLinkDocumentSelection([first],[second],new Set([second.documentId,foreign.documentId]));
 assert.deepEqual(result.documents,[first,second]);
 assert.deepEqual(mergeTradeLinkDocumentSelection(result.documents,[first],new Set()).documents,[second]);
 const full=Array.from({length:50},(_,i)=>makeRow(i+1));
 const overflow=mergeTradeLinkDocumentSelection(full,[makeRow(51)],new Set([makeRow(51).documentId]));
 assert.equal(overflow.overflow,true);
 assert.deepEqual(overflow.documents,full);
});
