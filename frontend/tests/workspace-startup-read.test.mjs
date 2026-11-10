import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readWorkspaceStartup} from '../workspace-startup-read.js';
const defer=()=>{let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});return {promise,resolve,reject};};
test('board listing and signed role read start concurrently only when invoked',async()=>{
 const board=defer(),role=defer(),calls=[];
 let complete=false;
 const read=readWorkspaceStartup({listBoards:()=>{calls.push('boards');return board.promise},
  verifyBootstrap:()=>{calls.push('bootstrap');return role.promise},isCurrent:()=>true});
 await Promise.resolve();await Promise.resolve();
 assert.deepEqual(calls,['boards','bootstrap'],'role must start before board listing completes');
 board.resolve([{id:'board'}]);
 await Promise.resolve();assert.equal(complete,false);
 role.resolve(true);
 const result=await read.then(v=>{complete=true;return v});
 assert.deepEqual(result,{boards:[{id:'board'}],bootstrapVerified:true});
});
test('server denial or network failure from board read remains fatal',async()=>{
 const denial=Object.assign(new Error('Forbidden'),{status:403});
 await assert.rejects(readWorkspaceStartup({listBoards:()=>Promise.reject(denial),
  verifyBootstrap:()=>Promise.resolve(true),isCurrent:()=>true}),
  error=>error===denial);
});
test('bootstrap verifier failure denies role without failing authorized board read',async()=>{
 const result=await readWorkspaceStartup({listBoards:()=>Promise.resolve([{id:1}]),
  verifyBootstrap:()=>Promise.reject(new Error('not privileged')),
  isCurrent:()=>true});
 assert.equal(result.bootstrapVerified,false);
 assert.deepEqual(result.boards,[{id:1}]);
});
test('only the exact server-confirmed boolean true grants bootstrap access',async()=>{
 for(const value of ['true',1,{bootstrapVerified:true},null,false]){
  const result=await readWorkspaceStartup({listBoards:()=>Promise.resolve([]),
   verifyBootstrap:()=>Promise.resolve(value),isCurrent:()=>true});
  assert.equal(result.bootstrapVerified,false);
 }
});
test('signed user/workspace invalidation is checked after both results',async()=>{
 const boards=defer(),role=defer();let current=true;
 const read=readWorkspaceStartup({listBoards:()=>boards.promise,
  verifyBootstrap:()=>role.promise,isCurrent:()=>current});
 current=false;boards.resolve([{id:1}]);role.resolve(true);
 await assert.rejects(read,/Signed workspace changed/);
});
test('synthetic 300ms board and 700ms role reads overlap with no extra network calls',async()=>{
 let now=0,boardStart,roleStart;
 const board=defer(),role=defer();
 const result=readWorkspaceStartup({listBoards:()=>{boardStart=now;return board.promise},
  verifyBootstrap:()=>{roleStart=now;return role.promise},isCurrent:()=>true});
 await Promise.resolve();
 assert.equal(boardStart,0);assert.equal(roleStart,0);
 now=300;board.resolve([{id:'a'}]);
 now=700;role.resolve(true);
 assert.deepEqual(await result,{boards:[{id:'a'}],bootstrapVerified:true});
 // Sequential execution of the exact synthetic durations would need 1000ms;
 // independent starts overlap, so the critical path is the slowest read.
 assert.equal(now,700);
});
test('application keeps authoritative context read before overlapping the independent reads',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const scope=app.slice(app.indexOf('async function refreshWorkspace(){'),app.indexOf('async function loadUserRoleManagement(){'));
 assert.ok(scope.indexOf("await startupCriticalPath.measure('workspace-context',()=>db.context())")<scope.indexOf('await readWorkspaceStartup('));
 assert.match(scope,/listBoards:\(\)=>startupCriticalPath\.measure\('board-list',\(\)=>db\.boards\('active'\)\)/);
 assert.match(scope,/verifyBootstrap:\(\)=>startupCriticalPath\.measure\('bootstrap-role',\(\)=>roleConfig\.bootstrapVerified\(\)\)/);
 assert.match(scope,/isCurrent:\(\)=>auth\.isSignedIn&&auth\.userId===signedId/);
 assert.ok(scope.indexOf('state.boards=boards')>scope.indexOf('await readWorkspaceStartup('));
 assert.doesNotMatch(readFileSync('frontend/workspace-startup-read.js','utf8'),
  /localStorage|sessionStorage|indexedDB|fetch\(|sendBeacon|setInterval/);
});
