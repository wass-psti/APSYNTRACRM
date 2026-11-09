import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeFrameIntervals,publicNavigationSnapshot,sampleBrowserFrames}
 from '../performance-profile.js';
const perf={getEntriesByType:type=>type==='navigation'?[{
 startTime:0,requestStart:20,responseStart:95,
 domContentLoadedEventEnd:260,loadEventEnd:420}]:[]};
function clock(){
 const queue=new Map();let next=0;
 const listeners=new Map(),doc={hidden:false,
  addEventListener:(name,fn)=>listeners.set(name,fn),
  removeEventListener:name=>listeners.delete(name)};
 const requestFrame=fn=>{const id=++next;queue.set(id,fn);return id};
 const cancelFrame=id=>queue.delete(id);
 const frame=t=>{
  const callbacks=[...queue.values()];queue.clear();callbacks.forEach(fn=>fn(t));
 };
 return {doc,frame,requestFrame,cancelFrame,listeners,queue};
}
test('frame percentiles, thresholds, and navigation timing have bounded numeric output',()=>{
 const result=summarizeFrameIntervals([5,8,10,20,30,NaN,Infinity,-5]);
 assert.deepEqual(result,{frames:5,p50Ms:10,p95Ms:30,over120Percent:60,
  over60Percent:40});
 assert.deepEqual(publicNavigationSnapshot(perf),{ttfbMs:75,domReadyMs:260,loadMs:420});
 assert.equal(summarizeFrameIntervals([]).p95Ms,null);
});
test('on-demand sample completes after a bounded visible-frame window',async()=>{
 const c=clock();
 const task=sampleBrowserFrames({durationMs:1000,performanceRef:perf,
  documentRef:c.doc,requestFrame:c.requestFrame,cancelFrame:c.cancelFrame});
 for(let t=0;t<=1000;t+=20)c.frame(t);
 const result=await task;
 assert.equal(result.status,'COMPLETE');
 assert.equal(result.durationMs,1000);
 assert.equal(result.p95Ms,20);
 assert.equal(result.over120Percent,100);
 assert.equal(c.queue.size,0);
 assert.equal(c.listeners.size,0);
 assert.equal(result.ttfbMs,75);
 assert.equal(JSON.stringify(result).includes('https://'),false);
});
test('hidden tab and revoked identity abort without residual observers',async()=>{
 const c=clock();const abort=new AbortController();
 const task=sampleBrowserFrames({durationMs:1000,performanceRef:perf,
  signal:abort.signal,documentRef:c.doc,
  requestFrame:c.requestFrame,cancelFrame:c.cancelFrame});
 c.frame(0);abort.abort();
 assert.equal((await task).status,'CANCELLED');
 assert.equal(c.queue.size,0);assert.equal(c.listeners.size,0);
 c.doc.hidden=true;
 assert.equal((await sampleBrowserFrames({documentRef:c.doc,
  requestFrame:c.requestFrame,cancelFrame:c.cancelFrame})).status,'UNAVAILABLE');
});
test('signed UI runs only a user-initiated finite sample without storing results',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'profile-rendering':\{/);
 assert.match(app,/sampleBrowserFrames\(\{signal:controller\.signal\}\)/);
 assert.match(app,/state\.performanceReport=profile/);
 assert.match(app,/performanceProfileAbort\?\.abort\(\)/);
 assert.match(app,/Profile board rendering \(5 seconds\)/);
 assert.match(app,/On-demand browser performance/);
 const source=readFileSync(new URL('../performance-profile.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/fetch\(|indexedDB|localStorage|sessionStorage|sendBeacon|WebSocket|XMLHttpRequest|PerformanceObserver|setInterval/);
 assert.doesNotMatch(source,/access_token|refresh_token|workspace_id|email/);
});
