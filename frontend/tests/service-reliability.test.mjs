import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AuthClient,ApiError} from '../session.js';
import {DomainApi} from '../data.js';
import {PlatformSync,shouldRecheckWorkspaceRoles} from '../platform-sync.js';

const userId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const boardId='33333333-3333-4333-8333-333333333333';
const response=(status=200,value={ok:true})=>new Response(JSON.stringify(value),{
 status,headers:{'Content-Type':'application/json'}
});
function authFixture({fetchImpl,wait=async()=>{},random=()=>0,requestTimeoutMs=1000}={}){
 const values=new Map();
 const auth=new AuthClient({fetchImpl,wait,random,requestTimeoutMs,
  storage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}});
 auth.save({access_token:'signed-access',refresh_token:'signed-refresh',expires_in:3600,user:{id:userId}});
 return auth;
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

test('safe signed read retries one transient network failure with bounded jitter',async()=>{
 let calls=0;const waits=[];
 const auth=authFixture({fetchImpl:async()=>{
  calls++;if(calls===1)throw new TypeError('connection reset');return response();
 },wait:async ms=>waits.push(ms),random:()=>0.5});
 const result=await auth.authorized('/rest/v1/rpc/wm_get_board_shell',{
  method:'POST',body:{p_board_id:boardId},requestKind:'read',retryableRead:true
 });
 assert.deepEqual(result,{ok:true});assert.equal(calls,2);assert.deepEqual(waits,[313]);
});

test('safe signed read retries one transient gateway response, but not a semantic conflict',async()=>{
 let calls=0;
 const auth=authFixture({fetchImpl:async()=>++calls===1?response(503,{message:'temporary'}):response()});
 assert.deepEqual(await auth.authorized('/rest/v1/rpc/wm_get_board_shell',{
  method:'POST',body:{},retryableRead:true
 }),{ok:true});
 assert.equal(calls,2);
 let conflictCalls=0;
 const conflict=authFixture({fetchImpl:async()=>{conflictCalls++;return response(409,{message:'revision conflict'});}});
 await assert.rejects(()=>conflict.authorized('/rest/v1/rpc/wm_get_board_shell',{
  method:'POST',body:{},retryableRead:true
 }),error=>error.status===409);
 assert.equal(conflictCalls,1);
});

test('rate-limited reads honor Retry-After and remain bounded to one retry',async()=>{
 let calls=0;const waits=[];
 const auth=authFixture({fetchImpl:async()=>++calls===1?
  new Response(JSON.stringify({message:'rate limited'}),{status:429,headers:{'Retry-After':'1'}}):response(),
  wait:async ms=>waits.push(ms)});
 assert.deepEqual(await auth.authorized('/rest/v1/rpc/wm_get_board_shell',{
  method:'POST',body:{},retryableRead:true
 }),{ok:true});
 assert.equal(calls,2);assert.deepEqual(waits,[1000]);
});

test('mutating RPC is never automatically retried after transport failure or timeout',async()=>{
 let calls=0;
 const auth=authFixture({fetchImpl:async()=>{calls++;throw new TypeError('connection reset');}});
 await assert.rejects(()=>auth.authorized('/rest/v1/rpc/wm_update_board_item',{
  method:'POST',body:{p_item_id:boardId},requestKind:'mutation'
 }),error=>error.code==='NETWORK_UNAVAILABLE'&&error.mayHaveCommitted===true);
 assert.equal(calls,1);
 let timeoutCalls=0;
 const timed=authFixture({requestTimeoutMs:10,fetchImpl:async()=>{timeoutCalls++;return new Promise(()=>{});}});
 await assert.rejects(()=>timed.authorized('/rest/v1/rpc/wm_update_board_item',{
  method:'POST',body:{p_item_id:boardId},requestKind:'mutation'
 }),error=>error.code==='REQUEST_TIMEOUT'&&error.mayHaveCommitted===true&&error.phase==='request');
 assert.equal(timeoutCalls,1);
});

