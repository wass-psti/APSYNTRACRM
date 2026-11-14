/** Real Chromium acceptance for progressive board pagination UI.
 * Uses synthetic local rows only; no production account or Supabase requests.
 */
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..');
const html='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css">'+
 '<title>Board pagination browser acceptance</title>'+
 '<style>body{margin:0;padding:20px}.test-row{height:52px;box-sizing:border-box;padding:15px;border-bottom:1px solid #ddd}.test-list{max-width:900px;margin:auto}</style>'+
 '</head><body><main id="app" class="test-list"></main>'+
 '<script type="module">'+
 'import {renderBoardPagination,mountBoardPagination} from "/frontend/board-pagination-ui.js";'+
 'const root=document.querySelector("#app");let loaded=200,calls=0,busy=false,error="",failNext=false,dispose=null;'+
 'const rows=()=>Array.from({length:loaded},(_,i)=>"<div class=\\"test-row\\">Board record "+(i+1)+"</div>").join("");'+
 'function render(){dispose?.();root.innerHTML="<section aria-label=\\"Synthetic board rows\\">"+rows()+"</section>"+renderBoardPagination({loaded_count:loaded,has_more:loaded<600},{busy,error});dispose=mountBoardPagination(root,loadMore);}'+
 'async function loadMore(){if(busy||loaded>=600)return false;calls++;busy=true;error="";render();await new Promise(resolve=>setTimeout(resolve,30));busy=false;if(failNext){failNext=false;error="Synthetic temporary page failure";render();return false;}loaded=Math.min(600,loaded+200);render();return true;}'+
 'root.addEventListener("click",event=>{if(event.target.closest?.("[data-action=board-load-more]")){event.preventDefault();void loadMore();}});'+
 'window.__progressive={stats:()=>({loaded,calls,busy,error,hasButton:!!root.querySelector("[data-action=board-load-more]"),hasSentinel:!!root.querySelector("[data-board-pagination-sentinel]")}),render,reset:({failure=false}={})=>{window.scrollTo(0,0);loaded=200;calls=0;busy=false;error="";failNext=failure;render();},loadMore,scrollEnd:()=>window.scrollTo(0,document.body.scrollHeight),dispose:()=>dispose?.()};render();'+
 '</script></body></html>';
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 if(pathname==='/frontend/board-pagination-ui.js'||pathname==='/frontend/apsyntra-styles.bundle.css'){
  const file=resolve(root,'.'+pathname);
  res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
  res.end(readFileSync(file));return;
 }
 res.statusCode=404;res.end('not found');
});
function chromePath(){
 return [process.env.CHROME_BIN,'/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']
  .find(path=>path&&existsSync(path));
}
class Page{
 constructor(url){
  this.ws=new WebSocket(url);this.nextId=1;this.pending=new Map();
  this.ready=new Promise((resolveReady,reject)=>{
   this.ws.addEventListener('open',resolveReady);
   this.ws.addEventListener('error',reject);
  });
  this.ws.addEventListener('message',event=>{
   const message=JSON.parse(String(event.data));if(!message.id)return;
   const pending=this.pending.get(message.id);if(!pending)return;
   this.pending.delete(message.id);
   if(message.error)pending.reject(Error(message.error.message));
   else pending.resolve(message.result);
  });
 }
 async call(method,params={}){
  await this.ready;const id=this.nextId++;
  return new Promise((resolveCall,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP '+method+' timed out'));},5000);
   this.pending.set(id,{resolve:value=>{clearTimeout(timer);resolveCall(value);},
    reject:error=>{clearTimeout(timer);reject(error);}});
   this.ws.send(JSON.stringify({id,method,params}));
  });
 }
 async evaluate(expression){
  const response=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(response.exceptionDetails)throw Error(response.exceptionDetails.text||'Browser exception');
  return response.result?.value;
 }
 close(){this.ws.close();}
}
async function until(fn,{attempts=100,delay=80}={}){
 for(let i=0;i<attempts;i++){let value;try{value=await fn();}catch{}
  if(value)return value;await sleep(delay);}
 throw Error('Timed out waiting for progressive board pagination.');
}
async function run(){
 const executable=chromePath();if(!executable)throw Error('BLOCKED: Chromium or Chrome not installed');
 const tmp=mkdtempSync(join(tmpdir(),'apsyntra-board-pagination-'));
 let browser,page;
 try{
  await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
  const port=server.address().port;
  browser=spawn(executable,['--headless=new','--no-first-run','--no-default-browser-check',
   '--disable-extensions','--disable-background-networking','--disable-sync',
   '--no-sandbox','--disable-dev-shm-usage','--user-data-dir='+tmp,
   '--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
  const active=join(tmp,'DevToolsActivePort');
  await until(()=>existsSync(active),{attempts:250,delay:100});
  const debugPort=Number(readFileSync(active,'utf8').split('\n')[0]);
  const response=await fetch('http://127.0.0.1:'+debugPort+'/json/new?'+
   encodeURIComponent('http://127.0.0.1:'+port+'/'),{method:'PUT',signal:AbortSignal.timeout(15000)});
  assert.equal(response.ok,true);
  const target=await response.json();page=new Page(target.webSocketDebuggerUrl);
  await page.ready;await page.call('Runtime.enable');
  await until(()=>page.evaluate('Boolean(window.__progressive)'));
  let initial=await page.evaluate('window.__progressive.stats()');
  assert.equal(initial.loaded,200);
  assert.equal(initial.calls,0,'initial render must not request pages beyond page one');
  assert.equal(initial.hasButton,true);
  assert.equal(initial.hasSentinel,true);
  await page.evaluate('window.__progressive.scrollEnd()');
  await until(async()=>{const x=await page.evaluate('window.__progressive.stats()');return x.loaded===400&&x.calls===1;});
  await sleep(300);
  let next=await page.evaluate('window.__progressive.stats()');
  assert.equal(next.calls,1,'one near-end intersection must load exactly one page');
  assert.equal(next.loaded,400);
  await page.evaluate('document.querySelector("[data-action=board-load-more]").click()');
  await until(async()=>{const x=await page.evaluate('window.__progressive.stats()');return x.loaded===600&&x.calls===2;});
  next=await page.evaluate('window.__progressive.stats()');
  assert.equal(next.hasButton,false,'the continuation control disappears after the final page');
  assert.equal(next.hasSentinel,false);

  await page.evaluate('window.__progressive.reset({failure:true})');
  await page.evaluate('window.__progressive.scrollEnd()');
  await until(async()=>{const x=await page.evaluate('window.__progressive.stats()');return x.calls===1&&!!x.error;});
  await sleep(350);
  let failed=await page.evaluate('window.__progressive.stats()');
  assert.equal(failed.calls,1,'a failed automatic request must not loop');
  assert.equal(failed.hasSentinel,false,'manual retry is required after an error');
  assert.equal(failed.hasButton,true);
  await page.evaluate('document.querySelector("[data-action=board-load-more]").click()');
  await until(async()=>{const x=await page.evaluate('window.__progressive.stats()');return x.loaded===400&&x.calls===2;});

  await page.evaluate('window.IntersectionObserver=undefined;window.__progressive.reset();');
  await page.evaluate('window.__progressive.scrollEnd()');
  await sleep(250);
  const fallback=await page.evaluate('window.__progressive.stats()');
  assert.equal(fallback.loaded,200,'manual button remains the fallback without IntersectionObserver');
  assert.equal(fallback.calls,0);
  await page.evaluate('document.querySelector("[data-action=board-load-more]").click()');
  await until(async()=>{const x=await page.evaluate('window.__progressive.stats()');return x.loaded===400;});
  const final=await page.evaluate('window.__progressive.stats()');
  assert.equal(final.calls,1);
  console.log('BROWSER_PROGRESSIVE_HYDRATION_PASS: initial_page=200 next_page=200 demand_driven=true');
  console.log('BROWSER_SCROLL_TRIGGER_PASS: near_end=1 request_per_page=true');
  console.log('BROWSER_RETRY_PASS: automatic_failure_does_not_loop=true manual_retry=true');
  console.log('BROWSER_FALLBACK_PASS: manual_load_without_IntersectionObserver=true');
 }finally{
  try{await page?.evaluate('window.__progressive?.dispose()');}catch{}
  page?.close();
  if(browser){const exited=new Promise(resolveExit=>browser.once('exit',resolveExit));
   browser.kill('SIGTERM');await Promise.race([exited,sleep(1500)]);}
  await new Promise(resolveClose=>server.close(resolveClose));
  try{rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}catch{}
 }
}
run().catch(error=>{console.error('BROWSER_PROGRESSIVE_HYDRATION_FAILED:',error.message);process.exitCode=1;});
