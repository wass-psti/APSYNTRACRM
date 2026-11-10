/** Real Chromium finite on-demand frame sampling with a disposable browser. */
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const allow=new Set(['/frontend/tests/fixtures/performance-profile-browser.html',
 '/frontend/performance-profile.js','/frontend/performance-critical-path.js',
 '/frontend/workspace-startup-read.js','/frontend/performance-entry-waterfall.js']);
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(!allow.has(url.pathname)){res.writeHead(404);res.end('not found');return;}
 const file=resolve(root,'.'+url.pathname);
 res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':'text/html');
 res.end(readFileSync(file));
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
 const executable=chromePath();if(!executable)throw Error('BLOCKED: Chromium unavailable');
 const tmp=mkdtempSync(join(tmpdir(),'apsyntra-performance-profile-'));
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
  try{await until(()=>existsSync(active),{attempts:250,delay:100});}
  catch{throw Object.assign(new Error('Chromium launch did not open DevToolsActivePort'),
   {code:'CHROME_STARTUP_TIMEOUT'});}
  const portNumber=Number(readFileSync(active,'utf8').split('\n')[0]);
  const base='http://127.0.0.1:'+portNumber;
  const href='http://127.0.0.1:'+port+'/frontend/tests/fixtures/performance-profile-browser.html';
  const target=await (await fetch(base+'/json/new?'+encodeURIComponent(href),{
   method:'PUT',signal:AbortSignal.timeout(5000)})).json();
  page=new Page(target.webSocketDebuggerUrl);await page.ready;
  await page.call('Runtime.enable');
  await until(()=>page.evaluate('document.readyState=== "complete"'));
  await until(()=>page.evaluate('Boolean(window.performanceAcceptance)'));
  const measured=await page.evaluate('performanceAcceptance.run()');
  assert.equal(measured.status,'COMPLETE');
  assert.ok(measured.frames>=15,'Chromium should deliver real animation frames');
  assert.ok(measured.p50Ms>0&&measured.p95Ms>=measured.p50Ms);
  assert.ok(measured.durationMs===1000);
  assert.ok(!('url' in measured)&&!('userId' in measured));
  assert.ok(measured.longTasks&&typeof measured.longTasks.supported==='boolean'&&
   Number.isFinite(measured.longTasks.count));
  assert.ok(measured.longTasks.maxMs>=0&&measured.longTasks.totalMs>=0);
  const waterfall=await page.evaluate('performanceAcceptance.waterfall()');
  assert.equal(waterfall.entryMs,250);
  assert.equal(waterfall.resourceCount,3);
  assert.equal(waterfall.groups.javascript.count,2);
  assert.equal(waterfall.groups.stylesheet.count,1);
  assert.equal(waterfall.afterLatestPublicResourceMs,40);
  assert.doesNotMatch(JSON.stringify(waterfall),/secret|must-not-leak|private|token|app\.js/);
  console.log('BROWSER_ENTRY_WATERFALL_PASS: bounded numeric-only public resource timing');
  const critical=await page.evaluate('performanceAcceptance.criticalPath()');
  assert.equal(critical.totalMs,120);
  assert.equal(critical.entryFromNavigationMs,0);
  assert.equal(critical.signedReadyFromNavigationMs,120);
  assert.deepEqual(critical.phases.map(x=>x.phase),
   ['session-restore','workspace-authorization','authorized-route']);
  const isolated=await page.evaluate('performanceAcceptance.measuredWorkspace()');
  assert.equal(isolated.count,1);
  assert.equal(isolated.bootstrap,true);
  assert.deepEqual(isolated.report.reads.map(x=>x.operation),
    ['workspace-context','board-list','bootstrap-role']);
  const [contextRead,boardRead,roleRead]=isolated.report.reads;
  assert.ok(contextRead.durationMs>=65&&contextRead.durationMs<500);
  assert.ok(boardRead.durationMs>=45&&boardRead.durationMs<500);
  assert.ok(roleRead.durationMs>=110&&roleRead.durationMs<700);
  assert.ok(boardRead.startMs>=contextRead.endMs&&roleRead.startMs>=contextRead.endMs);
  assert.ok(Math.abs(boardRead.startMs-roleRead.startMs)<60,
   'board and role starts must overlap after a fresh context check');
  assert.doesNotMatch(JSON.stringify(isolated.report),/synthetic-not-reported|not-reported|user_id|workspace_id/);
  console.log('BROWSER_WORKSPACE_RPC_TIMING_PASS: network-inclusive numeric-only context/list/role boundaries');
  const parallel=await page.evaluate('performanceAcceptance.concurrentWorkspace()');
  assert.deepEqual(parallel.starts,['boards','role']);
  assert.equal(parallel.authorizedBoards,1);
  assert.equal(parallel.bootstrapVerified,true);
  assert.equal(parallel.denied,true);
  assert.ok(parallel.elapsed>=230&&parallel.elapsed<800,
   'synthetic overlapping 100ms/250ms reads must have bounded makespan');
  console.log('BROWSER_WORKSPACE_PARALLEL_PASS: independent signed-read scheduling, scope denial, no extra request');
  console.log('BROWSER_STARTUP_PHASE_PASS: fixed-phase numeric timeline; no private fields');
  console.log('BROWSER_LONG_TASK_PASS: finite opt-in observer summary without attribution');
  console.log('BROWSER_LOCAL_FRAME_PROFILE_PASS: finite 1s real Chromium RAF sample, no identity or URL');

 }finally{
  page?.close();
  if(browser){const exited=new Promise(done=>browser.once('exit',done));
   browser.kill('SIGTERM');await Promise.race([exited,sleep(1500)]);}
  await new Promise(done=>server.close(done));
  try{rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:100})}catch{}
 }
}
run().catch(error=>{console.error('BROWSER_FRAME_PROFILE_FAILED:',error.message);
 process.exitCode=error.code==='CHROME_STARTUP_TIMEOUT'?75:1;});
