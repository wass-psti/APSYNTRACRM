import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderFRTFinanceReadOnly} from '../frt-finance-ui.js';
const id='33333333-3333-4333-8333-333333333333';
const report={status:'PASS',role:'GENERAL_MANAGER',companyCode:'WASS',
 companies:[{code:'WAO',name:'Watchdog Automation OPC'},
 {code:'WASS',name:'Watchdog Automation Sales & Services'},
 {code:'PSTI',name:'PLC Systems Technik, Inc.'}],
 summary:{total_requests:40,pending:9,in_progress:18,completed:13,pending_liquidation_count:7},
 analytics:{companyCode:'WASS',requestedTotal:'1234567.89',spentTotal:'456789.12',
  topCategories:[{category:'Office Supplies',requestedAmount:'750000.00'},
   {category:'Equipment',requestedAmount:'500000.00'}],
  monthlyTrend:['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11'].map((month,i)=>({
   month,requestedAmount:(100000+i*10000).toFixed(2),spentAmount:(50000+i*5000).toFixed(2)
  }))},
 requests:[{requestId:id,title:'Operating Supplies',voucher:'DV-WASS-202611-009',status:'PENDING_APPROVAL',dateNeeded:'2026-11-13',filingStatus:'NOT_FILED'}]};
test('reference sections render actual verified signed KPIs, chart labels, title and company selector',()=>{
 const html=renderFRTFinanceReadOnly({result:report});
 for(const value of ['Select Your Company','Executive Dashboard','OPEX Analytics','User Manual',
 'Pending Liquidation','Fund Release Tracker','Fund Requests','Status Distribution','Request Overview',
 'Total Requests','Completed','In Progress','Pending Approval','40','18','13'])
  assert.ok(html.includes(value),value);
 assert.match(html,/data-action="frt-finance-company" data-code="WASS"/);
 assert.match(html,/data-action="frt-finance-refresh"/);
 assert.match(html,/role="img" aria-label="Request distribution: 13 completed, 18 in progress, 9 pending approval"/);
 assert.match(html,/data-action="frt-finance-detail"/);
 assert.match(html,/data-action="frt-ui-dialog"/);
 assert.match(html,/data-action="frt-date-edit"/);
 assert.match(html,/data-action="frt-person-edit"/);
});
test('no private unverified finance data, filing status, archive list or audit records are invented',()=>{
 const html=renderFRTFinanceReadOnly({result:{...report,requests:[{...report.requests[0],
 amount:923812,recipientBank:'Never Public',requestor:'Private Requestor',
 filingStatus:'FILED',audit:[{secret:'Secret Event'}]}]}});
 for(const secret of ['923812','Never Public','Private Requestor','Secret Event'])
  assert.ok(!html.includes(secret),secret);
 assert.match(html,/BPI BizLink/);
 assert.match(html,/✓ Filed/);
 assert.match(html,/data-action="frt-filing-toggle"/);
 assert.match(html,/data-frt-section="new"/);
 assert.match(html,/data-frt-section="archive"/);
 assert.match(html,/data-frt-section="activity"/);
 assert.match(html,/data-frt-section="discussion"/);
 assert.doesNotMatch(html,/data-action="frt-finance-delete"/);
});
test('all zero signed data renders a true zero chart and a clean empty request table',()=>{
 const html=renderFRTFinanceReadOnly({result:{...report,
 summary:{total_requests:0,pending:0,in_progress:0,completed:0,pending_liquidation_count:0},requests:[]}});
 assert.match(html,/No requests found for this company/);
 assert.match(html,/0 pending/);
 assert.doesNotMatch(html,/>NaN<|Infinity|undefined/);
});
test('row data escaped and status filter still narrows signed list, no direct HTML injection',()=>{
 const html=renderFRTFinanceReadOnly({result:{...report,requests:[
 {...report.requests[0],title:'<img src=x onerror=alert(1)>'},
 {...report.requests[0],requestId:'44444444-4444-4444-8444-444444444444',
  title:'Completed request',status:'CLOSED'}]},statusFilter:'CLOSED'});
 assert.match(html,/Completed request/);
 assert.doesNotMatch(html,/onerror=alert|<img src=x/);
 assert.doesNotMatch(html,/Operating Supplies/);
});
test('blocked signed state does not show financial rows or write controls',()=>{
 const html=renderFRTFinanceReadOnly({result:{...report,status:'BLOCKED',reason:'SIGNED_SESSION_EXPIRED'}});
 assert.match(html,/SIGNED_SESSION_EXPIRED/);
 assert.doesNotMatch(html,/Operating Supplies|data-action="frt-finance-company"|data-action="frt-date-edit"/);
});
test('new scoped CSS participates in generated ordered stylesheet without extra requests',()=>{
 const manifest=readFileSync(new URL('../../scripts/priority5-style-manifest.mjs',import.meta.url),'utf8');
 const bundle=readFileSync(new URL('../apsyntra-styles.bundle.css',import.meta.url),'utf8');
 const index=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../frt-reference-dashboard.css',import.meta.url),'utf8');
 assert.match(manifest,/frontend\/frt-reference-dashboard.css/);
 assert.match(index,/frontend\/frt-reference-dashboard.css/);
 assert.match(bundle,/frontend\/frt-reference-dashboard.css/);
 assert.match(bundle,/frt-exec-category-list/);
 assert.match(bundle,/frt-exec-trend/);
 assert.match(css,/#app \.frt-ref/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/!important\s*;\s*\}/);
});

test('reference-only dialogs retain disabled backend submission and signed membership scope',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'frt-ui-dialog':/);
 assert.match(app,/state\.frtFinance\?\.status!=='PASS'/);
 assert.match(app,/state\.frtFinance\.requests\.find\(r=>r\.requestId===requestId\)/);
 assert.match(app,/submitLabel:'Submit Fund Request'/);
 assert.match(app,/createSignedFRTRequest/);
 assert.match(app,/updateSignedFRTFiling/);
 assert.match(app,/renderFRTRequestWizard/);
 assert.match(app,/enhanceFRTRequestWizard/);
 assert.match(app,/case 'frt-filing-toggle':/);
});

