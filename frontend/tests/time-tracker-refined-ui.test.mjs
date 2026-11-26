import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountTimeTrackerPixi} from '../time-tracker-pixi-scene.js';
import {timeTrackerNineHourThreshold} from '../time-tracker-auto-clockout.js';
import {
 renderTimeTrackerNative,timeTrackerSessionElapsed,syncTimeTrackerClock
} from '../time-tracker-ui.js';

const active={
 id:'signed-session',status:'Active',
 clockIn:'2026-11-19T00:00:00.000Z',clockOut:null,
 location:'Office-Base Duty',department:'Engineering',creditedMs:null
};
const access={moduleRole:'IT Administrator',attendanceWritesAccepted:true};
// 3:55 PM PHT: 7h55m gross, 6h55m credited after the lunch break.
const at=new Date('2026-11-19T07:55:00.000Z');

test('active elapsed timer is based on signed clock-in time, not local storage',()=>{
 const elapsed=timeTrackerSessionElapsed(active.clockIn,at);
 assert.equal(elapsed.label,'06:55:00');
 assert.ok(elapsed.progress>.76 && elapsed.progress<.78);
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
 assert.match(html,/id="tt-session-elapsed" data-clock-in="2026-11-19T00:00:00.000Z">06:55:00/);
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

test('approved overtime extends the signed Clock progress target and final cutoff',()=>{
 const clockIn='2026-11-24T00:00:00.000Z';
 const record={...active,id:'approved-ot-session',clockIn};
 const cutoff='2026-11-24T13:00:00.000Z';
 const now=new Date('2026-11-24T11:00:00.000Z');
 const html=renderTimeTrackerNative({result:{
  status:'VERIFIED_READ',access,records:[record],active:record,otRequests:[],
  autoClockout:{recordId:record.id,status:'OVERTIME',
   thresholdAt:'2026-11-24T10:00:00.000Z',overtimeCutoffAt:cutoff,nextAt:cutoff}
 },now,view:'clock'});
 assert.match(html,/data-goal-target-ms="43200000"/);
 assert.match(html,/of 12h goal/);
 assert.match(html,/Approved overtime active · automatic clock-out at/);
 assert.match(html,/data-tt-goal-remaining="2026-11-24T00:00:00\.000Z" data-tt-goal-target-ms="43200000">2h 0m to goal/);
 assert.match(html,/data-tt-auto-clockout-inline-time>09:00 PM/);
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
 assert.equal(nodes.get('tt-session-elapsed').textContent,'06:55:00');
 assert.equal(nodes.get('tt-session-progress')['stroke-dashoffset'],(339.292*(1-(6*60+55)/(9*60))).toFixed(3));
 assert.equal(nodes.get('tt-clock-hours').textContent,'03');
 assert.equal(nodes.get('tt-clock-period').textContent,'PM');
});

test('refined stylesheet remains scoped, responsive and uses native controls',()=>{
 const css=readFileSync('frontend/apps/TimeTracker/time-tracker-refined.css','utf8');
 const manifest=readFileSync('scripts/priority5-style-manifest.mjs','utf8');
 assert.match(css,/#app \.aps-board-shell\.aps-time-tracker-shell \.tt-native/);
 assert.match(css,/\.tt-session-ring-progress/);
 assert.match(css,/\.tt-clock-compact/);
 assert.match(css,/--tt-compact-panel:#E6F1FB/);
 assert.match(css,/--tt-compact-button:#4f43b1/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/font-size:32px;font-weight:500/);
 assert.match(css,/@media \(max-width: 480px\)/);
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
 assert.match(css,/focus-visible/);
 const clockStyles=css.slice(css.indexOf('/* CP-TT-CLOCK-STATE'),css.indexOf('#app .tt-native .tt-ojt'));
 assert.doesNotMatch(clockStyles,/animation:\s*tt-(?:work-plan-reveal|clock-ring-reveal)/,
  'Clock Work Plan and session ring must not run entrance animations');
 assert.doesNotMatch(clockStyles,/transition:\s*stroke-dashoffset/,
  'Clock progress must update without animated movement');
 assert.match(css,/@keyframes tt-work-plan-reveal/,
  'The separate OJT Work Plan reveal remains available');
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


test('live Clock ticks preserve the approved overtime target instead of reverting to nine hours',()=>{
 const clockIn='2026-11-24T00:00:00.000Z';
 const target=12*60*60*1000;
 const elapsed={dataset:{clockIn,goalTargetMs:String(target)},textContent:''};
 const progress={setAttribute(key,value){this[key]=value;}};
 const goal={dataset:{ttGoalRemaining:clockIn,ttGoalTargetMs:String(target)},textContent:''};
 const clock={textContent:''};
 const nodes={'#tt-clock-hours':clock,'#tt-session-elapsed':elapsed,'#tt-session-progress':progress,
  '[data-tt-goal-remaining]':goal};
 const root={querySelector(selector){return nodes[selector]||null;}};
 const tenHours=new Date('2026-11-24T11:00:00Z');
 syncTimeTrackerClock(root,tenHours);
 assert.equal(elapsed.textContent,'10:00:00');
 assert.equal(goal.textContent,'2h 0m to goal');
 assert.equal(progress['stroke-dashoffset'],(339.292*(1-10/12)).toFixed(3));
 const cutoff=new Date('2026-11-24T13:00:00Z');
 syncTimeTrackerClock(root,cutoff);
 assert.equal(elapsed.textContent,'12:00:00');
 assert.equal(goal.textContent,'12h goal reached');
 assert.equal(progress['stroke-dashoffset'],'0.000');
});
test('credited Clock and ring pause throughout Philippine lunch and resume at 1 PM',()=>{
 const clockIn='2026-11-24T00:00:00Z';
 const cases=[
  ['2026-11-24T03:59:59Z','03:59:59'],
  ['2026-11-24T04:00:00Z','04:00:00'],
  ['2026-11-24T04:30:00Z','04:00:00'],
  ['2026-11-24T05:00:00Z','04:00:00'],
  ['2026-11-24T05:00:01Z','04:00:01'],
  ['2026-11-24T09:59:59Z','08:59:59'],
  ['2026-11-24T10:00:00Z','09:00:00'],
  ['2026-11-24T10:30:00Z','09:30:00']
 ];
 for(const [now,label] of cases)assert.equal(timeTrackerSessionElapsed(clockIn,new Date(now)).label,label);
 assert.deepEqual(timeTrackerSessionElapsed(clockIn,new Date(cases[2][0])),timeTrackerSessionElapsed(clockIn,new Date(cases[3][0])));
 assert.equal(timeTrackerSessionElapsed(clockIn,new Date(cases[5][0])).progress<1,true);
 assert.equal(timeTrackerSessionElapsed(clockIn,new Date(cases[6][0])).progress,1);
 assert.equal(timeTrackerNineHourThreshold(clockIn),'2026-11-24T10:00:00.000Z');
 assert.equal(timeTrackerSessionElapsed('2026-11-24T04:30:00Z',new Date('2026-11-24T06:00:00Z')).label,'01:00:00');
 assert.equal(timeTrackerSessionElapsed('2026-11-24T05:00:00Z',new Date('2026-11-24T14:00:00Z')).label,'09:00:00');
});

test('active Clock render and live ticks agree with credited total and paid-work goal',()=>{
 const clockIn='2026-11-23T23:02:00Z';
 const record={...active,clockIn};
 const now=new Date('2026-11-24T07:37:49Z');
 const html=renderTimeTrackerNative({result:{status:'VERIFIED_READ',access,records:[record],active:record},now,view:'clock'});
 assert.match(html,/id="tt-session-elapsed"[^>]*>07:35:49/);
 assert.match(html,/<span>Total logged<\/span><strong>07:35:49/);
 assert.match(html,/data-tt-goal-remaining="[^"]+">1h 25m to goal/);
 const elapsed={dataset:{clockIn},textContent:''};
 const progress={setAttribute(key,value){this[key]=value;}};
 const goal={dataset:{ttGoalRemaining:clockIn},textContent:''};
 const totalValue={textContent:''};
 const total={dataset:{ttLiveTotal:clockIn,creditedBase:'0'},querySelector(){return totalValue;}};
 const clock={textContent:''};
 const nodes={'#tt-clock-hours':clock,'#tt-session-elapsed':elapsed,'#tt-session-progress':progress,
  '[data-tt-goal-remaining]':goal,'[data-tt-live-total]':total};
 const root={querySelector(selector){return nodes[selector]||null;}};
 syncTimeTrackerClock(root,now);
 assert.equal(elapsed.textContent,'07:35:49');
 assert.equal(totalValue.textContent,elapsed.textContent);
 assert.equal(goal.textContent,'1h 25m to goal');
 const threshold=timeTrackerNineHourThreshold(clockIn);
 assert.equal(threshold,'2026-11-24T09:02:00.000Z');
 syncTimeTrackerClock(root,new Date(threshold));
 assert.equal(elapsed.textContent,'09:00:00');
 assert.equal(goal.textContent,'9h goal reached');
 assert.equal(progress['stroke-dashoffset'],'0.000');
});
