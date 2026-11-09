import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedResendWebhook} from '../ws02d-resend-webhook.mjs';
const now=1800000000000;
const eventId='msg_test_event_123';
const providerMessageId='22222222-2222-4222-8222-222222222222';
const secret='whsec_'+btoa('a'.repeat(32));
const payload=JSON.stringify({type:'email.delivered',data:{email_id:providerMessageId}});
async function request(raw=payload,at=Math.floor(now/1000)){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('a'.repeat(32)),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,
  new TextEncoder().encode(`${eventId}.${at}.${raw}`)));
 const signature=btoa(String.fromCharCode(...bytes));
 return new Request('https://example.invalid/webhook',{method:'POST',
  headers:{'svix-id':eventId,'svix-timestamp':String(at),'svix-signature':'v1,'+signature},body:raw});
}
test('webhook is disabled by default and never changes production state',async()=>{
 let calls=0;
 const handle=createVerifiedResendWebhook({signingSecret:secret,
  recordVerifiedEvent:async()=>{calls++;}});
 const response=await handle(await request());
 assert.equal(response.status,503);
 assert.equal(calls,0);
});
test('valid signature correlates a delivered message to a durable event',async()=>{
 const events=[];
 const handle=createVerifiedResendWebhook({enabled:true,signingSecret:secret,clock:()=>now,
  recordVerifiedEvent:async e=>{events.push(e);return {persisted:true};}});
 const response=await handle(await request());
 assert.equal(response.status,200);
 assert.deepEqual(events,[{eventId,providerMessageId,state:'delivered'}]);
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('tampered payload, stale timestamp and mismatched signing secret fail before DB writes',async()=>{
 let calls=0;
 const handle=createVerifiedResendWebhook({enabled:true,signingSecret:secret,clock:()=>now,
  recordVerifiedEvent:async()=>{calls++;return {persisted:true};}});
 const changed=await request();
 const changedHeaders=new Headers(changed.headers);
 const tampered=new Request(changed.url,{method:'POST',headers:changedHeaders,
  body:payload.replace('email.delivered','email.failed')});
 assert.equal((await handle(tampered)).status,400);
 assert.equal((await handle(await request(payload,Math.floor(now/1000)-301))).status,400);
 const invalidKey=createVerifiedResendWebhook({enabled:true,signingSecret:'whsec_'+btoa('b'.repeat(32)),clock:()=>now,
  recordVerifiedEvent:async()=>{calls++;return {persisted:true};}});
 assert.equal((await invalidKey(await request())).status,400);
 assert.equal(calls,0);
});
test('only recognized correlated provider events are admitted',async()=>{
 let calls=0;
 const handle=createVerifiedResendWebhook({enabled:true,signingSecret:secret,clock:()=>now,
  recordVerifiedEvent:async()=>{calls++;return {persisted:true};}});
 for(const payload of [JSON.stringify({type:'email.received',data:{email_id:providerMessageId}}),
  JSON.stringify({type:'email.delivered',data:{email_id:'bad'}})])
  assert.equal((await handle(await request(payload))).status,400);
 assert.equal(calls,0);
});
test('persistent receipt failure never reports successful webhook processing',async()=>{
 const handle=createVerifiedResendWebhook({enabled:true,signingSecret:secret,clock:()=>now,
  recordVerifiedEvent:async()=>{throw Error('database unavailable');}});
 assert.equal((await handle(await request())).status,503);
});
