/** Isolated Chromium service-worker acceptance: no production traffic or credentials. */
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
let version=1,offline=false;
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 if(path==='/service-worker.js'){
  res.setHeader('Content-Type','text/javascript');
  res.setHeader('Cache-Control','no-store');
  res.end(readFileSync(join(root,'service-worker.js')));return;
 }
 if(path==='/frontend/tests/fixtures/static-cache-browser.html'){
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Static worker fixture</title><p>Isolated test</p>');return;
 }
 if(offline){res.statusCode=503;res.end('unavailable');return;}
 if(path==='/frontend/fixture-static.js'){
  res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-cache');
  res.end('/* version '+version+' */');return;
 }
 if(path==='/frontend/fixture-static.css'){
  res.setHeader('Content-Type','text/css');res.end('/* public css */');return;
 }
 if(path==='/frontend/private/approval.js'){
  res.setHeader('Content-Type','text/javascript');res.end('/* confidential */');return;
 }
 if(path==='/api/user'){
  res.setHeader('Content-Type','application/json');res.end('{"email":"private@example.test"}');return;
 }
 if(path==='/docs/approval.pdf'){
  res.setHeader('Content-Type','application/pdf');res.end('private approval');return;
 }
 res.statusCode=404;res.end('not found');
});
function chromePath(){
 const candidates=[process.env.CHROME_BIN,'/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'];
 return candidates.find(c=>c&&existsSync(c));
}
class Page {
 constructor(ws){this.ws=new WebSocket(ws);this.nextId=1;this.pending=new Map();
  this.ready=new Promise((resolveReady,reject)=>{
   this.ws.addEventListener('open',()=>resolveReady());
   this.ws.addEventListener('error',reject);
  });
  this.ws.addEventListener('message',event=>{
   const message=JSON.parse(String(event.data));
   if(!message.id){if(message.method==='Runtime.exceptionThrown')console.error('BROWSER_EXCEPTION',JSON.stringify(message.params?.exceptionDetails?.exception?.description||message.params?.exceptionDetails?.text));return;}
   const p=this.pending.get(message.id);if(!p)return;this.pending.delete(message.id);
   if(message.error)p.reject(Error(message.error.message));else p.resolve(message.result);
  });
 }
 async call(method,params={}){
  await this.ready;
  const id=this.nextId++;
  return new Promise((resolveCall,reject)=>{
   const deadline=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP '+method+' timed out'));},5000);
   this.pending.set(id,{resolve:value=>{clearTimeout(deadline);resolveCall(value);},
    reject:error=>{clearTimeout(deadline);reject(error);}});
   this.ws.send(JSON.stringify({id,method,params}));
  });
 }
 async evaluate(expression){
  const response=await this.call('Runtime.evaluate',{
   expression,awaitPromise:true,returnByValue:true});
  if(response.exceptionDetails)throw Error(response.exceptionDetails.text||'browser exception');
  return response.result?.value;
 }
 close(){this.ws.close();}
}
async function until(fn,{attempts=60,delay=100}={}){
 for(let i=0;i<attempts;i++){
  let value=null;try{value=await fn();}catch{}
  if(value)return value;
  await sleep(delay);
 }
 throw Error('Timed out waiting for two-tab browser acceptance');
}

async function run(){
 const executable=chromePath();if(!executable)throw Error('BLOCKED: Chromium not installed');
 const tmp=mkdtempSync(join(tmpdir(),'apsyntra-static-cache-'));
 let browser,page;
 try{
  await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
  const port=server.address().port;
  browser=spawn(executable,[
   '--headless=new','--no-first-run','--no-default-browser-check',
   '--disable-extensions','--disable-background-networking','--disable-sync',
   '--no-sandbox','--disable-dev-shm-usage',
   '--user-data-dir='+tmp,'--remote-debugging-port=0','about:blank'
  ],{stdio:'ignore'});
  const active=join(tmp,'DevToolsActivePort');
  // Shared hosted Chromium runners can need more than six seconds to start.
  try{await until(()=>existsSync(active),{attempts:250,delay:100});}
  catch{throw Object.assign(new Error('Chromium launch did not open DevToolsActivePort; exit code '+String(browser.exitCode)),
   {code:'CHROME_STARTUP_TIMEOUT'});}
  const debugPort=Number(readFileSync(active,'utf8').split('\n')[0]);
  const base='http://127.0.0.1:'+debugPort;
  const fixture='http://127.0.0.1:'+port+'/frontend/tests/fixtures/static-cache-browser.html';
  const target=await (await fetch(base+'/json/new?'+encodeURIComponent(fixture),{method:'PUT'})).json();
  page=new Page(target.webSocketDebuggerUrl);await page.ready;
  await page.call('Runtime.enable');
  await until(()=>page.evaluate('document.readyState=== "complete"'));
  const registered=await page.evaluate(`(async()=>{
   const registration=await navigator.serviceWorker.register('/service-worker.js',{scope:'/',updateViaCache:'none'});
   await navigator.serviceWorker.ready;
   await new Promise(resolve=>navigator.serviceWorker.controller?resolve():
    navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
   return registration.scope;
  })()`);
  assert.match(registered,/127\.0\.0\.1/);
  const first=await page.evaluate(`(async()=>{
   const a=await (await fetch('/frontend/fixture-static.js')).text();
   const b=await (await fetch('/frontend/fixture-static.css')).text();
   await fetch('/api/user');await fetch('/docs/approval.pdf');
   await fetch('/frontend/private/approval.js');
   await new Promise(r=>setTimeout(r,200));
   const keys=await caches.keys();
   const entries=(await Promise.all(keys.map(k=>caches.open(k).then(c=>c.keys())))).flat();
   return {a,b,keys,entries:entries.map(e=>new URL(e.url).pathname)};
  })()`);
  assert.match(first.a,/version 1/);
  assert.ok(first.entries.includes('/frontend/fixture-static.js'));
  assert.ok(first.entries.includes('/frontend/fixture-static.css'));
  assert.ok(!first.entries.some(p=>/api|docs|private|approval|user/.test(p)));
  version=2;
  const updated=await page.evaluate(`(async()=>{
   const text=await (await fetch('/frontend/fixture-static.js')).text();
   await new Promise(r=>setTimeout(r,150));return text;
  })()`);
  assert.match(updated,/version 2/);
  // Browser offline simulation: network requests fail so only previously cached static JS may return.
  await page.call('Network.enable');
  await page.call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  const fallback=await page.evaluate(`(async()=>{
   const cached=await (await fetch('/frontend/fixture-static.js')).text();
   let privateDenied=false;
   try{await fetch('/api/user')}catch{privateDenied=true}
   return {cached,privateDenied};
  })()`);
  assert.match(fallback.cached,/version 2/);
  assert.equal(fallback.privateDenied,true);
  console.log('BROWSER_STATIC_CACHE_PASS: real Chromium SW activation, network-first upgrade, offline public fallback');
  console.log('BROWSER_PRIVATE_EXCLUSION_PASS: API, private JS and approval PDF absent from Cache API');
 }finally{
  page?.close();
  if(browser){const exited=new Promise(resolveExit=>browser.once('exit',resolveExit));browser.kill('SIGTERM');await Promise.race([exited,sleep(1500)]);}
  await new Promise(done=>server.close(done));
  try{rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:100})}catch{}
 }
}
run().catch(error=>{console.error(error.message);
 process.exitCode=error.code==='CHROME_STARTUP_TIMEOUT'?75:1});
