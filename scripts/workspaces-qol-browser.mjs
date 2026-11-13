/** Credential-free Chromium acceptance for the public login presentation. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const root=process.cwd();
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"></head><body><div id="app"><button id="workspace-open">Open Workspaces</button></div><script type="module">'+
 `import {openWorkspaceSelector} from '/frontend/workspace-ui.js';
 const current={id:'00000000-0000-4000-8000-000000000001',name:'Work Management'};
 const catalog={status:'SIGNED_MEMBER_DISCOVERY',rows:[
  {id:current.id,name:current.name,relation:'member',privacy:'closed',active:true,verifiedScope:'SIGNED_MEMBER_RPC'},
  {id:'00000000-0000-4000-8000-000000000002',name:'Main Workspace',relation:'owner',privacy:'closed',active:false,verifiedScope:'SIGNED_MEMBER_RPC'}]};
 window.openFixture=()=>openWorkspaceSelector(current,{
  signedUserId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  switchingEnabled:false,invitationEnabled:false,
  lifecycle:{discover:async()=>catalog}
 });
 document.querySelector('#workspace-open').addEventListener('click',window.openFixture);
 `+'</script></body></html>';
const server=createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 if(req.url==='/frontend/apsyntra-styles.bundle.css'){
  res.setHeader('Content-Type','text/css');res.end(readFileSync(root+'/frontend/apsyntra-styles.bundle.css'));return;
 }
 if(req.url?.startsWith('/frontend/')&&req.url.endsWith('.js')){
  const file=join(root,req.url.slice(1));
  if(file.startsWith(root+'/frontend/')&&existsSync(file)){
   res.setHeader('Content-Type','text/javascript');res.end(readFileSync(file));return;
  }
 }
 res.statusCode=404;res.end('not found');
});
const chrome=['/Applications/Chromium.app/Contents/MacOS/Chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
if(!chrome)throw Error('Chromium not installed');
const profile=mkdtempSync(join(tmpdir(),'aps-workspace-qol-'));
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
  await wait(()=>evaluate("document.readyState==='complete' && !!window.openFixture"));
  await evaluate("window.openFixture();true");
  await wait(()=>evaluate("document.querySelector('.ws01-menu-card') && document.querySelectorAll('.ws01-entry').length===2"));
  const inspect=()=>evaluate(`(()=>{
   const layer=document.querySelector('.ws01-overlay');
   const card=layer?.firstElementChild;
   const items=[...layer.querySelectorAll('.ws01-entry')];
   const outside=items.some(entry=>{
    const badge=entry.querySelector('.ws01-entry-badge').getBoundingClientRect();
    const copy=entry.querySelector('.ws01-entry-copy').getBoundingClientRect();
    const outer=entry.getBoundingClientRect();
    return badge.left<outer.left-1||badge.right>outer.right+1||
     badge.top<copy.bottom-1;
   });
   const rect=card.getBoundingClientRect();
   return {type:card.className,viewport:innerWidth,
    pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
    modalInside:rect.left>=-1&&rect.right<=innerWidth+1,
    modalHeight:Math.round(rect.height),modalInsideHeight:rect.top>=-1&&rect.bottom<=innerHeight+1,
    rows:items.length,badgeOverlap:outside,
    actionButtons:[...card.querySelectorAll('button:not([disabled])')].length};
  })()`);
  const quick=await inspect();
  assert.equal(quick.type,'ws01-menu-card');
  assert.equal(quick.pageOverflow,false);
  assert.equal(quick.modalInside,true);
  assert.equal(quick.modalInsideHeight,true);
  assert.equal(quick.rows,2);
  assert.equal(quick.badgeOverlap,false);
  const iconPosition=await evaluate(`(()=>{
   const input=document.querySelector('#ws01-menu-search');
   const icon=document.querySelector('.ws01-menu-search-icon');
   const field=document.querySelector('.ws01-menu-search-field');
   const a=input.getBoundingClientRect(),b=icon.getBoundingClientRect(),c=field.getBoundingClientRect();
   return {centerDelta:Math.abs((a.top+a.height/2)-(b.top+b.height/2)),
    iconInside:b.left>=a.left&&b.right<a.right&&b.top>=a.top&&b.bottom<=a.bottom,
    wrapperInside:c.left>=a.left-1&&c.right<=a.right+1,
    inputPaddingLeft:parseFloat(getComputedStyle(input).paddingLeft),
    iconDecorative:icon.getAttribute('aria-hidden')==='true',
    singleSvg:field.querySelectorAll('svg').length===1,
    inputAppearance:getComputedStyle(input).appearance,
    nativeSearchDecoration:getComputedStyle(input,'::-webkit-search-decoration').display};
  })()`);
  assert.ok(iconPosition.centerDelta<=1,'search icon must be vertically centered within input');
  assert.equal(iconPosition.iconInside,true);
  assert.equal(iconPosition.wrapperInside,true);
  assert.equal(iconPosition.iconDecorative,true);
  assert.equal(iconPosition.singleSvg,true);
  assert.equal(iconPosition.inputAppearance,'none');
  assert.ok(iconPosition.inputPaddingLeft>=40);
  const menuSearch=await evaluate(`(()=>{
   const input=document.querySelector('#ws01-menu-search');
   input.value='Main';input.dispatchEvent(new Event('input',{bubbles:true}));
   return document.querySelectorAll('.ws01-menu-card .ws01-entry').length;
  })()`);
  assert.equal(menuSearch,1,'quick workspace search must filter signed catalog');
  await evaluate("document.querySelector('[data-ws01-action=browse]').click();true");
  await wait(()=>evaluate("!!document.querySelector('.ws01-browser-card')"));
  const browse=await inspect();
  assert.equal(browse.type,'ws01-browser-card');
  assert.equal(browse.pageOverflow,false);
  assert.equal(browse.modalInside,true);
  assert.equal(browse.modalInsideHeight,true);
  assert.equal(browse.rows,2);
  assert.equal(browse.badgeOverlap,false);
  const browserFilter=await evaluate(`(()=>{
   document.querySelector('[data-ws01-filter="owner"]').click();
   const ownerCount=document.querySelectorAll('.ws01-browser-grid .ws01-entry').length;
   const pressed=document.querySelector('[data-ws01-filter="owner"]').getAttribute('aria-pressed');
   const input=document.querySelector('#ws01-browser-search');
   input.value='no matching workspace';
   input.dispatchEvent(new Event('input',{bubbles:true}));
   return {ownerCount,pressed,empty:!!document.querySelector('.ws01-empty'),
    shown:document.querySelector('[data-ws01-count]').textContent};
  })()`);
  assert.equal(browserFilter.ownerCount,1);
  assert.equal(browserFilter.pressed,'true');
  assert.equal(browserFilter.empty,true);
  assert.equal(browserFilter.shown,'0 shown');
  await evaluate("document.querySelector('[data-ws01-action=create]').click();true");
  await wait(()=>evaluate("!!document.querySelector('.ws01-create-card')"));
  const create=await inspect();
  assert.equal(create.type,'ws01-create-card');
  assert.equal(create.pageOverflow,false);
  assert.equal(create.modalInside,true);
  assert.equal(create.modalInsideHeight,true);
  assert.equal(await evaluate("document.querySelectorAll('#ws01-name').length"),1);
  assert.equal(await evaluate("document.querySelectorAll('input[name=privacy]').length"),2);
  const validation=await evaluate(`(()=>{
   const form=document.querySelector('#ws01-proposal');
   form.querySelector('#ws01-name').value='A';
   form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
   return form.querySelector('.ws01-form-feedback').textContent;
  })()`);
  assert.ok(validation.length>0,'invalid draft should show validation');
  await evaluate("document.querySelector('[data-ws01-close]').click();window.openFixture();true");
  await wait(()=>evaluate("!!document.querySelector('.ws01-menu-card')"));
  await evaluate("document.querySelector('[data-ws01-action=invite]').click();true");
  await wait(()=>evaluate("!!document.querySelector('.ws02-invite-card')"));
  const invite=await inspect();
  assert.equal(invite.type,'ws02-invite-card');
  assert.equal(invite.pageOverflow,false);
  assert.equal(invite.modalInside,true);
  assert.equal(invite.modalInsideHeight,true);
  assert.equal(await evaluate("document.querySelector('[data-ws02-action=send]').disabled"),true);
  const invitation=await evaluate(`(()=>{
   const form=document.querySelector('#ws02-invite-preview');
   form.querySelector('#ws02-invite-email').value='invalid';
   form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
   const invalid=form.querySelector('.ws02-invite-feedback').textContent;
   form.querySelector('#ws02-invite-email').value='member@example.invalid';
   form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
   return {invalid,valid:form.querySelector('.ws02-invite-feedback').textContent,
    sendDisabled:form.querySelector('[data-ws02-action=send]').disabled};
  })()`);
  assert.ok(invitation.invalid.length>0);
  assert.match(invitation.valid,/validated|Member/i);
  assert.equal(invitation.sendDisabled,true);
  console.log('WORKSPACE_QOL_BROWSER_PASS '+JSON.stringify({width,quick,browse,create,invite}));

 }
}finally{
 ws?.close();child?.kill('SIGTERM');await new Promise(ok=>server.close(ok));await delay(350);try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
