/** Genuine disposable GoTrue/PostgREST OT reads + actual renderer and polling controller.
 * Does not exercise the full signed CRM host or a live Realtime server.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {cpus} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium} from 'playwright';
import {summarizeSamples,benchmarkInventory} from './lib/crm-performance-baseline.mjs';
import {rpcSummary,cpuInterval,workloadMode} from './lib/crm-signed-performance.mjs';

const run=promisify(execFile),root=resolve(import.meta.dirname,'..');
const fixture='/frontend/tests/fixtures/crm-signed-performance.html';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp',
 '.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
function hostCpu(){
 let total=0,idle=0;
 for(const cpu of cpus()){
  total+=Object.values(cpu.times).reduce((sum,n)=>sum+n,0);idle+=cpu.times.idle;
 }
 return {total,idle};
}
async function serviceResources(db){
 const names={ [db]:'postgres',[db.replace(/-pg$/,'-rest')]:'postgrest',
  [db.replace(/-pg$/,'-auth')]:'gotrue' };
 const {stdout}=await run('docker',['stats','--no-stream','--format',
  '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}',...Object.keys(names)],{timeout:15000});
 const result={};
 for(const line of stdout.trim().split('\n')){
  const [name,cpu,mem]=line.split('|');
  const percent=Number(cpu?.replace('%',''));
  if(!names[name]||!Number.isFinite(percent)||!mem)throw Error('Invalid container resource sample');
  result[names[name]]={cpuPercentOneCore:percent,memoryUsage:mem.split('/')[0].trim()};
 }
 assert.equal(Object.keys(result).length,3);
 return result;
}
async function renderer(session){
 const {metrics}=await session.send('Performance.getMetrics');
 const map=new Map(metrics.map(row=>[row.name,row.value]));
 return Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration',
  'JSHeapUsedSize','Nodes','Documents','JSEventListeners'].map(key=>[key,map.get(key)??null]));
}
function loopback(url){
 return /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(url);
}
export async function runSignedPerformanceBaseline({authUrl,restUrl,db,worker,hr,board,workspace,integrityRead}){
 assert.ok(loopback(authUrl)&&loopback(restUrl),'Disposable loopback endpoints required');
 assert.match(db,/^cpttot02-\d+-pg$/);
 const mode=process.env.CP_CRM_PERF_01A_MODE,plan=workloadMode(mode);
 const before=integrityRead();
 const report={checkpoint:'CP-CRM-PERF-01A',commit:process.env.GITHUB_SHA||'not-recorded',mode,
  scope:'disposable signed TimeTracker OT renderer and polling fallback',
  inventory:benchmarkInventory().map(app=>({id:app.id,coverage:app.id==='timetracker'?'OT fixture only':'NOT_RUN'})),
  startup:{},phases:[],plan,limitations:['No full CRM login/session restoration or sidebar host.',
   'Signed fixture uses actual GoTrue identity and PostgREST OT snapshot, not the production host dispatcher.',
   'Two pages deliberately polling-eligible; no genuine Realtime server.',
   'Runner host CPU includes all runner processes; container CPU is sampled, not continuous.',
   'Mobile viewport emulation, not physical mobile hardware.']};
 const server=createServer(async(req,res)=>{
  try{
   const pathname=new URL(req.url,'http://127.0.0.1').pathname;
   if((pathname==='/auth/user'&&req.method==='GET')||
    (pathname==='/rpc/timetracker_ot_snapshot'&&req.method==='POST')){
    const chunks=[];let bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>4096)throw Error('Body too large');chunks.push(chunk);}
    const target=pathname==='/auth/user'?authUrl+'/user':restUrl+pathname;
    const upstream=await fetch(target,{method:req.method,headers:{Authorization:req.headers.authorization||'',
     'Content-Type':'application/json'},...(req.method==='POST'?{body:Buffer.concat(chunks)}:{}),
     signal:AbortSignal.timeout(10000)});
    res.writeHead(upstream.status,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(await upstream.text());return;
   }
   const file=resolve(root,'.'+pathname);
   if(req.method!=='GET'||!pathname.startsWith('/frontend/')||!file.startsWith(root+'/frontend/')||
    !statSync(file).isFile()){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'public,max-age=3600'});
   res.end(readFileSync(file));
  }catch{res.writeHead(500);res.end('Disposable benchmark request failed');}
 });
 let browser;
 try{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin='http://127.0.0.1:'+server.address().port;
  const executablePath=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium',
   '/usr/bin/chromium-browser'].find(path=>path&&existsSync(path));
  browser=await chromium.launch({headless:true,executablePath,
   args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling',
    '--disable-renderer-backgrounding','--disable-background-networking',
    '--proxy-server=http://127.0.0.1:9','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
  report.browserVersion=browser.version();
  const errors=[];
  const args=(actor,moduleRole)=>({identity:actor.id,token:actor.token,board,workspace,moduleRole});
  const init=async(page,input)=>{
   const start=performance.now();
   await page.goto(origin+fixture,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.crmSignedPerf);
   const result=await page.evaluate(input=>window.crmSignedPerf.init(input),input);
   assert.ok(result.ready&&result.rows>0);assert.equal(result.requests,2);
   return {ms:performance.now()-start,rows:result.rows};
  };
  const track=page=>page.on('pageerror',()=>errors.push('pageerror'));
  if(mode==='smoke'){
   for(const [profile,options] of [['desktop',{viewport:{width:1440,height:900}}],
    ['mobile-viewport',{viewport:{width:390,height:844},isMobile:true,hasTouch:true}]]){
    report.startup[profile]={};
    for(const [role,actor] of [['Employee',worker],['HR',hr]]){
     const cold=[],warm=[],reads=[];
     for(let i=0;i<30;i++){
      const context=await browser.newContext(options);
      try{
       const page=await context.newPage();track(page);
       cold.push((await init(page,args(actor,role))).ms);
       reads.push(...(await page.evaluate(()=>window.crmSignedPerf.drain())).reads);
       await page.goto('about:blank');
       warm.push((await init(page,args(actor,role))).ms);
       reads.push(...(await page.evaluate(()=>window.crmSignedPerf.drain())).reads);
      }finally{await context.close();}
     }
     const auth=rpcSummary(reads.filter(row=>row.operation==='auth-user'));
     const ot=rpcSummary(reads.filter(row=>row.operation==='ot-snapshot'));
     assert.equal(auth.requests,60);assert.equal(ot.requests,60);
     assert.equal(auth.errors+ot.errors,0);
     report.startup[profile][role]={cold:summarizeSamples(cold),warm:summarizeSamples(warm),auth,ot};
    }
    console.log('CP_CRM_PERF_01A_STARTUP '+JSON.stringify({profile,results:report.startup[profile]}));
   }
  }
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  try{
   const pages=[],sessions=[];
   for(let i=0;i<plan.windows;i++){
    const page=await context.newPage();track(page);
    const initialized=await init(page,args(worker,'Employee'));
    report.fixtureRows=initialized.rows;
    await page.evaluate(()=>window.crmSignedPerf.drain());
    const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
    pages.push(page);sessions.push(cdp);
   }
   await Promise.all(pages.map(page=>page.evaluate(()=>window.crmSignedPerf.start())));
   for(const phase of plan.phases){
    const initial=await Promise.all(sessions.map(renderer)),hostStart=hostCpu();
    const start=performance.now(),deadline=start+plan.phaseMs,containerSamples=[];
    let nextClick=start,nextResource=start;
    while(performance.now()<deadline){
     const now=performance.now();
     if(phase==='interaction'&&now>=nextClick){
      await Promise.all(pages.map(async(page)=>{
       const active=page.locator('[data-action="tt-ot-status"][aria-pressed="true"]');
       const target=page.locator('[data-action="tt-ot-status"][aria-pressed="false"]').first();
       assert.ok(await active.count());await target.click({timeout:5000});
      }));
      nextClick+=15000;
     }
     if(now>=nextResource){
      containerSamples.push(await serviceResources(db));nextResource+=60000;
     }
     await sleep(Math.min(250,Math.max(0,deadline-performance.now())));
    }
    // Stop only after the final phase; the polling cadence spans all phases.
    if(phase===plan.phases.at(-1))await Promise.all(pages.map(page=>page.evaluate(()=>window.crmSignedPerf.stop())));
    const elapsedMs=performance.now()-start;
    const final=await Promise.all(sessions.map(renderer));
    const deltas=await Promise.all(pages.map(page=>page.evaluate(()=>window.crmSignedPerf.drain())));
    const requests=rpcSummary(deltas.flatMap(item=>item.reads));
    const interactions=deltas.flatMap(item=>item.interactions);
    assert.equal(requests.errors,0);assert.equal(deltas.reduce((n,item)=>n+item.syncFailures,0),0);
    assert.ok(requests.requests>=plan.windows,'Polling did not execute in every workload window');
    if(phase==='interaction')assert.ok(interactions.length>=plan.windows*30,'Insufficient interaction samples');
    const result={phase,elapsedMs,requests,perWindow:deltas.map(item=>({requests:rpcSummary(item.reads),
     renders:item.renderCount,rows:item.rows})),interactions:interactions.length?summarizeSamples(interactions):null,
     hostCpuPercent:cpuInterval(hostStart,hostCpu()),containerSamples,renderer:{initial,final}};
    report.phases.push(result);
    console.log('CP_CRM_PERF_01A_PHASE '+JSON.stringify(result));
   }
   for(const session of sessions)await session.detach();
  }finally{await context.close();}
  assert.equal(errors.length,0,'Unexpected browser errors');
  assert.equal(integrityRead(),before,'OT request/audit records changed during benchmark');
  report.integrityPreserved=true;report.productionWrites=0;report.pageErrors=0;
  report.sustained=mode!=='smoke'&&report.phases.reduce((sum,p)=>sum+p.elapsedMs,0)>=1800000;
  const out=resolve(root,'artifacts/crm-signed-performance-'+mode+'.json');
  mkdirSync(resolve(root,'artifacts'),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log('CP_CRM_PERF_01A_PASS '+JSON.stringify({mode,windows:plan.windows,sustained:report.sustained,
   phases:report.phases.length,fixtureRows:report.fixtureRows,integrityPreserved:true}));
 }finally{
  await browser?.close();await new Promise(done=>server.close(done));
 }
}
