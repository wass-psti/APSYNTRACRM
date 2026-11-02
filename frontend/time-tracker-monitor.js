/** APSYNTRA TimeTracker operational monitor.
 * Real, on-demand, in-memory measurements only. No telemetry upload,
 * recurring polling, raw URLs, employee data, credentials or security bypass.
 */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ms=v=>Number.isFinite(v)&&v>=0?Math.round(v):null;
const realUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pht=at=>new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'medium'
}).format(new Date(at));
const status=ok=>ok?'PASS':'FAIL';
const round=v=>Number.isFinite(v)?Math.round(v*10)/10:null;
export function collectTimeTrackerClientMetrics(perf=globalThis.performance){
 if(!perf||typeof perf.getEntriesByType!=='function')return Object.freeze({
  navigationMs:null,domInteractiveMs:null,transferBytes:null,
  slowResources:null,longTasks:null,heapMb:null});
 const nav=perf.getEntriesByType('navigation')?.[0];
 const resources=perf.getEntriesByType('resource')||[];
 const transferred=resources.filter(r=>Number.isFinite(r.transferSize)&&r.transferSize>0);
 const long=perf.getEntriesByType('longtask')||[];
 const heap=perf.memory?.usedJSHeapSize;
 return Object.freeze({
  navigationMs:nav?ms(nav.duration):null,
  domInteractiveMs:nav?ms(nav.domInteractive-nav.startTime):null,
  transferBytes:transferred.length?
   transferred.reduce((sum,r)=>sum+r.transferSize,0):null,
  slowResources:resources.filter(r=>Number.isFinite(r.duration)&&r.duration>1000).length,
  longTasks:long.length?long.filter(r=>r.duration>=50).length:null,
  heapMb:Number.isFinite(heap)?round(heap/1048576):null
 });
}
function cleanError(error){
 // Never include server-returned response bodies, tokens, paths, SQL, email or URLs.
 const code=Number(error?.status);
 if(code===401)return 'Session expired or unauthenticated';
 if(code===403)return 'Authorization denied';
 if(code===404)return 'Backend resource unavailable';
 return 'Check failed; inspect your authorized session and connection';
}
/** Only server-verified, deidentified aggregate database health is exposed. */
export function validateTimeTrackerServerHealth(payload,{userId,workspaceId,boardId}){
 if(!payload||payload.mode!=='ACTIVE'||payload.scope!=='BOOTSTRAP_AGGREGATE'||
    payload.actorId!==userId||payload.workspaceId!==workspaceId||
    payload.boardId!==boardId||!payload.database||
    !Number.isFinite(Date.parse(payload.serverTime||'')))
  throw Error('Server operational diagnostics identity/scope mismatch');
 const d=payload.database;
 const fields=['connections','transactionsCommitted','transactionsRolledBack',
  'cacheHits','diskReads','deadlocks'];
 for(const field of fields)if(!Number.isSafeInteger(d[field])||d[field]<0)
  throw Error('Invalid server operational counter');
 const total=d.cacheHits+d.diskReads;
 return Object.freeze({
  status:'VERIFIED',sampledAt:payload.serverTime,
  connections:d.connections,
  commitCount:d.transactionsCommitted,
  rollbackCount:d.transactionsRolledBack,
  deadlocks:d.deadlocks,
  cacheHitPercent:total>0?round(100*d.cacheHits/total):null,
  statsReset:typeof d.statsReset==='string'&&Number.isFinite(Date.parse(d.statsReset))?
   d.statsReset:null
 });
}
export function classifyTimeTrackerMonitor(result){
 if(!result)return 'NOT CHECKED';
 if(result.status==='BLOCKED')return 'BLOCKED';
 if(result.checks.some(c=>c.status!=='PASS'))return 'DEGRADED';
 return 'HEALTHY AT CHECK';
}
export function formatMonitorDuration(value){return value===null||value===undefined?'—':ms(value)+' ms';}
export async function probeTimeTrackerMonitor({
 auth,api,boardId,bootstrapEligible=false,perf=globalThis.performance,clock=()=>Date.now(),
 monotonic=()=>globalThis.performance?.now?.()??Date.now()
}={}){
 if(!auth||!api||!realUuid.test(boardId||'')||!auth.isSignedIn)
  throw Error('Signed TimeTracker monitor access required');
 const initialId=auth.userId,started=clock();
 const checks=[];
 const run=async(name,operation,verify)=>{
  const begin=monotonic();
  try{
   const response=await operation();
   if(!verify(response))throw {status:403};
   checks.push(Object.freeze({name,status:'PASS',durationMs:ms(monotonic()-begin),detail:'Verified signed response'}));
   return response;
  }catch(error){
   checks.push(Object.freeze({name,status:'FAIL',durationMs:ms(monotonic()-begin),detail:cleanError(error)}));
   return null;
  }
 };
 const signed=await run('Supabase Auth identity',()=>auth.getVerifiedUser(),
  u=>u?.id===initialId);
 if(!signed) return Object.freeze({
  status:'BLOCKED',sampledAt:new Date(clock()).toISOString(),checks,
  client:collectTimeTrackerClientMetrics(perf),
  network:{sampleMs:ms(clock()-started),successful:0,total:checks.length}
 });
 const ctx=await run('Workspace admission',()=>api.context(),
  c=>c?.user_id===initialId&&realUuid.test(c?.workspace_id||'')&&c?.profile?.status==='active');
 if(!ctx)return Object.freeze({
  status:'BLOCKED',sampledAt:new Date(clock()).toISOString(),checks,
  client:collectTimeTrackerClientMetrics(perf),
  network:{sampleMs:ms(clock()-started),successful:checks.filter(c=>c.status==='PASS').length,total:checks.length}
 });
 await run('TimeTracker module grant',()=>api.rpc('has_module_access',{
  p_module_id:'time-tracker',p_user_id:initialId
 }),response=>response===true);
 await run('Board view authorization',()=>api.allowed(boardId,'view'),r=>r===true);
 await run('Board and workspace binding',()=>api.board(boardId),
  r=>r?.board?.id===boardId&&r.board.workspace_id===ctx.workspace_id&&
   r.board.name==='TimeTracker Attendance');
 // A final identity check prevents stale readings after a role/session switch.
 const same=await run('Fresh signed identity',()=>api.context(),
  c=>auth.isSignedIn&&auth.userId===initialId&&c?.user_id===initialId&&
   c?.workspace_id===ctx.workspace_id&&c?.profile?.status==='active');
 let server=null;
 if(bootstrapEligible===true&&same&&checks.every(c=>c.status==='PASS')){
  try{
   const value=await api.rpc('timetracker_monitor_snapshot',{p_board_id:boardId});
   server=validateTimeTrackerServerHealth(value,{
    userId:initialId,workspaceId:ctx.workspace_id,boardId
   });
  }catch(error){
   const missing=error?.status===404||/PGRST202|Could not find the function/i.test(String(error?.message||''));
   server=Object.freeze({status:missing?'NOT DEPLOYED':'UNAVAILABLE'});
  }
 }
 return Object.freeze({
  status:same&&checks.every(c=>c.status==='PASS')?'VERIFIED':'DEGRADED',
  sampledAt:new Date(clock()).toISOString(),
  server,checks:Object.freeze(checks),
  client:collectTimeTrackerClientMetrics(perf),
  network:Object.freeze({
   sampleMs:ms(clock()-started),
   successful:checks.filter(c=>c.status==='PASS').length,
   total:checks.length
  })
 });
}
const entry=(label,value,sub='')=>'<div class="tt-monitor-stat"><span>'+esc(label)+
 '</span><strong>'+esc(value)+'</strong><small>'+esc(sub)+'</small></div>';
