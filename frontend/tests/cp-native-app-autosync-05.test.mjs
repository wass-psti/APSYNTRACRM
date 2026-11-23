import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldRefreshNativeCatalogOnSync} from '../native-application-catalog.js';

const context={
 reason:'broadcast',view:'role-configuration',tab:'application-access',
 adminVerified:true,busy:false,now:60000,lastReadAt:10000
};

test('registered application broadcasts request one signed catalog revalidation',()=>{
 assert.equal(shouldRefreshNativeCatalogOnSync(context),true);
 assert.equal(shouldRefreshNativeCatalogOnSync({...context,lastReadAt:59000}),false);
 assert.equal(shouldRefreshNativeCatalogOnSync({...context,lastReadAt:45000}),true);
});

test('no extra registry reads in unrelated tabs, unsafe or busy states',()=>{
 for(const patch of [
  {view:'boards'},{tab:'roles'},{reason:'poll'},
  {reason:'focus'},{adminVerified:false},{busy:true},{now:0},
  {lastReadAt:59500}
 ])assert.equal(shouldRefreshNativeCatalogOnSync({...context,...patch}),false,
  JSON.stringify(patch));
});

test('broadcast propagation reads the signed snapshot and never uses payload as an assignment',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const start=app.indexOf('async function reconcilePlatformSync(');
 const end=app.indexOf('let workspaceRelationReadGeneration',start);
 assert.ok(start>=0&&end>start);
 const code=app.slice(start,end);
 assert.match(code,/shouldRefreshNativeCatalogOnSync\(/);
 assert.match(code,/await loadUserRoleManagement\(\)/);
 assert.match(code,/if\(!state\.context\|\|state\.context\.user_id!==userId/);
 assert.doesNotMatch(code,/moduleAssignments\s*=\s*event\./);
});
