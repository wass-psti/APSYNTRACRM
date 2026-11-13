/** Credential-free Chromium acceptance for the public login presentation. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const root=process.cwd();
import {renderUserRoleManagement} from '../frontend/user-role-management.js';
const userId='11111111-1111-4111-8111-111111111111';
const data={users:[{id:userId,name:'Example Member',email:'member@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:1}],
 crmPlatformRoles:[{userId,effectiveRole:'employee',assignedRole:null}],
 modules:[],moduleAssignments:[{userId,moduleId:'tradelink',role:'User',enabled:true}],
 boards:Array.from({length:187},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),name:'Example board '+i})),
 boardAssignments:[],workspaceScopedMrhAvailable:true,crmPlatformUnavailable:false};
const markup=renderUserRoleManagement({verified:true,data,selectedUserId:userId,accessSection:'boards'});
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"></head><body><div id="app"><main class="main aps-user-roles-shell"><div class="main-content">'+markup+'</div></main></div></body></html>';
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
const profile=mkdtempSync(join(tmpdir(),'aps-user-role-flow-'));
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
  await wait(()=>evaluate("document.readyState==='complete' && !!document.querySelector('.aps-user-role-management')"));
  const result=await evaluate(`(()=>{
   const regions=[...document.querySelectorAll('.user-role-table-scroll')];
   const nav=[...document.querySelectorAll('.user-role-access-nav button')];
   const boards=document.querySelector('[data-role-access-section="boards"]');
   const apps=document.querySelector('[data-role-access-section="applications"]');
   const visible=regions.filter(r=>r.getClientRects().length>0);
   const buttons=[...boards.querySelectorAll('.user-role-table td button')].filter(b=>!b.disabled);
   return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,
     nav:nav.length,active:nav.filter(n=>n.getAttribute('aria-pressed')==='true').length,
     boardsVisible:!boards.hidden,appsHidden:apps.hidden,visibleRegions:visible.length,
     focusable:visible.every(r=>r.tabIndex===0),
     inside:visible.every(r=>r.getBoundingClientRect().left>=-1&&r.getBoundingClientRect().right<=innerWidth+1),
     scrollable:visible.some(r=>r.scrollWidth>r.clientWidth),
     boards:boards.querySelectorAll('button[data-action="user-role-edit-board"]').length,
     minActionHeight:Math.round(Math.min(...buttons.map(b=>b.getBoundingClientRect().height))),
     tabHeights:nav.map(n=>Math.round(n.getBoundingClientRect().height))};
  })()`);
  assert.equal(result.overflow,false,'overflow at '+width);
  assert.equal(result.nav,2);
  assert.equal(result.active,1);
  assert.equal(result.boardsVisible,true);
  assert.equal(result.appsHidden,true);
  assert.equal(result.visibleRegions,1);
  assert.equal(result.focusable,true);
  assert.equal(result.inside,true);
  assert.equal(result.boards,187);
  assert.ok(result.minActionHeight>=44);
  assert.ok(result.tabHeights.every(height=>height>=44));
  if(width<=390)assert.equal(result.scrollable,true);
  console.log('USER_ROLE_FLOW_BROWSER_PASS '+JSON.stringify(result));
 }
}finally{
 ws?.close();child?.kill('SIGTERM');await new Promise(ok=>server.close(ok));await delay(350);try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
