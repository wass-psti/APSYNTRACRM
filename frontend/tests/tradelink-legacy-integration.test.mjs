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
 taxSummary:[{currency:'PHP',vatType:'12',invoiceCount:3,
  taxable:10000,vat:1200,total:11200}],
 aging:{available:false,reason:'Aging requires invoice due dates and payment allocations.'}
};
const record={documentNumber:'Q-11131',documentType:'quotation',
 workflowState:'won',revision:3,updatedAt:'2026-11-16T05:00:00.000Z',archived:false};

test('legacy currencies include every currency named by the supplied workflow',()=>{
 for(const code of ['PHP','USD','EUR','JPY','SAR','SGD','AUD'])
  assert.ok(TRADELINK_CURRENCIES.includes(code),code);
});

test('analytics aggregate normalizer validates bounded aggregate-only rows',()=>{
 const normalized=normalizeTradeLinkAnalyticsSummary(summary);
 assert.deepEqual(normalized.documentCounts,summary.documentCounts);
 assert.deepEqual(summarizeTradeLinkAnalytics(normalized),{
  documents:6,quoteCount:3,won:2,lost:1,winRate:2/3,taxInvoices:3
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
 assert.match(html,/Quotation outcomes/);
 assert.match(html,/Tax summary/);
 assert.match(html,/Win rate/);
 assert.match(html,/11,200\.00 PHP/);
 assert.match(html,/Aging requires invoice due dates and payment allocations/);
 assert.doesNotMatch(html,/customerName|customerEmail|Synthetic buyer/);
});

test('analytics UI does not fabricate metrics while the aggregate RPC is inactive',()=>{
 const html=renderTradeLinkAnalytics({enabled:false});
 assert.match(html,/prepared but not activated/);
 assert.doesNotMatch(html,/0\.0%|100\.0%/);
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
 assert.match(csv,/"Document Number","Document Type","Workflow Status","Revision","Last Updated","Archived"/);
 assert.match(csv,/"Q-11131","quotation","won","3"/);
 assert.ok(csv.endsWith('\r\n'));
 assert.doesNotMatch(csv,/customerName|customerEmail|content|workspace_id/);
 const escaped=serializeTradeLinkDocumentCsv([{...record,documentNumber:'Q,"11131'}]);
 assert.match(escaped,/"Q,""11131"/);
 assert.throws(()=>serializeTradeLinkDocumentCsv(Array.from({length:51},()=>record)),/50/);
 assert.throws(()=>serializeTradeLinkDocumentCsv([{...record,revision:0}]),/invalid/i);
});

test('All Documents wires export only to the current selected authorized rows',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'tradelink-documents-export-selection'/);
 assert.match(app,/exportTradeLinkDocumentSelection\(/);
 assert.match(app,/!row\.hidden&&row\.querySelector\('\[data-tl-select-document\]'\)\?\.checked/);
 assert.match(app,/serializeTradeLinkDocumentCsv\(records\)/);
 const workspace=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 assert.match(workspace,/data-action="tradelink-documents-export-selection" disabled/);
});

test('analytics RPC remains off until its additive migration is activated',()=>{
 const client=readFileSync('frontend/tradelink-domain-client.js','utf8');
 assert.match(client,/export const TL03_ANALYTICS_ENABLED=false/);
 assert.match(client,/if\(!TL03_ANALYTICS_ENABLED\)[\s\S]*?deny\(/);
 const migration=readFileSync('supabase/migrations/20261116062500_cp_tl_legacy_analytics_summary.sql','utf8');
 assert.match(migration,/private\.tl03_can_manage\(p_board_id\)/);
 assert.match(migration,/SECURITY INVOKER/);
 assert.match(migration,/GRANT EXECUTE[\s\S]*TO authenticated/);
 assert.match(migration,/FROM PUBLIC,anon,authenticated/);
 assert.match(migration,/aging cannot be calculated yet/i);
 assert.doesNotMatch(migration,/CREATE ROLE|ALTER ROLE|ENABLE ROW LEVEL SECURITY|CREATE POLICY|DROP POLICY/i);
});

test('TradeLink printable output uses Letter pages rather than A4',()=>{
 const css=readFileSync('frontend/tradelink-application.css','utf8');
 assert.match(css,/@page\{size:Letter/);
 assert.doesNotMatch(css,/@page\{size:A4/);
 const output=readFileSync('frontend/tradelink-saved-document-output.js','utf8');
 assert.match(output,/Print \/ Save as PDF/);
});
