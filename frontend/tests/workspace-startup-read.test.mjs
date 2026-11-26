import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readWorkspaceStartup,transientBoardCatalogFailure} from '../workspace-startup-read.js';
const defer=()=>{let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});return {promise,resolve,reject};};
test('board catalog, bootstrap and CRM Admin reads start concurrently after context',async()=>{
 const board=defer(),bootstrap=defer(),admin=defer(),calls=[];
 let complete=false;
 const read=readWorkspaceStartup({
  listBoards:()=>{calls.push('boards');return board.promise},
  verifyBootstrap:()=>{calls.push('bootstrap');return bootstrap.promise},
  verifyAdmin:()=>{calls.push('admin');return admin.promise},
  isCurrent:()=>true
 });
 await Promise.resolve();await Promise.resolve();
 assert.deepEqual(calls,['boards','bootstrap','admin'],
  'all independent startup reads must start before any one of them completes');
 board.resolve([{id:'board'}]);
 await Promise.resolve();assert.equal(complete,false);
 bootstrap.resolve(true);admin.resolve(true);
 const result=await read.then(value=>{complete=true;return value});
 assert.deepEqual(result,{boards:[{id:'board'}],bootstrapVerified:true,adminVerified:true});
});
test('server denial or network failure from board read remains fatal',async()=>{
 const denial=Object.assign(new Error('Forbidden'),{status:403});
 await assert.rejects(readWorkspaceStartup({listBoards:()=>Promise.reject(denial),
  verifyBootstrap:()=>Promise.resolve(true),isCurrent:()=>true}),
  error=>error===denial);
});
test('native standalone startup can continue with an unavailable generic board catalog',async()=>{
 const failure=Object.assign(new Error('Catalog temporarily unavailable'),{status:503});
 const result=await readWorkspaceStartup({
  listBoards:()=>Promise.reject(failure),
  verifyBootstrap:()=>Promise.resolve(false),
  isCurrent:()=>true,
  allowBoardListFailure:true
 });
 assert.deepEqual(result.boards,[]);
 assert.equal(result.bootstrapVerified,false);
 assert.equal(result.boardCatalogError,failure);
});

test('native board-catalog fallback still rejects a changed signed workspace',async()=>{
 const failure=Object.assign(new Error('Catalog temporarily unavailable'),{status:503});
 await assert.rejects(readWorkspaceStartup({
  listBoards:()=>Promise.reject(failure),
  verifyBootstrap:()=>Promise.resolve(false),
  isCurrent:()=>false,
  allowBoardListFailure:true
 }),/Signed workspace changed/);
});

test('generic board startup remains fatal when its catalog is unavailable',async()=>{
 const failure=Object.assign(new Error('Catalog denied'),{status:403});
 await assert.rejects(readWorkspaceStartup({
  listBoards:()=>Promise.reject(failure),
  verifyBootstrap:()=>Promise.resolve(false),
  isCurrent:()=>true,
  allowBoardListFailure:false
 }),error=>error===failure);
});

