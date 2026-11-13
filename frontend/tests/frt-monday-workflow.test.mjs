import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectFRTWorkflowProgress} from '../frt-workflow-progress.js';
import {renderFRTFinanceReadOnly} from '../frt-finance-ui.js';

const baseline={status:'PENDING_APPROVAL',liquidationStatus:'NOT_SUBMITTED',
 financeApproved:false,transferConfirmed:false,closed:false};
const project=(changes={})=>projectFRTWorkflowProgress({...baseline,...changes});
const company={status:'PASS',companyCode:'WASS',role:'FINANCE_MANAGER',
 companies:[{code:'WASS',name:'Watchdog Automation & Security Services'}],
 summary:{total_requests:1,completed:0,in_progress:0,pending:1,pending_liquidation_count:0},
 requests:[{requestId:'11111111-1111-4111-8111-111111111111',
 title:'Authorized request',voucher:'DV-WASS-2026-001',dateNeeded:'2026-11-13',
 status:'PENDING_APPROVAL',filingStatus:'NOT_FILED'}]};
const detail={
 voucher:'DV-WASS-2026-001',title:'Authorized request',dateNeeded:'2026-11-13',
 ...baseline,workflow:[]
};

test('source-aligned lifecycle is informational and starts from actual signed pending state',()=>{
 const stages=project();
 assert.equal(stages.length,5);
 assert.deepEqual(stages.map(x=>x.state),
  ['complete','pending','pending','pending','pending']);
 assert.match(stages[2].detail,/not recorded/i);
 assert.equal(Object.isFrozen(stages),true);
});

test('finance approval and GM verification remain distinct from proof of a bank transfer',()=>{
 const stages=project({status:'DONE',financeApproved:true,transferConfirmed:true});
 assert.equal(stages[1].state,'complete');
 assert.equal(stages[2].state,'complete');
 assert.match(stages[2].detail,/not proof of bank transfer/i);
 assert.equal(stages[3].state,'pending');
});

test('returned/submitted/approved liquidation, closure, rejection and blocking render truthfully',()=>{
 assert.equal(project({liquidationStatus:'RETURNED'})[3].state,'attention');
 assert.equal(project({liquidationStatus:'SUBMITTED'})[3].state,'in-progress');
 assert.equal(project({liquidationStatus:'UNDER_REVIEW'})[3].state,'in-progress');
 assert.equal(project({liquidationStatus:'APPROVED'})[3].state,'complete');
 assert.equal(project({status:'CLOSED',liquidationStatus:'APPROVED',closed:true})[4].state,'complete');
 assert.equal(project({status:'REJECTED'})[1].state,'stopped');
 assert.equal(project({status:'REJECTED'})[3].state,'not-applicable');
 assert.equal(project({status:'BLOCKED'})[1].state,'attention');
});

test('malformed/unverified lifecycle cannot create progress guidance or authority',()=>{
 for(const change of [{status:'PAID'},{liquidationStatus:'UNDEFINED'},
  {financeApproved:'true'},{transferConfirmed:1},{closed:null}]){
  assert.equal(project(change),null);
 }
 assert.equal(projectFRTWorkflowProgress(null),null);
});

test('signed request details display lifecycle and do not invent three-day deadline or bank status',()=>{
 const html=renderFRTFinanceReadOnly({result:company,selectedRequestId:company.requests[0].requestId,
  detailResult:{status:'PASS',detail},view:'tracker'});
 assert.match(html,/Signed fund request lifecycle/);
 assert.match(html,/Request registered/);
 assert.match(html,/General Manager verification/);
 assert.match(html,/GM verification alone is not that timestamp/);
 assert.doesNotMatch(html,/OVERDUE TODAY|Bank transfer complete|automatic bank disbursement/i);
});

test('blocked detail does not produce a lifecycle or financial action buttons',()=>{
 const html=renderFRTFinanceReadOnly({result:company,
  detailResult:{status:'BLOCKED',reason:'FRT_DETAIL_ACCESS_DENIED'},view:'tracker'});
 assert.doesNotMatch(html,/Signed fund request lifecycle|Review Finance approval/);
});

test('manual accurately separates current signed controls from source-only features',()=>{
 const html=renderFRTFinanceReadOnly({result:company,view:'manual'});
 for(const term of ['PENDING_APPROVAL','24-hour autosaved drafts','duplicate checks',
 'three-day post-disbursement deadline','server-authorized','not proof that BPI'])
  assert.ok(html.includes(term),term);
 assert.doesNotMatch(html,/data-action="frt-finance-action"/);
});