test('safe read timeout retries once and a second timeout is returned without a retry storm',async()=>{
 let calls=0,waits=0;
 const auth=authFixture({requestTimeoutMs:10,fetchImpl:async()=>{
  calls++;if(calls===1)return new Promise(()=>{});return response();
 },wait:async()=>{waits++;}});
 assert.deepEqual(await auth.authorized('/rest/v1/rpc/wm_get_board_shell',{
  method:'POST',body:{},retryableRead:true
 }),{ok:true});
 assert.equal(calls,2);assert.equal(waits,1);
 let failures=0;
 const exhausted=authFixture({requestTimeoutMs:10,fetchImpl:async()=>{failures++;return new Promise(()=>{});},wait:async()=>{}});
 await assert.rejects(()=>exhausted.authorized('/rest/v1/rpc/wm_get_board_shell',{
  method:'POST',body:{},retryableRead:true
 }),error=>error.code==='REQUEST_TIMEOUT'&&error.phase==='request');
 assert.equal(failures,2);
});

test('response-body stream interruption is classified as network failure, not malformed JSON',async()=>{
 const auth=authFixture({fetchImpl:async()=>({ok:true,status:200,text:async()=>{throw new TypeError('stream interrupted');}})});
 await assert.rejects(()=>auth.call('/rest/v1/rpc/wm_get_board_shell',{
  method:'POST',body:{},requestKind:'read'
 }),error=>error instanceof ApiError&&error.code==='NETWORK_UNAVAILABLE'&&error.phase==='response-body');
});

test('aborted reads are not retried and stale response body cannot be accepted',async()=>{
 let calls=0;
 const controller=new AbortController();
 const auth=authFixture({fetchImpl:async(_url,init)=>{
  calls++;
  return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 }});
 const pending=auth.authorized('/rest/v1/rpc/wm_get_board_shell',{
  method:'POST',body:{},retryableRead:true,signal:controller.signal
 });
 await Promise.resolve();await Promise.resolve();controller.abort();
 await assert.rejects(()=>pending,error=>error.code==='REQUEST_ABORTED');
 assert.equal(calls,1);
});

test('verified user reads are coalesced only while the same signed identity request is pending',async()=>{
 const gate=deferred();let calls=0;
 const auth=authFixture({fetchImpl:async()=>{calls++;await gate.promise;return response(200,{id:userId,email:'user@example.test'});}});
 const first=auth.getVerifiedUser(),second=auth.getVerifiedUser();
 await Promise.resolve();await Promise.resolve();
 assert.equal(calls,1);
 gate.resolve();
 const [a,b]=await Promise.all([first,second]);
 assert.equal(a.id,userId);assert.equal(b.id,userId);assert.equal(calls,1);
});

test('verified identity reads reuse the same server-verified user for 30 seconds',async()=>{
 let now=1700000000000,userReads=0;
 const values=new Map();
 const auth=new AuthClient({
  clock:()=>now,
  fetchImpl:async url=>{
   if(url.endsWith('/auth/v1/user')){
    userReads++;
    return response(200,{id:userId,email:'user@example.test'});
   }
   throw Error('Unexpected auth request: '+url);
  },
  storage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}
 });
 auth.save({access_token:'signed-access',refresh_token:'signed-refresh',expires_in:3600,user:{id:userId}});
 for(let index=0;index<1000;index++)
  assert.equal((await auth.getVerifiedUser()).id,userId);
 assert.equal(userReads,1);
 now+=30001;
 await auth.getVerifiedUser();
 assert.equal(userReads,2);
 await auth.getVerifiedUser({fresh:true});
 assert.equal(userReads,3);
});

test('a newer in-memory access token is reused after 401 before attempting refresh',async()=>{
 let auth,apiCalls=0,refreshCalls=0;
 const values=new Map();
 auth=new AuthClient({
  clock:()=>1700000000000,
  fetchImpl:async(url,options)=>{
   if(url.includes('/auth/v1/token?grant_type=refresh_token')){
    refreshCalls++;
    return response(200,{access_token:'unneeded-access',refresh_token:'unneeded-refresh',
     expires_in:3600,user:{id:userId}});
   }
   if(url.endsWith('/rest/v1/rpc/session-continuity-test')){
    apiCalls++;
    if(apiCalls===1){
     auth.save({access_token:'newer-access',refresh_token:'newer-refresh',
      expires_in:3600,user:{id:userId}});
     return response(401,{message:'Expired token'});
    }
    assert.equal(options.headers.Authorization,'Bearer newer-access');
    return response(200,{ok:true});
   }
   throw Error('Unexpected request: '+url);
  },
  storage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}
 });
 auth.save({access_token:'old-access',refresh_token:'old-refresh',expires_in:3600,user:{id:userId}});
 const result=await auth.authorized('/rest/v1/rpc/session-continuity-test',{
  method:'POST',body:{},requestKind:'read'
 });
 assert.deepEqual(result,{ok:true});
 assert.equal(apiCalls,2);
 assert.equal(refreshCalls,0);
});

