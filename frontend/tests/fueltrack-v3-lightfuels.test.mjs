import test from 'node:test';
import assert from 'node:assert/strict';
import {fuelTrackLightFuelsModel,renderFuelTrackLightFuels,renderFuelTrackRefuelingDialog} from '../fueltrack-v3-lightfuels.js';
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
 assert.match(html,/data-action="ft3-open-receipt"/);
 const dialog=renderFuelTrackRefuelingDialog({...args({...baseline,activeCount:1,queue:[request]}),
  dialog:{id:request.id,stage:'details'}});
 assert.match(dialog,/data-ft3-receipt="55555555-5555-4555-8555-555555555555"/);
 assert.match(dialog,/Save & Complete/);
 assert.doesNotMatch(html,/data-action="ft3-mark-refueled"/);
});
test('enabled signed refueling actions are never globally styled as disabled',async()=>{
 const {readFileSync}=await import('node:fs');
 const css=readFileSync(new URL('../fueltrack-v3-application.css',import.meta.url),'utf8');
 assert.match(css,/#app \.ft3-light-card button:disabled\{opacity:\.55;cursor:not-allowed\}/);
 assert.match(css,/#app \.ft3-light-mark,#app \.ft3-light-complete\{/);
 assert.doesNotMatch(css,/#app \.ft3-light-card button\{[^}]*cursor:not-allowed/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'ft3-mark-refueled':/);
 assert.match(app,/mutateFuelTrackBackend\('mark',dialog.id\)/);
});

test('two-stage modal requires signed request stage and scopes actions',()=>{
 const id='55555555-5555-4555-8555-555555555555';
 const awaiting={id,requestor:'Requester',reference:'G42 80H',type:'vehicle',
  status:'Awaiting Refueling',createdAt:'2026-11-10T16:50:14Z',revision:3};
 const pending={...baseline,activeCount:1,queue:[awaiting]};
 const confirm=renderFuelTrackRefuelingDialog({...args(pending),dialog:{id,stage:'confirm'}});
 assert.match(confirm,/role="dialog" aria-modal="true"/);
 assert.match(confirm,/Step 1 of 2/);
 assert.match(confirm,/data-action="ft3-refuel-confirm"/);
 assert.match(confirm,/data-action="ft3-refuel-cancel"/);
 assert.doesNotMatch(confirm,/data-ft3-receipt=/);
 assert.equal(renderFuelTrackRefuelingDialog({...args(pending),dialog:{id,stage:'details'}}),'');
 const done={...baseline,activeCount:1,queue:[{...awaiting,status:'Refueling Done',revision:4}]};
 const details=renderFuelTrackRefuelingDialog({...args(done),dialog:{id,stage:'details'}});
 assert.match(details,/Step 2 of 2/);
 assert.match(details,/name="amount"[^>]*required/);
 assert.match(details,/name="liters"[^>]*required/);
 assert.match(details,/name="receiptPhoto"/);
 assert.match(details,/data-ft3-receipt=/);
 assert.match(details,/Save & Complete/);
 assert.equal(renderFuelTrackRefuelingDialog({...args(done),dialog:{id,stage:'confirm'}}),'');
 assert.equal(renderFuelTrackRefuelingDialog({...args(done),dialog:{id:'foreign',stage:'details'}}),'');
 assert.equal(renderFuelTrackRefuelingDialog({...args({...done,workspaceId:'other'}),dialog:{id,stage:'details'}}),'');
});

test('refueling details refinement preserves required numeric fields and private receipt selection',()=>{
 const id='55555555-5555-4555-8555-555555555555';
 const request={id,requestor:'Signed Driver',reference:'G42 80H',type:'vehicle',
  status:'Refueling Done',createdAt:'2026-11-10T16:50:14Z',revision:4};
 const html=renderFuelTrackRefuelingDialog({...args({...baseline,activeCount:1,queue:[request]}),
  dialog:{id,stage:'details'}});
 assert.match(html,/class="ft3-refuel-input-wrap"/);
 assert.match(html,/aria-hidden="true">₱</);
 assert.match(html,/id="ft3-refuel-amount" name="amount" type="number"[^>]*required/);
 assert.match(html,/id="ft3-refuel-liters" name="liters" type="number"[^>]*required/);
 assert.match(html,/id="ft3-refuel-photo" name="receiptPhoto" type="file"/);
 assert.match(html,/name="receiptPhoto" type="file" accept="image\/jpeg,image\/png,image\/webp"/);
 assert.match(html,/type="submit" class="ft3-refuel-primary"/);
 assert.match(html,/data-action="ft3-refuel-cancel"/);
});

test('completed history presents readable dates, responsive semantics and signed receipt controls',()=>{
 const id='55555555-5555-4555-8555-555555555555';
 const completed={id,requestor:'<svg onload=alert(1)>',reference:'G42 80H',
  completedAt:'2026-11-10T17:37:12Z'};
 const snap={...baseline,processedCount:1,recent:[completed]};
 const active=renderFuelTrackLightFuels({...args(snap),actionEnabled:true});
 assert.match(active,/class="ft3-light-history-table"/);
 assert.match(active,/class="ft3-light-history-row"/);
 assert.match(active,/data-label="Completed"/);
 assert.match(active,/Nov 11, 2026/);
 assert.match(active,/datetime="2026-11-10T17:37:12Z"/);
 assert.match(active,/&lt;svg onload=alert\(1\)&gt;/);
 assert.doesNotMatch(active,/<svg onload/);
 assert.match(active,/data-action="ft3-attach-receipt"/);
 assert.match(active,/Attach receipt if missing/);
 assert.match(active,/data-action="ft3-view-receipt"/);
 assert.match(active,/data-action="ft3-verify-receipt"/);
 assert.doesNotMatch(active,/Open receipt/);
 const blocked=renderFuelTrackLightFuels({...args(snap),actionEnabled:false});
 assert.match(blocked,/Admin access required/);
 assert.doesNotMatch(blocked,/data-action="ft3-attach-receipt"|data-action="ft3-view-receipt"|data-action="ft3-verify-receipt"/);
 const link=renderFuelTrackLightFuels({...args(snap),actionEnabled:true,receiptLink:{
  requestId:id,expiresAt:Date.now()+60000,href:'https://example.com/private-signed-receipt'
 }});
 assert.match(link,/Open receipt/);
 assert.match(link,/rel="noopener noreferrer"/);
 assert.doesNotMatch(link,/data-action="ft3-view-receipt"/);
 assert.match(link,/data-action="ft3-verify-receipt"/);
});

test('completed receipt attachment reuses existing signed Admin RPCs and never overwrites a registered receipt',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'ft3-attach-receipt':/);
 assert.match(app,/snapshot\?\.role!=='Admin'/);
 assert.match(app,/row\.state==='completed'/);
 assert.match(app,/existing\.status==='VERIFIED_RECEIPT'/);
 assert.match(app,/existing\.status!=='NO_RECEIPT'/);
 assert.match(app,/storage\.uploadAndRegister\(requestId,file\)/);
 assert.match(app,/storage\.verifyPrivateReceiptBinary\(requestId\)/);
 assert.match(app,/Receipt registered, but private binary verification failed/);
});
