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
