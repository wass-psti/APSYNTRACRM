/** Isolated real Chromium UI acceptance for the FRT creation wizard; no production API. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const repo=resolve(import.meta.dirname,'..');
const pageHtml=`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"></head>
<body><div id="app"></div><div class="modal-backdrop frt-wizard-backdrop"><section class="modal frt-wizard-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
<div class="modal-head"><h2 id="modal-title">New Fund Request</h2><button type="button" class="modal-close" aria-label="Close">×</button></div>
<form id="modal-form"><div id="fields"></div><div class="modal-actions"><button type="button" class="secondary">Cancel</button><button type="submit" class="primary">Submit Fund Request</button></div></form>
</section></div><script type="module">
import {renderFRTRequestWizard,enhanceFRTRequestWizard,collectFRTWizardRequest} from '/frontend/frt-request-wizard.js';
document.querySelector('#fields').outerHTML=renderFRTRequestWizard({companies:[{code:'WASS',name:'Watchdog Sales & Services'},{code:'WAO',name:'Watchdog OPC'}],selectedCompany:'WASS'});
const modal=document.querySelector('.frt-wizard-backdrop');enhanceFRTRequestWizard(modal);
document.querySelector('#modal-form').addEventListener('submit',event=>{event.preventDefault();
 window.__submitted=collectFRTWizardRequest(new FormData(event.currentTarget));});
window.__wizardReady=true;
</script></body></html>`;
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/'||path==='/index.html'){res.setHeader('Content-Type','text/html');res.end(pageHtml);return;}
 if(!['/frontend/apsyntra-styles.bundle.css','/frontend/frt-request-wizard.js'].includes(path)){
  res.statusCode=404;res.end('not found');return;
 }
 res.setHeader('Content-Type',extname(path)==='.css'?'text/css':'text/javascript');
 res.setHeader('Cache-Control','no-store');res.end(readFileSync(resolve(repo,path.slice(1))));
});
class BrowserPage{
 constructor(url){this.ws=new WebSocket(url);this.pending=new Map();this.seq=0;
  this.ready=new Promise((yes,no)=>{this.ws.addEventListener('open',yes);this.ws.addEventListener('error',no)});
  this.ws.addEventListener('message',event=>{
   const data=JSON.parse(String(event.data));const p=this.pending.get(data.id);
   if(!p)return;this.pending.delete(data.id);if(data.error)p.reject(Error(data.error.message));else p.resolve(data.result);
  });}
 async call(method,params={}){await this.ready;return new Promise((yes,no)=>{
  const id=++this.seq;const timeout=setTimeout(()=>{this.pending.delete(id);no(Error('CDP '+method+' timeout'));},15000);
  this.pending.set(id,{resolve:value=>{clearTimeout(timeout);yes(value)},reject:err=>{clearTimeout(timeout);no(err)}});
  this.ws.send(JSON.stringify({id,method,params}));
 });}
 async eval(expression){const r=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.text||'Browser expression failed');return r.result.value;}
 close(){this.ws.close()}
}
async function wait(check){for(let i=0;i<180;i++){try{if(await check())return;}catch{}await sleep(100)}throw Error('Browser ready timeout')}
const profile=mkdtempSync(join(tmpdir(),'apsyntra-frt-wizard-'));
let browser,page;
try{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const bin=['/Applications/Chromium.app/Contents/MacOS/Chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
 if(!bin)throw Error('Chromium binary is unavailable');
 browser=spawn(bin,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--disable-extensions','--disable-sync','--no-sandbox','--disable-dev-shm-usage',
  '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
 const portFile=join(profile,'DevToolsActivePort');await wait(()=>existsSync(portFile));
 const port=Number(readFileSync(portFile,'utf8').split('\n')[0]);
 const tab=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
 page=new BrowserPage(tab.webSocketDebuggerUrl);
 await page.call('Runtime.enable');await page.call('Page.enable');
 await page.call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await page.call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
 await wait(()=>page.eval('window.__wizardReady===true'));
 const getStep=`Number([...document.querySelectorAll('[data-frt-step]')].find(x=>!x.hidden)?.dataset.frtStep)`;
 assert.equal(await page.eval(getStep),1);
 await page.eval("document.querySelector('.frt-wizard-next').click()");
 assert.equal(await page.eval(getStep),1,'empty required step must not advance');
 await page.eval(`(()=>{
  const put=(name,value)=>{const el=document.querySelector('[name="'+name+'"]');el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))};
  put('dateNeeded','2026-11-30');put('fundSource','Operating Fund');
  put('expenseCategory','Materials');put('expenseAmount','120.50');
 })()`);
 await page.eval("document.querySelector('[data-frt-add-expense]').click()");
 assert.equal(await page.eval("document.querySelectorAll('[name=expenseCategory]').length"),2);
 await page.eval(`(()=>{document.querySelectorAll('[name=expenseCategory]')[1].value='Delivery';
  const el=document.querySelectorAll('[name=expenseAmount]')[1];el.value='85.25';
  el.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.frt-wizard-next').click()})()`);
 assert.equal(await page.eval(getStep),2);
 await page.eval("document.querySelector('.frt-wizard-back').click()");
 assert.equal(await page.eval(getStep),1);
 assert.equal(await page.eval("document.querySelector('[name=expenseCategory]').value"),'Materials');
 await page.eval("document.querySelector('.frt-wizard-next').click()");
 assert.equal(await page.eval(getStep),2);
 await page.eval(`(()=>{
  document.querySelector('[name=recipientName]').value='Example Supplier';
  document.querySelector('[name=recipientBank]').value='Example Bank';
  document.querySelector('[name=recipientAccount]').value='1234567';
  document.querySelector('.frt-wizard-next').click();})()`);
 assert.equal(await page.eval(getStep),3);
 await page.eval(`(()=>{
  document.querySelector('[name=requestName]').value='Approved test request';
  document.querySelector('[name=department]').value='Finance';
  document.querySelector('[name=description]').value='Two verified expense categories';
  document.querySelector('[name=orderIntakeNo]').value='OI-2026-01';
  document.querySelector('button[type=submit]').click();
 })()`);
 const result=await page.eval('window.__submitted');
 assert.ok(result,'valid form must reach submit handler');
 assert.deepEqual(result.items,[{category:'Materials',amount:'120.50'},{category:'Delivery',amount:'85.25'}]);
 assert.equal(result.recipientName,'Example Supplier');
 assert.equal(result.companyCode,'WASS');
 const bounds=await page.eval(`(()=>{const r=document.querySelector('.frt-wizard-modal').getBoundingClientRect();
  return {width:Math.round(r.width),height:Math.round(r.height),overflow:getComputedStyle(document.querySelector('.frt-wizard-scroll')).overflowY}})()`);
 process.stdout.write('FRT_WIZARD_BOUNDS: '+JSON.stringify(bounds)+'\n');
 assert.ok(bounds.width<=610&&bounds.width>400);
 assert.ok(bounds.height<=600&&bounds.height>=450);
 assert.equal(bounds.overflow,'auto');
 await page.call('Emulation.setDeviceMetricsOverride',{width:390,height:780,deviceScaleFactor:1,mobile:true});
 const mobile=await page.eval(`(()=>{const r=document.querySelector('.frt-wizard-modal').getBoundingClientRect();
 const grid=document.querySelector('[data-frt-step="3"] .frt-wizard-grid');
 return {width:Math.round(r.width),viewport:innerWidth,
 columns:getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length}})()`);
 assert.ok(mobile.width<=390&&mobile.width>=300);
 assert.equal(mobile.columns,1);
 process.stdout.write('FRT_WIZARD_CHROMIUM_PASS: '+JSON.stringify({steps:3,multipleItems:2,
  requiredValidation:true,backNavigation:true,finalSubmit:true,bounds,mobile})+'\n');
}finally{
 page?.close();browser?.kill('SIGTERM');server.close();await sleep(600);
 try{rmSync(profile,{recursive:true,force:true,maxRetries:6,retryDelay:200});}
 catch(error){process.stderr.write('FRT_WIZARD_TEMP_CLEANUP_WARNING: '+error.code+'\n');}
}
