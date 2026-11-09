/** Real Chromium public-module load comparison. Disposable unsigned browser.
 * Uses local copies of index and frontend assets; no production credentials.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {originalImportBaseline,inspectStaticModuleGraph} from './priority5f-module-graph.mjs';
const root=resolve(import.meta.dirname,'..');
const index=readFileSync(resolve(root,'index.html'),'utf8');
const app=readFileSync(resolve(root,'frontend/app.js'),'utf8');
const appOriginal=originalImportBaseline(app);
const server=createServer((request,response)=>{
 const pathname=new URL(request.url,'http://127.0.0.1').pathname;
 const match=pathname.match(/^\/(baseline|optimized)\/(.*)$/);
 if(!match){response.writeHead(404);response.end();return;}
 const variant=match[1],resource=match[2];
 response.setHeader('Cache-Control','no-store');
 if(resource===''||resource==='index.html'){
  response.setHeader('Content-Type','text/html; charset=utf-8');
  response.end(index.replace('<head>','<head><base href="/'+variant+'/">'));return;
 }
 if(!resource.startsWith('frontend/')){response.writeHead(404);response.end();return;}
 const target=resolve(root,resource);
 if(!target.startsWith(resolve(root,'frontend')+sep)){response.writeHead(403);response.end();return;}
 let contents;
 try{contents=resource==='frontend/app.js'&&variant==='baseline'?appOriginal:readFileSync(target)}
 catch{response.writeHead(404);response.end();return;}
 response.setHeader('Content-Type',extname(target)==='.js'?'text/javascript':
  extname(target)==='.css'?'text/css':extname(target)==='.webp'?'image/webp':'application/octet-stream');
 response.end(contents);
});
class CdpPage{
 constructor(ws){this.ws=new WebSocket(ws);this.next=0;this.pending=new Map();
  this.ready=new Promise((ok,bad)=>{this.ws.addEventListener('open',ok);this.ws.addEventListener('error',bad)});
  this.ws.addEventListener('message',e=>{
   const message=JSON.parse(String(e.data));if(!message.id)return;
   const item=this.pending.get(message.id);if(!item)return;this.pending.delete(message.id);
   if(message.error)item.reject(Error(message.error.message));else item.resolve(message.result);
  });
 }
 async call(method,params={}){await this.ready;return new Promise((resolveCall,reject)=>{
  const id=++this.next,timeout=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP '+method+' timeout'));},10000);
  this.pending.set(id,{resolve:v=>{clearTimeout(timeout);resolveCall(v)},
   reject:e=>{clearTimeout(timeout);reject(e)}});
  this.ws.send(JSON.stringify({id,method,params}));
 })}
 async evaluate(expression){const result=await this.call('Runtime.evaluate',
  {expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.text||'Evaluation exception');
  return result.result?.value;
 }
 close(){this.ws.close()}
}
async function until(check,attempts=150){for(let i=0;i<attempts;i++){
 try{if(await check())return;}catch{}await sleep(100)}throw Error('Browser did not reach expected state');}
async function run(){
 const browserBin=[process.env.CHROME_BIN,'/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']
 .find(path=>path&&existsSync(path));
 if(!browserBin)throw Error('Chromium unavailable');
 const profile=mkdtempSync(join(tmpdir(),'apsyntra-priority5f-'));
 let browser,page;
 try{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const port=server.address().port;
  browser=spawn(browserBin,['--headless=new','--no-first-run','--no-default-browser-check',
   '--disable-background-networking','--disable-extensions','--disable-sync',
   '--no-sandbox','--disable-dev-shm-usage','--disable-webgl',
   '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
  const active=join(profile,'DevToolsActivePort');
  try{await until(()=>existsSync(active),250)}catch{
   throw Object.assign(Error('Chrome startup timeout'),{code:'CHROME_STARTUP_TIMEOUT'});
  }
  const debugPort=Number(readFileSync(active,'utf8').split('\n')[0]);
  const target=await(await fetch('http://127.0.0.1:'+debugPort+'/json/new?about:blank',
   {method:'PUT',signal:AbortSignal.timeout(5000)})).json();
  page=new CdpPage(target.webSocketDebuggerUrl);await page.ready;
  await page.call('Runtime.enable');await page.call('Page.enable');
  await page.call('Network.enable');await page.call('Network.setCacheDisabled',{cacheDisabled:true});
  await page.call('Network.setBypassServiceWorker',{bypass:true});
  await page.call('Emulation.setEmulatedMedia',{
   features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  // This local synthetic fixture is fully unsigned. No external network traffic.
  await page.call('Network.setBlockedURLs',{urls:['*supabase.co/*','*unpkg.com/*','*formsubmit.co/*']});
  const checks={};
  for(const variant of ['baseline','optimized']){
   await page.call('Page.navigate',{url:`http://127.0.0.1:${port}/${variant}/index.html`});
   await until(()=>page.evaluate(`location.pathname==='/${variant}/index.html'&&window.__APSYNTRA_STARTUP?.state==='UNAUTHENTICATED'`),200);
   const report=await page.evaluate(`(()=>{
    const entries=performance.getEntriesByType('resource');
    const files=entries.filter(x=>x.name.includes('/${variant}/frontend/')&&
      new URL(x.name).pathname.endsWith('.js'));
    const nav=performance.getEntriesByType('navigation')[0];
    return {sourceCount:new Set(files.map(x=>new URL(x.name).pathname)).size,
      resourceBytes:files.reduce((n,r)=>n+r.decodedBodySize,0),
      bootState:window.__APSYNTRA_STARTUP?.state,
      login:!!document.querySelector('#app form, #app [data-auth-form]'),
      loadMs:Math.round(nav.loadEventEnd-nav.startTime),
      fueltransFetched:files.some(x=>x.name.includes('fueltrans-native.js')),
      importFetched:files.some(x=>x.name.includes('board-import-ui.js'))};
   })()`);
   checks[variant]=report;
  }
  assert.equal(checks.baseline.bootState,'UNAUTHENTICATED');
  assert.equal(checks.optimized.bootState,'UNAUTHENTICATED');
  assert.equal(checks.baseline.fueltransFetched,true);
  assert.equal(checks.baseline.importFetched,true);
  assert.equal(checks.optimized.fueltransFetched,false);
  assert.equal(checks.optimized.importFetched,false);
  assert.ok(checks.optimized.sourceCount<checks.baseline.sourceCount-20);
  const before=inspectStaticModuleGraph({appSource:appOriginal}),after=inspectStaticModuleGraph();
  assert.ok(before.count-after.count>=30);
  console.log('BROWSER_MODULE_BOOT_PASS: '+JSON.stringify({baseline:checks.baseline,
   optimized:checks.optimized,staticModulesBefore:before.count,staticModulesAfter:after.count}));
  console.log('BROWSER_MODULE_PRIVACY_PASS: anonymous local first paint and startup state preserved');
 }finally{
  page?.close();
  if(browser){const done=new Promise(ok=>browser.once('exit',ok));browser.kill('SIGTERM');await Promise.race([done,sleep(1500)])}
  await new Promise(ok=>server.close(ok));
  try{rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})}catch{}
 }
}
run().catch(error=>{console.error('BROWSER_MODULE_BOOT_FAILED:',error.message);
 process.exitCode=error.code==='CHROME_STARTUP_TIMEOUT'?75:1});
