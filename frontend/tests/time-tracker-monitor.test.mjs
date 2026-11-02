import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 collectTimeTrackerClientMetrics,probeTimeTrackerMonitor,
 renderTimeTrackerMonitor,classifyTimeTrackerMonitor
} from '../time-tracker-monitor.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';
const user='10000000-0000-4000-8000-000000000011';
const ws='00000000-0000-4000-8000-000000000001';
const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const fakePerf={getEntriesByType:k=>k==='navigation'?
 [{duration:108,domInteractive:45,startTime:0}]:
 k==='resource'?[{transferSize:12288,duration:1250},{transferSize:512,duration:7}]:[],
 memory:{usedJSHeapSize:4*1048576}};
function source({granted=true,userId=user,workspace=ws,authValid=true}={}){
 let counter=0;
 const auth={isSignedIn:true,userId,getVerifiedUser:async()=>authValid?{id:userId}:null};
 const api={
  context:async()=>({user_id:userId,workspace_id:workspace,profile:{status:'active'}}),
  rpc:async(name)=>name==='has_module_access'?granted:null,
  allowed:async()=>granted,
  board:async()=>({board:{id:board,name:'TimeTracker Attendance',workspace_id:ws}})
 };
 const monotonic=()=>{counter+=7;return counter};
 const clock=()=>Date.parse('2026-11-02T11:00:00Z');
 return {auth,api,boardId:board,perf:fakePerf,monotonic,clock};
}
test('Monitor starts as NOT CHECKED, never invents live metrics',()=>{
 const html=renderTimeTrackerMonitor({now:new Date('2026-11-02T11:00:00Z')});
 assert.match(html,/NOT CHECKED|Ready to check operational health/);
 assert.doesNotMatch(html,/HEALTHY AT CHECK|GPS CACHE HIT/);
 assert.doesNotMatch(html,/data-action="tt-monitor-refresh" disabled/);
});
test('authenticated backend probes verify board, role, workspace and session',async()=>{
 const sample=await probeTimeTrackerMonitor(source());
 assert.equal(sample.status,'VERIFIED');
 assert.equal(sample.checks.length,6);
 assert.equal(sample.network.successful,6);
 assert.equal(sample.network.total,6);
 assert.ok(sample.checks.every(c=>c.status==='PASS'&&c.durationMs>=0));
 assert.equal(classifyTimeTrackerMonitor(sample),'HEALTHY AT CHECK');
 assert.equal(sample.client.navigationMs,108);
 assert.equal(sample.client.slowResources,1);
 assert.equal(sample.client.transferBytes,12800);
 assert.equal(sample.client.heapMb,4);
});
test('ungranted module and board result in degraded, never pass',async()=>{
 const data=await probeTimeTrackerMonitor(source({granted:false}));
 assert.equal(data.status,'DEGRADED');
 assert.ok(data.checks.filter(c=>c.status==='FAIL').length>=2);
 assert.equal(classifyTimeTrackerMonitor(data),'DEGRADED');
});
test('identity failure blocks all backend follow-up probes',async()=>{
 const data=await probeTimeTrackerMonitor(source({authValid:false}));
 assert.equal(data.status,'BLOCKED');
 assert.equal(data.checks.length,1);
 assert.equal(classifyTimeTrackerMonitor(data),'BLOCKED');
});
test('foreign workspace board binding fails closed',async()=>{
 const data=await probeTimeTrackerMonitor(source({workspace:'00000000-0000-4000-8000-000000000002'}));
 assert.equal(data.status,'DEGRADED');
 assert.equal(data.checks.find(c=>c.name==='Board and workspace binding')?.status,'FAIL');
});
test('client browser metrics are optional and never fabricate unsupported readings',()=>{
 const result=collectTimeTrackerClientMetrics(null);
 assert.equal(result.longTasks,null);
 assert.equal(result.navigationMs,null);
 assert.equal(result.heapMb,null);
 const incomplete=collectTimeTrackerClientMetrics({getEntriesByType:()=>[]});
 assert.equal(incomplete.navigationMs,null);
 assert.equal(incomplete.longTasks,null);
});
test('Monitor rendering includes runtime and signed backend measurements only',async()=>{
 const sample=await probeTimeTrackerMonitor(source());
 const html=renderTimeTrackerMonitor({result:sample});
 for(const word of ['API Health Monitor','CLIENT RUNTIME','Supabase Auth identity',
  'Workspace admission','Board and workspace binding','LONG TASKS','SECURITY SCOPE'])
  assert.ok(html.includes(word),word);
 assert.doesNotMatch(html,/10000000-0000-4000-8000-000000000011|Bearer |sb_secret_|latitude/);
 assert.match(html,/data-action="tt-monitor-clear"/);
});
test('Roles tab is absent, Monitor enabled; no persistent telemetry or polling introduced',()=>{
 const html=renderTimeTrackerNative({view:'monitor',result:{
  status:'VERIFIED_READ',access:{name:'Employee',moduleRole:'Employee'},
  records:[],active:null,otRequests:[]
 }});
 assert.doesNotMatch(html,/data-target="roles"/);
 assert.match(html,/data-target="monitor"/);
 assert.match(html,/API Health Monitor/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/loadTimeTrackerMonitor/);
 assert.match(app,/case 'tt-monitor-refresh'/);
 assert.match(app,/case 'tt-monitor-clear'/);
 const monitor=readFileSync('frontend/time-tracker-monitor.js','utf8');
 assert.doesNotMatch(monitor,/localStorage|sessionStorage|setInterval|sendBeacon|WebSocket/);
});
