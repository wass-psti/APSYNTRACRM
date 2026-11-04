/** CP-CRM-METRIC-01: global signed-metric presentation only.
 * Original KPI text, calculations, form handlers and authorization are untouched.
 * SVG/Canvas represent only measured percentages (never invented trends).
 * Opt-in libraries load lazily from the existing strict-CSP script origin.
 */
export const METRIC_VALUE_SELECTOR=[
 '.stat-value','.tt-overview-metric > strong','.tt-report-stat > strong',
 '.tt-monitor-stat > strong','.tt-ov-telemetry-stats strong',
 '.tt-hours-kpis strong','.tt-hours-progress-kpis strong',
 '.tt-ot-metrics strong','.tt-cal-kpis strong',
 '.tt-team-stats strong','.tt-gps-kpi strong',
 '.tt-gps-telemetry-grid strong','.tt-monitor-telemetry-grid strong',
 '.tt-team-telemetry-grid strong','.tt-gps-telemetry-primary strong',
 '.tt-monitor-telemetry-primary strong','.tt-team-telemetry-primary strong',
 '.tt-on-time > b','.tt-ot-insight strong','.tt-pulse-grid strong'
].join(',');
export const METRIC_CHART_SELECTOR=[
 '.tt-report-analytics','.tt-cal-analytics','.tt-ot-chart',
 '.tt-gps-bars','.tt-hours-progress progress',
 '.tt-on-time-bar','.tt-monitor-history'
].join(',');
export const MOTION_SCRIPT='https://unpkg.com/motion@12.38.0/dist/motion.js';
export const GSAP_SCRIPT='https://unpkg.com/gsap@3.15.0/dist/gsap.min.js';
export const MAX_ACTIVE_KPIS=12;
export const METRIC_MOTION_DURATION=450;
const SVG_NS='http://www.w3.org/2000/svg';
let scriptsPromise=null;

