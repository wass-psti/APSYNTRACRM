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
function render({active=null,records=[],busy=false,clockPending=false,clockPendingAction='clock-out'}={}){
 return renderTimeTrackerNative({
  result:{status:'VERIFIED_READ',access,records,active},
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
 assert.match(markup,/class="tt-session-summary"[^>]*>[\s\S]*?<span>Sessions today<\/span><strong>1<\/strong>/);
});

test('Clock uses a single compact widget with two summary cards and one status badge',()=>{
 const markup=render();
 const layout=markup.indexOf('class="tt-command-layout tt-clock-compact"');
 const dashboard=markup.indexOf('class="tt-time-dashboard"');
 const console=markup.indexOf('class="tt-clock-card tt-attendance-console"');
 assert.ok(layout>0);
 assert.ok(dashboard>layout&&console>dashboard);
 assert.match(markup,/class="tt-clock-stage tt-command-center"/);
 assert.match(markup,/aria-label="Live time and attendance summary"/);
 assert.match(markup,/aria-label="Attendance clock form"/);
 assert.match(markup,/class="tt-compact-header"/);
 assert.match(markup,/<span>Sessions today<\/span><strong>/);
 assert.match(markup,/<span>Hours logged<\/span><strong>/);
 assert.doesNotMatch(markup,/tt-summary-status|<span>Status<\/span>/);
 assert.equal((markup.match(/class="tt-idle-badge/g)||[]).length,1);
 assert.match(markup,/class="tt-clock-face" role="timer" aria-label="Current Philippine time"/);
 assert.match(markup,/class="tt-dashboard-section-label">TODAY’S ATTENDANCE/);
 assert.match(markup,/class="tt-console-kicker"/);
 assert.doesNotMatch(markup,/class="tt-clock-aura"/);
 assert.equal((markup.match(/id="tt-clock-hours"/g)||[]).length,1);
 assert.equal((markup.match(/id="tt-clock-minutes"/g)||[]).length,1);
 assert.equal((markup.match(/id="tt-clock-seconds"/g)||[]).length,1);
 assert.equal((markup.match(/id="tt-clock-period"/g)||[]).length,1);
 assert.equal((markup.match(/<form id="tt-clock-form"/g)||[]).length,1);
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
 assert.match(markup,/Start your work session with a signed record/);
 assert.doesNotMatch(markup,/value="clock-out"/);
 assert.doesNotMatch(markup,/<canvas|<script|style=|onclick=/);
});

test('Active Clock preserves authoritative session details and Clock Out',()=>{
 const markup=render({active:record,records:[record]});
 assert.match(markup,/name="tt-action" value="clock-out"/);
 assert.match(markup,/class="tt-idle-badge tt-badge-active">Active/);
 assert.match(markup,/Location<\/span><strong>Office-Base Duty<\/strong>/);
 assert.match(markup,/Office-Base Duty/);
 assert.match(markup,/Department<\/span><strong>Information Technology<\/strong>/);
 assert.match(markup,/Information Technology/);
 assert.match(markup,/Session is secured with a fresh GPS fix on start and end/);
 assert.match(markup,/tt-compact-active/);
 assert.match(markup,/Elapsed this session/);
 assert.match(markup,/tt-compact-clock-icon/);
 assert.equal((markup.match(/class="tt-idle-badge/g)||[]).length,1);
 assert.doesNotMatch(markup,/Signed Clock writes active|Signed workspace verified/);
 assert.doesNotMatch(markup,/name="tt-action" value="clock-in"/);
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

test('Clock CSS structurally distinguishes panels and provides responsive safe fallbacks',()=>{
 assert.match(css,/\.tt-command-layout\{\s*display:grid;\s*grid-template-columns:minmax\(0,1\.16fr\) minmax\(320px,\.84fr\)/);
 assert.match(css,/\.tt-time-dashboard\{\s*position:relative/);
 assert.match(css,/linear-gradient\(145deg,#0b1939/);
 assert.match(css,/\.tt-clock-card\.tt-attendance-console/);
 assert.match(css,/\.tt-time-dashboard \.tt-session-summary/);
 assert.match(css,/@media\(max-width:1140px\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/will-change|@import|url\(https?:/);
 const scope=css.split('\n').filter(line=>line.trim().startsWith('#app '));
 assert.ok(scope.length>40);
 assert.ok(scope.every(line=>line.includes('.aps-board-shell .tt-native ')));
 assert.ok(index.indexOf('frontend/time-tracker-clock-command.css')>
  index.indexOf('frontend/time-tracker-pixi-experience.css'));
 assert.match(smoke,/'frontend\/time-tracker-clock-command\.css'/);
});

test('Pixi prioritizes the Clock dashboard and preserves single-instance teardown',()=>{
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
