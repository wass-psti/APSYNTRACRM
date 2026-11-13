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
const data={users:Array.from({length:40},(_,i)=>({id:'11111111-1111-4111-8111-'+String(i+1).padStart(12,'0'),name:'Example Member '+(i+1),email:'member'+(i+1)+'@example.invalid',platformRole:'employee',protected:false,activeWorkspaceCount:1})),
 crmPlatformRoles:[{userId,effectiveRole:'employee',assignedRole:null}],
 modules:[],moduleAssignments:[{userId,moduleId:'tradelink',role:'User',enabled:true}],
 boards:Array.from({length:187},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),name:'Example board '+i})),
 boardAssignments:[],workspaceScopedMrhAvailable:true,crmPlatformUnavailable:false};
const markup=renderUserRoleManagement({verified:true,data,selectedUserId:data.users[0].id,
 batchMode:true,batchSelected:[data.users[0].id,data.users[1].id],batchScope:'board',
 batchResource:data.boards[0].id,batchRole:'editor'});
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
const profile=mkdtempSync(join(tmpdir(),'aps-user-role-batch-'));
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
   const panel=document.querySelector('.user-role-batch-panel');
   const mode=[...document.querySelectorAll('.user-role-mode-nav button')];
   const boxes=[...document.querySelectorAll('[data-user-role-batch-member]')];
   const formControls=[...panel.querySelectorAll('select')];
   const review=panel.querySelector('[data-action="user-role-batch-review"]');
   const rect=panel.getBoundingClientRect();
   return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,
    mode:mode.length,active:mode.filter(b=>b.getAttribute('aria-pressed')==='true').length,
    selected:boxes.filter(b=>b.checked).length,memberCount:boxes.length,
    controls:formControls.length,reviewEnabled:!review.disabled,
    panelInside:rect.left>=-1&&rect.right<=innerWidth+1,
    reviewHeight:Math.round(review.getBoundingClientRect().height),
    modeHeights:mode.map(b=>Math.round(b.getBoundingClientRect().height)),
    roleSelected:panel.querySelector('#user-role-batch-role')?.value,
    gridColumns:getComputedStyle(panel.querySelector('.user-role-batch-layout')).gridTemplateColumns.split(' ').length,
    summaryPresent:!!panel.querySelector('.user-role-batch-summary'),
    searchPresent:!!panel.querySelector('#user-role-batch-member-search'),
    memberListInside:(()=>{
     const list=panel.querySelector('.user-role-batch-user-list').getBoundingClientRect();
     return list.left>=-1&&list.right<=innerWidth+1;
    })()};
  })()`);
  assert.equal(result.overflow,false,'overflow at '+width);
  assert.equal(result.mode,2);
  assert.equal(result.active,1);
  assert.equal(result.selected,2);
  assert.equal(result.memberCount,40);
  assert.equal(result.controls,3);
  assert.equal(result.reviewEnabled,true);
  assert.equal(result.panelInside,true);
  assert.ok(result.reviewHeight>=44);
  assert.ok(result.modeHeights.every(height=>height>=44));
  assert.equal(result.roleSelected,'editor');
  assert.equal(result.gridColumns,width>1040?2:1);
  assert.equal(result.summaryPresent,true);
  assert.equal(result.searchPresent,true);
  assert.equal(result.memberListInside,true);
  console.log('USER_ROLE_BATCH_BROWSER_PASS '+JSON.stringify(result));
 }
}finally{
 ws?.close();child?.kill('SIGTERM');await new Promise(ok=>server.close(ok));await delay(350);try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
