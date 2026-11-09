/** Real headless browser, two same-origin tabs; synthetic signed fixtures only.
 * Never connects to Supabase, production or user browser profiles.
 */
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const BOARD='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WS='00000000-0000-4000-8000-000000000001';
const FOREIGN_WS='00000000-0000-4000-8000-000000000002';
const counts={boardReads:0,viewReads:0,writes:0};
let revision='2026-11-09T09:00:00Z',name='Original group',viewRevoked=false;
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/fixture/control/revoke-view'&&req.method==='POST'){
  viewRevoked=true;res.end('ok');return;
 }
 if(pathname==='/fixture/control/restore-view'&&req.method==='POST'){
  viewRevoked=false;res.end('ok');return;
 }
 if(pathname.startsWith('/fixture/rpc/')){
  const user=req.headers['x-synthetic-user'],workspace=req.headers['x-synthetic-workspace'];
  const allowed=user===USER&&workspace===WS;
  const action=pathname.split('/').at(-1);
  res.setHeader('Content-Type','application/json');
  if(action==='wm_get_board')counts.boardReads++;
  if(action==='work_board_access')counts.viewReads++;
  if(action==='wm_board_group_cas')counts.writes++;
  if(!allowed||(viewRevoked&&action==='work_board_access')){
   res.statusCode=403;res.end(JSON.stringify({error:'signed fixture authorization denied'}));return;
  }
  if(action==='wm_get_board')res.end(JSON.stringify({board:{id:BOARD,workspace_id:WS,updated_at:revision,name},groups:[],items:[]}));
  else if(action==='work_board_access')res.end('true');
  else if(action==='wm_board_group_cas'){
   revision='2026-11-09T09:01:00Z';name='Changed group';
   res.end(JSON.stringify({board:{id:BOARD,updated_at:revision},operation:'rename'}));
  }else {res.statusCode=404;res.end('{}');}
  return;
 }
 const allowStatic=new Set([
  '/frontend/tests/fixtures/board-cache-two-tab.html',
  '/frontend/data.js','/frontend/session.js','/frontend/config.js',
  '/frontend/board-cache-channel.js',
  '/frontend/tests/fixtures/board-virtual-browser.html',
  '/frontend/board-presentation.js','/frontend/board-window.js',
  '/frontend/styles.css'
 ]);
 const file=resolve(root,'.'+pathname);
 if(!allowStatic.has(pathname)||!existsSync(file)){
  res.statusCode=404;res.end('not found');return;
 }
 res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript; charset=utf-8':
  extname(file)==='.css'?'text/css; charset=utf-8':'text/html; charset=utf-8');
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
 const executable=chromePath();if(!executable)throw Error('BLOCKED: Chromium or Chrome not installed');
 const tmp=mkdtempSync(join(tmpdir(),'apsyntra-board-browser-'));
 let browser;let pages=[];
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
  // Hosted Chromium cold-start can exceed six seconds under CI load.
  await until(()=>existsSync(active),{attempts:250,delay:100});
  const debugPort=Number(readFileSync(active,'utf8').split('\n')[0]);
  const base='http://127.0.0.1:'+debugPort;
  const fixture='http://127.0.0.1:'+port+'/frontend/tests/fixtures/board-cache-two-tab.html';
  async function openTab(href=fixture,ready='window.acceptance'){
   const response=await fetch(base+'/json/new?'+encodeURIComponent(href),{method:'PUT',signal:AbortSignal.timeout(5000)});
   assert.equal(response.ok,true);
   const target=await response.json();
   const page=new Page(target.webSocketDebuggerUrl);
   await page.ready;
   await page.call('Runtime.enable');
   try{await until(()=>page.evaluate('Boolean('+ready+')'));}
   catch(error){console.error('PAGE_DEBUG',await page.evaluate('({url:location.href,ready:document.readyState,html:document.body.innerText})'));throw error;}
   pages.push(page);return page;
  }
  const [a,b]=await Promise.all([openTab(),openTab()]);
  await a.evaluate(`acceptance.setup('${USER}','${WS}')`);
  await b.evaluate(`acceptance.setup('${USER}','${WS}')`);
  // 5 direct reads, each server-side. A fresh auth view check always happens.
  for(let i=0;i<5;i++)await a.evaluate('acceptance.directRead()');
  const baseline=counts.boardReads;
  for(let i=0;i<5;i++)await a.evaluate('acceptance.navigate()');
  assert.equal(counts.boardReads-baseline,1,'five navigations must share one signed board read');
  assert.equal(counts.viewReads,5,'view authorization must never be cached');
  await b.evaluate('acceptance.navigate()');
  const before=counts.boardReads;
  await a.evaluate('acceptance.mutate()');
  await until(async()=>{
   const bStats=await b.evaluate('acceptance.stats()');
   return bStats?.data==='Changed group'&&bStats?.updates?.length>=1;
  });
  assert.equal(counts.boardReads,before+1,'other tab must perform fresh board read');
  assert.equal(counts.writes,1);
  assert.deepEqual(await b.evaluate('acceptance.stats().errors'),[]);
  // Cached board data never substitutes for a fresh signed view permission.
  assert.equal((await fetch('http://127.0.0.1:'+port+'/fixture/control/revoke-view',{method:'POST'})).ok,true);
  await assert.rejects(()=>b.evaluate('acceptance.navigate()'),/browser exception|Uncaught|denied/);
  assert.equal((await fetch('http://127.0.0.1:'+port+'/fixture/control/restore-view',{method:'POST'})).ok,true);
  // The same browser session but foreign workspace cannot reuse cached data.
  await b.evaluate(`acceptance.setup('${USER}','${FOREIGN_WS}')`);
  await assert.rejects(()=>b.evaluate('acceptance.navigate()'),/browser exception|Uncaught|denied/);
  const previousEvents=(await b.evaluate('acceptance.stats().updates')).length;
  await a.evaluate('acceptance.mutate()');
  await sleep(350);
  assert.equal((await b.evaluate('acceptance.stats().updates')).length,previousEvents);
  await b.evaluate('acceptance.signOut()');
  console.log('BROWSER_TWO_TAB_PASS: isolated Chromium actual cross-tab BroadcastChannel');
  console.log('BROWSER_PERMISSION_PASS: foreign workspace and revoked view denied; view permission rechecked per navigation');
  console.log('BROWSER_PERFORMANCE_PASS: direct_reads=5 cached_reads=1 reduction=80% (synthetic fixture, not production latency)');
  console.log('BROWSER_SYNC_PASS: second tab independently fetched updated board after mutation');
  const virtualUrl='http://127.0.0.1:'+port+'/frontend/tests/fixtures/board-virtual-browser.html';
  const v=await openTab(virtualUrl,'window.virtualAcceptance');
  const first=await v.evaluate('virtualAcceptance.stats()');
  assert.ok(first.count>0&&first.count<=64,'initial DOM window bounded');
  assert.equal(first.visibleTotal,600);
  assert.ok(first.tableHeight>=30000,'spacers must preserve natural page scroll height');
  const keyboard=await v.evaluate('virtualAcceptance.keyboard(false)');
  assert.equal(keyboard.focusRow,50,'Tab from last rendered row must focus next virtual record');
  const reverse=await v.evaluate('virtualAcceptance.keyboard(true)');
  assert.ok(reverse.focusRow>1&&reverse.focusRow<keyboard.focusRow,
   'Shift+Tab from first rendered row must reach previous virtual record');
  const scrolled=await v.evaluate('virtualAcceptance.scroll(16000)');
  assert.ok(scrolled.count>0&&scrolled.count<=64,'scrolled DOM window bounded');
  assert.notEqual(scrolled.first,first.first,'scroll must recycle visible rows');
  assert.ok(scrolled.spacerHeight>0);
  const filtered=await v.evaluate('virtualAcceptance.filter("Record 0555")');
  assert.equal(filtered.visibleTotal,1,'search all loaded rows, not mounted DOM');
  assert.equal(filtered.count,1);
  assert.equal(filtered.queryFound,true);
  const empty=await v.evaluate('virtualAcceptance.filter("not-an-item")');
  assert.equal(empty.visibleTotal,0);
  assert.match(empty.empty,/No matching items/);
  const restored=await v.evaluate('virtualAcceptance.filter("")');
  assert.equal(restored.visibleTotal,600);
  console.log('BROWSER_VIRTUAL_ROWS_PASS: 600 loaded items; bounded DOM, natural scroll, local search, empty state');
 }finally{
  for(const page of pages)page.close();
  if(browser){
   const exited=new Promise(resolveExit=>browser.once('exit',resolveExit));
   browser.kill('SIGTERM');
   await Promise.race([exited,sleep(1500)]);
  }
  await new Promise(resolveClose=>server.close(resolveClose));
  try{rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}catch{}
 }
}
run().catch(error=>{console.error('BROWSER_TWO_TAB_FAILED:',error.message);process.exitCode=1;});
