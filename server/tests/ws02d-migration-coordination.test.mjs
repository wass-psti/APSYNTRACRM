import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const dir='sql/';
const read=name=>readFileSync(dir+name+'.sql','utf8');
test('a single specialized migration owns the FuelTrack backup import ceiling',()=>{
 const specialized=read('cp-ws02d-b3-fueltrack-import-ceiling-candidate');
 const remaining=execFileSync(process.execPath,['scripts/ws02d-d-compose-production-ceilings.mjs'],{encoding:'utf8'});
 assert.match(specialized,/CREATE OR REPLACE FUNCTION public\.import_fueltrack_activity_backup\(/);
 assert.doesNotMatch(remaining,/CREATE OR REPLACE FUNCTION public\.import_fueltrack_activity_backup\(/);
 assert.match(remaining,/6c6767c6982e908b1bfe4e2464d976a8/);
 assert.match(specialized,/private\.ws02d_workspace_ceiling\(ws,caller,'edit'\)/);
});
test('remaining domains never overwrite functions already rewritten by specialized migrations',()=>{
 const remaining=execFileSync(process.execPath,['scripts/ws02d-d-compose-production-ceilings.mjs'],{encoding:'utf8'});
 const modified=s=>new Set([...s.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map(m=>m[1]));
 const names=modified(remaining);
 for(const path of [
  'cp-ws02d-b2-board-acl-integration-candidate',
  'cp-ws02d-b2-board-create-ceiling-candidate',
  'cp-ws02d-b3-shared-module-mutation-ceiling-candidate',
  'cp-ws02d-b3-fueltrack-import-ceiling-candidate'
 ])for(const name of modified(read(path)))
  assert.equal(names.has(name),false,`Duplicate rewrite: ${name} in ${path}`);
});