test('concurrent token refresh requests share one refresh-token exchange',async()=>{
 const gate=deferred();let calls=0;
 const now=1700000000000;
 const auth=new AuthClient({clock:()=>now,fetchImpl:async(url,options)=>{
  calls++;assert.ok(url.includes('/auth/v1/token?grant_type=refresh_token'));
  assert.equal(options.method,'POST');
  await gate.promise;
  return response(200,{access_token:'rotated-access',refresh_token:'rotated-refresh',
   expires_in:3600,user:{id:userId}});
 },storage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}});
 auth.save({access_token:'old-access',refresh_token:'old-refresh',expires_in:1,user:{id:userId}});
 const first=auth.token(),second=auth.token();
 await Promise.resolve();await Promise.resolve();
 assert.equal(calls,1);
 gate.resolve();
 assert.deepEqual(await Promise.all([first,second]),['rotated-access','rotated-access']);
 assert.equal(calls,1);
});

test('DomainApi coalesces startup context and board-list reads without caching completed results',async()=>{
 const gate=deferred(),calls=[];
 const auth={userId,accessToken:'signed-token',authorized:async(path,options)=>{
  calls.push({path,options});await gate.promise;
  return path.endsWith('/wm_auth_access_context')?
   {user_id:userId,workspace_id:workspaceId,profile:{status:'active'}}:[];
 }};
 const api=new DomainApi(auth);
 const contextA=api.context(),contextB=api.context();
 const boardsA=api.boards('active'),boardsB=api.boards('active');
 await Promise.resolve();await Promise.resolve();
 assert.equal(calls.length,2,'one context request and one board-list request');
 gate.resolve();
 const [a,b,firstBoards,secondBoards]=await Promise.all([contextA,contextB,boardsA,boardsB]);
 assert.equal(a.user_id,userId);assert.equal(b.user_id,userId);
 assert.notEqual(a,b,'each caller receives an isolated context object');
 assert.deepEqual(firstBoards,[]);assert.deepEqual(secondBoards,[]);
 assert.notEqual(firstBoards,secondBoards,'board-list arrays are isolated');
 assert.equal(calls.filter(call=>call.path.endsWith('/wm_auth_access_context')).length,1);
 assert.equal(calls.filter(call=>call.path.endsWith('/wm_list_boards')).length,1);
});

test('DomainApi coalesces identical allowlisted read RPCs in flight, but never caches completed results',async()=>{
 const gate=deferred(),calls=[];
 const auth={userId,accessToken:'signed-token',authorized:async(path,options)=>{
  calls.push({path,options});await gate.promise;return {ok:true};
 }};
 const api=new DomainApi(auth);
 const a=api.rpc('work_board_access',{p_board_id:boardId,p_required:'view'});
 const b=api.rpc('work_board_access',{p_required:'view',p_board_id:boardId});
 await Promise.resolve();
 assert.equal(calls.length,1);
 gate.resolve();await Promise.all([a,b]);
 assert.equal(calls[0].options.retryableRead,true);
 assert.equal(calls[0].options.requestKind,'read');
 await api.rpc('work_board_access',{p_board_id:boardId,p_required:'view'});
 assert.equal(calls.length,2,'settled read result is not cached');
});

test('unreviewed RPC cannot opt into preflight caching with a caller-supplied read hint',async()=>{
 const calls=[];
 const auth=authFixture({fetchImpl:async(url,options)=>{
  calls.push({url,options});return response();
 }});
 const api=new DomainApi(auth);
 await api.rpc('unreviewed_read_rpc',{}, {requestKind:'read'});
 assert.equal(calls.length,1);
 assert.ok(calls[0].url.endsWith('/rest/v1/rpc/unreviewed_read_rpc'));
 assert.equal(calls[0].options.cache,'no-store');
});

