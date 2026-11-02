import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPagesSmokeHead} from '../../scripts/pages-smoke-supersession.mjs';

const old='1d1d18064ea6d49f32daf6ba853ee9a0f31e3745';
const latest='c728fbdc948234cc72e9dd2425550f7c89b2cdab';

test('current main source must still undergo exact live Pages asset checks',()=>{
 assert.equal(classifyPagesSmokeHead(latest,latest),'CURRENT');
});
test('historical source is superseded only by verified fast-forward descendant',()=>{
 assert.equal(classifyPagesSmokeHead(old,latest,{
  status:'ahead',ahead_by:16,behind_by:0,merge_base_commit:{sha:old}
 }),'SUPERSEDED');
});
test('divergent, rewritten or unverified history cannot bypass live Pages gate',()=>{
 for(const comparison of [
  null,{status:'diverged',ahead_by:3,behind_by:4,merge_base_commit:{sha:old}},
  {status:'ahead',ahead_by:1,behind_by:0,merge_base_commit:{sha:latest}},
  {status:'ahead',ahead_by:0,behind_by:0,merge_base_commit:{sha:old}}
 ])assert.throws(()=>classifyPagesSmokeHead(old,latest,comparison),
  /refusing to skip/);
 assert.throws(()=>classifyPagesSmokeHead('not-a-sha',latest),/Invalid Git SHA/);
});
