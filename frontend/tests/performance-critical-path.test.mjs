import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStartupCriticalPath,summarizeLongTasks} from '../performance-critical-path.js';
import {sampleBrowserFrames} from '../performance-profile.js';
test('signed startup phases track only fixed numeric durations, never identifiers or arbitrary labels',()=>{
 let t=100;
 const timeline=createStartupCriticalPath({clock:()=>t});
 assert.equal(timeline.snapshot(),null);
 timeline.begin();t+=32;
 timeline.phase('workspace-authorization');t+=68;
 timeline.phase('authorized-route');t+=17;
 timeline.end({authenticated:true});
 assert.deepEqual(timeline.snapshot(),{
  phases:[{phase:'session-restore',durationMs:32},
   {phase:'workspace-authorization',durationMs:68},
   {phase:'authorized-route',durationMs:17}],totalMs:117,
  entryFromNavigationMs:100,signedReadyFromNavigationMs:217,reads:[]
 });
 timeline.clear();assert.equal(timeline.snapshot(),null);
 timeline.begin();t+=20;timeline.phase('unknown-email');
 t+=20;timeline.end({authenticated:false});
 assert.equal(timeline.snapshot(),null,'unauthenticated startup must not retain report');
});
test('out-of-sequence, negative and invalid clocks fail closed',()=>{
 let time=5;
 const timeline=createStartupCriticalPath({clock:()=>time});
 timeline.begin();timeline.phase('authorized-route');
 time+=7;timeline.phase('workspace-authorization');
 time-=30;timeline.phase('authorized-route');
 time+=31;timeline.end({authenticated:true});
 const result=timeline.snapshot();
 assert.ok(result.phases.every(x=>Number.isFinite(x.durationMs)&&x.durationMs>=0));
 assert.equal(result.phases.some(x=>x.phase==='unknown-email'),false);
});
test('long task aggregations are bounded and contain only numeric summaries',()=>{
 assert.deepEqual(summarizeLongTasks([12,50,80,120,NaN,Infinity,-1]),
  {count:3,totalMs:250,maxMs:120});
 assert.deepEqual(summarizeLongTasks([]),{count:0,totalMs:0,maxMs:0});
 assert.equal(summarizeLongTasks(Array(600).fill(60)).count,128);
});
test('on-demand observer records only durations and disconnects on complete',async()=>{
 let observer,callback,tick;
 class FakeObserver{
  static supportedEntryTypes=['longtask'];
  constructor(handler){callback=handler;observer=this;this.stopped=false;}
  observe(value){assert.deepEqual(value,{type:'longtask',buffered:false});}
  disconnect(){this.stopped=true;}
 }
 const frames=[];const doc={hidden:false,addEventListener(){},removeEventListener(){}};
 const start=sampleBrowserFrames({durationMs:1000,observerClass:FakeObserver,documentRef:doc,
  requestFrame:fn=>{tick=fn;frames.push(fn);return frames.length;},cancelFrame:()=>{},
  performanceRef:{getEntriesByType:()=>[]}});
 callback({getEntries:()=>[{duration:66.42,name:'sensitive URL not read',attribution:[{name:'private'}]},
  {duration:90,name:'secret-not-read'}]});
 for(let ms=0;ms<=1000;ms+=20)tick(ms);
 const result=await start;
 assert.equal(result.status,'COMPLETE');
 assert.deepEqual(result.longTasks,{supported:true,count:2,totalMs:156.42,maxMs:90});
 assert.equal(observer.stopped,true);
 assert.doesNotMatch(JSON.stringify(result),/sensitive URL|secret-not-read|private/);
});
test('abort also disconnects observer and no subscription survives',async()=>{
 let observer;
 class FakeObserver{
  static supportedEntryTypes=['longtask'];
  constructor(){observer=this;}
  observe(){}
  disconnect(){this.disconnected=true;}
 }
 const controller=new AbortController(),doc={hidden:false,addEventListener(){},removeEventListener(){}};
 const started=sampleBrowserFrames({signal:controller.signal,observerClass:FakeObserver,
  documentRef:doc,requestFrame:()=>1,cancelFrame:()=>{},performanceRef:{getEntriesByType:()=>[]}});
 controller.abort();
 assert.equal((await started).status,'CANCELLED');
 assert.equal(observer.disconnected,true);
});
test('signed interface labels bootstrap phases accurately and retains no telemetry',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/startupCriticalPath\.begin\(\)/);
 assert.match(app,/startupCriticalPath\.phase\('workspace-authorization'\)/);
 assert.match(app,/startupCriticalPath\.phase\('authorized-route'\)/);
 assert.match(app,/startupCriticalPath\.end\(\{authenticated:outcome==='AUTHENTICATED'\}\)/);
 assert.match(app,/if\(!startupBusy\)startupCriticalPath\.clear\(\)/);
 assert.match(app,/Long tasks \(50 ms or more\)/);
 const source=readFileSync(new URL('../performance-critical-path.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest|WebSocket|setInterval/);
});
test('Priority 5E captures only three fixed signed read durations with real overlap',async()=>{
 let time=80;
 const path=createStartupCriticalPath({clock:()=>time});
 const defer=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
 path.begin();time+=25;path.phase('workspace-authorization');
 const context=defer();const waitContext=path.measure('workspace-context',()=>context.promise);
 time+=150;context.resolve({private:'must not be observed'});
 assert.deepEqual(await waitContext,{private:'must not be observed'});
 const board=defer(),role=defer();
 const waitBoard=path.measure('board-list',()=>board.promise);
 const waitRole=path.measure('bootstrap-role',()=>role.promise);
 time+=280;board.resolve([{id:'sensitive'}]);await waitBoard;
 time+=190;role.resolve(true);await waitRole;
 path.phase('authorized-route');time+=10;path.end({authenticated:true});
 const report=path.snapshot();
 assert.deepEqual(report.reads,[
  {operation:'workspace-context',durationMs:150,startMs:25,endMs:175},
  {operation:'board-list',durationMs:280,startMs:175,endMs:455},
  {operation:'bootstrap-role',durationMs:470,startMs:175,endMs:645}
 ]);
 assert.equal(report.phases[1].durationMs,620);
 assert.doesNotMatch(JSON.stringify(report),/sensitive|private|true/);
});
test('Priority 5E never publishes denied, stale, unknown or cross-session operation details',async()=>{
 let time=20;
 const timeline=createStartupCriticalPath({clock:()=>time});
 timeline.begin();time+=10;timeline.phase('workspace-authorization');
 await timeline.measure('unexpected-private-label',async()=>{time+=100;return {secret:'none'}});
 await assert.rejects(timeline.measure('workspace-context',async()=>{
  time+=20;throw new Error('server denied');
 }),/server denied/);
 timeline.end({authenticated:false});
 assert.equal(timeline.snapshot(),null);
 timeline.begin();time+=10;timeline.phase('workspace-authorization');
 let finish;
 const stalled=new Promise(resolve=>finish=resolve);
 const pending=timeline.measure('workspace-context',()=>stalled);
 timeline.clear();finish('delayed');await pending;
 assert.equal(timeline.snapshot(),null);
});
test('Priority 5E records only first valid label, with numeric timestamps and no extra read calls',async()=>{
 let time=0,calls=0;
 const path=createStartupCriticalPath({clock:()=>time});
 path.begin();path.phase('workspace-authorization');
 await path.measure('board-list',()=>{calls++;time+=55;return Promise.resolve([])});
 await path.measure('board-list',()=>{calls++;time+=95;return Promise.resolve([])});
 path.phase('authorized-route');path.end({authenticated:true});
 assert.equal(calls,2,'diagnostics must not skip or cache any signed request');
 assert.equal(path.snapshot().reads.length,1,'fixed label is recorded at most once');
 assert.equal(path.snapshot().reads[0].durationMs,55);
});
test('Priority 5E signed settings report uses numeric operation names without exposing payloads',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/report\?\.startup\?\.reads\?\.length/);
 assert.match(app,/report\.startup\.reads\.map\(read=>/);
 assert.match(app,/e\(read\.operation\)/);
 assert.match(app,/not additive/);
 assert.match(app,/start(?:up)?CriticalPath\.measure\('workspace-context',\(\)=>db\.context\(\)\)/);
 assert.match(app,/startupCriticalPath\.measure\('board-list',\(\)=>db\.boards\('active'\)\)/);
 assert.match(app,/startupCriticalPath\.measure\('bootstrap-role',\(\)=>roleConfig\.bootstrapVerified\(\)\)/);
});
