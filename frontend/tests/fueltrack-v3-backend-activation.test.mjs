import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFuelTrackNewRequest,fuelTrackNewRequestPayload} from '../fueltrack-v3-new-request.js';
import {FUELTRACK_PLATE_OPTIONS,FUELTRACK_PERSON_OPTIONS} from '../fueltrack-v3-reference-options.js';
import {renderFuelTrackApprovals} from '../fueltrack-v3-approvals.js';
import {renderFuelTrackLightFuels} from '../fueltrack-v3-lightfuels.js';
import {verifyFuelTrackBackendSnapshot,projectFuelTrackApprovals,projectFuelTrackLightFuels}
 from '../fueltrack-v3-backend-projections.js';
const board='7af78b3f-67bf-4600-9aa1-9006d19d486e';
const workspace='11111111-1111-4111-8111-111111111111';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const row={id,kind:'vehicle',details:{plate:'GAN 8289'},state:'submitted',
 revision:1,requestor_name:'Person A',created_at:'2026-11-09T10:00:00Z'};
const summary={total:1,submitted:1,approved:0,rejected:0,refuelingDone:0,completed:0,
 approvedToday:0,rejectedToday:0,decisionsToday:0,pendingCount:1,
 activeQueue:0,completedToday:0,overdueCount:0};
const snapshot={status:'VERIFIED_READ',boardId:board,workspaceId:workspace,
 role:'Admin',rows:[row],summary};
function fakeForm(kind,fields){
 return {querySelector(selector){return selector==='[name="ft3-fuel-mode"]:checked'?
  {value:kind}:{value:fields[selector.slice(1)]??''};}};
}
test('request submit is disabled without verified backend, but available to signed module members',()=>{
 const blocked=renderFuelTrackNewRequest();
 const enabled=renderFuelTrackNewRequest({enabled:true});
 assert.match(blocked,/class="ft3-new-submit" disabled/);
 assert.match(enabled,/type="submit" class="ft3-new-submit" aria-describedby/);
 assert.match(enabled,/id="ft3-new-request-form"/);
});
test('new request directs signed Admin to real post-refueling receipt workflow without false capture',()=>{
 const admin=renderFuelTrackNewRequest({enabled:true,receiptHref:'#/boards/board/fueltrack/lightfuels'});
 assert.match(admin,/Capture Receipt \/ Photo in LightFuels/);
 assert.match(admin,/approved and marked Refueling Done/);
 assert.doesNotMatch(admin,/Capture Receipt \/ Photo — unavailable/);
 const user=renderFuelTrackNewRequest({enabled:true});
 assert.doesNotMatch(user,/ft3-receipt-action/);
 const blocked=renderFuelTrackNewRequest();
 assert.doesNotMatch(blocked,/Go to LightFuels receipt upload/);
 assert.match(blocked,/Requests cannot be saved until the connection succeeds/);
 assert.match(blocked,/Retry signed FuelTrack connection/);
});
test('vehicle input payload is strictly bounded to authorized form controls',()=>{
 const fields={
  'ft3-plate':FUELTRACK_PLATE_OPTIONS[0],
  'ft3-owner':FUELTRACK_PERSON_OPTIONS[0],
  'ft3-origin':'Office','ft3-destination':'Depot',
  'ft3-purpose':'Refuel for scheduled operations',
  'ft3-odometer':'39264','ft3-distance':'77.2'
 };
 const payload=fuelTrackNewRequestPayload(fakeForm('vehicle',fields));
 assert.deepEqual(Object.keys(payload.details),['plate','owner','origin','destination','purpose','odometer','distance']);
 assert.equal(payload.details.distance,77.2);
 assert.throws(()=>fuelTrackNewRequestPayload(fakeForm('vehicle',{...fields,'ft3-plate':'UNKNOWN'})),/required vehicle/);
});
test('container payload validates custom quantity and responsible person',()=>{
 const fields={'ft3-quantity':'custom','ft3-custom-count':'7',
  'ft3-responsible':FUELTRACK_PERSON_OPTIONS[1],
  'ft3-container-purpose':'Refill containers for site work'};
 const payload=fuelTrackNewRequestPayload(fakeForm('container',fields));
 assert.deepEqual(payload.details,{containerCount:7,responsiblePerson:fields['ft3-responsible'],
  purpose:fields['ft3-container-purpose']});
 assert.throws(()=>fuelTrackNewRequestPayload(fakeForm('container',{...fields,
  'ft3-custom-count':'0'})),/valid container quantity/);
});
test('only a verified Admin record enables approval and rejection buttons',()=>{
 const signed=verifyFuelTrackBackendSnapshot(snapshot,board,workspace);
 const p=projectFuelTrackApprovals(signed);
 const blocked=renderFuelTrackApprovals({snapshot:p,boardId:board,workspaceId:workspace});
 const active=renderFuelTrackApprovals({snapshot:p,boardId:board,workspaceId:workspace,
  actionEnabled:true});
 assert.doesNotMatch(blocked,/data-action="ft3-approve"/);
 assert.match(active,/data-action="ft3-approve"/);
 assert.match(active,/data-action="ft3-reject"/);
});
test('refueling transitions permit mark first and receipt details second',()=>{
 const approved={...snapshot,rows:[{...row,state:'approved'}],
  summary:{...summary,submitted:0,approved:1,pendingCount:0,activeQueue:1}};
 const p=projectFuelTrackLightFuels(verifyFuelTrackBackendSnapshot(approved,board,workspace));
 const active=renderFuelTrackLightFuels({snapshot:p,boardId:board,workspaceId:workspace,
  actionEnabled:true});
 assert.match(active,/data-action="ft3-mark-refueled"/);
 const refueled={...approved,rows:[{...row,state:'refueling_done',revision:2}],
  summary:{...approved.summary,approved:0,refuelingDone:1}};
 const next=projectFuelTrackLightFuels(verifyFuelTrackBackendSnapshot(refueled,board,workspace));
 const html=renderFuelTrackLightFuels({snapshot:next,boardId:board,workspaceId:workspace,
  actionEnabled:true});
 assert.match(html,/data-ft3-receipt=/);
 assert.match(html,/Save & Complete/);
 assert.doesNotMatch(html,/data-action="ft3-mark-refueled"/);
});

test('existing completed records offer explicit nonmutating signed receipt byte verification only to Admin editor',()=>{
 const completed={...snapshot,rows:[{...row,state:'completed',completed_at:'2026-11-10T04:00:00Z'}],
  summary:{...summary,submitted:0,completed:1,pendingCount:0,activeQueue:0}};
 const data=projectFuelTrackLightFuels(verifyFuelTrackBackendSnapshot(completed,board,workspace));
 const active=renderFuelTrackLightFuels({snapshot:data,boardId:board,workspaceId:workspace,
  actionEnabled:true});
 assert.match(active,/data-action="ft3-verify-receipt"/);
 assert.match(active,/Verify private receipt bytes/);
 const denied=renderFuelTrackLightFuels({snapshot:data,boardId:board,workspaceId:workspace});
 assert.doesNotMatch(denied,/data-action="ft3-verify-receipt"/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'ft3-verify-receipt'/);
 assert.match(app,/verifyPrivateReceiptBinary\(requestId\)/);
});
