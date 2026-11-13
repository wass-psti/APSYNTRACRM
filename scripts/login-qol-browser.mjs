/** Credential-free Chromium acceptance for the public login presentation. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {renderAuthMarkup} from '../frontend/auth-markup.js';
const root=process.cwd();
const markup=renderAuthMarkup({emailValue:'person@example.com',message:'Sign-in unsuccessful'});
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"></head><body><div id="app">'+markup+'</div></body></html>';
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
const profile=mkdtempSync(join(tmpdir(),'aps-auth-qol-'));
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
  await wait(()=>evaluate("document.readyState==='complete' && !!document.querySelector('#login-form')"));
  const result=await evaluate(`(()=>{
   const email=document.querySelector('#email'),password=document.querySelector('#password');
   const toggle=document.querySelector('#login-form .eye-btn'),links=[...document.querySelectorAll('.auth-access-links a')];
   const rect=toggle.getBoundingClientRect(),submit=document.querySelector('#login-submit');
   email.focus();const emailFocus=getComputedStyle(email).boxShadow;
   submit.focus();const submitFocus=getComputedStyle(submit).outlineStyle;
   const overflow=document.documentElement.scrollWidth>innerWidth+1;
   return {width:innerWidth,overflow,emailValue:email.value,passwordValue:password.value,
    toggleWidth:Math.round(rect.width),toggleHeight:Math.round(rect.height),
    emailFocus,submitFocus,links:links.map(a=>({text:a.textContent,height:Math.round(a.getBoundingClientRect().height)})),
    submitVisible:submit.getBoundingClientRect().width>0};
  })()`);
  assert.equal(result.overflow,false,'horizontal overflow at '+width);
  assert.equal(result.emailValue,'person@example.com');
  assert.equal(result.passwordValue,'');
  assert.ok(result.toggleHeight>=44&&result.toggleWidth>=44,'password visibility target at '+width);
  assert.notEqual(result.emailFocus,'none');
  assert.ok(result.links.every(link=>link.height>=34));
  assert.equal(result.submitVisible,true);
  console.log('LOGIN_BROWSER_PASS '+JSON.stringify(result));
 }
}finally{
 ws?.close();child?.kill('SIGTERM');await new Promise(ok=>server.close(ok));await delay(350);try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
