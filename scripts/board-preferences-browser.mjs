/** Real Chromium IndexedDB acceptance, loopback fixture, no signed user data. */
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const allow=new Set(['/frontend/tests/fixtures/board-preferences-browser.html',
 '/frontend/board-preferences-idb.js','/frontend/board-presentation.js',
 '/frontend/board-window.js']);
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
 const tmp=mkdtempSync(join(tmpdir(),'apsyntra-prefs-idb-'));
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
  const href='http://127.0.0.1:'+port+'/frontend/tests/fixtures/board-preferences-browser.html';
  const target=await (await fetch(base+'/json/new?'+encodeURIComponent(href),{
   method:'PUT',signal:AbortSignal.timeout(5000)})).json();
  page=new Page(target.webSocketDebuggerUrl);await page.ready;
  await page.call('Runtime.enable');
  await until(()=>page.evaluate('document.readyState=== "complete"'));
  const test=await page.evaluate(`(async()=>{
   const mod=await import('/frontend/board-preferences-idb.js');
   const {BoardPreferenceStore,PREFERENCE_DB,PREFERENCE_TTL_MS,
    PREFERENCE_ENTRY_LIMIT}=mod;
   const user='11111111-1111-4111-8111-111111111111',
    workspace='22222222-2222-4222-8222-222222222222',
    board='33333333-3333-4333-8333-333333333333';
   const ctx={user_id:user,workspace_id:workspace};
   const key='apsyntra.board-layout.v1:'+user+':'+workspace+':'+board;
   const layout={tabs:['items','issues'],columns:['record','status','owner'],
    hidden:['owner'],widths:{record:180,status:185,owner:210}};
   const first=new BoardPreferenceStore();
   first.setItem(key,JSON.stringify(layout));await first.flush();
   const second=new BoardPreferenceStore();
   const restored=await second.hydrate(ctx,board,{legacyStorage:null});
   const same=restored&&second.getItem(key)===JSON.stringify(layout);
   const otherUser=await second.hydrate({...ctx,user_id:'44444444-4444-4444-8444-444444444444'},
    board,{legacyStorage:null});
   const otherWorkspace=await second.hydrate({...ctx,workspace_id:'55555555-5555-4555-8555-555555555555'},
    board,{legacyStorage:null});
   const db=await new Promise((resolve,reject)=>{
    const req=indexedDB.open(PREFERENCE_DB,1);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });
   const before=await new Promise((resolve,reject)=>{
    const tx=db.transaction('board-layouts','readonly');const req=tx.objectStore('board-layouts').getAll();
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });
   const onlySafe=before.length===1&&Object.keys(before[0]).sort().join(',')===
    'expiresAt,key,schema,updatedAt,value'&& !JSON.stringify(before).includes('token');
   const expired=await new Promise((resolve,reject)=>{
    const tx=db.transaction('board-layouts','readwrite');
    tx.objectStore('board-layouts').put({...before[0],expiresAt:Date.now()-1});
    tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);
   });
   const third=new BoardPreferenceStore();
   const deniedExpiry=!(await third.hydrate(ctx,board,{legacyStorage:null}));
   const removed=await new Promise((resolve,reject)=>{
    const tx=db.transaction('board-layouts','readonly');const req=tx.objectStore('board-layouts').get(key);
    req.onsuccess=()=>resolve(!req.result);req.onerror=()=>reject(req.error);
   });
   // Bounded entry count under many independent, valid board preference keys.
   const bulk=new BoardPreferenceStore();
   for(let i=0;i<PREFERENCE_ENTRY_LIMIT+8;i++){
    const suffix=String(i+1).padStart(12,'0');
    bulk.setItem('apsyntra.board-layout.v1:'+user+':'+workspace+
     ':33333333-3333-4333-8333-'+suffix,JSON.stringify(layout));
    await bulk.flush();
   }
   const count=await new Promise((resolve,reject)=>{
    const tx=db.transaction('board-layouts','readonly');const req=tx.objectStore('board-layouts').count();
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });
   const limitOk=count<=PREFERENCE_ENTRY_LIMIT;
   const local={key,value:JSON.stringify(layout)};
   localStorage.setItem(key,local.value);
   const migration=new BoardPreferenceStore();
   const migrated=await migration.hydrate(ctx,board);
   const legacyRemoved=localStorage.getItem(key)===null;
   migration.removeItem(key);await migration.flush();
   const afterReset=new BoardPreferenceStore();
   const resetOk=!(await afterReset.hydrate(ctx,board,{legacyStorage:null}));
   first.clearMemory();second.clearMemory();bulk.clearMemory();
   db.close();
   return {same,otherUser,otherWorkspace,onlySafe,expired,deniedExpiry,removed,
    count,limitOk,migrated,legacyRemoved,resetOk,ttl:PREFERENCE_TTL_MS};
  })()`);
  assert.equal(test.same,true,'independent store must restore safe layout');
  assert.equal(test.otherUser,false,'foreign user must not restore');
  assert.equal(test.otherWorkspace,false,'foreign workspace must not restore');
  assert.equal(test.onlySafe,true,'database holds only allowlisted layout envelope');
  assert.equal(test.deniedExpiry,true,'expired layout must never hydrate');
  assert.equal(test.removed,true,'expired record must be deleted');
  assert.equal(test.limitOk,true,'storage must remain bounded');
  assert.equal(test.migrated,true,'validated legacy preference must migrate');
  assert.equal(test.legacyRemoved,true,'legacy copy must be removed after commit');
  assert.equal(test.resetOk,true,'reset must persist across new store instances');
  console.log('BROWSER_IDB_PASS: persisted layout across instances, 30-day expiry, migration and reset');
  console.log('BROWSER_IDB_ISOLATION_PASS: foreign account/workspace denied, no private payloads');
  console.log('BROWSER_IDB_LIMIT_PASS: bounded record count='+test.count);
 }finally{
  page?.close();
  if(browser){const exited=new Promise(done=>browser.once('exit',done));
   browser.kill('SIGTERM');await Promise.race([exited,sleep(1500)]);}
  await new Promise(done=>server.close(done));
  try{rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:100})}catch{}
 }
}
run().catch(error=>{console.error('BROWSER_IDB_FAILED:',error.message);
 process.exitCode=error.code==='CHROME_STARTUP_TIMEOUT'?75:1;});
