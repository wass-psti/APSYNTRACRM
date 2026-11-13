/** Credential-free Chromium acceptance for the public login presentation. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const root=process.cwd();
const app=readFileSync(root+'/frontend/app.js','utf8');
const source=app.slice(app.indexOf('function boardsPage(){'),app.indexOf('function groupRows(',app.indexOf('function boardsPage(){')));
const render=new Function('state','cards','matchBoardSearch','overviewIcon','boardCard','empty','e','BOARD_CARD_LIFECYCLE_ENABLED','boardCatalogResultLabel',source+'\nreturn boardsPage()');
const boardData=Array.from({length:182},(_,i)=>({name:'Example board '+i,id:String(i),description:'Board description'}));
const card=b=>'<article class="board-card" data-searchable="'+b.name.toLowerCase()+'"><div class="board-card-top"><details class="board-card-actions"><summary aria-label="Board actions">•••</summary></details></div><a class="board-card-main" href="#/boards/'+b.id+'"><h3>'+b.name+'</h3><p>Description</p><div class="board-card-footer"><span>1 item</span><span>Nov 13, 2026</span></div></a></article>';
const markup=render({boardSearch:'',showArchived:false,showTrash:false},()=>boardData,()=>true,()=>'',card,()=>'',String,true,()=> '182 active boards');
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"></head><body><div id="app"><main class="main aps-boards-shell"><div class="main-content">'+markup+'</div></main></div></body></html>';
const server=createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 if(req.url==='/frontend/apsyntra-styles.bundle.css'){
  res.setHeader('Content-Type','text/css');
  res.end(readFileSync(root+'/frontend/apsyntra-styles.bundle.css'));return;
 }
 res.statusCode=404;res.end('not found');
});
const chrome=['/Applications/Chromium.app/Contents/MacOS/Chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
if(!chrome)throw Error('Chromium not installed');
const profile=mkdtempSync(join(tmpdir(),'aps-boards-qol-'));
const wait=async fn=>{for(let i=0;i<100;i++){try{const result=await fn();if(result)return result}catch{}await delay(100)}throw Error('Browser startup timeout')};
let child,ws;const pending=new Map();let id=0;
const call=(method,params={})=>new Promise((resolve,reject)=>{
 const key=++id;const timeout=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method))},12000);
 pending.set(key,{resolve:v=>{clearTimeout(timeout);resolve(v)},reject:e=>{clearTimeout(timeout);reject(e)}});
 ws.send(JSON.stringify({id:key,method,params}));
});
const evaluate=async expression=>{
 const response=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(response.exceptionDetails)throw Error(response.exceptionDetails.text);
 return response.result?.value;
};
try{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 child=spawn(chrome,['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync','--no-sandbox','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
 const active=join(profile,'DevToolsActivePort');await wait(()=>existsSync(active));
 const port=+readFileSync(active,'utf8').split('\n')[0];
 const target=await(await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((ok,fail)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',fail,{once:true})});
 ws.addEventListener('message',event=>{
  const msg=JSON.parse(String(event.data));const entry=pending.get(msg.id);if(!entry)return;
  pending.delete(msg.id);if(msg.error)entry.reject(Error(msg.error.message));else entry.resolve(msg.result);
 });
 await call('Runtime.enable');await call('Page.enable');
 for(const width of [1440,768,390,320]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
  await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  await wait(()=>evaluate("document.readyState==='complete' && !!document.querySelector('.aps-boards')"));
  const result=await evaluate(`(()=>{
   const first=document.querySelector('.boards-catalog-grid .board-card');
   const segment=document.querySelector('.boards-status-segments .segment');
   const summary=first.querySelector('.board-card-actions>summary');
   return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,
    cards:document.querySelectorAll('.boards-catalog-grid .board-card').length,
    text:document.querySelector('#board-search-result')?.textContent,
    statusHeight:Math.round(segment.getBoundingClientRect().height),
    summaryWidth:Math.round(summary.getBoundingClientRect().width),
    summaryHeight:Math.round(summary.getBoundingClientRect().height),
    searchVisible:document.querySelector('#board-search').getBoundingClientRect().width>0};
  })()`);
  console.log('MEASURE',JSON.stringify(result));
  assert.equal(result.overflow,false,'overflow at '+width);
  assert.equal(result.cards,182);
  assert.equal(result.text,'182 active boards');
  assert.ok(result.statusHeight>=44);
  assert.ok(result.summaryWidth>=44&&result.summaryHeight>=44);
  assert.equal(result.searchVisible,true);
  console.log('BOARDS_BROWSER_PASS '+JSON.stringify(result));
 }
}finally{
 ws?.close();child?.kill('SIGTERM');await new Promise(ok=>server.close(ok));await delay(350);try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