const fmtBytes=v=>v===null?'—':v>=1048576?round(v/1048576)+' MiB':Math.round(v/1024)+' KiB';
export function renderTimeTrackerMonitor({result=null,loading=false,error='',now=new Date()}={}){
 const state=classifyTimeTrackerMonitor(result);
 const client=result?.client||{};
 const net=result?.network||{};
 const results=result?.checks||[];
 const live=state==='HEALTHY AT CHECK',degraded=state==='DEGRADED';
 return '<section class="tt-monitor" aria-label="TimeTracker API and browser health monitor">'+
  '<header class="tt-monitor-head"><div><h3>API Health Monitor</h3>'+
   '<p>'+esc(pht(now))+'</p></div><div class="tt-monitor-actions">'+
   '<span class="tt-monitor-indicator '+(live?'tt-monitor-healthy':degraded?'tt-monitor-degraded':'')+
   '">'+esc(loading?'Checking…':state)+'</span>'+
   '<button type="button" data-action="tt-monitor-refresh"'+(loading?' disabled':'')+
   '>Run checks</button>'+
   '<button type="button" data-action="tt-monitor-clear"'+(!result||loading?' disabled':'')+
   ' title="Discard in-memory readings">Clear</button></div></header>'+
  '<div class="tt-monitor-subheading">On-demand diagnostics · No recurring telemetry</div>'+
  (error?'<p role="alert" class="tt-monitor-error">'+esc(error)+'</p>':'')+
  (!result?'<div class="tt-monitor-empty"><span aria-hidden="true">⌁</span>'+
   '<strong>'+esc(loading?'Collecting signed operational readings…':'Ready to check operational health')+'</strong>'+
   '<p>Run checks to measure your authenticated backend and this browser. Measurements are held only in the current session view.</p></div>':
  '<div class="tt-monitor-section"><strong>BACKEND / AUTHORIZATION</strong><span>Last sampled '+
   esc(pht(result.sampledAt))+'</span></div>'+
   '<div class="tt-monitor-stats">'+
    entry('SIGNED CHECKS',(net.successful??'—')+' / '+(net.total??'—'))+
    entry('ROUND-TRIP SAMPLE',formatMonitorDuration(net.sampleMs))+
    entry('FAILED CHECKS',(net.total??0)-(net.successful??0))+
    entry('SECURITY SCOPE',result.status==='VERIFIED'?'Verified':'Not fully verified')+'</div>'+
   '<section class="tt-monitor-checks">'+results.map(c=>
    '<div class="tt-monitor-check"><span class="tt-monitor-check-status tt-monitor-'+
    (c.status==='PASS'?'ok':'bad')+'">'+esc(c.status)+'</span>'+
    '<strong>'+esc(c.name)+'</strong><span>'+esc(formatMonitorDuration(c.durationMs))+
    '</span><small>'+esc(c.detail)+'</small></div>').join('')+'</section>'+
   (result.server?'<div class="tt-monitor-section"><strong>POSTGRESQL / BOOTSTRAP</strong><span>'+
   esc(result.server.status==='VERIFIED'?'Server-verified aggregate sample':
    'Optional endpoint '+result.server.status.toLowerCase())+'</span></div>'+
   (result.server.status==='VERIFIED'?'<div class="tt-monitor-stats">'+
    entry('CONNECTIONS',result.server.connections)+
    entry('CACHE HIT RATIO',result.server.cacheHitPercent===null?'—':
      result.server.cacheHitPercent+'%')+
    entry('TRANSACTION ROLLBACKS',result.server.rollbackCount,'Cumulative')+
    entry('DEADLOCKS',result.server.deadlocks,'Cumulative')+'</div>':
    '<p class="tt-monitor-unavailable">Database-level metrics are not active. Only verified bootstrap administrators can use the separately staged read-only endpoint.</p>'):'')+
  '<div class="tt-monitor-section"><strong>CLIENT RUNTIME</strong><span>Browser-reported readings</span></div>'+
   '<div class="tt-monitor-stats">'+
    entry('NAVIGATION',formatMonitorDuration(client.navigationMs))+
    entry('DOM INTERACTIVE',formatMonitorDuration(client.domInteractiveMs))+
    entry('RESOURCE TRANSFER',fmtBytes(client.transferBytes))+
    entry('SLOW RESOURCES',client.slowResources===null||client.slowResources===undefined?'—':client.slowResources)+'</div>'+
   '<div class="tt-monitor-stats">'+
    entry('LONG TASKS',client.longTasks===null||client.longTasks===undefined?'—':client.longTasks,'Only if exposed by browser')+
    entry('JS HEAP',client.heapMb===null||client.heapMb===undefined?'—':client.heapMb+' MiB','Only if supported')+
    entry('GPS CACHE HIT','—','Not instrumented')+
    entry('INPUT LATENCY','—','Not instrumented')+'</div>')+
  '<p class="tt-monitor-footnote">Checks use existing signed Supabase RPCs and board permissions; they do not alter data. Backend timings represent this browser’s observed requests. When enabled, PostgreSQL counters are aggregate and cumulative since stats reset; neither sample establishes a service-level guarantee. Unsupported browser metrics are shown as unavailable. No raw URLs, tokens, employee records, location coordinates or persistent monitoring logs are collected.</p>'+
 '</section>';
}
