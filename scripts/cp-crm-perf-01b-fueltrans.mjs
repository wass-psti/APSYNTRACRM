/** Read-only signed FuelTrans benchmark on the established isolated host fixture. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {summarizeRows} from './lib/crm-performance-baseline.mjs';

export function classifyFuelTransRead(url){
 const parsed=new URL(url);
 const path=parsed.pathname.replace(/^\/rest\/v1/,'');
 if(path==='/fueltrans_tickets')return parsed.searchParams.get('select')==='id'&&
  parsed.searchParams.get('limit')==='1'?'ticket-count':'ticket-list';
 return path==='/fueltrans_memberships'?'membership':null;
}
export function createReadObserver(){
 const pending=new Set(),rows=[],requestSamples=new WeakMap();
 return {blockedWrites:0,attach(page){
  page.on('request',request=>{
   const operation=classifyFuelTransRead(request.url());
   if(operation){const sample={operation,start:performance.now(),status:null,bytes:null,ms:null};
    pending.add(sample);requestSamples.set(request,sample);}
  });
  page.on('response',response=>{
   const sample=requestSamples.get(response.request());
   if(sample)sample.status=response.status();
  });
  page.on('requestfinished',request=>{
   const sample=requestSamples.get(request);
   if(!sample)return;
   sample.ms=performance.now()-sample.start;
   void request.sizes().then(sizes=>{sample.bytes=sizes.responseBodySize;},()=>{sample.bytes=null;})
    .finally(()=>{pending.delete(sample);rows.push(sample);});
  });
  page.on('requestfailed',request=>{
   const sample=requestSamples.get(request);
   if(sample){sample.ms=performance.now()-sample.start;pending.delete(sample);rows.push(sample);}
  });
 },async drain(){
  const end=performance.now()+10000;
  while(pending.size&&performance.now()<end)await new Promise(done=>setTimeout(done,10));
  assert.equal(pending.size,0,'Signed requests must settle');
  const result=rows.splice(0);
  assert.ok(result.every(x=>x.status>=200&&x.status<300&&Number.isFinite(x.bytes)&&x.bytes>=0),
   'Signed reads must succeed and have observed response sizes');
  return result;
 }};
}
export async function runFuelTransPerformance({openActor,actor}){
 const report={checkpoint:'CP-CRM-PERF-01B',commit:process.env.GITHUB_SHA||'not-recorded',
  application:'fueltrans',scope:'signed native application, emulated CRM host',profiles:{},
  limitations:['Real PostgREST signed reads; existing host handshake and optional services emulated.',
   'Thirty warm navigation cycles per viewport; not full CRM startup.',
   'Automatic refresh disabled only inside the disposable browser to isolate navigation.',
   'Response body sizes from Chromium request accounting; not network wire totals.']};
 const twoFrames=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile-viewport',{width:390,height:844}]]){
  const observe=createReadObserver();
  const {page,pick}=await openActor(actor,'dashboard',{viewport,observe});
  try{
   await page.bringToFront();await pick('.ft-dashboard-grid').waitFor();
   await pick('#auto-refresh25').selectOption('0');await observe.drain();
   const samples={dashboard:[],tickets:[]};
   for(let i=0;i<30;i++)for(const destination of ['tickets','dashboard']){
    const start=performance.now();
    await pick('.ft-navigation a[href$="/'+destination+'"]').click({timeout:10000});
    await pick(destination==='dashboard'?'.ft-dashboard-grid':'.ft-queue-panel').waitFor({timeout:15000});
    await twoFrames(page);
    const readyMs=performance.now()-start;
    const reads=await observe.drain();
    const counts=reads.filter(row=>row.operation==='ticket-count').length;
    const lists=reads.filter(row=>row.operation==='ticket-list').length;
    assert.equal(counts,destination==='dashboard'?6:0,'Dashboard count fan-out changed');
    assert.equal(lists,1,'Expected exactly one list request');
    assert.equal(reads.length,counts+lists,'Unexpected membership or repeated read');
    samples[destination].push({readyMs,requests:reads.length,countRequests:counts,
     responseBytes:reads.reduce((n,row)=>n+row.bytes,0),
     maxReadMs:Math.max(...reads.map(row=>row.ms))});
   }
   assert.equal(observe.blockedWrites,0);
   report.profiles[name]=Object.fromEntries(Object.entries(samples).map(([view,rows])=>[
    view,summarizeRows(rows,['readyMs','requests','countRequests','responseBytes','maxReadMs'])
   ]));
   console.log('CP_CRM_PERF_01B_FUELTRANS_PROFILE '+JSON.stringify({name,results:report.profiles[name]}));
  }finally{await page.close();}
 }
 mkdirSync('artifacts',{recursive:true});
 writeFileSync('artifacts/crm-perf-01b-fueltrans.json',JSON.stringify(report,null,2)+'\n');
 console.log('CP_CRM_PERF_01B_FUELTRANS_BROWSER_PASS '+JSON.stringify({profiles:2,cycles:60,transitions:120}));
}
