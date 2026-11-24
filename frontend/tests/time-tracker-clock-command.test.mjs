import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderTimeTrackerNative,syncTimeTrackerClock} from '../time-tracker-ui.js';

const css=readFileSync('frontend/time-tracker-clock-command.css','utf8');
const pixi=readFileSync('frontend/time-tracker-pixi-scene.js','utf8');
const app=readFileSync('frontend/app.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const access={userId:'user-1',workspaceId:'workspace-1',boardId:'board-1',
 moduleRole:'Supervisor',attendanceWritesAccepted:true};
const at=new Date('2026-11-04T05:48:59.000Z');
const record={
 id:'attendance-1',status:'Active',clockIn:'2026-11-04T03:40:00.000Z',
 clockOut:null,location:'Office-Base Duty',department:'Information Technology',
 creditedMs:0
};
function render({active=null,records=[],busy=false,clockPending=false,clockPendingAction='clock-out',autoClockout=null,autoClockoutUnavailable=false}={}){
 return renderTimeTrackerNative({
  result:{status:'VERIFIED_READ',access,records,active,autoClockout,autoClockoutUnavailable},
  busy,clockPending,clockPendingAction,view:'clock',now:at
 });
}

test('daily attendance summary uses Philippine dates across UTC midnight',()=>{
 const instant=new Date('2026-11-16T16:30:00.000Z'); // Nov 17, 00:30 PHT
 const phtToday={...record,id:'today',clockIn:'2026-11-16T16:02:00.000Z'};
 const phtYesterday={...record,id:'yesterday',clockIn:'2026-11-16T15:55:00.000Z'};
 const markup=renderTimeTrackerNative({
  result:{status:'VERIFIED_READ',access,records:[phtYesterday,phtToday],active:null},
  view:'clock',now:instant
 });
 assert.match(markup,/class="tt-clock-rework-stat"><span>Sessions today<\/span><strong>1<\/strong>/);
});

test('Clock uses a fluid unified workspace with visible greeting, live time and three attendance indicators',()=>{
 const markup=render();
 assert.match(markup,/class="tt-clock-stage tt-clock-rework"/);
 assert.doesNotMatch(markup,/tt-command-layout|tt-clock-compact|tt-time-dashboard|tt-time-scene/);
 assert.match(markup,/<h3 id="tt-clock-greeting" class="tt-clock-rework-greeting">Good afternoon,<\/h3>/);
 assert.match(markup,/id="tt-clock-date" class="tt-clock-rework-date"/);
 assert.match(markup,/class="tt-clock-rework-time"/);
 assert.match(markup,/class="tt-clock-rework-stats"[\s\S]*?Sessions today[\s\S]*?Hours logged[\s\S]*?Status/);
 assert.match(markup,/class="tt-clock-rework-workspace tt-attendance-console"/);
 assert.equal((markup.match(/class="tt-clock-rework-stat"/g)||[]).length,3);
 assert.equal((markup.match(/<form id="tt-clock-form"/g)||[]).length,1);
 assert.equal((markup.match(/name="tt-action"/g)||[]).length,1);
});

test('Idle Clock preserves signed Clock In controls without requesting GPS',()=>{
 const markup=render();
 assert.match(markup,/name="tt-action" value="clock-in"/);
 assert.match(markup,/id="tt-location" name="tt-location" required/);
 assert.doesNotMatch(markup,/id="tt-department"/);
 assert.match(markup,/Assigned employee department/);
 assert.match(markup,/data-action="tt-location-shortcut" data-location="Office-Base Duty"/);
 assert.match(markup,/data-action="tt-location-shortcut" data-location="Offsite \(Home\)"/);
 assert.match(markup,/id="tt-note-wrap" hidden/);
 assert.match(markup,/Session is secured with a fresh GPS fix on start and end/);
 assert.doesNotMatch(markup,/tt-location-readiness/);
 assert.match(markup,/A fresh GPS fix is requested at that time, not when this page opens/);
 assert.doesNotMatch(markup,/value="clock-out"/);
 assert.doesNotMatch(markup,/<canvas|<script|style=|onclick=/);
});

