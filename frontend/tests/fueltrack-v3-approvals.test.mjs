import test from 'node:test';
import assert from 'node:assert/strict';
import {fuelTrackApprovalModel,renderFuelTrackApprovals} from '../fueltrack-v3-approvals.js';
const board='7af78b3f-67bf-4600-9aa1-9006d19d486e';
const workspace='11111111-1111-4111-8111-111111111111';
const base={status:'VERIFIED_READ',boardId:board,workspaceId:workspace,
 approvedToday:1,rejectedToday:0,decisionsToday:1,pendingCount:0,pending:[]};
const args=snapshot=>({snapshot,boardId:board,workspaceId:workspace});
test('unknown approval data shows no fabricated empty queue or percentages',()=>{
 const html=renderFuelTrackApprovals(args(null));
 assert.match(html,/Approval statistics and pending requests are unavailable/);
 assert.doesNotMatch(html,/All clear!|100%|0 pending review/);
 assert.match(html,/data-action="refresh-board"/);
 assert.doesNotMatch(html,/Delegate|Delegation/);
});
test('verified empty queue alone renders reference empty-state and exact daily totals',()=>{
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
test('verified pending rows escape untrusted content and never expose mutation controls',()=>{
 const snapshot={...base,pendingCount:1,pending:[{id:'r1',title:'<img src=x onerror=alert(1)>',
  createdAt:'2026-11-09T10:00:00Z'}]};
 const html=renderFuelTrackApprovals(args(snapshot));
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<img|data-action="ft3-approve"/);
 assert.match(html,/Review actions are unavailable/);
});

test('verified signed Admin sees distinct accessible cards and scoped decision actions',()=>{
 const snapshot={...base,pendingCount:2,pending:[
  {id:'55555555-5555-4555-8555-555555555551',title:'G42 80H — Requester',
   createdAt:'2026-11-10T16:50:14.76496+00:00',revision:1},
  {id:'55555555-5555-4555-8555-555555555552',title:'Container refill',
   createdAt:'2026-11-10T16:51:00Z',revision:2}
 ]};
 const html=renderFuelTrackApprovals({...args(snapshot),actionEnabled:true});
 assert.match(html,/aria-label="Pending approval requests"/);
 assert.match(html,/Awaiting your decision/);
 assert.equal((html.match(/class="ft3-approval-card"/g)||[]).length,2);
 assert.equal((html.match(/data-action="ft3-approve"/g)||[]).length,2);
 assert.equal((html.match(/data-action="ft3-reject"/g)||[]).length,2);
 assert.match(html,/Nov 11, 2026/);
 assert.match(html,/for="ft3-reason-55555555-5555-4555-8555-555555555551"/);
 assert.match(html,/class="ft3-approval-status"/);
 assert.doesNotMatch(html,/2026-11-10T16:50:14/);
});

test('a pending request without a verified revision has no decision buttons',()=>{
 const snapshot={...base,pendingCount:1,pending:[
  {id:'55555555-5555-4555-8555-555555555553',
   title:'Unknown revision',createdAt:'2026-11-10T00:00:00Z'}
 ]};
 const html=renderFuelTrackApprovals({...args(snapshot),actionEnabled:true});
 assert.match(html,/Decision actions are unavailable for this request/);
 assert.doesNotMatch(html,/data-action="ft3-approve"|data-action="ft3-reject"/);
});

test('approval cards show the verified request context needed for a decision',()=>{
 const snapshot={...base,pendingCount:1,pending:[{
  id:'55555555-5555-4555-8555-555555555554',title:'GAN 8289 — Requester',
  createdAt:'2026-11-10T16:50:14Z',revision:1,requestType:'vehicle',
  requestorName:'Requester',reference:'GAN 8289',vehicleOwner:'Vehicle Owner',
  origin:'Mandaue',destination:'Cebu City',odometer:12000,distance:18.5,
  purpose:'Equipment delivery to project site'
 }]};
 const html=renderFuelTrackApprovals({...args(snapshot),actionEnabled:true});
 for(const value of ['Vehicle fuel','Requested by','Requester','Vehicle plate','GAN 8289',
  'Vehicle owner','Vehicle Owner','Trip route','Mandaue → Cebu City',
  '12,000 km','18.5 km','Equipment delivery to project site'])
  assert.ok(html.includes(value),value);
 assert.equal((html.match(/data-action="ft3-approve"/g)||[]).length,1);
 assert.equal((html.match(/data-action="ft3-reject"/g)||[]).length,1);
});
test('malformed optional request context is rejected rather than rendered',()=>{
 const snapshot={...base,pendingCount:1,pending:[{
  id:'r1',title:'Request',createdAt:'2026-11-10T16:50:14Z',
  requestType:'administrator',requestorName:'Requester'
 }]};
 assert.equal(fuelTrackApprovalModel(args(snapshot)),null);
});
