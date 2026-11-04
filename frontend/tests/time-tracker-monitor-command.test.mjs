import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 renderTimeTrackerMonitor,classifyTimeTrackerMonitor,
 summarizeTimeTrackerMonitorHistory
} from '../time-tracker-monitor.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';
const now=new Date('2026-11-04T08:00:00.000Z');
const checks=['Supabase Auth identity','Workspace admission','TimeTracker module grant',
 'Board view authorization','Board and workspace binding','Fresh signed identity'];
const sample={
 status:'VERIFIED',sampledAt:'2026-11-04T07:45:00Z',
 checks:checks.map(name=>({name,status:'PASS',durationMs:15,detail:'Verified signed response'})),
 client:{navigationMs:108,domInteractiveMs:45,transferBytes:12800,
  slowResources:1,longTasks:null,heapMb:4},
 network:{sampleMs:97,successful:6,total:6}
};
const render=options=>renderTimeTrackerMonitor({now,...options});
const css=readFileSync('frontend/time-tracker-monitor-command.css','utf8');
const scene=readFileSync('frontend/time-tracker-pixi-scene.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const app=readFileSync('frontend/app.js','utf8');
const monitorSource=readFileSync('frontend/time-tracker-monitor.js','utf8');

test('Monitor command hero contains a single passive GPU host and no fabricated measurements',()=>{
 const html=render();
 assert.match(html,/class="tt-monitor tt-monitor-command"/);
 assert.match(html,/tt-monitor-head tt-monitor-command-hero/);
 assert.match(html,/APSYNTRA \/ OPERATIONAL INTELLIGENCE/);
 assert.match(html,/class="tt-monitor-graphics" aria-hidden="true"/);
 assert.match(html,/LATEST ON-DEMAND CHECK/);
 assert.match(html,/NOT CHECKED/);
 assert.match(html,/Readings are measured only when checks are run/);
 assert.equal((html.match(/class="tt-pixi-backdrop"/g)||[]).length,1);
 assert.match(html,/tt-monitor-telemetry-grid/);
 assert.match(html,/>—<\/strong><span>Signed checks<\/span>/);
 assert.match(html,/>—<\/strong><span>Check duration<\/span>/);
 assert.match(html,/>0<\/strong><span>Memory samples<\/span>/);
 assert.doesNotMatch(html,/HEALTHY AT CHECK|97 ms|<canvas|<script|style=|onclick=/);
});
test('Monitor hero renders actual signed on-demand metrics and bounded session history',()=>{
 const html=render({result:sample,history:[sample]});
 assert.equal(classifyTimeTrackerMonitor(sample),'HEALTHY AT CHECK');
 assert.match(html,/HEALTHY AT CHECK/);
 assert.match(html,/tt-monitor-indicator tt-monitor-healthy/);
 assert.match(html,/>6 \/ 6<\/strong><span>Signed checks<\/span>/);
 assert.match(html,/>97 ms<\/strong><span>Check duration<\/span>/);
 assert.match(html,/>1<\/strong><span>Memory samples<\/span>/);
 assert.match(html,/ON-DEMAND HISTORY/);
 assert.equal(summarizeTimeTrackerMonitorHistory([sample]).count,1);
 assert.doesNotMatch(html,/Bearer|access_token|longitude|latitude|raw URL/);
});
test('Degraded and blocked statuses never display a healthy state',()=>{
 const degraded={...sample,status:'DEGRADED',
  checks:sample.checks.map((c,i)=>i?c:{...c,status:'FAIL'})};
 const blocked={...sample,status:'BLOCKED',checks:sample.checks.slice(0,1).map(
  c=>({...c,status:'FAIL'}))};
 const html1=render({result:degraded});
 const html2=render({result:blocked});
 assert.match(html1,/tt-monitor-indicator tt-monitor-degraded/);
 assert.match(html2,/tt-monitor-indicator tt-monitor-blocked/);
 assert.doesNotMatch(html1,/HEALTHY AT CHECK/);
 assert.doesNotMatch(html2,/HEALTHY AT CHECK/);
 assert.match(render({result:sample,loading:true}),/Checking…/);
});
test('Existing explicit run and clear actions stay gated and never activate background polling',()=>{
 const initial=render();
 assert.match(initial,/data-action="tt-monitor-refresh"/);
 assert.match(initial,/data-action="tt-monitor-clear" disabled/);
 assert.equal((initial.match(/data-action="tt-monitor-refresh"/g)||[]).length,1);
 assert.equal((initial.match(/data-action="tt-monitor-clear"/g)||[]).length,1);
 const busy=render({result:sample,loading:true});
 assert.match(busy,/data-action="tt-monitor-refresh" disabled/);
 assert.match(busy,/data-action="tt-monitor-clear" disabled/);
 const available=render({result:sample});
 assert.match(available,/data-action="tt-monitor-clear"/);
 assert.doesNotMatch(available,/data-action="tt-monitor-clear" disabled/);
 assert.match(app,/case 'tt-monitor-refresh'/);
 assert.match(app,/case 'tt-monitor-clear'/);
 assert.doesNotMatch(monitorSource,/localStorage|sessionStorage|setInterval|setTimeout|sendBeacon|WebSocket|new Worker|fetch\(/);
});
test('Monitor semantics preserve existing signed access checks and no raw private data',()=>{
 const native=renderTimeTrackerNative({
  view:'monitor',
  result:{status:'VERIFIED_READ',access:{moduleRole:'Employee'},
   records:[],active:null,otRequests:[]}
 });
 assert.match(native,/data-target="monitor"/);
 assert.match(native,/tt-monitor-command-hero/);
 const denied=renderTimeTrackerNative({
  view:'monitor',result:{status:'UNVERIFIED',access:{},records:[]}
 });
 assert.doesNotMatch(denied,/tt-monitor-command-hero|tt-pixi-backdrop" data-pixi="fallback"><\/div><span class="tt-monitor-orbit"/);
 assert.match(denied,/Attendance is unavailable until signed workspace/);
 assert.match(monitorSource,/probeTimeTrackerMonitor/);
 assert.match(monitorSource,/validateTimeTrackerServerHealth/);
});
test('Monitor stylesheet uses scoped responsive cards, reduced motion and keyboard focus',()=>{
 assert.match(css,/\.tt-monitor-head\.tt-monitor-command-hero\{\s*display:grid/);
 assert.match(css,/linear-gradient\(120deg,#0a1938/);
 assert.match(css,/\.tt-monitor-graphics \.tt-pixi-backdrop canvas/);
 assert.match(css,/\.tt-monitor-command \.tt-monitor-stats/);
 assert.match(css,/:focus-visible/);
 for(const query of ['@media(max-width:1100px)','@media(max-width:720px)',
  '@media(max-width:400px)','@media(prefers-reduced-motion:reduce)',
  '@media(prefers-contrast:more)'])assert.ok(css.includes(query),query);
 assert.doesNotMatch(css,/@keyframes|animation:.*infinite|will-change|@import|url\(https?:/);
 assert.ok(css.split('\n').filter(x=>x.trim().startsWith('#app '))
  .every(x=>x.includes('.aps-board-shell .tt-native .tt-monitor-command')||
   x.includes('.aps-board-shell .tt-native .tt-monitor.tt-monitor-command')));
});
test('shared Pixi scene prefers Monitor route and retains lazy single renderer lifecycle',()=>{
 const names=['calendar-command','overtime-command','my-hours-command','team-command',
  'monitor-command','reports-command','log-command','overview','clock-stage','app-header'];
 const indexes=names.map(name=>scene.indexOf("'.tt-native .tt-"+name+" .tt-pixi-backdrop'"));
 assert.ok(indexes.every(n=>n>=0),indexes.join(','));
 assert.ok(indexes.every((n,i)=>!i||n>indexes[i-1]));
 assert.match(scene,/if\(current\?\.host===host\)return current\.app!==null/);
 assert.match(scene,/stopTimeTrackerPixi\(\)/);
 assert.match(scene,/PIXI_DECORATION_FPS=30/);
 assert.match(scene,/canRunTimeTrackerPixi/);
 assert.doesNotMatch(scene,/new Worker|WebAssembly|\.style\./);
});
test('GitHub Pages includes Monitor module and stylesheet under existing CSP',()=>{
 assert.ok(index.indexOf('frontend/time-tracker-monitor-command.css')>
  index.indexOf('frontend/time-tracker-team-command.css'));
 assert.match(smoke,/'frontend\/time-tracker-monitor-command\.css'/);
 assert.match(smoke,/'frontend\/time-tracker-monitor\.js'/);
 assert.match(index,/style-src-attr 'none'/);
 assert.match(index,/script type="module" src="\.\/frontend\/app\.js"/);
});
