/** Explicit, finite, read-only local performance sample.
 * No URLs, credentials, account identifiers, record data, RPC payloads,
 * telemetry transmission, persistent storage or background observers.
 */
const round=value=>Number.isFinite(value)?Math.round(value*100)/100:null;
const quantile=(sorted,percentile)=>sorted.length?
 sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*percentile)-1)]:null;
export function summarizeFrameIntervals(intervals=[]){
 const sorted=intervals.filter(n=>Number.isFinite(n)&&n>=0&&n<=1000)
  .slice(0,1200).sort((a,b)=>a-b);
 if(!sorted.length)return {frames:0,p50Ms:null,p95Ms:null,over120Percent:null,
  over60Percent:null};
 const over=limit=>round(sorted.filter(ms=>ms>limit).length/ sorted.length*100);
 return {frames:sorted.length,p50Ms:round(quantile(sorted,.5)),
  p95Ms:round(quantile(sorted,.95)),over120Percent:over(1000/120),
  over60Percent:over(1000/60)};
}
export function publicNavigationSnapshot(performanceRef=globalThis.performance){
 const navigation=performanceRef?.getEntriesByType?.('navigation')?.[0];
 const safe=value=>round(typeof value==='number'&&value>=0?value:NaN);
 return navigation?{
  ttfbMs:safe(navigation.responseStart-navigation.requestStart),
  domReadyMs:safe(navigation.domContentLoadedEventEnd-navigation.startTime),
  loadMs:safe(navigation.loadEventEnd-navigation.startTime)
 }:{ttfbMs:null,domReadyMs:null,loadMs:null};
}
/** Samples exactly one visible tab for a bounded user-requested duration. */
export function sampleBrowserFrames({
 durationMs=5000,requestFrame=globalThis.requestAnimationFrame?.bind(globalThis),
 cancelFrame=globalThis.cancelAnimationFrame?.bind(globalThis),
 documentRef=globalThis.document,performanceRef=globalThis.performance,
 signal
}={}){
 if(!requestFrame||!cancelFrame||documentRef?.hidden||signal?.aborted)
  return Promise.resolve({status:'UNAVAILABLE',reason:'No visible supported browser tab'});
 const duration=Math.max(1000,Math.min(10000,Number(durationMs)||5000));
 const navigation=publicNavigationSnapshot(performanceRef);
 return new Promise(resolve=>{
  const intervals=[];let last=null,start=null,handle=null,settled=false;
  const finish=(status,reason=null)=>{
   if(settled)return;
   settled=true;
   if(handle!==null)cancelFrame(handle);
   documentRef?.removeEventListener?.('visibilitychange',onVisibility);
   signal?.removeEventListener?.('abort',onAbort);
   resolve({status,reason,...navigation,...summarizeFrameIntervals(intervals),
    durationMs:status==='COMPLETE'?duration:null});
  };
  const onVisibility=()=>{if(documentRef?.hidden)finish('CANCELLED','Tab hidden');};
  const onAbort=()=>finish('CANCELLED','Session or workspace changed');
  const tick=time=>{
   if(settled)return;
   if(signal?.aborted||documentRef?.hidden){finish('CANCELLED','Sample interrupted');return;}
   if(start===null)start=time;
   if(last!==null)intervals.push(Math.max(0,time-last));
   last=time;
   if(time-start>=duration){finish('COMPLETE');return;}
   handle=requestFrame(tick);
  };
  signal?.addEventListener?.('abort',onAbort,{once:true});
  documentRef?.addEventListener?.('visibilitychange',onVisibility);
  handle=requestFrame(tick);
 });
}
