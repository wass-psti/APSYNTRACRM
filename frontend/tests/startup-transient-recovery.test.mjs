import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startupVerifiedRead,startupFailureDescription,transientStartupFailure}
 from '../startup-recovery-policy.js';

const failure=(status=0,code='')=>Object.assign(new Error('Synthetic provider error'),{status,code});

test('only explicitly transient read errors qualify for startup recovery',()=>{
 for(const e of [failure(0,'NETWORK_UNAVAILABLE'),failure(0,'REQUEST_TIMEOUT'),
  failure(408),failure(429),failure(500),failure(502),failure(503),failure(504),
  failure(599)])
  assert.equal(transientStartupFailure(e),true);
 for(const e of [failure(0,'REQUEST_ABORTED'),failure(400),failure(401),
  failure(403),failure(404),failure(409),failure(422),null])
  assert.equal(transientStartupFailure(e),false);
});
test('one bounded retry restores a transient signed read without duplicate loops',async()=>{
 for(const e of [failure(0,'NETWORK_UNAVAILABLE'),failure(0,'REQUEST_TIMEOUT'),
  failure(429),failure(503)]){
  let calls=0,retries=0,waits=[];
  const result=await startupVerifiedRead(async()=>{
   calls++;if(calls===1)throw e;return {user_id:'signed-user'};
  },{wait:async ms=>{waits.push(ms);},onRetry:()=>{retries++;}});
  assert.deepEqual(result,{user_id:'signed-user'});
  assert.equal(calls,2);
  assert.equal(retries,1);
  assert.deepEqual(waits,[350]);
 }
});
test('repeated transport failure is surfaced after two reads, not retried indefinitely',async()=>{
 let calls=0;
 const e=failure(0,'REQUEST_TIMEOUT');
 await assert.rejects(()=>startupVerifiedRead(async()=>{
  calls++;throw e;
 },{wait:async()=>{}}),error=>error===e);
 assert.equal(calls,2);
});
test('permission denial and revoked-session errors fail closed without retry or delay',async()=>{
 for(const status of [400,401,403,409]){
  let calls=0,retries=0;
  const e=failure(status);
  await assert.rejects(()=>startupVerifiedRead(async()=>{
   calls++;throw e;
  },{wait:async()=>{},onRetry:()=>retries++}),error=>error===e);
  assert.equal(calls,1);
  assert.equal(retries,0);
 }
});
test('session identity change cancels retry and cannot publish a stale signed result',async()=>{
 let valid=true,calls=0;
 await assert.rejects(()=>startupVerifiedRead(async()=>{
  calls++;valid=false;throw failure(503);
 },{canContinue:()=>valid,wait:async()=>{}}),/Synthetic provider error/);
 assert.equal(calls,1);
 let after=0;
 await assert.rejects(()=>startupVerifiedRead(async()=>{
  after++;return 'privileged result';
 },{canContinue:()=>false,wait:async()=>{}}),/Startup session changed/);
 assert.equal(after,0);
});
test('recovery messages identify safe stage, never leak server messages or grant access',()=>{
 const secret=Object.assign(new Error('Bearer sensitive-value'),{status:503});
 for(const stage of ['authentication','workspace','route']){
  const message=startupFailureDescription(secret,stage);
  assert.doesNotMatch(message,/Bearer|sensitive-value/);
  assert.match(message,/signed session is preserved where valid/i);
 }
 assert.match(startupFailureDescription(failure(403),'workspace'),/no verified access/);
 assert.match(startupFailureDescription(failure(429),'workspace'),/rate limited/);
 assert.match(startupFailureDescription(failure(0,'REQUEST_TIMEOUT'),'authentication'),/too long/);
});
test('integration only wraps startup reads, not writes, routes, or privileges',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const boot=app.slice(app.indexOf('async function boot(){'),
  app.indexOf('startSelectExperience(document.body);'));
 assert.match(boot,/await startupVerifiedRead\(async\(\)=>await auth\.restore\(\)\)/);
 assert.match(boot,/await startupVerifiedRead\(async\(\)=>await refreshWorkspace\(\),\{/);
 assert.match(boot,/canContinue:\(\)=>auth\.isSignedIn&&auth\.userId===startupUserId/);
 assert.match(boot,/await onRoute\(\)/);
 assert.doesNotMatch(boot,/startupVerifiedRead\(.*onRoute/);
 assert.match(app,/if\(startupBusy\)return;/);
 assert.match(app,/renderBootstrapFailure\(err\)/);
 assert.match(app,/const description=startupFailureDescription\(error,startupRecoveryStage\)/);
 assert.doesNotMatch(readFileSync('frontend/startup-recovery-policy.js','utf8'),
  /localStorage|sessionStorage|sendBeacon|fetch\(|setInterval/);
});
