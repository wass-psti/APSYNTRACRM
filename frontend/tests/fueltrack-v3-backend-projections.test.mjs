import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFuelTrackBackendSnapshot,projectFuelTrackApprovals,projectFuelTrackLightFuels} from '../fueltrack-v3-backend-projections.js';
import {fuelTrackApprovalModel} from '../fueltrack-v3-approvals.js';
import {fuelTrackLightFuelsModel} from '../fueltrack-v3-lightfuels.js';
const board='7af78b3f-67bf-4600-9aa1-9006d19d486e';
const workspace='11111111-1111-4111-8111-111111111111';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const row={id,kind:'vehicle',details:{plate:'GAN 8289'},state:'submitted',
 revision:1,requestor_name:'Person A',created_at:'2026-11-09T10:00:00Z'};
const summary={total:1,submitted:1,approved:0,rejected:0,refuelingDone:0,completed:0,
 approvedToday:0,rejectedToday:0,decisionsToday:0,pendingCount:1,
 activeQueue:0,completedToday:0,overdueCount:0};
const snap={status:'VERIFIED_READ',boardId:board,workspaceId:workspace,role:'Admin',
 rows:[row],summary};
test('strict workspace and board evidence are required',()=>{
 assert.equal(verifyFuelTrackBackendSnapshot({...snap,workspaceId:'foreign'},board,workspace),null);
 assert.equal(verifyFuelTrackBackendSnapshot({...snap,boardId:'foreign'},board,workspace),null);
 assert.equal(verifyFuelTrackBackendSnapshot({...snap,status:'UNVERIFIED'},board,workspace),null);
 assert.equal(verifyFuelTrackBackendSnapshot({...snap,rows:[row,row]},board,workspace),null);
 assert.equal(verifyFuelTrackBackendSnapshot(snap,board,workspace),snap);
});
test('Admin signed reads project correctly into existing Approvals model',()=>{
 const p=projectFuelTrackApprovals(verifyFuelTrackBackendSnapshot(snap,board,workspace));
 const model=fuelTrackApprovalModel({snapshot:p,boardId:board,workspaceId:workspace});
 assert.equal(model.pendingCount,1);
 assert.equal(model.pending[0].id,id);
 assert.equal(model.pending[0].revision,1);
});
test('User cannot infer an Admin approval or refueling queue',()=>{
 const visible=verifyFuelTrackBackendSnapshot({...snap,role:'User'},board,workspace);
 assert.equal(projectFuelTrackApprovals(visible),null);
 assert.equal(projectFuelTrackLightFuels(visible),null);
});
test('Approved requests flow to the existing LightFuels model without Board inference',()=>{
 const visible=verifyFuelTrackBackendSnapshot({...snap,rows:[{...row,state:'approved'}],
  summary:{...summary,submitted:0,approved:1,pendingCount:0,activeQueue:1}},board,workspace);
 const p=projectFuelTrackLightFuels(visible);
 const model=fuelTrackLightFuelsModel({snapshot:p,boardId:board,workspaceId:workspace});
 assert.equal(model.activeCount,1);
 assert.equal(model.queue[0].status,'Awaiting Refueling');
});
test('unrecognized status or invalid counts fail closed',()=>{
 assert.equal(verifyFuelTrackBackendSnapshot({...snap,rows:[{...row,state:'fabricated'}]},board,workspace),null);
 assert.equal(verifyFuelTrackBackendSnapshot({...snap,summary:{...summary,total:-1}},board,workspace),null);
});