export function parseMetricValue(raw){
 const text=String(raw??'').trim();
 const match=/^([₱$€]?)(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(\s*(?:%|ms|h|hrs|m|s|MiB|KiB|MB|GB)?)$/i.exec(text);
 if(!match)return null;
 const numeric=Number(match[2].replace(/,/g,''));
 if(!Number.isFinite(numeric)||Math.abs(numeric)>1e9)return null;
 return Object.freeze({raw:text,value:numeric,prefix:match[1],suffix:match[3],
  percent:match[3].trim()==='%'&&numeric>=0&&numeric<=100});
}
export function metricMotionLevel({reduced=false,saveData=false,hidden=false,
 cores=8,memory=8}={}){
 if(reduced||saveData||hidden)return 'none';
 if(Number(cores)<=4||Number(memory)<=4)return 'lite';
 return 'full';
}
export function metricFrameBudget(level){
 return level==='full'?1000/60:level==='lite'?1000/30:Infinity;
}
export function metricProgressPoint(progress){
 return Math.max(0,Math.min(1,Number.isFinite(progress)?progress:0));
}
export function describeMetricProfiling(samples=[]){
 if(!samples.length)return Object.freeze({frames:0,meanMs:null,maxMs:null,slowFrames:0});
 const n=samples.filter(v=>Number.isFinite(v)&&v>=0).slice(-120);
 if(!n.length)return Object.freeze({frames:0,meanMs:null,maxMs:null,slowFrames:0});
 return Object.freeze({frames:n.length,
  meanMs:Math.round(n.reduce((sum,value)=>sum+value,0)/n.length*100)/100,
  maxMs:Math.round(Math.max(...n)*100)/100,
  slowFrames:n.filter(ms=>ms>16.7).length});
}
function motionAllowed(doc,win){
 return metricMotionLevel({
  reduced:!!win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
  saveData:!!win?.navigator?.connection?.saveData,
  hidden:doc?.visibilityState==='hidden',
  cores:win?.navigator?.hardwareConcurrency??8,
  memory:win?.navigator?.deviceMemory??8
 });
}
function appendScript(doc,url){
 return new Promise((resolve,reject)=>{
  const node=doc.createElement('script');
  node.async=true;node.src=url;node.referrerPolicy='no-referrer';
  node.onload=resolve;
  node.onerror=()=>reject(Error('Metric animation library unavailable'));
  doc.head.append(node);
 });
}
/** Shared, pinned; no CSP expansion and no dependency for reduced-motion devices. */
export function loadMetricMotionLibraries(doc=globalThis.document){
 if(globalThis.Motion?.animate&&globalThis.gsap?.to)
  return Promise.resolve({motion:globalThis.Motion,gsap:globalThis.gsap});
 if(!doc?.head)return Promise.resolve({motion:null,gsap:null});
 if(!scriptsPromise){
  scriptsPromise=(async()=>{
   if(!globalThis.Motion?.animate)await appendScript(doc,MOTION_SCRIPT);
   if(!globalThis.gsap?.to)await appendScript(doc,GSAP_SCRIPT);
   return {motion:globalThis.Motion?.animate?globalThis.Motion:null,
    gsap:globalThis.gsap?.to?globalThis.gsap:null};
  })().catch(()=>({motion:null,gsap:null}));
 }
 return scriptsPromise;
}
function svgNode(doc,name,attrs){
 const n=doc.createElementNS(SVG_NS,name);
 for(const [key,value] of Object.entries(attrs))
  n.setAttribute(key,String(value));
 return n;
}
/** Exact percent is taken exclusively from the already-rendered signed KPI. */
export function createMetricSvgGauge(percent,doc=globalThis.document){
 if(!doc?.createElementNS||!Number.isFinite(percent)||percent<0||percent>100)
  return null;
 const svg=svgNode(doc,'svg',{class:'aps-metric-gauge aps-metric-gauge-svg',
  viewBox:'0 0 52 52',width:52,height:52,'aria-hidden':'true',focusable:'false'});
 const base={cx:26,cy:26,r:19,fill:'none','stroke-width':5,
  'pathLength':100,transform:'rotate(-90 26 26)'};
 svg.append(svgNode(doc,'circle',{...base,class:'aps-metric-gauge-track'}),
  svgNode(doc,'circle',{...base,class:'aps-metric-gauge-fill',
   'stroke-dasharray':percent+' 100'}));
 return svg;
}
export function drawMetricCanvasGauge(canvas,percent,{dpr=1}={}){
 const p=Number(percent);
 if(!canvas?.getContext||!Number.isFinite(p)||p<0||p>100)return false;
 const context=canvas.getContext('2d',{alpha:true});
 if(!context)return false;
 const ratio=Math.min(2,Math.max(1,Number(dpr)||1)),size=52;
 const pixels=Math.round(size*ratio);
 if(canvas.width!==pixels||canvas.height!==pixels){
  canvas.width=pixels;canvas.height=pixels;
 }
 context.setTransform(ratio,0,0,ratio,0,0);
 context.clearRect(0,0,size,size);
 context.lineWidth=5;
 context.lineCap='round';
 context.strokeStyle='#dce5f7';
 context.beginPath();
 context.arc(26,26,19,0,Math.PI*2);
 context.stroke();
 context.strokeStyle='#6574df';
 context.beginPath();
 context.arc(26,26,19,-Math.PI/2,-Math.PI/2+(Math.PI*2*p/100));
 context.stroke();
 return true;
}
/** Allows deterministic local profiling only when caller explicitly opts in. */
export function startMetricsExperience(root=globalThis.document?.body,{
 profile=false,onProfile=null,enhancedLibraries=true
}={}){
 const doc=root?.ownerDocument||globalThis.document,win=doc?.defaultView||globalThis.window;
 if(!root?.querySelectorAll||!doc||!win||typeof MutationObserver!=='function')
  return ()=>{};
 const reduced=()=>motionAllowed(doc,win);
 let running=true,hasRefreshIntent=false,activeAnimations=0;
 const entries=new Map(),profileSamples=[],observed=new Set();
 const charts=new Set(),chartAnimations=new Map();
 let live=null;
 const observerAvailable=typeof IntersectionObserver==='function';
 const resizeAvailable=typeof ResizeObserver==='function';
 const hasAnimationFrame=typeof win.requestAnimationFrame==='function';
 const frame=callback=>hasAnimationFrame?win.requestAnimationFrame(callback):null;
 const cancel=id=>{if(id!==null&&typeof win.cancelAnimationFrame==='function')
  win.cancelAnimationFrame(id);};
 let visibilityObserver=null,resizeObserver=null;
 function profileFrame(ms){
  if(!profile||!Number.isFinite(ms)||ms<0)return;
  if(profileSamples.length>=120)profileSamples.shift();
  profileSamples.push(ms);
  if(typeof onProfile==='function'&&profileSamples.length%30===0)
   onProfile(describeMetricProfiling(profileSamples));
 }
 function stop(entry){
  if(entry.frameId!==null)cancel(entry.frameId);
  entry.frameId=null;entry.tween?.kill?.();entry.tween=null;
  entry.motion?.cancel?.();entry.motion=null;
  if(entry.playing){entry.playing=false;activeAnimations=Math.max(0,activeAnimations-1);}
 }
 function draw(entry,value){
  if(entry.canvas){
   const t0=win.performance?.now?.()??0;
   drawMetricCanvasGauge(entry.canvas,value,{dpr:win.devicePixelRatio||1});
   if(profile)profileFrame((win.performance?.now?.()??t0)-t0);
  }else if(entry.ring){
   entry.ring.setAttribute('stroke-dasharray',value+' 100');
  }
 }
 function finish(entry){
  stop(entry);
  if(entry.gauge)draw(entry,entry.percent);
 }
 function nativeAnimation(entry,level){
  if(!entry.gauge)return;
  if(!hasAnimationFrame){draw(entry,entry.percent);return;}
  stop(entry);entry.playing=true;activeAnimations++;
  const duration=level==='lite'?240:METRIC_MOTION_DURATION;
  const startTime=win.performance?.now?.()??0;
  let previous=0;
  function tick(timestamp){
   if(!running||!entry.node.isConnected||doc.visibilityState==='hidden'){
    finish(entry);return;
   }
   if(timestamp-previous<metricFrameBudget(level)-1){
    entry.frameId=frame(tick);return;
   }
   previous=timestamp;
   const elapsed=Math.max(0,timestamp-startTime);
   const raw=metricProgressPoint(elapsed/duration);
   const easing=1-Math.pow(1-raw,3);
   draw(entry,entry.percent*easing);
   if(raw>=1)finish(entry);
   else entry.frameId=frame(tick);
  }
  entry.frameId=frame(tick);
 }
 function maybeReveal(entry){
  if(entry.revealed||!entry.node.isConnected)return;
  entry.revealed=true;
  const level=reduced();
  if(level==='none')return;
  const card=entry.card;
  if(!card)return;
  // WAAPI transforms operate on compositor, not style attributes or CSSOM.
  if(typeof card.animate==='function'){
   entry.motion=card.animate([
    {opacity:0.88,transform:'translateY(5px) scale(.99)'},
    {opacity:1,transform:'translateY(0) scale(1)'}
   ],{duration:level==='lite'?180:320,easing:'ease-out'});
  }
  if(!entry.gauge)return;
  if(activeAnimations>=MAX_ACTIVE_KPIS){draw(entry,entry.percent);return;}
  nativeAnimation(entry,level);
  if(level!=='full'||!enhancedLibraries)return;
  void loadMetricMotionLibraries(doc).then(({motion,gsap})=>{
   if(!running||!entry.node.isConnected||doc.visibilityState==='hidden')return;
   if(entry.card&&motion?.animate){
    try{
     entry.motion?.cancel?.();
     entry.motion=motion.animate(entry.card,
      {opacity:[0.9,1]},{duration:0.25});
    }catch{/* WAAPI fallback already applied. */}
   }
   if(entry.canvas&&gsap?.to&&entry.playing){
    stop(entry);
    entry.playing=true;activeAnimations++;
    const counter={value:0};
    try{
     entry.tween=gsap.to(counter,{value:entry.percent,
      duration:0.34,ease:'power2.out',overwrite:true,
      onUpdate:()=>draw(entry,counter.value),
      onComplete:()=>finish(entry)});
    }catch{finish(entry);}
   }
  });
 }
 function attach(node){
  if(!running||!node?.isConnected||entries.has(node))return;
  // Only plain, already rendered numeric metrics are candidates.
  if(node.children?.length||node.closest?.('[hidden],[aria-hidden="true"]'))return;
  const parsed=parseMetricValue(node.textContent);
  const card=node.closest?.('.stat-card,.tt-overview-metric,.tt-report-stat,.tt-monitor-stat,'
   +'.tt-hours-kpis > div,.tt-hours-progress-kpis > div,.tt-ot-metrics > div,'
   +'.tt-cal-kpis > div,.tt-team-stats > div,.tt-gps-kpi,'
   +'.tt-ov-telemetry-stats > div,.tt-gps-telemetry-grid > div,'
   +'.tt-team-telemetry-grid > div,.tt-monitor-telemetry-grid > div,'
   +'.tt-gps-telemetry-primary,.tt-team-telemetry-primary,.tt-monitor-telemetry-primary');
  if(!card)return;
  node.classList.add('aps-metric-value');
  card.classList.add('aps-metric-card');
  const entry={node,card,parsed,gauge:null,canvas:null,ring:null,
   percent:parsed?.percent?parsed.value:0,revealed:false,
   frameId:null,tween:null,motion:null,playing:false};
  if(parsed?.percent&&card.querySelectorAll?.('.aps-metric-gauge').length===0){
   const percent=parsed.value;
   // Canvas for compact TimeTracker summaries; SVG elsewhere. Both show same %.
   const canvasEligible=!!card.closest?.('.tt-ot-metrics,.tt-monitor-stats,'
    +'.tt-cal-kpis,.tt-report-kpis');
   const gauge=canvasEligible?doc.createElement('canvas'):createMetricSvgGauge(percent,doc);
   if(gauge){
    if(canvasEligible){
     gauge.className='aps-metric-gauge aps-metric-gauge-canvas';
     gauge.setAttribute('aria-hidden','true');
     gauge.setAttribute('width','52');gauge.setAttribute('height','52');
     entry.canvas=gauge;
    }else entry.ring=gauge.querySelector?.('.aps-metric-gauge-fill');
    entry.gauge=gauge;card.append(gauge);
    draw(entry,percent);
    if(entry.canvas&&resizeObserver)resizeObserver.observe(entry.canvas);
   }
  }
  entries.set(node,entry);
  if(visibilityObserver){visibilityObserver.observe(card);observed.add(card);}
  else maybeReveal(entry);
 }
 function revealChart(chart){
  if(!running||!chart.isConnected||!charts.has(chart))return;
  charts.delete(chart);
  const level=reduced();
  if(level==='none')return;
  if(typeof chart.animate==='function'){
   try{
    const animation=chart.animate([
     {opacity:0.86,transform:'translateY(5px)'},
     {opacity:1,transform:'translateY(0)'}
    ],{duration:level==='lite'?150:260,easing:'ease-out'});
    chartAnimations.set(chart,animation);
   }catch{/* Static original chart remains fully visible. */}
  }
  // Existing SVG chart bars keep their source dimensions and values.
  // Animate visibility only, never invent data points or path positions.
  for(const bar of Array.from(chart.querySelectorAll?.('svg rect')||[]).slice(0,12)){
   if(typeof bar.animate==='function'){
    try{bar.animate([{opacity:0.7},{opacity:1}],
     {duration:level==='lite'?140:240,easing:'ease-out'});}
    catch{/* Original SVG bar remains unchanged. */}
   }
  }
 }
 function watchChart(chart){
  if(!chart?.isConnected||charts.has(chart)||chartAnimations.has(chart))return;
  chart.classList.add('aps-metric-chart');
  charts.add(chart);
  if(visibilityObserver){visibilityObserver.observe(chart);observed.add(chart);}
  else revealChart(chart);
 }
 function scan(node){
  if(node?.nodeType!==1)return;
  if(node.matches?.(METRIC_VALUE_SELECTOR))attach(node);
  node.querySelectorAll?.(METRIC_VALUE_SELECTOR).forEach(attach);
  if(node.matches?.(METRIC_CHART_SELECTOR))watchChart(node);
  node.querySelectorAll?.(METRIC_CHART_SELECTOR).forEach(watchChart);
 }
 if(observerAvailable){
  visibilityObserver=new IntersectionObserver(changes=>{
   for(const change of changes){
    if(!change.isIntersecting)continue;
    for(const entry of entries.values())
     if(entry.card===change.target)maybeReveal(entry);
    if(charts.has(change.target))revealChart(change.target);
    visibilityObserver.unobserve(change.target);
    observed.delete(change.target);
   }
  },{root:null,rootMargin:'0px 0px 50px 0px',threshold:0.08});
 }
 if(resizeAvailable){
  resizeObserver=new ResizeObserver(changes=>{
   for(const change of changes){
    for(const entry of entries.values())
     if(entry.canvas===change.target&&!entry.playing)draw(entry,entry.percent);
   }
  });
 }
 const observer=new MutationObserver(changes=>{
  if(!running)return;
  let added=false;
  for(const change of changes){
   if(change.type!=='childList')continue;
   for(const node of change.addedNodes){
    if(node.nodeType===1){scan(node);added=true;}
   }
  }
  for(const [node,entry] of entries)
   if(!node.isConnected){
    stop(entry);
    if(entry.canvas)resizeObserver?.unobserve(entry.canvas);
    if(entry.gauge?.isConnected)entry.gauge.remove();
    entries.delete(node);
   }
  for(const chart of charts)
   if(!chart.isConnected){visibilityObserver?.unobserve(chart);charts.delete(chart);}
  for(const [chart,animation] of chartAnimations)
   if(!chart.isConnected){animation?.cancel?.();chartAnimations.delete(chart);}
  if(added&&hasRefreshIntent){
   hasRefreshIntent=false;
   if(live)live.textContent='Authorized metrics refreshed.';
  }
 });
 observer.observe(root,{subtree:true,childList:true});
 const onRefresh=event=>{
  if(event.target?.closest?.('[data-action="tt-refresh"],[data-action="tt-monitor-refresh"],'
   +'[data-action="tt-gps-load"]'))hasRefreshIntent=true;
 };
 const onVisibility=()=>{
  if(doc.visibilityState==='hidden'){
   for(const entry of entries.values())finish(entry);
   for(const animation of chartAnimations.values())animation?.cancel?.();
   chartAnimations.clear();
  }
 };
 if(root.append&&doc.createElement){
  live=doc.createElement('div');
  live.className='aps-metric-live';
  live.setAttribute('role','status');
  live.setAttribute('aria-live','polite');
  live.setAttribute('aria-atomic','true');
  root.append(live);
 }
 root.addEventListener?.('click',onRefresh,true);
 doc.addEventListener?.('visibilitychange',onVisibility);
 scan(root);
 return ()=>{
  if(!running)return;
  running=false;observer.disconnect();
  root.removeEventListener?.('click',onRefresh,true);
  doc.removeEventListener?.('visibilitychange',onVisibility);
  visibilityObserver?.disconnect();resizeObserver?.disconnect();
  for(const [chart,animation] of chartAnimations){
   animation?.cancel?.();chart.classList.remove('aps-metric-chart');
  }
  chartAnimations.clear();
  for(const chart of charts)chart.classList.remove('aps-metric-chart');
  charts.clear();
  for(const entry of entries.values()){
   stop(entry);entry.gauge?.remove();
   entry.node.classList.remove('aps-metric-value');
   entry.card.classList.remove('aps-metric-card');
  }
  entries.clear();live?.remove();
  if(profile&&typeof onProfile==='function')
   onProfile(describeMetricProfiling(profileSamples));
 };
}
