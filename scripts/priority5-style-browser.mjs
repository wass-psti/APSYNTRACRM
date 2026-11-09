/** Isolated real Chromium CSS equivalence and request-count profiling; no user data. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {STYLE_SOURCES,STYLE_BUNDLE} from './priority5-style-manifest.mjs';
const root=resolve(import.meta.dirname,'..');
const selectors=['shell','sidebar','side-section','nav-list','nav-link','main-content',
 'aps-board-shell','page-head','tabs','board-table','board-group-panel',
 'aps-overview','aps-sidebar','aps-topbar','aps-sync','stat-value',
 'aps-settings','aps-security','aps-tradelink-app','aps-board-loading'];
const sample=`<div id="app"><div class="shell"><aside class="sidebar aps-sidebar">
<div class="brand">APSYNTRA</div><div class="side-section">Workspace</div>
<div class="nav-list"><a class="nav-link active" href="#">Boards</a></div></aside>
<main class="main aps-board-shell aps-overview-shell"><header class="topbar aps-topbar">
<span class="aps-sync">Synchronized</span></header><section class="main-content">
<div class="aps-overview"><p class="stat-value">12</p></div>
<div class="aps-settings">Account settings</div><div class="aps-security">Permissions</div>
<div class="aps-tradelink-app">TradeLink</div>
<div class="page-head"><h1>Boards</h1></div>
<nav class="tabs"><a class="tab active">Items</a></nav>
<div class="panel board-group-panel"><div class="table-scroll board-group-scroll">
<table class="board-table board-table-custom"><thead><tr><th>Item</th></tr></thead>
<tbody><tr><td>Example item</td></tr></tbody></table></div></div>
<div class="aps-board-loading">Loading</div></section></main></div></div>`;
const html=(variant)=>'<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 (variant==='baseline'?STYLE_SOURCES.map(path=>'<link rel="stylesheet" href="/'+path+'">').join(''):
 '<link rel="stylesheet" href="/'+STYLE_BUNDLE+'">')+'</head><body>'+sample+'</body></html>';
const allow=new Set([...STYLE_SOURCES,STYLE_BUNDLE]);
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/baseline'||pathname==='/optimized'){
  res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');
  res.end(html(pathname.slice(1)));return;
 }
 const asset=pathname.slice(1);
 if(!allow.has(asset)){res.statusCode=404;res.end('not found');return;}
 res.setHeader('Content-Type',extname(asset)==='.css'?'text/css':'application/octet-stream');
 res.setHeader('Cache-Control','no-store');
 res.end(readFileSync(resolve(root,asset)));
});
function chromePath(){
 return [process.env.CHROME_BIN,'/Applications/Chromium.app/Contents/MacOS/Chromium',
 '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']
 .find(path=>path&&existsSync(path));
}
class Page{
 constructor(ws){this.ws=new WebSocket(ws);this.id=0;this.pending=new Map();
  this.ready=new Promise((resolveReady,reject)=>{
   this.ws.addEventListener('open',resolveReady);this.ws.addEventListener('error',reject)});
  this.ws.addEventListener('message',event=>{
   const data=JSON.parse(String(event.data));if(!data.id)return;
   const action=this.pending.get(data.id);if(!action)return;
   this.pending.delete(data.id);
   if(data.error)action.reject(Error(data.error.message));else action.resolve(data.result);
  });
 }
 async call(method,params={}){await this.ready;const id=++this.id;
  return new Promise((resolveCall,reject)=>{
   const timeout=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout '+method))},10000);
   this.pending.set(id,{resolve:v=>{clearTimeout(timeout);resolveCall(v)},
    reject:e=>{clearTimeout(timeout);reject(e)}});
   this.ws.send(JSON.stringify({id,method,params}));
  });
 }
 async evaluate(expression){const value=await this.call('Runtime.evaluate',
  {expression,awaitPromise:true,returnByValue:true});
  if(value.exceptionDetails)throw Error(value.exceptionDetails.text);
  return value.result?.value;
 }
 close(){this.ws.close();}
}
async function until(fn,n=250){for(let i=0;i<n;i++){
 try{if(await fn())return true}catch{}await sleep(100)}throw Error('Browser startup/paint timeout');}
async function run(){
 const bin=chromePath();if(!bin)throw Error('Chromium unavailable');
 const profile=mkdtempSync(join(tmpdir(),'apsyntra-css-profile-'));
 let browser,page;
 try{
  await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
  const port=server.address().port;
  browser=spawn(bin,['--headless=new','--no-first-run','--disable-background-networking',
    '--disable-extensions','--disable-sync','--no-sandbox','--disable-dev-shm-usage',
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
  const active=join(profile,'DevToolsActivePort');
  try{await until(()=>existsSync(active));}catch{
   throw Object.assign(new Error('Chromium launch failed'),{code:'CHROME_STARTUP_TIMEOUT'})}
  const debugPort=Number(readFileSync(active,'utf8').split('\n')[0]);
  const debug='http://127.0.0.1:'+debugPort;
  const target=await(await fetch(debug+'/json/new?'+encodeURIComponent('about:blank'),
   {method:'PUT',signal:AbortSignal.timeout(8000)})).json();
  page=new Page(target.webSocketDebuggerUrl);await page.ready;
  await page.call('Runtime.enable');await page.call('Page.enable');
  await page.call('Network.enable');await page.call('Network.setCacheDisabled',{cacheDisabled:true});
  const trials={baseline:[],optimized:[]};
  for(let sampleNum=0;sampleNum<3;sampleNum++)for(const variant of ['baseline','optimized']){
   await page.call('Page.navigate',{url:'http://127.0.0.1:'+port+'/'+variant+'?sample='+sampleNum});
   await until(()=>page.evaluate(`document.readyState==='complete'&&
    performance.getEntriesByType('resource').filter(r=>r.initiatorType==='link').length>=${variant==='baseline'?STYLE_SOURCES.length:1}`),120);
   const snapshot=await page.evaluate(`(async()=>{
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const entries=performance.getEntriesByType('resource').filter(r=>r.initiatorType==='link');
    const nav=performance.getEntriesByType('navigation')[0];
    const properties=['color','backgroundColor','fontFamily','fontSize','fontWeight',
     'lineHeight','display','position','padding','borderRadius','gap','opacity',
     'transform','width','height','overflowX','overflowY'];
    const snap={};
    const nodes=document.querySelectorAll('#app *');
    for(const node of nodes){
     const key=node.tagName+':'+node.className+':'+node.parentElement?.className;
     const style=getComputedStyle(node);
     snap[key]=Object.fromEntries(properties.map(p=>[p,style[p]]));
    }
    return {count:entries.length,bytes:entries.reduce((v,e)=>v+e.decodedBodySize,0),
      loadMs:Math.round(nav.loadEventEnd-nav.startTime),styles:snap};
   })()`);
   trials[variant].push(snapshot);
  }
  const base=trials.baseline,optimized=trials.optimized;
  assert.ok(base.every(x=>x.count===41),'baseline stylesheet count must be 41');
  assert.ok(optimized.every(x=>x.count===1),'bundled stylesheet count must be 1');
  for(let i=0;i<base.length;i++)assert.deepEqual(optimized[i].styles,base[i].styles,
   'Computed CSS must not change after bundling');
  const times=values=>values.map(x=>x.loadMs);
  console.log('CSS_PROFILE: '+JSON.stringify({baseline:{requests:41,decodedBytes:base[0].bytes,
   loadMs:times(base)},bundled:{requests:1,decodedBytes:optimized[0].bytes,
   loadMs:times(optimized)},samples:base.length,representativeElements:Object.keys(base[0].styles).length}));
  console.log('CSS_CASCADE_PASS: identical computed style for representative elements across three isolated trials');
 }finally{
  page?.close();if(browser){const exited=new Promise(done=>browser.once('exit',done));
   browser.kill('SIGTERM');await Promise.race([exited,sleep(1500)]);}
  await new Promise(done=>server.close(done));
  try{rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})}catch{}
 }
}
run().catch(error=>{console.error('CSS_PROFILE_FAILED:',error.message);
 process.exitCode=error.code==='CHROME_STARTUP_TIMEOUT'?75:1;});
