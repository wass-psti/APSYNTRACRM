import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountTimeTrackerPixi} from '../time-tracker-pixi-scene.js';
import {
 renderTimeTrackerNative,timeTrackerSessionElapsed,syncTimeTrackerClock
} from '../time-tracker-ui.js';

const active={
 id:'signed-session',status:'Active',
 clockIn:'2026-11-19T00:00:00.000Z',clockOut:null,
 location:'Office-Base Duty',department:'Engineering',creditedMs:null
};
const access={moduleRole:'IT Administrator',attendanceWritesAccepted:true};
const at=new Date('2026-11-19T07:55:00.000Z');

test('active elapsed timer is based on signed clock-in time, not local storage',()=>{
 const elapsed=timeTrackerSessionElapsed(active.clockIn,at);
 assert.equal(elapsed.label,'07:55:00');
 assert.ok(elapsed.progress>.87 && elapsed.progress<.89);
 assert.deepEqual(timeTrackerSessionElapsed('bad',at),{label:'00:00:00',progress:0});
 assert.equal(timeTrackerSessionElapsed('2026-11-19T08:00:00Z',at).label,'00:00:00');
 assert.equal(timeTrackerSessionElapsed('2026-11-18T00:00:00Z',at).progress,1);
});

test('rendering matches the compact blue and purple clock reference without weakening signed actions',()=>{
 const html=renderTimeTrackerNative({
  result:{status:'VERIFIED_READ',access,records:[active],active,otRequests:[]},
  now:at,view:'clock'
 });
 assert.match(html,/data-tt-view="clock"/);
 assert.match(html,/class="tt-session-ring"/);
 assert.match(html,/id="tt-session-elapsed" data-clock-in="2026-11-19T00:00:00.000Z">07:55:00/);
 assert.match(html,/id="tt-session-progress"/);
 assert.match(html,/role="timer" aria-label="Elapsed time/);
 assert.match(html,/data-action="tt-tab" data-target="hours"/);
 assert.match(html,/data-action="tt-refresh"/);
 assert.match(html,/id="tt-clock-form"/);
 assert.match(html,/name="tt-action" value="clock-out"/);
 assert.match(html,/End session/);
 assert.match(html,/Location|Recorded work location/);
 assert.doesNotMatch(html,/<canvas|style=|onclick=/);
});

test('idle state displays the original clock-in form without a misleading session ring',()=>{
 const html=renderTimeTrackerNative({
  result:{status:'VERIFIED_READ',access,records:[],active:null,otRequests:[]},
  now:at,view:'clock'
 });
 assert.doesNotMatch(html,/id="tt-session-elapsed"/);
 assert.match(html,/id="tt-location"/);
 assert.doesNotMatch(html,/id="tt-department"/);
 assert.match(html,/Assigned employee department/);
 assert.match(html,/name="tt-action" value="clock-in"/);
 assert.match(html,/Start session/);
});

test('existing clock tick updates elapsed text and SVG offset without rebuilding the DOM',()=>{
 const nodes=new Map();
 for(const id of ['tt-clock-greeting','tt-clock-date','tt-clock-hours',
  'tt-clock-minutes','tt-clock-seconds','tt-clock-period',
  'tt-session-elapsed','tt-session-progress']){
  nodes.set(id,{textContent:'',dataset:{},setAttribute(name,value){this[name]=value;}});
 }
 nodes.get('tt-session-elapsed').dataset.clockIn=active.clockIn;
 const root={querySelector(selector){return nodes.get(selector.slice(1))||null;}};
 assert.equal(syncTimeTrackerClock(root,at),true);
 assert.equal(nodes.get('tt-session-elapsed').textContent,'07:55:00');
 assert.ok(Number(nodes.get('tt-session-progress')['stroke-dashoffset'])<50);
 assert.equal(nodes.get('tt-clock-hours').textContent,'03');
 assert.equal(nodes.get('tt-clock-period').textContent,'PM');
});

test('refined stylesheet remains scoped, responsive and uses native controls',()=>{
 const css=readFileSync('frontend/apps/TimeTracker/time-tracker-refined.css','utf8');
 const manifest=readFileSync('scripts/priority5-style-manifest.mjs','utf8');
 assert.match(css,/#app \.aps-board-shell\.aps-time-tracker-shell \.tt-native/);
 assert.match(css,/\.tt-session-ring-progress/);
 assert.match(css,/\.tt-clock-compact/);
 assert.match(css,/--tt-compact-panel:#e3effa/);
 assert.match(css,/--tt-compact-button:#4f43b1/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/font-size:32px;font-weight:500/);
 assert.match(css,/@media \(max-width: 480px\)/);
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
 assert.match(css,/focus-visible/);
 assert.doesNotMatch(css,/@import|url\(|animation:.*infinite|!important/);
 assert.match(manifest,/frontend\/apps\/TimeTracker\/time-tracker-refined\.css/);
});

test('Clock view never starts hidden decorative GPU work',()=>{
 let loads=0;
 const root={querySelector(selector){
  if(selector==='.tt-native .tt-application')return {dataset:{ttView:'clock'}};
  return {isConnected:true,dataset:{pixi:'fallback'}};
 }};
 assert.equal(mountTimeTrackerPixi(root,{load:async()=>{loads++;return {};}}),false);
 assert.equal(loads,0);
});
