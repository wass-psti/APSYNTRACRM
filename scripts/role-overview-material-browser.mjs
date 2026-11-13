/** Credential-free Chromium acceptance for the public login presentation. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const root=process.cwd();
import {renderRoleConfiguration} from '../frontend/role-configuration-ui.js';
const markup=renderRoleConfiguration({verified:true,tab:'matrix',data:{
 workspaceId:'local-fixture',roles:[],users:[],assignments:[],boards:[],proposals:[],audit:[]
}});
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"></head><body><div id="app"><main class="main aps-role-config-shell"><div class="main-content">'+markup+'</div></main></div></body></html>';
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
const profile=mkdtempSync(join(tmpdir(),'aps-role-qol-'));
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
  await wait(()=>evaluate("document.readyState==='complete' && !!document.querySelector('.aps-role-configuration')"));
  const result=await evaluate(`(()=>{
   const matrix=document.querySelector('.role-table-scroll');
   const first=document.querySelector('button[data-action="role-propose-permission"]');
   const tabs=[...document.querySelectorAll('.role-tab-button')];
   const mr=matrix.getBoundingClientRect();
   return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,
     actions:document.querySelectorAll('button[data-action="role-propose-permission"]').length,
     label:first?.getAttribute('aria-label'),tableFocusable:matrix.tabIndex===0,
     horizontalScrollable:matrix.scrollWidth>matrix.clientWidth,
     tableWithinViewport:mr.left>=-1&&mr.right<=innerWidth+1,
     minTabHeight:Math.round(Math.min(...tabs.map(t=>t.getBoundingClientRect().height))),
     heroBackground:getComputedStyle(document.querySelector('.role-config-hero')).backgroundColor,
     heroText:getComputedStyle(document.querySelector('.role-config-hero h1')).color,
     heroBorderRadius:getComputedStyle(document.querySelector('.role-config-hero')).borderRadius,
     statBackground:getComputedStyle(document.querySelector('.role-stat-card')).backgroundColor,
     statHoverTransform:getComputedStyle(document.querySelector('.role-stat-card')).transform,
     activeTabBackground:getComputedStyle(document.querySelector('.role-tab-button.primary')).backgroundColor,
     noteBackground:getComputedStyle(document.querySelector('.role-staged-note')).backgroundColor,
     heroInside:(()=>{const r=document.querySelector('.role-config-hero').getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;})(),
     tabsInside:(()=>{const r=document.querySelector('.role-config-tabs').getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;})()
    };
  })()`);
  assert.equal(result.overflow,false,'overflow at '+width);
  assert.equal(result.actions,84);
  assert.ok(result.label.includes('no live permission change'));
  assert.equal(result.tableFocusable,true);
  assert.equal(result.tableWithinViewport,true);
  assert.ok(result.minTabHeight>=44);
  assert.equal(result.heroBackground,'rgb(255, 255, 255)');
  assert.equal(result.statBackground,'rgb(255, 255, 255)');
  assert.equal(result.heroText,'rgb(37, 48, 71)');
  assert.equal(result.activeTabBackground,'rgb(255, 255, 255)');
  assert.equal(result.statHoverTransform,'none');
  assert.equal(result.heroInside,true);
  assert.equal(result.tabsInside,true);
  console.log('ROLE_OVERVIEW_MATERIAL_BROWSER_PASS '+JSON.stringify(result));
 }
}finally{
 ws?.close();child?.kill('SIGTERM');await new Promise(ok=>server.close(ok));await delay(350);try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
