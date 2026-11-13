/** Credential-free Chromium acceptance for the public login presentation. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const root=process.cwd();
import {sidebarIcon} from '../frontend/sidebar-visuals.js';
import {renderWorkspaceSwitcher,renderWorkspaceInviteLaunch} from '../frontend/workspace-ui.js';
const app=readFileSync(root+'/frontend/app.js','utf8');
const src=app.slice(app.indexOf('function sidebarNav('),app.indexOf('/** Signed session-local basemap opt-in.')); 
const fakeState={
 roleVerified:false,adminVerified:true,
 view:'user-role-management',boardId:null,
 boards:Array.from({length:6},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),name:'Long board title '+i})),
 context:{user_id:'11111111-1111-4111-8111-111111111111',
 workspace_id:'22222222-2222-4222-8222-222222222222',profile:{platform_role:'employee'}}
};
const render=new Function('state','location','showEngineeringDiagnostics','renderWorkspaceSwitcher',
 'renderWorkspaceInviteLaunch','workspaceName','name','initials','e','sidebarIcon',
 'signedCrmRoleLabel','signedCrmIdentityLabel','workspaceRelationLabel',
 src+'\nreturn sidebar();');
const sidebarMarkup=render(fakeState,{search:''},()=>false,renderWorkspaceSwitcher,
 renderWorkspaceInviteLaunch,()=> 'Work Management',()=> 'Example Admin',()=> 'EA',
 value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 sidebarIcon,()=> 'CRM admin',()=> 'CRM admin',()=> 'Workspace member');
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"></head><body><div id="app"><div class="shell">'+sidebarMarkup+'<main class="main"><div class="main-content">Workspace page</div></main></div></div></body></html>';
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
const profile=mkdtempSync(join(tmpdir(),'aps-sidebar-qol-'));
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
  await wait(()=>evaluate("document.readyState==='complete' && !!document.querySelector('.aps-sidebar')"));
  const measure=()=>evaluate(`(()=>{
   const shell=document.querySelector('.shell'),side=document.querySelector('.aps-sidebar');
   const relation=side.querySelector('.ws01-context-relation'),invite=side.querySelector('.ws02-sidebar-action');
   const switcher=side.querySelector('.workspace-switcher'),main=document.querySelector('.main');
   const nav=side.querySelector('a[href="#/user-role-management"]');
   const toggle=side.querySelector('.sidebar-layout-toggle');
   const navLinks=[...side.querySelectorAll('.nav-link')];
   return {pageWidth:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,
    railWidth:Math.round(side.getBoundingClientRect().width),
    mainWidth:Math.round(main.getBoundingClientRect().width),
    relationVisible:relation.getClientRects().length>0,
    inviteVisible:invite.getClientRects().length>0,
    switcherVisible:switcher.getClientRects().length>0,
    navLabelVisible:nav.querySelector('.nav-label').getClientRects().length>0,
    navCount:navLinks.length,active:nav.getAttribute('aria-current'),
    toggleHeight:Math.round(toggle.getBoundingClientRect().height),
    controlOverflow:[...side.querySelectorAll('button,.nav-link')].some(el=>{
     if(el.getClientRects().length===0)return false;
     const rect=el.getBoundingClientRect(),sidebar=side.getBoundingClientRect();
     return rect.left<sidebar.left-2||rect.right>sidebar.right+2;
    })};
  })()`);
  const initial=await measure();
  assert.equal(initial.overflow,false);
  assert.equal(initial.active,'page');
  assert.equal(initial.controlOverflow,false);
  assert.ok(initial.navCount>=10);
  assert.ok(initial.toggleHeight>=33);
  if(width<=810){
   assert.ok(initial.railWidth<=72);
   assert.equal(initial.relationVisible,false);
   assert.equal(initial.inviteVisible,false);
   assert.equal(initial.switcherVisible,false);
   assert.equal(initial.navLabelVisible,false);
   await evaluate("document.querySelector('.shell').classList.add('sidebar-mobile-open')");
   const expanded=await measure();
   assert.equal(expanded.overflow,false);
   assert.equal(expanded.controlOverflow,false);
   assert.ok(expanded.railWidth>200);
   assert.equal(expanded.relationVisible,true);
   assert.equal(expanded.inviteVisible,true);
   assert.equal(expanded.switcherVisible,true);
   assert.equal(expanded.navLabelVisible,true);
   assert.equal(expanded.mainWidth,initial.mainWidth,'expanded rail must not squeeze the content');
  }else{
   assert.ok(initial.railWidth>=250);
   assert.equal(initial.relationVisible,true);
   assert.equal(initial.inviteVisible,true);
   assert.equal(initial.navLabelVisible,true);
   await evaluate("document.querySelector('.shell').classList.add('sidebar-user-collapsed')");
   const compact=await measure();
   assert.ok(compact.railWidth<=75);
   assert.equal(compact.overflow,false);
   assert.equal(compact.controlOverflow,false);
   assert.equal(compact.relationVisible,false);
   assert.equal(compact.inviteVisible,false);
   assert.equal(compact.navLabelVisible,false);
  }
  console.log('SIDEBAR_BROWSER_PASS '+JSON.stringify({width,initial}));

 }
}finally{
 ws?.close();child?.kill('SIGTERM');await new Promise(ok=>server.close(ok));await delay(350);try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
