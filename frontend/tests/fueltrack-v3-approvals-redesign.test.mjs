import test from 'node:test';
import assert from 'node:assert/strict';
import {fuelTrackApprovalModel,renderFuelTrackApprovals} from '../fueltrack-v3-approvals.js';
const board='7af78b3f-67bf-4600-9aa1-9006d19d486e';
const workspace='11111111-1111-4111-8111-111111111111';
const base={status:'VERIFIED_READ',boardId:board,workspaceId:workspace,
 approvedToday:1,rejectedToday:0,decisionsToday:1,pendingCount:0,pending:[]};
const args=snapshot=>({snapshot,boardId:board,workspaceId:workspace});
test('approval header and verified statistics use the redesigned visual structure',()=>{
 const html=renderFuelTrackApprovals(args(base));
 assert.match(html,/FUEL OPERATIONS \/ DECISION CENTER/);
 assert.match(html,/Verified approval data/);
 assert.match(html,/ft3-approvals-metrics/);
 assert.equal((html.match(/class="ft3-approval-metric /g)||[]).length,4);
 assert.match(html,/Approved today/);
 assert.match(html,/Rejected today/);
 assert.match(html,/Decisions today/);
 assert.match(html,/Approval rate/);
});
test('unknown approval data stays unavailable rather than fabricating an empty queue',()=>{
 const html=renderFuelTrackApprovals(args(null));
 assert.match(html,/Approval statistics and pending requests are unavailable/);
 assert.match(html,/Approval queue unavailable/);
 assert.doesNotMatch(html,/All clear!|100%|0 pending review/);
 assert.match(html,/data-action="refresh-board"/);
 assert.doesNotMatch(html,/Delegate|Delegation/);
});
test('verified empty queue renders the explicit all-clear state and exact totals',()=>{
 const html=renderFuelTrackApprovals(args(base));
 assert.match(html,/All clear!/);
 assert.match(html,/100%/);
 assert.match(html,/0 pending review/);
});
test('invalid, mismatched and duplicated data fail closed',()=>{
 for(const snapshot of [
  {...base,workspaceId:'foreign'},
  {...base,boardId:'foreign'},
  {...base,status:'UNVERIFIED'},
  {...base,approvedToday:-1},
  {...base,decisionsToday:0},
  {...base,pendingCount:1,pending:[{id:'same',title:'a',createdAt:'2026-11-09T00:00:00Z'},
   {id:'same',title:'b',createdAt:'2026-11-09T00:00:00Z'}]},
 ])assert.equal(fuelTrackApprovalModel(args(snapshot)),null);
});
test('verified pending rows are escaped and read-only mode has no mutation controls',()=>{
 const snapshot={...base,pendingCount:1,pending:[{id:'r1',title:'<img src=x onerror=alert(1)>',
  createdAt:'2026-11-09T10:00:00Z'}]};
 const html=renderFuelTrackApprovals(args(snapshot));
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<img|data-action="ft3-approve"/);
 assert.match(html,/Review actions are unavailable/);
});
test('signed Admin decision actions retain their existing selectors and required reason input',()=>{
 const id='55555555-5555-4555-8555-555555555551';
 const snapshot={...base,pendingCount:1,pending:[{id,title:'G42 80H — Requester',
  createdAt:'2026-11-10T16:50:14.76496+00:00',revision:1}]};
 const html=renderFuelTrackApprovals({...args(snapshot),actionEnabled:true});
 assert.match(html,/aria-label="Pending approval requests"/);
 assert.equal((html.match(/class="ft3-approval-card"/g)||[]).length,1);
 assert.equal((html.match(/data-action="ft3-approve"/g)||[]).length,1);
 assert.equal((html.match(/data-action="ft3-reject"/g)||[]).length,1);
 assert.match(html,/for="ft3-reason-55555555-5555-4555-8555-555555555551"/);
 assert.match(html,/Required to reject/);
 assert.match(html,/maxlength="1000"/);
 assert.match(html,/Nov 11, 2026/);
 assert.doesNotMatch(html,/2026-11-10T16:50:14/);
});
test('a pending request without a verified revision has no decision buttons',()=>{
 const snapshot={...base,pendingCount:1,pending:[{
  id:'55555555-5555-4555-8555-555555555553',title:'Unknown revision',
  createdAt:'2026-11-10T00:00:00Z'}]};
 const html=renderFuelTrackApprovals({...args(snapshot),actionEnabled:true});
 assert.match(html,/Decision actions are unavailable for this request/);
 assert.doesNotMatch(html,/data-action="ft3-approve"|data-action="ft3-reject"/);
});
