import test from 'node:test';
import assert from 'node:assert/strict';
import {assertForegroundInteractionPage,cpuInterval,rpcSummary,workloadMode} from '../../scripts/lib/crm-signed-performance.mjs';

test('signed performance report accounts for bytes, latency and failed requests',()=>{
 const result=rpcSummary([{status:200,ms:3,bytes:120},{status:503,ms:9,bytes:20}]);
 assert.equal(result.requests,2);assert.equal(result.errors,1);
 assert.equal(result.responseBytes,140);assert.equal(result.latency.p95,9);
 assert.equal(rpcSummary([]).latency,null);
 for(const row of [{status:0,ms:1,bytes:1},{status:200,ms:NaN,bytes:1},{status:200,ms:1,bytes:-1}])
  assert.throws(()=>rpcSummary([row]));
});
test('host CPU interval rejects reset and invalid counters',()=>{
 assert.equal(cpuInterval({total:100,idle:40},{total:200,idle:120}),20);
 assert.throws(()=>cpuInterval({total:200,idle:100},{total:100,idle:40}));
 assert.throws(()=>cpuInterval({total:100,idle:40},{total:200,idle:200}));
});
test('matched sustained cohorts each run 30 minutes with the same phase schedule',()=>{
 const a=workloadMode('single'),b=workloadMode('dual');
 assert.deepEqual(a.phases,b.phases);
 assert.equal(a.phaseMs*a.phases.length,1800000);
 assert.equal(b.phaseMs*b.phases.length,1800000);
 assert.equal(a.windows,1);assert.equal(b.windows,2);
 assert.equal(workloadMode('smoke').phaseMs,35000);
 assert.throws(()=>workloadMode('production'));
});

test('interaction samples require a foreground browser page',()=>{
 assert.equal(assertForegroundInteractionPage('visible'),true);
 for(const state of ['hidden','prerender','unloaded',undefined,null])
  assert.throws(()=>assertForegroundInteractionPage(state),/foreground browser page/);
});
