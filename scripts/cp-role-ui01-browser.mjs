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
const data={
 workspaceId:'11111111-1111-4111-8111-111111111111',
 roles:[{roleKey:'admin',displayName:'Admin',kind:'system_reference',state:'reference',revision:1},
  {roleKey:'role-draft',displayName:'Draft role',kind:'draft',state:'proposal',revision:2}],
 users:Array.from({length:20},(_,i)=>({id:'22222222-2222-4222-8222-'+String(i).padStart(12,'0'),
  displayName:'Workspace Member '+i,email:'member'+i+'@example.invalid',platformRole:'employee',bootstrapProtected:i===0})),
 assignments:[],boards:Array.from({length:15},(_,i)=>({id:'33333333-3333-4333-8333-'+String(i).padStart(12,'0'),name:'Board '+i})),
 proposals:[{id:'44444444-4444-4444-8444-444444444444',operation:'role.create',status:'pending',createdAt:'2026-11-13'}],
 audit:[]};
const sections=['roles','users','matrix','workspace','audit'];
const server=createServer((req,res)=>{
 if(req.url?.startsWith('/?tab=')){
  const section=new URL(req.url,'http://localhost').searchParams.get('tab');
  const tab=sections.includes(section)?section:'roles';
  const markup=renderRoleConfiguration({verified:true,data,tab});
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"></head><body><div id="app"><main class="main aps-role-config-shell"><div class="main-content">'+markup+'</div></main></div></body></html>');
  return;
 }
 if(req.url==='/frontend/apsyntra-styles.bundle.css'){
  res.setHeader('Content-Type','text/css');
  res.end(readFileSync(root+'/frontend/apsyntra-styles.bundle.css'));return;
 }
 res.statusCode=404;res.end('not found');
});
const chrome=['/Applications/Chromium.app/Contents/MacOS/Chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
if(!chrome)throw Error('Chromium not installed');
const profile=mkdtempSync(join(tmpdir(),'aps-role-ui01-'));
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
  for(const tab of sections){
   await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/?tab='+tab});
   await wait(()=>evaluate("document.readyState==='complete'&&!!document.querySelector('.role-content-workspace')"));
   const result=await evaluate(`(()=>{
    const container=document.querySelector('.role-content-workspace');
    const intro=document.querySelector('.role-content-heading');
    const body=document.querySelector('.role-content-body');
    const tabs=[...document.querySelectorAll('.role-tab-button')];
    const matrix=document.querySelector('.role-table-scroll');
    const status=document.querySelector('.role-content-mode');
    const roleLayout=document.querySelector('.role-config-layout');
    const sideNav=document.querySelector('.role-config-tabs');
    const navBox=sideNav.getBoundingClientRect();
    const contentBox=container.getBoundingClientRect();
    const columns=getComputedStyle(roleLayout).gridTemplateColumns.split(' ');
    const selectedTab=sideNav.querySelector('[aria-pressed="true"]');

    const rect=container.getBoundingClientRect();
    return {
     width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,
     columns:columns.length,sideNavVisible:navBox.width>0,
     contentBesideNav:contentBox.left>=navBox.right-1&&Math.abs(contentBox.top-navBox.top)<3,
     contentBelowNav:contentBox.top>=navBox.bottom-1,
     navItemSelected:selectedTab?.getAttribute('aria-current')==='page',
     navIcons:sideNav.querySelectorAll('.role-tab-icon svg').length,

     containerInside:rect.left>=-1&&rect.right<=innerWidth+1,
     containerBackground:getComputedStyle(container).backgroundImage,
     containerRadius:getComputedStyle(container).borderRadius,
     introFill:getComputedStyle(intro).backgroundColor,
     introInside:Math.abs(intro.getBoundingClientRect().left-rect.left)<4,
     bodyInside:body.getBoundingClientRect().left>=rect.left&&body.getBoundingClientRect().right<=rect.right+1,
     heading:document.querySelector('#role-content-heading').textContent,
     mode:status.textContent,selected:tabs.filter(t=>t.getAttribute('aria-pressed')==='true').length,
     minTabHeight:Math.round(Math.min(...tabs.map(t=>t.getBoundingClientRect().height))),
     actions:document.querySelectorAll('button[data-action="role-propose-permission"]').length,
     tableFocusable:[...document.querySelectorAll('.role-table-scroll')].every(el=>el.tabIndex===0),
     tableInside:[...document.querySelectorAll('.role-table-scroll')].every(el=>{
      const r=el.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1}),
     scrollable:matrix?.scrollWidth>matrix?.clientWidth||false};
   })()`);
   assert.equal(result.overflow,false,'page overflow at '+width+'/'+tab);
   assert.equal(result.containerInside,true,'workspace width at '+width+'/'+tab);
   assert.equal(result.columns,width>790?2:1,'navigation grid columns at '+width+'/'+tab);
   assert.equal(result.navIcons,5,'all sections have icons');
   assert.equal(result.navItemSelected,true,'selected navigation remains semantically identifiable');
   if(width>790)assert.equal(result.contentBesideNav,true,'desktop configuration must sit right of navigation');
   else assert.equal(result.contentBelowNav,true,'mobile navigation must precede content');

   assert.ok(result.containerBackground.includes('linear-gradient'),'Overview-aligned gradient should render');
   assert.equal(result.containerRadius,'17px');
   assert.equal(result.introFill,'rgb(249, 250, 255)');
   assert.equal(result.introInside,true,'intro layout at '+width+'/'+tab);
   assert.equal(result.bodyInside,true,'body layout at '+width+'/'+tab);
   assert.equal(result.selected,1);
   assert.equal(result.mode,'Proposal-only');
   assert.ok(result.minTabHeight>=44);
   assert.equal(result.tableFocusable,true);
   assert.equal(result.tableInside,true);
   assert.equal(result.actions,tab==='matrix'?84:0);
   if(tab==='matrix'&&width<=768)assert.equal(result.scrollable,true);
   console.log('ROLE_UI01_BROWSER_PASS '+JSON.stringify({tab,...result}));
  }
 }
}finally{
 ws?.close();child?.kill('SIGTERM');await new Promise(ok=>server.close(ok));await delay(350);try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
