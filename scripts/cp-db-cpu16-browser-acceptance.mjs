import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const moduleSource=readFileSync(new URL('../frontend/platform-sync.js',import.meta.url));
const server=createServer((req,res)=>{
 if(req.url==='/platform-sync.js'){
  res.writeHead(200,{'content-type':'text/javascript'});res.end(moduleSource);
 }else{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>CP-DB-CPU-16 synthetic browser acceptance</title>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext();
 const url='http://127.0.0.1:'+server.address().port+'/';
 const a=await context.newPage(),b=await context.newPage();
 await Promise.all([a.goto(url),b.goto(url)]);
 const init=async page=>page.evaluate(async()=>{
  const {PlatformSync}=await import('/platform-sync.js');
  const userId='20000000-0000-4000-8000-000000000001';
  const workspaceId='10000000-0000-4000-8000-000000000001';
  window.auditNow=1000000;window.auditEvents=[];
  const ctl=new PlatformSync({
   auth:{isSignedIn:true,userId},api:{},WebSocketImpl:null,
   now:()=>window.auditNow,visible:()=>true,online:()=>true,
   onInvalidate:async event=>{window.auditEvents.push(event.reason);return true;},
   setIntervalFn:()=>1,clearIntervalFn:()=>{}
  });
  ctl.running=true;ctl.scope={userId,workspaceId};ctl.pollRecoveryAt=window.auditNow;
  ctl.lastTransport='realtime';window.ctl=ctl;
  return Boolean(navigator.locks&&localStorage);
 });
 assert.equal(await init(a),true,'Chromium Web Locks and localStorage are required');
 assert.equal(await init(b),true);
 await a.evaluate(()=>window.ctl.pollTick(window.ctl.generation));
 await b.evaluate(()=>window.ctl.pollTick(window.ctl.generation));
 assert.deepEqual(await a.evaluate(()=>window.auditEvents),['poll']);
 assert.deepEqual(await b.evaluate(()=>window.auditEvents),[]);
 await b.evaluate(()=>window.ctl.syncNow('focus'));
 assert.deepEqual(await b.evaluate(()=>window.auditEvents),['focus']);
 await Promise.all([a,b].map(page=>page.evaluate(()=>{window.auditNow+=270000;})));
 await b.evaluate(()=>window.ctl.pollTick(window.ctl.generation));
 assert.deepEqual(await b.evaluate(()=>window.auditEvents),['focus','poll']);
 await a.evaluate(()=>window.ctl.stop());
 await b.evaluate(()=>window.ctl.stop());
 await context.close();
 console.log('CP-DB-CPU-16 real Chromium two-window Web Locks: PASS (dedup, focus, recovery, stop)');
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}
