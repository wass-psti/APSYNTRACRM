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
  entryFromNavigationMs:100,signedReadyFromNavigationMs:217
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
