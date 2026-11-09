import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {registerStaticCache} from '../static-cache-registration.js';
const origin='https://wass-psti.github.io';
const root=origin+'/APSYNTRACRM/';
const resource=root+'frontend/app.js';
const response=(body='v1',type='text/javascript',headers={})=>{
 const result=new Response(body,{headers:{'Content-Type':type,...headers}});
 Object.defineProperty(result,'type',{value:'basic'});
 const clone=result.clone.bind(result);
 result.clone=()=>{const next=clone();Object.defineProperty(next,'type',{value:'basic'});return next};
 return result;
};
function harness(){
 const handlers=new Map(),stores=new Map(),requests=[];
 let offline=false,reply=response(),putCount=0;
 const cacheStore=name=>{
  if(!stores.has(name))stores.set(name,new Map());
  const store=stores.get(name);
  return {match:async request=>store.get(request.url)?.clone(),
   put:async(request,result)=>{putCount++;store.set(request.url,result.clone())},
   keys:async()=>[...store.keys()].map(url=>new Request(url)),
   delete:async request=>store.delete(request.url)};
 };
 const caches={keys:async()=>[...stores.keys()],open:async name=>cacheStore(name),
  delete:async name=>stores.delete(name)};
 const self={location:{href:root+'service-worker.js',origin},
  addEventListener:(type,handler)=>handlers.set(type,handler),
  skipWaiting:async()=>true,clients:{claim:async()=>true}};
 const context={self,caches,URL,Response,Request,
  fetch:async request=>{requests.push(request.url);if(offline)throw Error('offline');return reply.clone()}};
 vm.runInNewContext(readFileSync(new URL('../../service-worker.js',import.meta.url),'utf8'),context);
 const event=async(type,request)=>{
  let result,handled=false;const waits=[];
  handlers.get(type)({request,respondWith:promise=>{handled=true;result=promise},
   waitUntil:promise=>waits.push(promise)});
  let value;if(handled)value=await result;
  await Promise.all(waits);
  return {handled,value};
 };
 return {event,stores,requests,cacheStore,
  setOffline:v=>offline=v,setReply:r=>reply=r,
  get puts(){return putCount}};
}
test('registration limited to canonical HTTPS Pages origin and path',async()=>{
 const calls=[];
 const navigatorRef={serviceWorker:{register:async(...args)=>{
  calls.push(args);return {update:async()=>true};}}};
 const locationRef={origin,protocol:'https:',pathname:'/APSYNTRACRM/'};
 assert.equal(await registerStaticCache({navigatorRef,locationRef}),true);
 assert.deepEqual(calls[0],['/APSYNTRACRM/service-worker.js',
  {scope:'/APSYNTRACRM/',updateViaCache:'none'}]);
 for(const changed of [{protocol:'http:'},{origin:'https://evil.example'},
  {pathname:'/OTHER/'},{pathname:'/APSYNTRACRM-attacker/'}]){
  assert.equal(await registerStaticCache({navigatorRef,
   locationRef:{...locationRef,...changed}}),false);
 }
 assert.equal(calls.length,1);
});
test('only public static GET scripts/styles/logo enter the cache; never documents or signed APIs',async()=>{
 const h=harness();
 const requests=[
  new Request(root),new Request(root+'index.html'),
  new Request(root+'frontend/tests/test.js'),
  new Request(root+'frontend/private/data.js'),
  new Request(root+'frontend/documents/approval.js'),
  new Request(root+'frontend/avatar.webp'),
  new Request(root+'frontend/approval.pdf'),
  new Request(root+'frontend/app.js?token=private'),
  new Request('https://jtlusodorfnyzgyuewkz.supabase.co/rest/v1/profiles'),
  new Request(resource,{method:'POST'}),
  new Request(resource,{headers:{Authorization:'Bearer private'}}),
  new Request(resource,{headers:{Cookie:'session=private'}}),
  new Request(resource,{headers:{Range:'bytes=0-100'}})
 ];
 for(const request of requests)assert.equal((await h.event('fetch',request)).handled,false,request.url);
 assert.equal(h.puts,0);
 assert.equal(h.requests.length,0);
});
test('network-first refresh, offline static fallback and no offline navigation shell',async()=>{
 const h=harness(),req=new Request(resource);
 assert.equal((await h.event('fetch',req)).value&&h.puts,1);
 h.setReply(response('v2'));
 assert.equal(await (await h.event('fetch',req)).value.text(),'v2');
 assert.equal(h.puts,2);
 h.setOffline(true);
 assert.equal(await (await h.event('fetch',req)).value.text(),'v2');
 assert.equal((await h.event('fetch',new Request(root))).handled,false);
 assert.equal(h.requests.length,3);
});
test('private/no-store/cookie/download/wrong MIME/oversize are never stored',async()=>{
 for(const reply of [response('x','text/javascript',{'Cache-Control':'private'}),
  response('x','text/javascript',{'Cache-Control':'no-store'}),
  response('x','text/javascript',{'Set-Cookie':'s=1'}),
  response('x','text/javascript',{'Content-Disposition':'attachment'}),
  response('x','text/html'),response('x','text/javascript',{'Content-Length':'3000000'}),
  response('x'.repeat(2*1024*1024+1))]){
  const h=harness();h.setReply(reply);
  await h.event('fetch',new Request(resource));
  assert.equal(h.puts,0);
 }
});
test('activation removes only old APSYNTRA static caches; unrelated caches remain',async()=>{
 const h=harness();
 await h.cacheStore('apsyntra-crm-public-static-v0').put(new Request(resource),response());
 await h.cacheStore('other-app-cache').put(new Request(resource),response());
 await h.event('activate');
 assert.equal(h.stores.has('apsyntra-crm-public-static-v0'),false);
 assert.equal(h.stores.has('other-app-cache'),true);
});
test('install does not prefetch any assets or signed data',async()=>{
 const h=harness();await h.event('install');
 assert.equal(h.requests.length,0);
 assert.equal(h.stores.size,0);
});
