import assert from 'node:assert/strict';
import { getGuestApiBaseUrl } from '../../supabase/pdl-booking/source/functions/pdl-guest-api/_shared/urls.mjs';
const pages='https://wass-psti.github.io';
const preview='https://apsyntracrm-preview.alexsenaganwatchdog.workers.dev';
const watchdogPreview='https://apsyntracrm-preview.watchdog-521.workers.dev';
const configured='https://configured.example.invalid';
Deno.test('actual Paseo entrypoint accepts only configured origins plus Pages and preview',async()=>{
 const original=Deno.serve;
 const old=Deno.env.get('PDL_ALLOWED_ORIGINS');
 let handler: ((req:Request)=>Response|Promise<Response>)|undefined;
 Deno.env.set('PDL_ALLOWED_ORIGINS',configured);
 try{
  Deno.serve=((fn: typeof handler)=>{handler=fn;}) as unknown as typeof Deno.serve;
  await import('../../supabase/pdl-booking/source/functions/pdl-guest-api/index.ts');
 }finally{
  Deno.serve=original;
  if(old===undefined)Deno.env.delete('PDL_ALLOWED_ORIGINS');
  else Deno.env.set('PDL_ALLOWED_ORIGINS',old);
 }
 assert.ok(handler);
 const call=(origin:string,method='OPTIONS')=>handler!(new Request('https://fixture.invalid/functions/v1/pdl-guest-api/v1/availability',{method,headers:{origin,'access-control-request-method':'GET','access-control-request-headers':'authorization,content-type,idempotency-key,apikey'}}));
 for(const origin of [pages,preview,watchdogPreview,configured]){
  const res=await call(origin);
  assert.equal(res.status,204);
  assert.equal(res.headers.get('access-control-allow-origin'),origin);
  assert.match(res.headers.get('access-control-allow-headers')||'',/idempotency-key/);
 }
 for(const origin of ['https://untrusted.invalid',preview+'.evil.invalid',watchdogPreview+'.evil.invalid','https://apsyntracrm.watchdog-521.workers.dev','https://apsyntracrm.alexsenaganwatchdog.workers.dev']){
  for(const method of ['OPTIONS','GET']){
   const res=await call(origin,method);
   assert.equal(res.status,403);
   assert.equal(res.headers.get('access-control-allow-origin'),null);
  }
 }
});
Deno.test('preserve deployed QR image base URL normalization',()=>{
 assert.equal(getGuestApiBaseUrl('https://example.supabase.co/'),'https://example.supabase.co/functions/v1/pdl-guest-api');
 assert.throws(()=>getGuestApiBaseUrl('file:///etc/passwd'));
});
