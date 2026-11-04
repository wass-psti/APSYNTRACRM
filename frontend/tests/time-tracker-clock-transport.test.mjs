import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AuthClient,ApiError} from '../session.js';
import {DomainApi} from '../data.js';

const user='20000000-0000-4000-8000-000000000001';
const response=(status,payload)=>({
 ok:status>=200&&status<300,status,async json(){return payload;}
});
const session=()=>({
 access_token:'test-access',refresh_token:'test-refresh',
 expires_at:1000000,user:{id:user}
});
function signedAuth(fetchImpl){
 const auth=new AuthClient({
  fetchImpl,clock:()=>1000,
  storage:{setItem(){},removeItem(){},getItem(){return null;}}
 });
 auth.session=session();
 return auth;
}

test('Clock commit HTTP 401 is not replayed after token refresh',async()=>{
 const requests=[];
 const auth=signedAuth(async(url,options)=>{
  requests.push(options);
  return response(401,{message:'Authentication denied'});
 });
 auth.refresh=async()=>{throw new Error('Unauthorized write unexpectedly refreshed');};
 const api=new DomainApi(auth);
 await assert.rejects(()=>api.rpc('timetracker_attendance_commit_v2',
  {p_action:'clock-out'},{retryUnauthorized:false}),
  err=>err instanceof ApiError&&err.status===401);
 assert.equal(requests.length,1);
 assert.equal(requests[0].method,'POST');
 assert.match(requests[0].headers.Authorization,/^Bearer test-access$/);
});

test('existing authorized reads retain normal 401 refresh behavior',async()=>{
 let calls=0;
 const auth=signedAuth(async(url,options)=>{
  calls++;
  return calls===1?response(401,{message:'expired'}):
   response(200,{status:'VERIFIED_READ'});
 });
 auth.refresh=async()=>{auth.session.access_token='renewed-access';return 'renewed-access';};
 const api=new DomainApi(auth);
 const data=await api.rpc('wm_auth_access_context');
 assert.equal(data.status,'VERIFIED_READ');
 assert.equal(calls,2);
});

test('abort is distinguished from ordinary network loss',async()=>{
 const signal=new AbortController();signal.abort();
 const auth=signedAuth(async()=>{throw new Error('AbortError');});
 await assert.rejects(()=>auth.call('/rest/v1/rpc/timetracker_attendance_commit_v2',
  {method:'POST',signal:signal.signal}),err=>
  err instanceof ApiError&&err.code==='REQUEST_TIMEOUT');
 await assert.rejects(()=>auth.call('/rest/v1/rpc/timetracker_attendance_commit_v2',
  {method:'POST'}),err=>
  err instanceof ApiError&&err.code!== 'REQUEST_TIMEOUT'&&
  /Network unavailable/.test(err.message));
});

test('attendance commit is the sole non-replayed bounded write RPC',()=>{
 const native=readFileSync('frontend/time-tracker-native.js','utf8');
 const api=readFileSync('frontend/data.js','utf8');
 const auth=readFileSync('frontend/session.js','utf8');
 assert.match(native,/AbortSignal\?\.timeout\?\.\(25000\)/);
 assert.match(native,/retryUnauthorized:false/);
 assert.match(api,/rpc\(name,args=\{\},options=\{\}\)/);
 assert.match(auth,/if\(err\.status!==401\|\|!retryUnauthorized\)throw err/);
});