test('Active Clock preserves authoritative session details and Clock Out',()=>{
 const markup=render({active:record,records:[record]});
 assert.match(markup,/name="tt-action" value="clock-out"/);
 assert.match(markup,/class="tt-clock-rework-status is-active">Active/);
 assert.match(markup,/Location<\/span><strong>Office-Base Duty<\/strong>/);
 assert.match(markup,/Office-Base Duty/);
 assert.match(markup,/Department<\/span><strong>Information Technology<\/strong>/);
 assert.match(markup,/Information Technology/);
 assert.match(markup,/Session is secured with a fresh GPS fix on start and end/);
 assert.match(markup,/class="tt-clock-rework-session"/);
 assert.match(markup,/tt-clock-rework-session-details/);
 assert.match(markup,/id="tt-session-progress"/);
 assert.match(markup,/ELAPSED THIS SESSION/);
 assert.match(markup,/tt-compact-clock-icon/);
 assert.equal((markup.match(/class="tt-clock-rework-status/g)||[]).length,1);
 assert.doesNotMatch(markup,/Signed Clock writes active|Signed workspace verified/);
 assert.doesNotMatch(markup,/name="tt-action" value="clock-in"/);
});

test('Active Clock exposes scheduled automatic clock-out and a live countdown when available',()=>{
 const autoClockout={recordId:record.id,status:'MONITORING',
  nextAt:'2026-11-04T10:00:00.000Z',cutoffAt:'2026-11-04T10:00:00.000Z'};
 const markup=render({active:record,records:[record],autoClockout});
 assert.match(markup,/Automatic clock-out monitoring/);
 assert.match(markup,/data-tt-auto-clockout-countdown/);
 assert.match(markup,/Scheduled clock-out/);
});

test('Uncertain clock-out retains verify-only control; busy form is disabled',()=>{
 const uncertain=render({active:record,records:[record],clockPending:true});
 assert.match(uncertain,/data-action="tt-clock-verify"/);
 assert.match(uncertain,/Clock-out status needs verification/);
 assert.doesNotMatch(uncertain,/name="tt-action" value="clock-out"/);
 const busy=render({busy:true});
 assert.match(busy,/name="tt-action" value="clock-in" disabled/);
});

test('Live clock continues to update existing text nodes without rendering a new board',()=>{
 const expected={
  'tt-clock-greeting':'Good afternoon,',
  'tt-clock-date':'Wednesday, November 4',
  'tt-clock-hours':'01',
  'tt-clock-minutes':'48',
  'tt-clock-seconds':'59',
  'tt-clock-period':'PM'
 };
 const found=Object.fromEntries(Object.keys(expected).map(id=>[id,{textContent:''}]));
 const root={querySelector(selector){return found[selector.slice(1)]||null;}};
 assert.equal(syncTimeTrackerClock(root,at),true);
 for(const [id,value] of Object.entries(expected))assert.equal(found[id].textContent,value);
 assert.match(app,/syncTimeTrackerClock\(root\)/);
 assert.match(app,/if\(!document\.hidden\)tick\(\)/);
});

test('Clock CSS uses the full workspace width, terracotta accents, responsive layout and dark-mode tokens',()=>{
 assert.match(css,/\.tt-clock-stage\.tt-clock-rework/);
 assert.match(css,/\.tt-clock-rework-workspace/);
 assert.match(css,/grid-template-columns: minmax\(0, 1fr\) minmax\(300px, 0\.82fr\)/);
 assert.match(css,/max-width: none/);
 assert.match(css,/--tt-clock-accent: #b85d3d/);
 assert.match(css,/@media \(max-width: 980px\)/);
 assert.match(css,/@media \(max-width: 640px\)/);
 assert.match(css,/@media \(max-width: 380px\)/);
 assert.match(css,/html\[data-aps-monday-theme="dark"\]/);
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
 assert.doesNotMatch(css,/will-change|@import|url\(https?:/);
 assert.match(css,/#app\s+\.aps-board-shell\.aps-time-tracker-shell\s+\.tt-native\s+\.tt-clock-stage\.tt-clock-rework/);
 assert.match(css,/html\[data-aps-monday-theme="dark"\]\s+#app\s+\.aps-board-shell\.aps-time-tracker-shell\s+\.tt-native/);
 assert.ok(index.indexOf('frontend/time-tracker-clock-command.css')>
  index.indexOf('frontend/time-tracker-pixi-experience.css'));
 assert.match(smoke,/'frontend\/time-tracker-clock-command\.css'/);
});

test('Pixi prioritizes the Clock dashboard and preserves single-instance teardown',()=>{
 assert.match(pixi,/dataset\?\.ttView==='clock'/);
 assert.match(pixi,/\.tt-native \.tt-clock-stage \.tt-pixi-backdrop/);
 assert.match(pixi,/\.tt-native \.tt-app-header \.tt-pixi-backdrop/);
 assert.match(pixi,/stopTimeTrackerPixi\(\)/);
 assert.match(pixi,/scene\.app\.destroy/);
 assert.match(pixi,/PIXI_DECORATION_FPS=30/);
 assert.match(pixi,/canRunTimeTrackerPixi/);
 assert.match(app,/mountTimeTrackerPixi\(root\)/);
 assert.doesNotMatch(pixi,/\.style\.|setAttribute\(['"]style|WebAssembly|new Worker/);
});


test('Uncertain Clock In uses the shared verify-only recovery control',()=>{
 const pending=render({clockPending:true,clockPendingAction:'clock-in'});
 assert.match(pending,/Clock-in status needs verification/);
 assert.match(pending,/data-action="tt-clock-verify"/);
 assert.doesNotMatch(pending,/name="tt-action" value="clock-in"/);
});

test('header uses role-derived identity and retains accessible signed navigation actions',()=>{
 const markup=renderTimeTrackerNative({
  result:{status:'VERIFIED_READ',access:{...access,moduleRole:'System Admin'},records:[],active:null},
  view:'clock',now:at
 });
 assert.match(markup,/class="tt-header-avatar" aria-hidden="true">SA<\/span>/);
 assert.match(markup,/class="tt-header-role">System admin<\/span>/);
 assert.match(markup,/data-action="tt-refresh" aria-label="Refresh TimeTracker attendance"/);
 assert.match(markup,/data-action="tt-tab" data-target="hours"[^>]*>[\s\S]*?<span>My hours<\/span>/);
 assert.match(markup,/class="tt-header-chevron"/);
 assert.doesNotMatch(markup,/class="tt-role-pill"/);
 assert.match(markup,/aria-selected="true" data-action="tt-tab" data-target="clock"/);
 assert.match(render(),/class="tt-header-avatar" aria-hidden="true">S<\/span>/);
 const loading=renderTimeTrackerNative({busy:true});
 assert.match(loading,/Checking signed access/);
 assert.match(loading,/data-action="tt-refresh" disabled/);
});
