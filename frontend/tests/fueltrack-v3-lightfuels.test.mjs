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
 assert.doesNotMatch(html,/Mark as Refueling Done — unavailable|Save & Complete — unavailable/);
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
 assert.match(html,/Signed Admin access and a current request revision are required/);
 assert.doesNotMatch(html,/data-action="ft3-refuel/);
});
test('duplicate request ids across queue and history fail closed',()=>{
 const req={id:'r1',requestor:'A',reference:'plate',type:'vehicle',
  status:'Awaiting Refueling',createdAt:'2026-11-09T10:00:00Z'};
 const recent={id:'r1',requestor:'A',reference:'plate',completedAt:'2026-11-09T10:20:00Z'};
 const snap={...baseline,activeCount:1,queue:[req],recent:[recent]};
 assert.equal(fuelTrackLightFuelsModel(args(snap)),null);
});

test('verified Admin queue shows actionable styled refueling transition without disabled attributes',()=>{
 const request={id:'55555555-5555-4555-8555-555555555555',requestor:'Fuel requester',
  reference:'G42 80H',type:'vehicle',status:'Awaiting Refueling',
  createdAt:'2026-11-10T16:50:14.76496+00:00',revision:3};
 const html=renderFuelTrackLightFuels({...args({...baseline,activeCount:1,queue:[request]}),actionEnabled:true});
 assert.match(html,/class="ft3-light-card"/);
 assert.match(html,/class="ft3-light-mark" type="button" data-action="ft3-mark-refueled"/);
 assert.match(html,/Mark as Refueling Done<\/button>/);
 assert.match(html,/Nov 11, 2026/);
 assert.doesNotMatch(html,/data-action="ft3-mark-refueled"[^>]*disabled/);
 assert.match(html,/Refueling queue/);
});
test('verified Admin request without revision remains nonactionable',()=>{
 const request={id:'55555555-5555-4555-8555-555555555555',requestor:'Fuel requester',
  reference:'G42 80H',type:'vehicle',status:'Awaiting Refueling',
  createdAt:'2026-11-10T16:50:14.76496+00:00'};
 const html=renderFuelTrackLightFuels({...args({...baseline,activeCount:1,queue:[request]}),actionEnabled:true});
 assert.match(html,/Signed Admin access and a current request revision are required/);
 assert.doesNotMatch(html,/data-action="ft3-mark-refueled"/);
});
test('verified refueling-done record keeps signed completion form',()=>{
 const request={id:'55555555-5555-4555-8555-555555555555',requestor:'Fuel requester',
  reference:'G42 80H',type:'vehicle',status:'Refueling Done',
  createdAt:'2026-11-10T16:50:14.76496+00:00',revision:4};
 const html=renderFuelTrackLightFuels({...args({...baseline,activeCount:1,queue:[request]}),actionEnabled:true});
 assert.match(html,/data-ft3-receipt="55555555-5555-4555-8555-555555555555"/);
 assert.match(html,/Save & Complete/);
 assert.doesNotMatch(html,/data-action="ft3-mark-refueled"/);
});
test('enabled signed refueling actions are never globally styled as disabled',async()=>{
 const {readFileSync}=await import('node:fs');
 const css=readFileSync(new URL('../fueltrack-v3-application.css',import.meta.url),'utf8');
 assert.match(css,/#app \.ft3-light-card button:disabled\{opacity:\.55;cursor:not-allowed\}/);
 assert.match(css,/#app \.ft3-light-mark,#app \.ft3-light-complete\{/);
 assert.doesNotMatch(css,/#app \.ft3-light-card button\{[^}]*cursor:not-allowed/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'ft3-mark-refueled':\{/);
 assert.match(app,/mutateFuelTrackBackend\('mark',id\)/);
});
