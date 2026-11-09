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
