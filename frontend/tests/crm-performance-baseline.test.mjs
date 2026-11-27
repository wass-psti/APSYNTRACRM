import test from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkInventory,summarizeSamples,summarizeRows} from '../../scripts/lib/crm-performance-baseline.mjs';
import {WORK_MANAGEMENT_APPLICATIONS} from '../workspace-application-ownership.js';

test('baseline inventory includes every registered application and canonical destination',()=>{
 const inventory=benchmarkInventory();
 assert.equal(inventory.length,WORK_MANAGEMENT_APPLICATIONS.length);
 assert.equal(new Set(inventory.map(app=>app.id)).size,inventory.length);
 for(const app of inventory){
  assert.match(app.route,/^#\//);
  assert.ok(!app.route.includes(':boardId'));
  assert.ok(WORK_MANAGEMENT_APPLICATIONS.some(source=>source.id===app.id));
 }
});
test('nearest-rank percentile includes tail observations and preserves input order',()=>{
 const samples=Array.from({length:30},(_,i)=>30-i);
 assert.deepEqual(summarizeSamples(samples),{samples:30,min:1,p50:15,p95:29,max:30,mean:15.5});
 assert.equal(samples[0],30);
 assert.equal(summarizeSamples([0]).p95,0);
});
test('invalid or missing observations fail rather than report artificial zeroes',()=>{
 for(const invalid of [[],[NaN],[Infinity],[-1],[null]])assert.throws(()=>summarizeSamples(invalid));
 assert.throws(()=>summarizeRows([{ms:1},{}],['ms']));
 assert.equal(summarizeRows([{ms:2},{ms:4}],['ms']).ms.mean,3);
});