test('failed role reads reject rather than misclassify a signed account',async()=>{
 for(const failedRole of ['bootstrap','admin']){
  const error=Object.assign(new Error('temporary role read failure'),{status:503,retryAttempts:1});
  await assert.rejects(readWorkspaceStartup({
   listBoards:async()=>[{id:1}],
   verifyBootstrap:async()=>{if(failedRole==='bootstrap')throw error;return true;},
   verifyAdmin:async()=>{if(failedRole==='admin')throw error;return true;},
   isCurrent:()=>true
  }),observed=>observed===error);
 }
});
test('explicit negative role decisions still resolve ordinary account startup',async()=>{
 assert.deepEqual(await readWorkspaceStartup({listBoards:async()=>[{id:1}],
  verifyBootstrap:async()=>false,verifyAdmin:async()=>false,isCurrent:()=>true}),
  {boards:[{id:1}],bootstrapVerified:false,adminVerified:false});
});
test('CRM Admin verification accepts only exact server-confirmed boolean true',async()=>{
 for(const value of ['true',1,{adminVerified:true},null,false]){
  const result=await readWorkspaceStartup({
   listBoards:()=>Promise.resolve([]),
   verifyBootstrap:()=>Promise.resolve(false),
   verifyAdmin:()=>Promise.resolve(value),
   isCurrent:()=>true
  });
  assert.equal(result.adminVerified,false);
 }
});
test('only the exact server-confirmed boolean true grants bootstrap access',async()=>{
 for(const value of ['true',1,{bootstrapVerified:true},null,false]){
  const result=await readWorkspaceStartup({listBoards:()=>Promise.resolve([]),
   verifyBootstrap:()=>Promise.resolve(value),isCurrent:()=>true});
  assert.equal(result.bootstrapVerified,false);
 }
});
test('signed user/workspace invalidation is checked after all startup reads',async()=>{
 const boards=defer(),bootstrap=defer(),admin=defer();let current=true;
 const read=readWorkspaceStartup({listBoards:()=>boards.promise,
  verifyBootstrap:()=>bootstrap.promise,verifyAdmin:()=>admin.promise,
  isCurrent:()=>current});
 current=false;boards.resolve([{id:1}]);bootstrap.resolve(true);admin.resolve(true);
 await assert.rejects(read,/Signed workspace changed/);
});
test('synthetic 300ms catalog, 700ms bootstrap and 500ms admin reads overlap',async()=>{
 let now=0,boardStart,bootstrapStart,adminStart;
 const board=defer(),bootstrap=defer(),admin=defer();
 const result=readWorkspaceStartup({
  listBoards:()=>{boardStart=now;return board.promise},
  verifyBootstrap:()=>{bootstrapStart=now;return bootstrap.promise},
  verifyAdmin:()=>{adminStart=now;return admin.promise},
  isCurrent:()=>true
 });
 await Promise.resolve();
 assert.equal(boardStart,0);assert.equal(bootstrapStart,0);assert.equal(adminStart,0);
 now=300;board.resolve([{id:'a'}]);
 now=500;admin.resolve(true);
 now=700;bootstrap.resolve(true);
 assert.deepEqual(await result,{boards:[{id:'a'}],bootstrapVerified:true,adminVerified:true});
 // Sequential execution would need 1500ms; the critical path is the 700ms read.
 assert.equal(now,700);
});
test('application keeps authoritative context read before overlapping the independent reads',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const scope=app.slice(app.indexOf('async function refreshWorkspace(){'),app.indexOf('async function loadUserRoleManagement(){'));
 assert.ok(scope.indexOf("await startupCriticalPath.measure('workspace-context',()=>db.context())")<scope.indexOf('await readWorkspaceStartup('));
 assert.match(scope,/listBoards:\(\)=>startupCriticalPath\.measure\('board-list',\(\)=>db\.boards\('active'\)\)/);
 assert.match(scope,/verifyBootstrap:\(\)=>startupCriticalPath\.measure\('bootstrap-role',\(\)=>roleConfig\.bootstrapVerified\(\)\)/);
 assert.match(scope,/verifyAdmin:\(\)=>startupCriticalPath\.measure\('admin-role',\(\)=>roleConfig\.adminVerified\(\)\)/);
 assert.match(scope,/state\.adminVerified=adminVerified/);
 assert.doesNotMatch(scope,/state\.adminVerified=await roleConfig\.adminVerified/);
 assert.match(scope,/isCurrent:\(\)=>auth\.isSignedIn&&auth\.userId===signedId/);
 assert.match(scope,/allowBoardListFailure=workspaceRouteAllowsBoardCatalogFallback\(location\.hash\)/);
 assert.match(scope,/state\.boardCatalogError=boardCatalogError\?errorMessage\(boardCatalogError\):''/);
 assert.match(app,/state\.adminVerified,state\.boardCatalogError,name\(\)/);
 assert.match(app,/Retry workspace refresh/);
 assert.match(app,/Native application access refreshed; board catalog remains unavailable/);
 assert.match(app,/data-action=\"refresh\"/);
 assert.ok(scope.indexOf('state.boards=boards')>scope.indexOf('await readWorkspaceStartup('));
 assert.doesNotMatch(readFileSync('frontend/workspace-startup-read.js','utf8'),
  /localStorage|sessionStorage|indexedDB|fetch\(|sendBeacon|setInterval/);
});

test("native Board-catalog recovery admits temporary network and server outages only", async () => {
  for (const failure of [
    { status: 408 },
    { status: 429 },
    { status: 500 },
    { status: 502 },
    { status: 503 },
    { status: 504 },
    { status: 521 },
    { code: "NETWORK_UNAVAILABLE" },
    { code: "REQUEST_TIMEOUT" },
    { status: 503, retryAttempts: 2 },
  ]) {
    assert.equal(
      transientBoardCatalogFailure(failure),
      true,
      JSON.stringify(failure),
    );
    const snapshot = await readWorkspaceStartup({
      listBoards: () =>
        Promise.reject(Object.assign(new Error("temporary outage"), failure)),
      verifyBootstrap: async () => false,
      isCurrent: () => true,
      allowBoardListFailure: true,
    });
    assert.deepEqual(snapshot.boards, []);
    assert.ok(snapshot.boardCatalogError);
  }
});
test("native Board-catalog fallback never masks authoritative denial, missing Board or invalid scope", async () => {
  for (const failure of [
    { status: 401 },
    { status: 403 },
    { status: 404 },
    { status: 409 },
    { status: 422 },
    { code: "42501" },
    { code: "INVALID_NATIVE_APPLICATION_CONTEXT" },
    {},
  ]) {
    assert.equal(
      transientBoardCatalogFailure(failure),
      false,
      JSON.stringify(failure),
    );
    const error = Object.assign(new Error("definitive failure"), failure);
    await assert.rejects(
      readWorkspaceStartup({
        listBoards: () => Promise.reject(error),
        verifyBootstrap: async () => false,
        isCurrent: () => true,
        allowBoardListFailure: true,
      }),
      (observed) => observed === error,
    );
  }
});
test("native degraded startup remains scoped and never upgrades bootstrap privileges", async () => {
  const failing = Object.assign(Error("network unavailable"), { status: 503 });
  await assert.rejects(
    readWorkspaceStartup({
      listBoards: () => Promise.reject(failing),
      verifyBootstrap: async () => true,
      isCurrent: () => false,
      allowBoardListFailure: true,
    }),
    /Signed workspace changed/,
  );
  const ok = await readWorkspaceStartup({
    listBoards: () => Promise.reject(failing),
    verifyBootstrap: async () => false,
    isCurrent: () => true,
    allowBoardListFailure: true,
  });
  assert.equal(ok.bootstrapVerified, false);
});
test("context read completes before cache sync teardown to preserve visible Board on outage", () => {
  const app = readFileSync("frontend/app.js", "utf8");
  const start = app.indexOf("async function refreshWorkspace(){");
  const end = app.indexOf("async function loadUserRoleManagement(){");
  const block = app.slice(start, end);
  const context = block.indexOf(
    "const incomingContext=await startupCriticalPath.measure('workspace-context',()=>db.context());",
  );
  const stop = block.indexOf(
    "boardCacheChannel.stop();db.invalidateBoardCache();",
  );
  const commit = block.indexOf("state.context=mergeProfileAvatarContext(");
  assert.ok(
    context >= 0 && stop > context && commit > stop,
    "the signed context must resolve before rotating workspace cache and sync",
  );
  assert.match(
    block,
    /boardCacheChannel.start\(\{userId:state.context\?\.user_id,workspaceId:state.context\?\.workspace_id\}\)/,
  );
  assert.match(
    block,
    /if\(priorIdentity!==state.context\?\.user_id\|\|priorWorkspace!==state.context\?\.workspace_id\)/,
  );
});


test('optional signed-browser acceptance tools do not require Playwright during unit-test module import',()=>{
 for(const file of ['cp-crm-native-access-final02-signed-matrix.mjs','cp-crm-native-access-final04-board-linked.mjs']){
  const contents=readFileSync('scripts/'+file,'utf8');
  assert.doesNotMatch(contents,/^import\s+.*from\s+['"]playwright['"];?/m);
  assert.match(contents,/const \{ chromium \} = await import\(['"]playwright['"]\)/);
  assert.ok(contents.indexOf('await import("playwright")')>contents.indexOf('import.meta.url'),
   'only the executable browser path may load the optional dependency');
 }
});
