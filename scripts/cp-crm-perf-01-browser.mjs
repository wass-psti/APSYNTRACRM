/**
 * CP-CRM-PERF-01: finite loopback Chromium baseline, no signed production account.
 * Actual repository entry (signed out) and production shell/table helpers with
 * synthetic content. This is not an authenticated app or database latency test.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {resolve,extname,dirname} from 'node:path';
import {chromium} from 'playwright';
import {benchmarkInventory,summarizeRows} from './lib/crm-performance-baseline.mjs';

const root=resolve(import.meta.dirname,'..');
const inventory=benchmarkInventory();
const repetitions=30;
const profiles=[{name:'desktop',viewport:{width:1440,height:900}},
 {name:'mobile-viewport',viewport:{width:390,height:844},isMobile:true,hasTouch:true}];
const browserBin=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium',
 '/usr/bin/chromium-browser'].find(path=>path&&existsSync(path));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
 '.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp',
 '.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.woff':'font/woff'};
const fixturePath='/frontend/tests/fixtures/crm-performance-baseline.html';
const server=createServer((request,response)=>{
 try{
  const path=new URL(request.url,'http://127.0.0.1').pathname;
  const name=path==='/'?'/index.html':path;
  if(name!=='/index.html'&&!name.startsWith('/frontend/')){
   response.writeHead(404);response.end();return;
  }
  const file=resolve(root,'.'+name);
  if(!file.startsWith(root+'/')||!statSync(file).isFile()){
   response.writeHead(404);response.end();return;
  }
  response.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream',
   'cache-control':name==='/index.html'?'no-store':'public, max-age=3600'});
  response.end(readFileSync(file));
 }catch{response.writeHead(404);response.end();}
});
const report={checkpoint:'CP-CRM-PERF-01',commit:process.env.GITHUB_SHA||'not-recorded',
 mode:'loopback source assets; no production network; isolated shell and table fixtures',
 repetitions,inventory:inventory.map(({id,label,kind})=>({id,label,kind,signedRuntime:'NOT_RUN'})),
 startup:{},shell:{},boards:{},frames:{},limitations:[
  'Signed-out startup only; not authenticated ready time.',
  'Shell fixture uses identical synthetic content for each registered route; not native application loading.',
  'Mobile viewport emulation, not physical mobile hardware.',
  'Warm HTTP-cache eligible; transfer size is recorded rather than assuming a hit.',
  'No production RPC, sustained CPU or signed multi-window benchmark.'
 ]};
let browser;
async function measureStartup(page,origin){
 await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>window.__APSYNTRA_STARTUP?.state==='UNAUTHENTICATED'&&
  !!document.querySelector('#login-form'),null,{timeout:45000});
 await page.locator('#login-form').waitFor({state:'visible'});
 return page.evaluate(async()=>{
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const readyMs=performance.now();
  const entries=performance.getEntriesByType('resource').filter(entry=>{
   const url=new URL(entry.name);
   return url.origin===location.origin&&url.pathname.startsWith('/frontend/');
  });
  const assets=entries.filter(entry=>/\.(?:js|mjs|css)$/.test(new URL(entry.name).pathname));
  const sum=(rows,key)=>rows.reduce((total,row)=>total+row[key],0);
  return {readyMs,resourceCount:entries.length,scriptStyleDecodedBytes:sum(assets,'decodedBodySize'),
   scriptStyleTransferBytes:sum(assets,'transferSize')};
 });
}
try{
 await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:browserBin,
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking',
   '--proxy-server=http://127.0.0.1:9','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
 report.browserVersion=browser.version();
 for(const profile of profiles){
  const {name,...options}=profile;
  const cold=[],warm=[];
  for(let i=0;i<repetitions;i++){
   const context=await browser.newContext({...options,serviceWorkers:'block'});
   try{
    const page=await context.newPage();
    cold.push(await measureStartup(page,origin));
    await page.goto('about:blank');
    warm.push(await measureStartup(page,origin));
   }finally{await context.close();}
  }
  const keys=['readyMs','resourceCount','scriptStyleDecodedBytes','scriptStyleTransferBytes'];
  report.startup[name]={cold:summarizeRows(cold,keys),warm:summarizeRows(warm,keys)};
  const context=await browser.newContext({...options,serviceWorkers:'block'});
  try{
   const page=await context.newPage();
   let errors=0;page.on('pageerror',()=>errors++);
   await page.goto(origin+fixturePath);
   await page.waitForFunction(()=>!!window.crmBaseline);
   const shell=await page.evaluate(async({inventory,repetitions})=>
    window.crmBaseline.shell(inventory,repetitions),{inventory,repetitions});
   assert.equal(shell.length,inventory.length);
   report.shell[name]=shell.map(entry=>({
    id:entry.id,retainedShell:entry.retainedShell,retainedSidebar:entry.retainedSidebar,
    retainedHeader:entry.retainedHeader,summary:summarizeRows(entry.samples,['updateMs','twoFrameMs'])
   }));
   for(const entry of report.shell[name]){
    assert.ok(entry.retainedShell&&entry.retainedSidebar&&entry.retainedHeader);
    assert.equal(entry.summary.updateMs.samples,repetitions);
   }
   report.boards[name]={};
   for(const size of [100,1000]){
    const rows=await page.evaluate(async({size,repetitions})=>
     window.crmBaseline.board(size,repetitions),{size,repetitions});
    assert.equal(rows.length,repetitions);
    assert.ok(rows.every(row=>row.renderedRows>0&&row.renderedRows<=size));
    if(size===1000)assert.ok(rows.every(row=>row.renderedRows<120),'large board window did not remain bounded');
    report.boards[name][size]=summarizeRows(rows,['updateMs','twoFrameMs','renderedRows']);
   }
   report.frames[name]=await page.evaluate(()=>window.crmBaseline.frames());
   assert.equal(report.frames[name].status,'COMPLETE');
   assert.equal(errors,0,'Fixture page errors');
  }finally{await context.close();}
  console.log('CP_CRM_PERF_01_PROFILE '+JSON.stringify({name,startup:report.startup[name],
   shell:report.shell[name],boards:report.boards[name],frames:report.frames[name]}));
 }
 const destination=resolve(root,'artifacts/crm-performance-baseline.json');
 mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
 console.log('CP_CRM_PERF_01_BROWSER_BASELINE_PASS '+JSON.stringify({
  registeredApplications:inventory.length,profiles:profiles.length,repetitions,
  startupSamples:profiles.length*repetitions*2,
  shellSamples:profiles.length*repetitions*inventory.length,
  boardSamples:profiles.length*repetitions*2,signedRuntime:'NOT_RUN'}));
}finally{
 await browser?.close();
 await new Promise(resolveClose=>server.close(resolveClose));
}