test('DomainApi does not deduplicate writes and separates reads across signed token generations',async()=>{
 const gate=deferred(),calls=[];
 const auth={userId,accessToken:'token-a',authorized:async(path,options)=>{
  calls.push({path,options});await gate.promise;return {ok:true};
 }};
 const api=new DomainApi(auth);
 const a=api.rpc('work_board_access',{p_board_id:boardId,p_required:'view'});
 auth.accessToken='token-b';
 const b=api.rpc('work_board_access',{p_board_id:boardId,p_required:'view'});
 const writeA=api.rpc('wm_update_board_item',{p_item_id:boardId});
 const writeB=api.rpc('wm_update_board_item',{p_item_id:boardId});
 await Promise.resolve();assert.equal(calls.length,4);
 gate.resolve();await Promise.all([a,b,writeA,writeB]);
 assert.equal(calls.filter(x=>x.path.endsWith('/wm_update_board_item')).length,2);
 assert.ok(calls.filter(x=>x.path.endsWith('/wm_update_board_item')).every(x=>x.options.retryableRead===false));
});

test('Realtime connection attempts share one in-flight authentication and one socket',async()=>{
 const gate=deferred();let userReads=0,contextReads=0;
 const sockets=[];
 class Socket{constructor(url){this.url=url;this.readyState=0;sockets.push(this);}close(){this.readyState=3;}send(){}}
 const auth={isSignedIn:true,userId,async getVerifiedUser(){userReads++;await gate.promise;return {id:userId};},async token(){return 'signed-token';}};
 const api={async context(){contextReads++;return {user_id:userId,workspace_id:workspaceId};}};
 const ctl=new PlatformSync({auth,api,url:'https://project.supabase.co',publishableKey:'sb_publishable_test',
  WebSocketImpl:Socket,visible:()=>true,online:()=>true,setTimeoutFn:()=>1,clearTimeoutFn:()=>{},
  setIntervalFn:()=>1,clearIntervalFn:()=>{}});
 ctl.running=true;ctl.generation=1;ctl.scope={userId,workspaceId};ctl.boardIds=[boardId];
 const attempts=[ctl.connect(1),ctl.connect(1),ctl.connect(1)];
 await Promise.resolve();assert.equal(userReads,1);
 gate.resolve();await Promise.all(attempts);
 assert.equal(contextReads,1);assert.equal(sockets.length,1);
 await ctl.connect(1);assert.equal(sockets.length,1,'active socket is reused');
 ctl.stop();
});

test('startup recovery does not stack a second retry after a request-layer read retry',async()=>{
 const {startupVerifiedRead,transientStartupFailure}=await import('../startup-recovery-policy.js');
 const exhausted=Object.assign(new Error('read retry exhausted'),{status:503,retryAttempts:1});
 assert.equal(transientStartupFailure(exhausted),false);
 let calls=0;
 await assert.rejects(()=>startupVerifiedRead(async()=>{calls++;throw exhausted;},{wait:async()=>{}}),error=>error===exhausted);
 assert.equal(calls,1);
});

test('role identity RPCs are not rechecked during periodic polling and respect focus/reconnect cooldown',()=>{
 assert.equal(shouldRecheckWorkspaceRoles({reason:'poll',lastReadAt:0,now:100000}),false);
 assert.equal(shouldRecheckWorkspaceRoles({reason:'join',lastReadAt:0,now:100000}),false);
 assert.equal(shouldRecheckWorkspaceRoles({reason:'broadcast',lastReadAt:0,now:100000}),false);
 assert.equal(shouldRecheckWorkspaceRoles({reason:'focus',lastReadAt:95000,now:100000}),false);
 assert.equal(shouldRecheckWorkspaceRoles({reason:'focus',lastReadAt:80000,now:100000}),true);
 assert.equal(shouldRecheckWorkspaceRoles({reason:'online',lastReadAt:80000,now:100000}),true);
 assert.equal(shouldRecheckWorkspaceRoles({reason:'poll',roleChanged:true,lastReadAt:99999,now:100000}),true);
});

test('reconciliation role checks are gated and independent reads run in parallel',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const start=app.indexOf('async function reconcilePlatformSync(');
 const end=app.indexOf('\n}\n',start);
 const source=app.slice(start,end);
 assert.match(source,/shouldRecheckWorkspaceRoles\(/);
 assert.match(source,/if\(roleRecheck\)\{/);
 assert.match(source,/Promise\.all\(\[/);
 assert.doesNotMatch(source,/if\(roleChanged\|\|sensitive\)/);
});
