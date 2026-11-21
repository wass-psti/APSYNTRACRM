import test from 'node:test';
import assert from 'node:assert/strict';
import {createOtpRequestControl,parseOtpRetryAfter} from '../ws02d-otp-request-control.js';

function storageFixture(seed){
 const values=new Map(seed?Object.entries(seed):[]);
 return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
}
const KEY='apsyntra:ws02d:otp-send-cooldown:v1';

test('numeric and HTTP-date Retry-After values are parsed without shortening provider delay',()=>{
 const now=Date.parse('2026-11-21T08:00:00Z');
 assert.equal(parseOtpRetryAfter('30',now),30_000);
 assert.equal(parseOtpRetryAfter('1.5',now),1_500);
 assert.equal(parseOtpRetryAfter('Sat, 21 Nov 2026 08:02:00 GMT',now),120_000);
 assert.equal(parseOtpRetryAfter('invalid',now),0);
 assert.equal(parseOtpRetryAfter('-1',now),0);
});

test('one in-flight request is allowed and duplicate concurrent sends are rejected',()=>{
 const control=createOtpRequestControl({storage:storageFixture(),now:()=>1_000});
 assert.equal(control.begin(),true);
 assert.equal(control.isInFlight(),true);
 assert.equal(control.begin(),false);
 control.finish();
 assert.equal(control.begin(),true);
});

test('in-flight request lock is shared across tabs and expires if its tab closes',()=>{
 const store=storageFixture();let now=1_000;
 const first=createOtpRequestControl({storage:store,now:()=>now});
 const second=createOtpRequestControl({storage:store,now:()=>now});
 assert.equal(first.begin(),true);
 assert.equal(second.begin(),false);
 assert.equal(second.isInFlight(),true);
 first.finish();
 assert.equal(second.begin(),true);
 second.finish();
 assert.equal(first.begin(),true);
 now+=60_001;
 const afterTabClose=createOtpRequestControl({storage:store,now:()=>now});
 assert.equal(afterTabClose.begin(),true);
});

test('successful OTP submission applies a persisted shared cooldown without storing account data',()=>{
 const store=storageFixture();let now=1_000;
 const control=createOtpRequestControl({storage:store,now:()=>now});
 assert.equal(control.begin(),true);
 assert.equal(control.recordSuccess(),60_000);
 control.finish();
 assert.equal(control.remaining(),60_000);
 const persisted=JSON.parse(store.values.get(KEY));
 assert.deepEqual(persisted,{notBefore:61_000,backoff:0,lockUntil:0,lockId:''});
 assert.doesNotMatch(store.values.get(KEY),/email|password|token|secret/i);
 now+=59_000;assert.equal(control.begin(),false);
 now+=1_000;assert.equal(control.begin(),true);
});

test('429 applies progressive shared cooldown and persists across page reloads',()=>{
 const store=storageFixture();let now=10_000;
 const first=createOtpRequestControl({storage:store,now:()=>now});
 assert.equal(first.recordRateLimit(null),60_000);
 assert.equal(first.remaining(),60_000);
 now+=60_000;
 const afterReload=createOtpRequestControl({storage:store,now:()=>now});
 assert.equal(afterReload.remaining(),0);
 assert.equal(afterReload.recordRateLimit(null),120_000);
 assert.equal(afterReload.remaining(),120_000);
 now+=120_000;
 const third=createOtpRequestControl({storage:store,now:()=>now});
 assert.equal(third.recordRateLimit(null),240_000);
});

test('a second tab shares the persisted success cooldown',()=>{
 const store=storageFixture();
 const first=createOtpRequestControl({storage:store,now:()=>100});
 const second=createOtpRequestControl({storage:store,now:()=>100});
 assert.equal(first.recordSuccess(),60_000);
 assert.equal(second.begin(),false);
 assert.equal(second.remaining(),60_000);
});

test('progressive provider backoff caps at fifteen minutes instead of growing without bound',()=>{
 const store=storageFixture();let now=0;
 const control=createOtpRequestControl({storage:store,now:()=>now});
 const expected=[60_000,120_000,240_000,480_000,900_000,900_000,900_000];
 for(const delay of expected){assert.equal(control.recordRateLimit(null),delay);now+=delay;}
});

test('Retry-After longer than local backoff is honored exactly',()=>{
 let now=0;
 const control=createOtpRequestControl({storage:storageFixture(),now:()=>now});
 assert.equal(control.recordRateLimit('600'),600_000);
 assert.equal(control.remaining(),600_000);
});

test('uncertain network outcome prevents an immediate duplicate without automatic retry',()=>{
 let now=0;
 const control=createOtpRequestControl({storage:storageFixture(),now:()=>now});
 assert.equal(control.recordUncertain(),60_000);
 assert.equal(control.begin(),false);
 now+=60_000;
 assert.equal(control.begin(),true);
});

test('storage failures degrade to a tab-local cooldown instead of blocking sign-in',()=>{
 let now=0;
 const storage={getItem(){throw new Error('storage unavailable')},setItem(){throw new Error('storage unavailable')}};
 const control=createOtpRequestControl({storage,now:()=>now});
 assert.equal(control.recordRateLimit(null),60_000);
 assert.equal(control.remaining(),60_000);
 now+=60_000;
 assert.equal(control.begin(),true);
});

test('malformed persisted cooldown state is ignored',()=>{
 let now=0;
 const store=storageFixture({[KEY]:'not-json'});
 const control=createOtpRequestControl({storage:store,now:()=>now});
 assert.equal(control.remaining(),0);
 assert.equal(control.begin(),true);
});
