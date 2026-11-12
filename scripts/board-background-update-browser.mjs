/** Disposable Chromium DOM-patch acceptance: no credentials, backend or writes. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const root=resolve(import.meta.dirname,'..');
const fixture=`<!doctype html><html><body><div id="app"><div class="shell">
<nav id="retained-sidebar"><button id="nav">Boards</button></nav>
<main class="main"><header id="retained-header"><button id="refresh">Refresh</button></header>
<div class="main-content"><h1 id="board-title">QA board</h1>
<div data-board-live-content><input id="search-board-items" value="draft search">
<div class="board-group-scroll" style="overflow-x:auto;width:140px">
<table data-group-id="group-1" style="width:300px"><tbody><tr><td id="record">Before</td></tr></tbody></table></div>
<button id="edit">Edit</button></div></div></main></div></div>
<script type="module">import {replaceVisibleBoardContent} from '/frontend/board-background-update.js';
window.patchBoard=html=>replaceVisibleBoardContent(document.getElementById('app'),html);
</script></body></html>`;
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}
 if(path==='/frontend/board-background-update.js'||path==='/frontend/board-scroll-state.js'){
  res.setHeader('Content-Type','text/javascript');res.end(readFileSync(resolve(root,path.slice(1))));return;
 }
 res.writeHead(404).end();
});
class CDP{
 constructor(url){this.ws=new WebSocket(url);this.i=0;this.pending=new Map();this.ready=new Promise(ok=>this.ws.addEventListener('open',ok));this.ws.addEventListener('message',e=>{const o=JSON.parse(String(e.data));if(!o.id)return;const p=this.pending.get(o.id);if(!p)return;this.pending.delete(o.id);o.error?p.reject(Error(o.error.message)):p.resolve(o.result);});}
 async call(method,params={}){await this.ready;return new Promise((resolveCall,reject)=>{const id=++this.i;this.pending.set(id,{resolve:resolveCall,reject});this.ws.send(JSON.stringify({id,method,params}));});}
 async eval(expr){const r=await this.call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text||'JavaScript exception');return r.result?.value;}
 close(){this.ws.close();}
}
async function until(fn){for(let i=0;i<180;i++){try{if(await fn())return}catch{}await sleep(60)}throw Error('Chrome startup timeout')}
async function main(){
 const chrome=[process.env.CHROME_BIN,'/Applications/Chromium.app/Contents/MacOS/Chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(path=>path&&existsSync(path));
 assert.ok(chrome,'Chromium unavailable');const profile=mkdtempSync(join(tmpdir(),'aps-board-refresh-'));
 let browser,page;try{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 browser=spawn(chrome,['--headless=new','--no-first-run','--no-sandbox','--disable-background-networking','--disable-extensions','--disable-sync','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
 await until(()=>existsSync(join(profile,'DevToolsActivePort')));
 const port=Number(readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);
 const target=await(await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'})).json();
 page=new CDP(target.webSocketDebuggerUrl);await page.call('Runtime.enable');await page.call('Page.enable');
 await page.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
 await until(()=>page.eval('typeof window.patchBoard==="function"'));
 const outcome=await page.eval(`(()=>{
  const nav=document.getElementById('nav'),header=document.getElementById('refresh'),search=document.getElementById('search-board-items');
  const scroller=document.querySelector('.board-group-scroll');
  scroller.scrollLeft=75;search.value='user draft';
  const html='<div data-board-live-content><input id="search-board-items" value="user draft">'+
   '<div class="board-group-scroll" style="overflow-x:auto;width:140px">'+
   '<table data-group-id="group-1" style="width:300px"><tbody><tr><td id="record">After</td></tr></tbody></table></div></div>';
  const updated=window.patchBoard(html);
  return {updated,sameNav:nav===document.getElementById('nav'),sameHeader:header===document.getElementById('refresh'),
   record:document.getElementById('record')?.textContent,search:document.getElementById('search-board-items')?.value,
   scroll:document.querySelector('.board-group-scroll')?.scrollLeft,
   loader:!!document.querySelector('.aps-board-loading')};
 })()`);
 assert.deepEqual(outcome,{updated:true,sameNav:true,sameHeader:true,record:'After',search:'user draft',scroll:75,loader:false});
 console.log('BOARD_BACKGROUND_BROWSER_PASS '+JSON.stringify(outcome));
 }finally{page?.close();if(browser){browser.kill('SIGTERM');await sleep(450)}await new Promise(ok=>server.close(ok));try{rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}catch{}}
}
main().catch(error=>{console.error('BOARD_BACKGROUND_BROWSER_FAIL',error.stack||error.message);process.exitCode=1});
