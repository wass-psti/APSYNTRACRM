import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 projectTimeTrackerOverview,renderTimeTrackerOverview,
 syncTimeTrackerOverviewClock,applyTimeTrackerOverviewFilters
} from '../time-tracker-overview.js';

const now=new Date('2026-11-04T05:48:59.000Z');
const user='a1208d7e-8d27-4f77-947a-9c6fcd742ed0';
const coworker='ed2ef1bc-50ea-4eea-8b83-2d6ec8434797';
const directory=[
 {id:user,display_name:'Verified Worker',status:'active'},
 {id:coworker,display_name:'Authorized Teammate',status:'active'}
];
const records=[
 {id:'first',ownerId:'cloud:'+user,
  clockIn:{timestamp:'2026-11-03T23:45:00Z',location:'Office-Base Duty',
   department:'Technology',geo:{latitude:10.3,longitude:123.9}},
  clockOut:null},
 {id:'second',ownerId:'cloud:'+coworker,
  clockIn:{timestamp:'2026-11-04T00:15:00Z',location:'Local Field Works',
   department:'Field Services',geo:{latitude:10.31,longitude:123.95}},
  clockOut:null}
];
const project=(role='HR')=>projectTimeTrackerOverview({
 value:{version:1,records},directory,userId:user,moduleRole:role,now
});
const render=(role='HR')=>renderTimeTrackerOverview({
 overview:project(role),access:{name:'Signed Operator'},now
});
const html=readFileSync('index.html','utf8');
const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/time-tracker-overview-command.css','utf8');
const pixi=readFileSync('frontend/time-tracker-pixi-scene.js','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

test('Overview is a distinct signed workforce command dashboard with one decorative scene',()=>{
 const content=render();
 assert.match(content,/class="tt-overview tt-overview-command" data-tt-view="overview"/);
 assert.match(content,/class="tt-overview-hero tt-overview-command-hero"/);
 assert.match(content,/aria-label="Authorized attendance intelligence"/);
 assert.match(content,/class="tt-overview-hero-content"/);
 assert.match(content,/class="tt-ov-telemetry"/);
 assert.match(content,/class="tt-ov-telemetry-stats" aria-label="Current attendance snapshot"/);
 assert.match(content,/APSYNTRA .*WORKFORCE INTELLIGENCE/);
 assert.match(content,/data-pixi="fallback"/);
 assert.match(content,/class="tt-overview-graphics" aria-hidden="true"/);
 assert.equal((content.match(/class="tt-pixi-backdrop"/g)||[]).length,1);
 assert.match(content,/SIGNED SNAPSHOT/);
 assert.doesNotMatch(content,/LIVE STATUS|<canvas|<script|style=|onclick=/);
});

test('Snapshot metrics contain only authoritative signed projection values',()=>{
 const overview=project();
 const content=render();
 assert.equal(overview.scope,'AUTHORIZED_WORKSPACE_TEAM');
 assert.equal(overview.peopleCount,2);
 assert.equal(overview.activeCount,2);
 assert.equal(overview.completedCount,0);
 assert.equal(overview.onTimeRate,50);
 assert.match(content,/>2<\/strong><span>Working now<\/span>/);
 assert.match(content,/>0<\/strong><span>Completed<\/span>/);
 assert.match(content,/>50%<\/strong><span>On-time rate<\/span>/);
 assert.match(content,/Authorized workspace team/);
 assert.match(content,/Philippine Time · UTC \+08:00/);
 assert.doesNotMatch(content,/latitude|longitude|10\.31|123\.95/);
});

test('Employee role still sees only its own attendance and no unauthorized names',()=>{
 const content=render('Employee');
 assert.match(content,/My authorized attendance/);
 assert.match(content,/Verified Worker/);
 assert.doesNotMatch(content,/Authorized Teammate|Field Services/);
 assert.match(content,/SIGNED SNAPSHOT/);
 assert.doesNotMatch(content,/latitude|longitude/);
});

test('No attendance never invents an on-time percentage or active staff',()=>{
 const empty=projectTimeTrackerOverview({
  value:{version:1,records:[]},
  directory,userId:user,moduleRole:'Employee',now
 });
 const content=renderTimeTrackerOverview({
  overview:empty,access:{name:'Signed Operator'},now
 });
 assert.equal(empty.peopleCount,0);
 assert.equal(empty.onTimeRate,null);
 assert.match(content,/>0<\/strong><span>Working now<\/span>/);
 assert.match(content,/>—<\/strong><span>On-time rate<\/span>/);
 assert.match(content,/No arrivals/);
 assert.match(content,/No authorized attendance records today/);
});

test('Existing Overview filtering, export, refresh and independent ticker remain operational',()=>{
 const content=render();
 for(const key of ['tt-overview-search','tt-overview-location','tt-overview-department',
  'tt-overview-status','tt-overview-sort','tt-overview-export','tt-refresh',
  'tt-overview-time','tt-overview-filterable','Attendance Records','Employee Whereabouts',
  'Clock-In Distribution','Arrival Pattern','Department Breakdown']){
  assert.ok(content.includes(key),'Expected retained Overview feature: '+key);
 }
 const node={textContent:''};
 const root={querySelector:s=>s==='#tt-overview-time'?node:null};
 assert.equal(syncTimeTrackerOverviewClock(root,now),true);
 assert.match(node.textContent,/01:48:59 PM/);
 assert.equal(syncTimeTrackerOverviewClock({querySelector:()=>null},now),false);
 assert.equal(applyTimeTrackerOverviewFilters({querySelector:()=>null}),0);
 assert.match(app,/applyTimeTrackerOverviewFilters/);
 assert.match(app,/timeTrackerOverviewCsv/);
});

test('Dashboard CSS is scoped, responsive and respects reduced-motion preferences',()=>{
 assert.match(css,/\.tt-overview-hero\.tt-overview-command-hero\{\s*display:grid/);
 assert.match(css,/linear-gradient\(120deg,#0b1836/);
 assert.match(css,/\.tt-overview-command \.tt-overview-metrics/);
 assert.match(css,/\.tt-overview-command \.tt-overview-panel/);
 assert.match(css,/\.tt-overview-graphics \.tt-pixi-backdrop canvas/);
 assert.match(css,/@media\(max-width:1100px\)/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/@media\(max-width:400px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.doesNotMatch(css,/@keyframes|animation:.*infinite|will-change|@import|url\(https?:/);
 assert.ok(css.split('\n').filter(x=>x.trim().startsWith('#app '))
  .every(x=>x.includes('.aps-board-shell .tt-native .tt-overview-command')||
   x.includes('.aps-board-shell .tt-native .tt-overview.tt-overview-command')));
});

test('Existing Pixi lifecycle selects Overview first without a second GPU instance',()=>{
 const first=pixi.indexOf("'.tt-native .tt-overview .tt-pixi-backdrop'");
 const second=pixi.indexOf("'.tt-native .tt-clock-stage .tt-pixi-backdrop'");
 const third=pixi.indexOf("'.tt-native .tt-app-header .tt-pixi-backdrop'");
 assert.ok(first>0&&second>first&&third>second);
 assert.match(pixi,/if\(current\?\.host===host\)return current\.app!==null/);
 assert.match(pixi,/stopTimeTrackerPixi\(\)/);
 assert.match(pixi,/PIXI_DECORATION_FPS=30/);
 assert.match(pixi,/canRunTimeTrackerPixi/);
 assert.match(app,/mountTimeTrackerPixi\(root\)/);
 assert.doesNotMatch(pixi,/new Worker|WebAssembly|\.style\./);
});

test('GitHub Pages includes Overview stylesheet without adding build dependencies',()=>{
 assert.ok(html.includes('frontend/time-tracker-overview-command.css'));
 assert.ok(html.indexOf('frontend/time-tracker-overview-command.css')>
  html.indexOf('frontend/time-tracker-clock-command.css'));
 assert.match(smoke,/'frontend\/time-tracker-overview-command\.css'/);
 assert.match(html,/script type="module" src="\.\/frontend\/app\.js"/);
 assert.doesNotMatch(html,/react-three|pixi-viewport|pixi-spine|gsap/);
});
