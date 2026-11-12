import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFRTExecutiveDashboard} from '../frt-executive-dashboard.js';
import {loadFRTFinanceReadOnly} from '../frt-finance-readonly.js';

const months=['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10'];
const executive={
 status:'PASS',totalAmount:30874339.60,totalLiquidated:29539132.58,
 budgetUtilization:95.68,pendingLiquidation:321836.66,
 topCategories:[
  {category:'Salaries & Wages',amount:5700000},
  {category:'Purchases',amount:5200000},
  {category:'Loans Payable',amount:1900000}
 ],
 monthlyTrend:months.map((period,i)=>({period,requested:1000000+i*100000,spent:900000+i*90000}))
};
const report={status:'PASS',role:'GENERAL_MANAGER',companyCode:'WASS',
 summary:{total_requests:626,pending:1,in_progress:26,completed:599,pending_liquidation_count:4},
 executive};

test('executive dashboard renders verified PHP KPIs and threshold warning',()=>{
 const html=renderFRTExecutiveDashboard(report);
 for(const text of ['Executive Dashboard','Total Fund Requests','Total Liquidated',
  'Budget Utilization','Pending Liquidation','₱30,874,339.60','₱29,539,132.58',
  '95.68%','₱321,836.66','exceeds 90%'])assert.ok(html.includes(text),text);
 assert.match(html,/Budget utilization exceeds 90%/);
 assert.match(html,/data-testid="frt-executive-dashboard"/);
});

test('status pipeline uses verified counts and expense categories render horizontal bars',()=>{
 const html=renderFRTExecutiveDashboard(report);
 assert.match(html,/599 completed, 26 in progress, 1 pending approval/);
 assert.match(html,/Salaries &amp; Wages/);
 assert.match(html,/Top 5 Expense Categories/);
 assert.match(html,/frt-exec-category-bar/);
 assert.match(html,/₱5,700,000\.00/);
});

test('six-month trend renders all supplied months and requested/spent series',()=>{
 const html=renderFRTExecutiveDashboard(report);
 for(const month of ['May 2026','Jun 2026','Jul 2026','Aug 2026','Sep 2026','Oct 2026'])
  assert.ok(html.includes(month),month);
 assert.match(html,/aria-label="Six-month requested versus actual spent trend"/);
 assert.match(html,/Requested/);
 assert.match(html,/Spent/);
});

test('zero financial data renders honest zero values and no false budget warning',()=>{
 const zero={...report,summary:{total_requests:0,pending:0,in_progress:0,completed:0,pending_liquidation_count:0},
 executive:{status:'PASS',totalAmount:0,totalLiquidated:0,budgetUtilization:0,pendingLiquidation:0,
  topCategories:[],monthlyTrend:months.map(period=>({period,requested:0,spent:0}))}};
 const html=renderFRTExecutiveDashboard(zero);
 assert.match(html,/₱0\.00/);
 assert.match(html,/0\.00%/);
 assert.doesNotMatch(html,/exceeds 90%/);
 assert.match(html,/No expense category data/);
});

test('untrusted category labels are escaped and blocked analytics are not fabricated',()=>{
 const unsafe={...report,executive:{...executive,topCategories:[{category:'<img src=x onerror=alert(1)>',amount:50}]}};
 const html=renderFRTExecutiveDashboard(unsafe);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img src=x/);
 const blocked=renderFRTExecutiveDashboard({...report,executive:{status:'BLOCKED',reason:'EXECUTIVE_REPORTING_NOT_ACTIVATED'}});
 assert.match(blocked,/Executive reporting is not activated/);
 assert.doesNotMatch(blocked,/₱30,874,339\.60/);
});

test('executive analytics are fetched only when explicitly requested and never use legacy broad RPCs',async()=>{
 const user='11111111-1111-4111-8111-111111111111';
 const workspace='22222222-2222-4222-8222-222222222222';
 const calls=[];
 const auth={userId:user,async getVerifiedUser(){return{id:user};}};
 const api={
  async context(){return{user_id:user,workspace_id:workspace,profile:{status:'active'}};},
  async rpc(name){
   calls.push(name);
   if(name==='frt_bootstrap')return{membership:{user_id:user,workspace_id:workspace,role:'GENERAL_MANAGER',enabled:true,status:'active'},companies:[{code:'WASS',name:'WASS'}]};
   if(name==='frt_board_dashboard_safe')return{total_requests:1,pending:0,in_progress:0,completed:1,pending_liquidation_count:0};
   if(name==='frt_board_list_safe')return[];
   if(name==='frt_executive_dashboard_safe')return{
    total_amount:1000,total_liquidated:950,budget_utilization:95,
    pending_liquidation:0,top_categories:[{category:'Travel',amount:1000}],
    monthly_trend:months.map(period=>({period,requested:100,spent:95}))
   };
   throw new Error('Unexpected legacy RPC '+name);
  }
 };
 const tracker=await loadFRTFinanceReadOnly({auth,api});
 assert.equal(tracker.status,'PASS');
 assert.equal(tracker.executive,undefined);
 assert.ok(!calls.includes('frt_executive_dashboard_safe'));
 const dashboard=await loadFRTFinanceReadOnly({auth,api,includeExecutive:true});
 assert.equal(dashboard.status,'PASS');
 assert.equal(dashboard.executive.status,'PASS');
 assert.equal(dashboard.executive.totalAmount,1000);
 assert.equal(dashboard.executive.topCategories[0].category,'Travel');
 assert.ok(calls.includes('frt_executive_dashboard_safe'));
 assert.ok(!calls.includes('frt_dashboard'));
 assert.ok(!calls.includes('frt_list_requests'));
});

test('missing executive reporting RPC does not break existing signed Fund Tracker',async()=>{
 const user='11111111-1111-4111-8111-111111111111';
 const workspace='22222222-2222-4222-8222-222222222222';
 const auth={userId:user,async getVerifiedUser(){return{id:user};}};
 const api={
  async context(){return{user_id:user,workspace_id:workspace,profile:{status:'active'}};},
  async rpc(name){
   if(name==='frt_bootstrap')return{membership:{user_id:user,workspace_id:workspace,role:'GENERAL_MANAGER',enabled:true,status:'active'},companies:[{code:'WASS',name:'WASS'}]};
   if(name==='frt_board_dashboard_safe')return{total_requests:0,pending:0,in_progress:0,completed:0,pending_liquidation_count:0};
   if(name==='frt_board_list_safe')return[];
   if(name==='frt_executive_dashboard_safe')throw Object.assign(new Error('missing'),{code:'PGRST202'});
   throw new Error('Unexpected RPC '+name);
  }
 };
 const response=await loadFRTFinanceReadOnly({auth,api,includeExecutive:true});
 assert.equal(response.status,'PASS');
 assert.equal(response.executive.status,'BLOCKED');
 assert.equal(response.executive.reason,'EXECUTIVE_REPORTING_NOT_ACTIVATED');
 assert.deepEqual(response.requests,[]);
});
