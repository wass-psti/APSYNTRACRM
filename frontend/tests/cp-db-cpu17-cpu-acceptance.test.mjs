import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCpuEvidence} from '../../scripts/cp-db-cpu17-acceptance.mjs';
const start='2026-11-17T06:00:00Z',end='2026-11-17T06:30:00Z';
const base={
 window_start:start,window_end:end,cpu_samples_pct:[40,42,38],
 active_users:2,active_windows:4,workflow_events:50,cohort:'same-signed-workspace',
 rpc_requests:{wm_list_boards:120,wm_auth_access_context:240,work_board_access:240},
 rpc_errors:0,signed_regression_passed:true,integrity_verified:true
};
const after={...base,cpu_samples_pct:[3,4,2],workflow_events:48,
 rpc_requests:{wm_list_boards:60,wm_auth_access_context:120,work_board_access:120}};
test('comparable CPU and API reductions pass without inventing per-query CPU attribution',()=>{
 const result=compareCpuEvidence(base,after);
 assert.equal(result.status,'VERIFIED');
 assert.equal(result.cpu_percentage_point_change,-37);
 assert.equal(result.rpc_rates.wm_list_boards.change_percent,-50);
 assert.deepEqual(result.blockers,[]);
});
test('single dashboard CPU observation is never certified as historical CPU reduction',()=>{
 const result=compareCpuEvidence({...base,cpu_samples_pct:[]},{...after,cpu_samples_pct:[3]});
 assert.equal(result.status,'INDETERMINATE');
 assert.match(result.blockers.join(' '),/three CPU samples/);
});
test('missing or changed signed cohort prevents false workload comparisons',()=>{
 const result=compareCpuEvidence(base,{...after,cohort:'another-workspace'});
 assert.equal(result.status,'INDETERMINATE');
 assert.match(result.blockers.join(' '),/cohort/);
});
test('failed runtime and persistence acceptance cannot be called complete',()=>{
 const result=compareCpuEvidence(base,{...after,integrity_verified:false});
 assert.equal(result.status,'INDETERMINATE');
 assert.match(result.blockers.join(' '),/data-integrity/);
});
test('CPU increase and application RPC error regression are rejected',()=>{
 const result=compareCpuEvidence(base,{...after,cpu_samples_pct:[50,51,52],rpc_errors:1});
 assert.equal(result.status,'INDETERMINATE');
 assert.match(result.blockers.join(' '),/CPU reduction/);
 assert.match(result.blockers.join(' '),/RPC errors increased/);
});
test('unequal sample lengths and changed business workload are not misrepresented',()=>{
 const result=compareCpuEvidence(base,{...after,window_end:'2026-11-17T06:10:00Z',workflow_events:10});
 assert.equal(result.status,'INDETERMINATE');
 assert.match(result.blockers.join(' '),/15 minutes/);
 assert.match(result.blockers.join(' '),/workflow volume/);
});
test('invalid inputs fail clearly',()=>{
 assert.throws(()=>compareCpuEvidence({...base,cpu_samples_pct:[101]},after),/percentages/);
 assert.throws(()=>compareCpuEvidence(base,{...after,rpc_requests:{wm_list_boards:-1}}),/invalid wm_list_boards/);
});
