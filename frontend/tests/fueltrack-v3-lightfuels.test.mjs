import test from 'node:test';
import assert from 'node:assert/strict';
import {fuelTrackLightFuelsModel,renderFuelTrackLightFuels} from '../fueltrack-v3-lightfuels.js';
const board='7af78b3f-67bf-4600-9aa1-9006d19d486e';
const workspace='11111111-1111-4111-8111-111111111111';
const baseline={status:'VERIFIED_READ',boardId:board,workspaceId:workspace,
 activeCount:0,processedCount:0,completedToday:0,overdueCount:0,queue:[],recent:[]};
const args=snapshot=>({snapshot,boardId:board,workspaceId:workspace});
test('missing signed LightFuels response cannot display zero counts or invented requests',()=>{
 const html=renderFuelTrackLightFuels(args(null));
 assert.match(html,/Queue and processing data unavailable/);
 assert.match(html,/signed LightFuels queue and refueling workflow are not connected/);
 assert.doesNotMatch(html,/Queue clear|8 in queue|257 processed/);
 assert.match(html,/data-action="refresh-board"/);
 assert.match(html,/Mark as Refueling Done — unavailable/);
 assert.match(html,/Save & Complete — unavailable/);
 assert.doesNotMatch(html,/<form\b|type="submit"/);
});
test('verified empty queue alone receives an empty label and zero totals',()=>{
 const html=renderFuelTrackLightFuels(args(baseline));
 assert.match(html,/Queue clear/);
 assert.match(html,/0 in queue · 0 processed/);
});
test('foreign scope, missing receipt or invalid counts reject unverified projections',()=>{
 for(const snap of [
  {...baseline,status:'UNVERIFIED'}, {...baseline,boardId:'foreign'},
  {...baseline,workspaceId:'foreign'}, {...baseline,activeCount:-1},
  {...baseline,processedCount:NaN}, {...baseline,overdueCount:1},
  {...baseline,queue:[{id:'r1'}]},
 ])assert.equal(fuelTrackLightFuelsModel(args(snap)),null);
});
test('verified queue displays safe requestor labels without granting refueling actions',()=>{
 const request={id:'r1',requestor:'<svg onload=alert(1)>',reference:'ABC-123',
  type:'vehicle',status:'Awaiting Refueling',createdAt:'2026-11-09T10:20:00Z'};
 const snap={...baseline,activeCount:1,overdueCount:1,queue:[request]};
 const html=renderFuelTrackLightFuels(args(snap));
 assert.match(html,/&lt;svg onload=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<svg onload/);
 assert.match(html,/1 overdue requests require attention/);
 assert.match(html,/Process — unavailable/);
 assert.doesNotMatch(html,/data-action="ft3-refuel/);
});
test('duplicate request ids across queue and history fail closed',()=>{
 const req={id:'r1',requestor:'A',reference:'plate',type:'vehicle',
  status:'Awaiting Refueling',createdAt:'2026-11-09T10:00:00Z'};
 const recent={id:'r1',requestor:'A',reference:'plate',completedAt:'2026-11-09T10:20:00Z'};
 const snap={...baseline,activeCount:1,queue:[req],recent:[recent]};
 assert.equal(fuelTrackLightFuelsModel(args(snap)),null);
});