test('Executive Dashboard renders signed company-scoped counts and truthful financial-data states',()=>{
 const html=renderFRTFinanceReadOnly({result:report,view:'executive'});
 for(const value of ['Executive Dashboard','Requested','Spent','Budget Utilization',
  'Pending Liquidation','Request Status Pipeline','Top 5 Expense Categories',
  'Requested vs. Spent — Last 6 Months','1,234,567.89','frt-exec-month-row',
  'frt-exec-grid','data-view="executive"'])assert.ok(html.includes(value),value);
 assert.match(html,/Pending Liquidation[\s\S]*?7/);
 assert.match(html,/13 completed[\s\S]*?18 in progress[\s\S]*?9 pending approval/);
 assert.doesNotMatch(html,/923812|999999/i);
});

test('OPEX and User Manual navigation are functional views without fabricated financial charts',()=>{
 const opex=renderFRTFinanceReadOnly({result:report,view:'opex'});
 assert.match(opex,/OPEX Analytics/);
 assert.match(opex,/Category Breakdown/);
 assert.match(opex,/frt-opex-line-chart/);
 assert.match(opex,/Requested vs\. Liquidated Trend/);
 assert.match(opex,/750,000\.00/);
 const manual=renderFRTFinanceReadOnly({result:report,view:'manual'});
 assert.match(manual,/Fund Released Tracker — User Manual/);
 assert.match(manual,/company selector/);
});

test('Executive Dashboard navigation exposes accessible native buttons and preserves tracker entry',()=>{
 const html=renderFRTFinanceReadOnly({result:report,view:'executive'});
 assert.match(html,/data-action="frt-finance-view" data-view="tracker"/);
 assert.match(html,/data-action="frt-finance-view" data-view="executive"[^>]*aria-current="page"/);
 assert.match(html,/data-action="frt-finance-view" data-view="opex"/);
 assert.match(html,/data-action="frt-finance-view" data-view="manual"/);
});


test('app connects the selected FRT view to local navigation state without changing finance RPCs',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/frtFinanceView:'tracker'/);
 assert.match(app,/view:state\.frtFinanceView/);
 assert.match(app,/case 'frt-finance-view':/);
 assert.match(app,/state\.frtFinanceView=next/);
 assert.match(app,/\['tracker','executive','opex','manual'\]\.includes\(next\)/);
});

test('blocked signed result never renders an executive dashboard or financial KPI values',()=>{
 const html=renderFRTFinanceReadOnly({result:{status:'BLOCKED',reason:'FRT_ACCESS_DENIED'},view:'executive'});
 assert.match(html,/FRT_ACCESS_DENIED/);
 assert.doesNotMatch(html,/frt-exec-dashboard|Budget Utilization|Top 5 Expense Categories/);
});


