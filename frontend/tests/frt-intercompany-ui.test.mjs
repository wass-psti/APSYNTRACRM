import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderFRTFinanceReadOnly} from '../frt-finance-ui.js';

const workspace='00000000-0000-4000-8000-000000000001';
const companies=[
 {id:'044fe766-cd40-41ba-8bc5-e47f4cae8a8e',code:'WAO',name:'Watchdog Automation OPC'},
 {id:'9b5fad85-97fa-47ea-95c8-182d0a511892',code:'WASS',name:'Watchdog Automation Sales & Services'},
 {id:'09ec5c72-4297-4c35-96d0-96557193bc93',code:'PSTI',name:'Process Solutions Technology Inc.'}
];
const loanId='44444444-4444-4444-8444-444444444441';
const pairs={'WAO|WASS':'600000.00','PSTI|WAO':'250000.00'};
const matrix=(source,transpose=false)=>companies.flatMap(row=>companies.map(column=>{
 const creditor=transpose?column.code:row.code;
 const debtor=transpose?row.code:column.code;
 return {rowCompanyCode:row.code,columnCompanyCode:column.code,
  amount:source[creditor+'|'+debtor]||'0.00'};
}));
const icSnapshot={
 workspaceId:workspace,asOfDate:'2026-11-13',companies,
 entities:[
  {companyCode:'WAO',companyName:companies[0].name,receivables:'600000.00',payables:'250000.00',netPosition:'350000.00'},
  {companyCode:'WASS',companyName:companies[1].name,receivables:'0.00',payables:'600000.00',netPosition:'-600000.00'},
  {companyCode:'PSTI',companyName:companies[2].name,receivables:'250000.00',payables:'0.00',netPosition:'250000.00'}
 ],
 receivablesMatrix:matrix(pairs),
 payablesMatrix:matrix({'WAO|WASS':'600000.00','PSTI|WAO':'250000.00'},true),
 summary:{totalReceivables:'850000.00',totalPayables:'850000.00',
  netIntercompanyPosition:'0.00',activeObligationCount:2,activeLoanCount:1,
  activeLoanBalance:'600000.00',overdueCount:1,dueSoonCount:0,
  highExposurePairCount:1,exposureThreshold:'500000.00',ledgerBalanced:true},
 obligations:[{id:loanId,reference:'IC01-LOAN-001',kind:'LOAN',creditorCode:'WAO',
  debtorCode:'WASS',description:'Loan fixture',principalAmount:'600000.00',
  settledAmount:'0.00',outstandingAmount:'600000.00',issuedOn:'2026-09-14',
  dueOn:'2026-11-03',riskStatus:'OVERDUE'}],
 loans:[{id:loanId,reference:'IC01-LOAN-001',lenderCode:'WAO',borrowerCode:'WASS',
  originalAmount:'600000.00',settledAmount:'0.00',outstandingBalance:'600000.00',
  issueDate:'2026-09-14',maturityDate:'2026-11-03',daysOutstanding:60,
  daysToMaturity:-10,riskStatus:'OVERDUE'}],
 disclosure:'Receivables and payables are opposite sides of the same recorded obligation. Internal balance is not external counterparty confirmation.'
};
const base={
 status:'PASS',role:'FINANCE_MANAGER',companyCode:'WAO',
 companies:companies.map(({code,name})=>({code,name})),
 summary:{total_requests:0,pending:0,in_progress:0,completed:0,pending_liquidation_count:0},
 analytics:{companyCode:'WAO',requestedTotal:'0.00',spentTotal:'0.00',
  topCategories:[],monthlyTrend:['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11']
   .map(month=>({month,requestedAmount:'0.00',spentAmount:'0.00'}))},
 icSnapshot,icStatus:'PASS',requests:[]
};

test('CP-FRT-IC-01 renders bilateral matrix, net positions, active loans, maturity risk and finance controls',()=>{
 const html=renderFRTFinanceReadOnly({result:base,view:'opex'});
 for(const text of ['Risk-Aware IC Matrix','Internally balanced','Net Intercompany Position by Entity',
  'Receivables Matrix (Lender Exposure)','Payables Matrix (Borrower Obligation)',
  'Active Intercompany Loans','Intercompany Obligations &amp; Settlements',
  '₱850,000.00','₱600,000.00','-₱600,000.00','OVERDUE','₱500,000.00'])
  assert.ok(html.includes(text),text);
 assert.match(html,/data-action="frt-ic-new-obligation"/);
 assert.match(html,/data-action="frt-ic-settle" data-obligation-id="44444444-4444-4444-8444-444444444441"/);
 assert.match(html,/not external counterparty confirmation/i);
 assert.doesNotMatch(html,/>Reconciled<|>0 active loans</i);
});

test('CP-FRT-IC-01 retains read-only access for REQUESTOR without exposing finance write actions',()=>{
 const html=renderFRTFinanceReadOnly({result:{...base,role:'REQUESTOR'},view:'opex'});
 assert.match(html,/Risk-Aware IC Matrix/);
 assert.match(html,/Read-only FRT access/);
 assert.doesNotMatch(html,/data-action="frt-ic-new-obligation"|data-action="frt-ic-settle"/);
});

test('CP-FRT-IC-01 invalid or unavailable snapshot never invents exposure values or controls',()=>{
 const invalid=renderFRTFinanceReadOnly({result:{...base,icSnapshot:null,icStatus:'INVALID_CONTRACT'},view:'opex'});
 assert.match(invalid,/Intercompany ledger unavailable/);
 assert.doesNotMatch(invalid,/₱850,000|data-action="frt-ic-new-obligation"|data-action="frt-ic-settle"/);
 assert.match(invalid,/data-action="frt-ic-retry-read"/);
 assert.match(invalid,/Retry performs a read only/);
});

test('CP-FRT-IC-01 app binds actionable settlement controls and the existing finance modal workflow',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'frt-ic-retry-read'/);
 assert.match(app,/await loadFRTFinance\(state\.frtFinance\?\.companyCode\|\|null\)/);
 assert.match(app,/case 'frt-ic-new-obligation'/);
 assert.match(app,/case 'frt-ic-settle'/);
 assert.match(app,/!\/\^\\d\+\(\?:\\.\\d\{1,2\}\)\?\$\//);
 assert.match(app,/recordFRTICSettlement\(\{auth,api:db,workspaceId,obligationId,payload\}\)/);
});

test('CP-FRT-IC-01C transient service failures expose safe signed read recovery',()=>{
 const unavailable=renderFRTFinanceReadOnly({result:{...base,icSnapshot:null,icStatus:'UNAVAILABLE'},view:'opex'});
 assert.match(unavailable,/Retry signed ledger read/);
 assert.doesNotMatch(unavailable,/data-action="frt-ic-new-obligation"|data-action="frt-ic-settle"/);
 const healthy=renderFRTFinanceReadOnly({result:base,view:'opex'});
 assert.doesNotMatch(healthy,/data-action="frt-ic-retry-read"/);
});
