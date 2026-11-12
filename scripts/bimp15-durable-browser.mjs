/** Disposable real-Chromium UI proof. All board records and sessions are synthetic. */
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const path='/frontend/tests/fixtures/board-import-durable-browser.html';
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname!==path&&!/^\/frontend\/[\w/.-]+\.js$/.test(pathname)){
  res.writeHead(404);res.end('not found');return;
 }
 const file=resolve(root,'.'+pathname);
 if(!file.startsWith(resolve(root,'frontend')+'/')){
  res.writeHead(403);res.end('denied');return;
 }
 res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':'text/html');
 try{res.end(readFileSync(file));}catch{res.writeHead(404);res.end('not found');}
});
const chromePath=()=>[process.env.CHROME_BIN,
 '/Applications/Chromium.app/Contents/MacOS/Chromium',
 '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 '/usr/bin/chromium'].find(f=>f&&existsSync(f));
async function until(fn,{attempts=120,delay=100}={}){
 for(let i=0;i<attempts;i++){
  try{const v=await fn();if(v)return v;}catch{}
  await sleep(delay);
 }throw Error('Timed out waiting for Chromium import recovery');
}
class Page{
 constructor(ws){
  this.ws=new WebSocket(ws);this.nextId=0;this.pending=new Map();
  this.ready=new Promise((resolveReady,reject)=>{
   this.ws.addEventListener('open',resolveReady);this.ws.addEventListener('error',reject);
  });
  this.ws.addEventListener('message',e=>{
   const message=JSON.parse(String(e.data));
   if(!message.id){
    if(message.method==='Runtime.exceptionThrown')console.error('BROWSER_EXCEPTION',
     JSON.stringify(message.params?.exceptionDetails?.exception?.description||message.params));
    return;
   }
   const pending=this.pending.get(message.id);if(!pending)return;
   this.pending.delete(message.id);
   if(message.error)pending.reject(Error(message.error.message));
   else pending.resolve(message.result);
  });
 }
 async call(method,params={}){
  await this.ready;const id=++this.nextId;
  return new Promise((resolveCall,reject)=>{
   const timeout=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},6000);
   this.pending.set(id,{resolve:x=>{clearTimeout(timeout);resolveCall(x);},
    reject:x=>{clearTimeout(timeout);reject(x);}});
   this.ws.send(JSON.stringify({id,method,params}));
  });
 }
 async evaluate(expression){
  const r=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
 }
 close(){this.ws.close();}
}
async function run(){
 const chrome=chromePath();if(!chrome)throw Error('Chromium unavailable');
 const temp=mkdtempSync(join(tmpdir(),'bimp15-disposable-'));
 let browser,page;
 try{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  browser=spawn(chrome,['--headless=new','--no-first-run','--disable-extensions',
   '--disable-background-networking','--disable-sync','--no-sandbox',
   '--disable-dev-shm-usage','--user-data-dir='+temp,
   '--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
  const active=join(temp,'DevToolsActivePort');
  await until(()=>existsSync(active),{attempts:250});
  const portNumber=Number(readFileSync(active,'utf8').split('\n')[0]);
  const base='http://127.0.0.1:'+portNumber;
  const url='http://127.0.0.1:'+server.address().port+path;
  let target;
  try{
   target=await (await fetch(base+'/json/new?'+encodeURIComponent(url),{
    method:'PUT',signal:AbortSignal.timeout(12000)})).json();
  }catch(cause){
   throw Object.assign(new Error('Chromium debugging endpoint was unavailable during startup'),
    {code:'CHROME_STARTUP_TIMEOUT',cause});
  }
  page=new Page(target.webSocketDebuggerUrl);await page.ready;
  await page.call('Runtime.enable');
  await until(()=>page.evaluate('!!window.bimp15Browser'));
  const seeded=await page.evaluate('bimp15Browser.seed()');
  assert.equal(seeded.completed,1);
  assert.equal(seeded.rawContainsData,false);
  assert.equal(seeded.persistedRows,1);
  await page.call('Page.enable');
  await page.call('Page.navigate',{url});
  await until(()=>page.evaluate('!!window.bimp15Browser'));
  const startup=await page.evaluate('bimp15Browser.launch()');
  assert.match(startup,/Previous import: 1 of 3 rows verified/);
  await page.evaluate('bimp15Browser.upload()');
  await until(()=>page.evaluate('bimp15Browser.state().text.includes("Source verified")'));
  assert.match((await page.evaluate('bimp15Browser.state()')).text,/remaining 2 rows/);
  await page.evaluate('bimp15Browser.click("next")');
  await until(()=>page.evaluate('bimp15Browser.state().text.includes("Review remaining rows")'));
  assert.equal(await page.evaluate('bimp15Browser.confirm()'),true);
  await page.evaluate('bimp15Browser.click("import")');
  await until(()=>page.evaluate('bimp15Browser.state().text.includes("Import committed")'));
  const completed=await page.evaluate('bimp15Browser.state()');
  assert.equal(completed.items,3);
  assert.deepEqual(completed.values,['A-1','B-2','C-3']);
  assert.equal(completed.marker,false);
  assert.equal(completed.writes,1);
  assert.equal(completed.finished.created,3);
  await page.call('Page.navigate',{url});
  await until(()=>page.evaluate('!!window.bimp15Browser'));
  const refreshed=await page.evaluate('bimp15Browser.state()');
  assert.equal(refreshed.items,3);
  assert.equal(refreshed.marker,false);
  console.log('BIMP15_CHROMIUM_RESTART_IMPORT_PASS: 1 verified existing + 2 recovered rows, one signed-fixture atomic write; refresh persisted');
 }finally{
  page?.close();server.close();
  if(browser){
   if(browser.exitCode===null&&browser.signalCode===null)browser.kill('SIGTERM');
   await Promise.race([
    new Promise(ok=>browser.once('close',ok)),
    sleep(1800)
   ]);
  }
  // Chromium may briefly flush its profile after exit on APFS.
  for(let attempt=0;attempt<10;attempt++){
   try{rmSync(temp,{recursive:true,force:true,maxRetries:2,retryDelay:50});break;}
   catch(error){
    if(attempt===9||error?.code!=='ENOTEMPTY')throw error;
    await sleep(150);
   }
  }
 }
}
run().catch(error=>{console.error(error);
 process.exitCode=error.code==='CHROME_STARTUP_TIMEOUT'?75:1;});
