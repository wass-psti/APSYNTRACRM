import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AuthClient,ApiError,STORE_KEY} from '../session.js';
import {startupFailureDescription,transientStartupFailure} from '../startup-recovery-policy.js';

const userId='11111111-1111-4111-8111-111111111111';
const otherUserId='22222222-2222-4222-8222-222222222222';
const freshStoredSession=()=>({
 access_token:'signed-example-token',refresh_token:'signed-refresh-example',
 expires_at:Date.now()+3600000,user:{id:userId}
});
const fixtureStorage=()=>{
 const entries=new Map([[STORE_KEY,JSON.stringify(freshStoredSession())]]);
 let writes=0,removes=0;
 return {entries,getItem:key=>entries.get(key)??null,
  setItem:()=>{writes++;throw Object.assign(new Error('Quota exceeded'),{name:'QuotaExceededError'});},
  removeItem:key=>{removes++;entries.delete(key);},
  get writes(){return writes;},get removes(){return removes;}};
};
const reply=(status,body)=>new Response(JSON.stringify(body),{
 status,headers:{'Content-Type':'application/json'}
});
test('verified user remains signed in if optional browser metadata storage write fails',async()=>{
 const storage=fixtureStorage();
 let reads=0;
 const auth=new AuthClient({storage,fetchImpl:async(url)=>{
  assert.match(url,/\/auth\/v1\/user$/);
  reads++;
  return reply(200,{id:userId,email:'verified@example.invalid'});
 }});
 assert.equal(await auth.restore(),true);
 assert.equal(reads,1);
 assert.equal(storage.writes,1);
 assert.equal(auth.isSignedIn,true);
 assert.equal(auth.userId,userId);
 assert.equal(auth.session.user.email,'verified@example.invalid');
 assert.equal(storage.removes,0);
 // Failure to update metadata never changes the previously signed token.
 assert.equal(JSON.parse(storage.getItem(STORE_KEY)).access_token,'signed-example-token');
});
test('revoked, forbidden or changed identity still fails closed when browser storage writes fail',async()=>{
 for(const [status,payload] of [
  [401,{message:'invalid session'}],[403,{message:'forbidden'}],
  [200,{id:otherUserId}]
 ]){
  const storage=fixtureStorage();
  const auth=new AuthClient({storage,fetchImpl:async()=>reply(status,payload)});
  assert.equal(await auth.restore(),false);
  assert.equal(auth.isSignedIn,false);
  assert.ok(storage.removes>=1,'invalid sessions must be removed from storage');
  assert.equal(storage.getItem(STORE_KEY),null);
  assert.equal(storage.writes,0);
 }
});
test('network outage is not mistaken for success or bypassed due to local storage resilience',async()=>{
 const storage=fixtureStorage();
 const auth=new AuthClient({storage,fetchImpl:async()=>{throw new Error('offline');}});
 await assert.rejects(()=>auth.restore(),error=>
  error instanceof ApiError&&error.code==='NETWORK_UNAVAILABLE');
 assert.equal(auth.isSignedIn,true,'cached tokens remain, but verified startup must not proceed');
 assert.equal(storage.writes,0);
});
test('invalid provider response is actionable while error bodies remain private',()=>{
 const message=startupFailureDescription(
  Object.assign(new Error('Bearer secret-to-redact'),{
   code:'INVALID_JSON_RESPONSE',status:200
  }),'authentication');
 assert.match(message,/invalid server response/);
 assert.doesNotMatch(message,/Bearer|secret-to-redact/);
 assert.equal(transientStartupFailure({code:'INVALID_JSON_RESPONSE',status:200}),false);
 assert.match(startupFailureDescription(new TypeError('Sensitive internal path'),
  'authentication'),/unexpected client error/);
});
test('online recovery is event-driven, session-scoped and preserves existing action path',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/window\.addEventListener\('online',\(\)=>\{[\s\S]*?platformSync\.network\(true\);[\s\S]*?if\(startupRecoveryActive&&!startupBusy&&auth\.isSignedIn\)void boot\(\);/);
 assert.match(app,/case 'retry-startup'/);
 assert.match(app,/if\(startupBusy\)return;/);
 assert.match(app,/await startupVerifiedRead\(async\(\)=>await auth\.restore\(\)\)/);
 assert.doesNotMatch(app,/setInterval\([^)]*boot\(|setTimeout\([^)]*boot\(/);
});
