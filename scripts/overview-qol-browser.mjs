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
const part=app.slice(app.indexOf('function overview(){'),app.indexOf('function boardsPage(){'));
const render=new Function('state','name','e','overviewIcon','boardCard','empty','signedCrmRoleLabel','signedCrmIdentityLabel','workspaceRelationLabel',part+'\nreturn overview();');
const boards=Array.from({length:175},(_,i)=>({id:String(i),name:'Example board '+i,item_count:i?0:6212}));
const card=b=>'<article class="board-card"><a class="board-card-main" href="#/boards/'+b.id+'"><h3>'+b.name+'</h3><p>Description</p><div class="board-card-footer">0 items</div></a></article>';
const markup=render({boards,roleVerified:false,context:{profile:{platform_role:'employee'}}},()=>'Example User',String,()=>'',card,()=>'',()=>'Member',()=>'member',()=>'Workspace member');
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"></head><body><div id="app"><main class="main aps-overview-shell"><div class="main-content">'+markup+'</div></main></div></body></html>';
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
const profile=mkdtempSync(join(tmpdir(),'aps-overview-qol-'));
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
  await wait(()=>evaluate("document.readyState==='complete' && !!document.querySelector('.aps-overview')"));
  const result=await evaluate(`(()=>{
    const cards=[...document.querySelectorAll('.overview-board-grid .board-card')];
    const action=document.querySelector('.overview-section-heading .inline-link');
    return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,
    cards:cards.length,preview:document.querySelector('.overview-board-count')?.textContent,
    counts:[...document.querySelectorAll('.stat-card')].map(n=>n.getAttribute('aria-label')),
    actionHeight:Math.round(action.getBoundingClientRect().height)};
  })()`);
  assert.equal(result.overflow,false,'overflow at '+width);
  assert.equal(result.cards,6);
  assert.equal(result.preview,'Showing 6 of 175 available boards');
  assert.ok(result.counts.includes('Board items: 6,212'));
  assert.ok(result.actionHeight>=44);
  console.log('OVERVIEW_BROWSER_PASS '+JSON.stringify(result));
 }
}finally{
 ws?.close();child?.kill('SIGTERM');await new Promise(ok=>server.close(ok));await delay(350);try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
