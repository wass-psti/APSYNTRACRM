/** Priority 5G. Finite, on-demand summary of browser public startup resources.
 * Names/URLs are used solely to classify same-origin, public frontend assets;
 * output is fixed numeric aggregates, never names, paths, queries or payloads.
 * Does not issue requests, observe network events, or write persistent data.
 */
const round=value=>Number.isFinite(value)?Math.round(value*100)/100:null;
const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const empty=()=>({count:0,decodedBytes:0,latestEndMs:null,latestStartMs:null});
export function summarizeEntryWaterfall({
 performanceRef=globalThis.performance,
 origin=globalThis.location?.origin,
 entryMs=null
}={}){
 const cutoff=number(entryMs);
 if(cutoff===null||!origin||typeof performanceRef?.getEntriesByType!=='function')return null;
 let records=[];
 try{records=performanceRef.getEntriesByType('resource')||[];}catch{return null;}
 const groups={javascript:empty(),stylesheet:empty(),other:empty()};
 let examined=0;
 for(const record of records){
  if(examined>=300)break;
  examined++;
  let path;
  try{
   const uri=new URL(String(record?.name||''));
   if(uri.origin!==origin)continue;
   path=uri.pathname;
  }catch{continue;}
  // Public static assets only; never inspect signed API or attachment paths.
  if(!/^\/(?:APSYNTRACRM\/)?frontend\/[a-zA-Z0-9_./-]+$/.test(path)||path.includes('/../'))continue;
  const start=number(record.startTime),end=number(record.responseEnd);
  if(start===null||end===null||end<start||end>cutoff)continue;
  const group=path.endsWith('.js')?groups.javascript:
   path.endsWith('.css')?groups.stylesheet:groups.other;
  group.count++;
  // 0 means unknown on some browsers, not proof of zero transfer.
  const bytes=number(record.decodedBodySize);
  if(bytes!==null)group.decodedBytes+=Math.min(bytes,5_000_000);
  group.latestEndMs=Math.max(group.latestEndMs??0,end);
  group.latestStartMs=Math.max(group.latestStartMs??0,start);
 }
 for(const group of Object.values(groups)){
  group.decodedBytes=Math.round(group.decodedBytes);
  group.latestEndMs=round(group.latestEndMs);
  group.latestStartMs=round(group.latestStartMs);
 }
 const lastResourceEnd=Math.max(0,...Object.values(groups).map(x=>x.latestEndMs??0));
 return {entryMs:round(cutoff),resourceCount:Object.values(groups).reduce((n,x)=>n+x.count,0),
  groups,afterLatestPublicResourceMs:lastResourceEnd?round(Math.max(0,cutoff-lastResourceEnd)):null,
  // No causal attribution: HTML parse, scheduler, module parse/evaluation and
  // unrelated waits can all contribute to this residual interval.
  scope:'same-origin public frontend resources completed before app entry'};
}