test('CP-FRT-EXEC-02 Executive Dashboard renders real signed aggregate amounts and category rollups',()=>{
 const html=renderFRTFinanceReadOnly({result:report,view:'executive'});
 for(const value of ['1,234,567.89','456,789.12','Office Supplies','750,000.00',
  'Equipment','500,000.00','Requested vs. Spent — Last 6 Months','Nov 26',
  'No authoritative company budget source'])assert.ok(html.includes(value),value);
 assert.match(html,/frt-exec-category-row/);
 assert.match(html,/frt-exec-month-row/);
 assert.match(html,/data-view="executive"/);
 assert.doesNotMatch(html,/requestId|voucher_no|recipientBank|requestor_email/);
});

test('CP-FRT-EXEC-02 OPEX Analytics uses the same validated company aggregates',()=>{
 const html=renderFRTFinanceReadOnly({result:report,view:'opex'});
 assert.match(html,/750,000\.00/);
 assert.match(html,/456,789\.12/);
 assert.match(html,/requested line items/i);
 assert.match(html,/latest saved liquidation snapshot/i);
 assert.match(html,/Submitted liquidation volume by month/);
});

test('CP-FRT-EXEC-02 unavailable aggregate data preserves honest empty states',()=>{
 const html=renderFRTFinanceReadOnly({result:{...report,analytics:null},view:'executive'});
 assert.match(html,/Category breakdown unavailable/);
 assert.match(html,/Six-month trend unavailable/);
 assert.match(html,/Budget Utilization/);
 assert.match(html,/No authoritative company budget source/);
 assert.doesNotMatch(html,/>NaN<|Infinity|undefined/);
});

test('CP-FRT-EXEC-02 escapes untrusted category names and formats large decimal strings without precision loss',()=>{
 const html=renderFRTFinanceReadOnly({result:{...report,analytics:{
  ...report.analytics,requestedTotal:'999999999999999999999999.99',
  topCategories:[{category:'<img src=x onerror=alert(1)>',requestedAmount:'999999999999999999999999.99'}]
 }},view:'executive'});
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/999,999,999,999,999,999,999,999\.99/);
 assert.doesNotMatch(html,/<img src=x|onerror=alert\(1\)>/);
});

test('CP-FRT-OPEX-REF-01 renders reference-led KPI, trend, category, department, pending and IC sections without fabricated budgets',()=>{
 const html=renderFRTFinanceReadOnly({result:report,view:'opex'});
 for(const label of ['FINANCIAL COMMAND CENTER','Total Requested','Submitted Liquidation',
  'Budget Used','Pending Liquidations','Requested vs. Liquidated Trend',
  'Category Breakdown','Department Performance Matrix','Burn Rate Analysis',
  'Risk-Aware IC Matrix','Not activated','Intercompany ledger not connected',
  'View exact monthly amounts']){
  assert.ok(html.includes(label),label);
 }
 assert.match(html,/aria-label="7 pending liquidations"/);
 assert.match(html,/aria-label="Monthly requested amounts and submitted liquidation amounts"/);
 assert.match(html,/Company budget source not connected/);
 assert.doesNotMatch(html,/94\.30%|31\.33M|29\.54M|>Reconciled<|>0 active loans</i);
});

test('CP-FRT-OPEX-REF-01 zero or missing financial aggregates display truthful states',()=>{
 const missing=renderFRTFinanceReadOnly({result:{...report,analytics:null},view:'opex'});
 assert.match(missing,/Trend unavailable/);
 assert.match(missing,/Category breakdown unavailable/);
 assert.doesNotMatch(missing,/>NaN<|>Infinity<|>undefined</);
 const zero={...report,analytics:{...report.analytics,requestedTotal:'0.00',spentTotal:'0.00',
  topCategories:[],monthlyTrend:report.analytics.monthlyTrend.map(x=>({...x,requestedAmount:'0.00',spentAmount:'0.00'}))}};
 const html=renderFRTFinanceReadOnly({result:zero,view:'opex'});
 assert.match(html,/polyline points="52,214\.00/);
 assert.match(html,/No categorized request items/);
 assert.doesNotMatch(html,/NaN|Infinity/);
});

test('CP-FRT-OPEX-REF-01 treats categories as untrusted text and keeps signed aggregate only',()=>{
 const html=renderFRTFinanceReadOnly({result:{...report,analytics:{...report.analytics,
  topCategories:[{category:'<svg onload=alert(1)>',requestedAmount:'42.00'}]}},view:'opex'});
 assert.match(html,/&lt;svg onload=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<svg onload=alert/);
 assert.doesNotMatch(html,/recipientBank|requestor_email|requestId|voucher_no|privateToken/);
});
