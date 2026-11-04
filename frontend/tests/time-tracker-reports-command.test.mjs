import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 renderTimeTrackerReports,filterTimeTrackerReportRows,
 summarizeTimeTrackerReports,applyTimeTrackerReportSearch
} from '../time-tracker-reports.js';

const now=new Date('2026-11-04T05:48:59.000Z');
const authorized=[
 {id:'session-a',ownerId:'cloud:one',name:'Authorized Worker',
  department:'Engineering',location:'Office-Base Duty',
  clockIn:'2026-11-04T01:00:00.000Z',clockOut:null,
  status:'Active',classification:'Late',creditedMs:null},
 {id:'session-b',ownerId:'cloud:two',name:'Authorized Colleague',
  department:'HR',location:'Local Field Works',
  clockIn:'2026-11-03T00:00:00.000Z',clockOut:'2026-11-03T09:00:00.000Z',
  status:'Completed',classification:'On time',creditedMs:28800000},
 {id:'session-c',ownerId:'cloud:one',name:'Authorized Worker',
  department:'Engineering',location:'Offsite (Home)',
  clockIn:'2026-11-04T00:00:00.000Z',clockOut:'2026-11-04T05:00:00.000Z',
  status:'Completed',classification:'On time',creditedMs:14400000}
];
const render=(extra={})=>renderTimeTrackerReports({
 rows:authorized,scope:'AUTHORIZED_WORKSPACE_TEAM',now,...extra
});
const reportCss=readFileSync('frontend/time-tracker-reports-command.css','utf8');
const app=readFileSync('frontend/app.js','utf8');
const pixi=readFileSync('frontend/time-tracker-pixi-scene.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

test('Reports builds a distinct semantic analytics command dashboard and single Pixi host',()=>{
 const html=render();
 assert.match(html,/class="tt-reports tt-reports-command" aria-label="Authorized attendance Reports"/);
 assert.match(html,/class="tt-reports-heading tt-reports-command-hero" aria-label="Authorized attendance analytics"/);
 assert.match(html,/class="tt-report-graphics" aria-hidden="true"/);
 assert.match(html,/class="tt-reports-hero-content"/);
 assert.match(html,/class="tt-reports-telemetry" aria-label="Authorized report snapshot"/);
 assert.match(html,/APSYNTRA \/ WORKFORCE ANALYTICS/);
 assert.match(html,/SIGNED REPORT SNAPSHOT/);
 assert.match(html,/Attendance Reports/);
 assert.match(html,/class="tt-pixi-backdrop" data-pixi="fallback"/);
 assert.equal((html.match(/class="tt-pixi-backdrop"/g)||[]).length,1);
 assert.doesNotMatch(html,/<canvas|<script|style=|onclick=/);
});

test('Report hero reads only the filtered signed projection, never guesses a metric',()=>{
 const summary=summarizeTimeTrackerReports(authorized);
 assert.equal(summary.records,3);
 assert.equal(summary.completed,2);
 assert.equal(summary.late,1);
 assert.equal(summary.onTimeRate,67);
 assert.equal(summary.averageMs,21600000);
 const html=render();
 assert.match(html,/>3<\/strong><span>Attendance sessions/);
 assert.match(html,/>2<\/strong><span>Completed<\/span>/);
 assert.match(html,/>67%<\/strong><span>On-time rate<\/span>/);
 assert.match(html,/>6\.0 h<\/strong><span>Avg credited hours<\/span>/);
 assert.match(html,/Authorized workspace team/);
 const today=render({period:'today'});
 assert.match(today,/>2<\/strong><span>Attendance sessions/);
 assert.equal(filterTimeTrackerReportRows(authorized,{period:'today',now}).length,2);
 const lateOnly=render({filters:{status:'Late'}});
 assert.match(lateOnly,/>1<\/strong><span>Attendance sessions/);
 assert.doesNotMatch(lateOnly,/Authorized Colleague/);
});

test('Empty reports show explicit unavailable statistics, not fabricated rates or hours',()=>{
 const html=render({rows:[],scope:'OWN_ATTENDANCE_ONLY'});
 assert.match(html,/Your own signed attendance/);
 assert.match(html,/>0<\/strong><span>Attendance sessions/);
 assert.match(html,/>—<\/strong><span>On-time rate<\/span>/);
 assert.match(html,/>—<\/strong><span>Avg credited hours<\/span>/);
 assert.match(html,/No authorized arrivals in this range/);
 assert.match(html,/No authorized department data/);
 assert.match(html,/No authorized sessions match this selection/);
 assert.match(html,/data-action="tt-export" disabled/);
});

test('Existing report controls, charts, date input, records and CSV workflow remain present',()=>{
 const html=render({period:'custom',filters:{start:'2026-11-03',end:'2026-11-04'}});
 for(const token of [
  'tt-report-period','tt-report-start','tt-report-end',
  'tt-report-search','tt-report-visible-count','tt-report-status',
  'tt-report-preset','tt-report-filterable','tt-report-analytics','tt-report-table',
  'Arrival Patterns','Department Utilization','Arrival Distribution',
  'Avg Hours by Department','Attendance Records','TIME CORRECTIONS'
 ])assert.ok(html.includes(token),'Missing retained report feature: '+token);
 assert.equal((html.match(/data-action="tt-refresh"/g)||[]).length,1);
 assert.equal((html.match(/data-action="tt-export"/g)||[]).length,1);
 assert.match(html,/role="img" aria-label="On-time and late arrivals by date"/);
 assert.match(html,/role="img" aria-label="Clock-in counts by hour"/);
 assert.match(html,/November/);
 assert.match(app,/case 'tt-report-preset'/);
 assert.match(app,/case 'tt-report-status'/);
 assert.match(app,/case 'tt-export'/);
 assert.match(app,/applyTimeTrackerReportSearch\(root,state\.ttReportFilters\.search\)/);
 assert.equal(applyTimeTrackerReportSearch({querySelector:()=>null},'test'),false);
});

test('Unknown personnel and precise GPS data never enter authorized Report content',()=>{
 const own=render({rows:[authorized[0]],scope:'OWN_ATTENDANCE_ONLY'});
 assert.match(own,/Authorized Worker/);
 assert.doesNotMatch(own,/Authorized Colleague/);
 assert.doesNotMatch(own,/123\.987654|latitude|longitude/);
 const malicious=render({
  rows:[{...authorized[0],name:'<img src=x onerror=alert(1)>',
   department:'<script>alert(1)</script>',
   geo:{latitude:10.4321,longitude:123.987654}}],
  scope:'OWN_ATTENDANCE_ONLY'
 });
 assert.match(malicious,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(malicious,/<img src=x|<script>|123\.987654|10\.4321/);
 assert.match(malicious,/Only existing centrally authorized attendance data is shown/);
});

test('Analytics styling is scoped, responsive and honors reduced motion',()=>{
 assert.match(reportCss,/\.tt-reports-heading\.tt-reports-command-hero\{\s*display:grid/);
 assert.match(reportCss,/linear-gradient\(122deg,#0b1838/);
 assert.match(reportCss,/\.tt-reports-command \.tt-report-kpis/);
 assert.match(reportCss,/\.tt-reports-command \.tt-report-panel/);
 assert.match(reportCss,/\.tt-report-graphics \.tt-pixi-backdrop canvas/);
 assert.match(reportCss,/@media\(max-width:1100px\)/);
 assert.match(reportCss,/@media\(max-width:720px\)/);
 assert.match(reportCss,/@media\(max-width:400px\)/);
 assert.match(reportCss,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(reportCss,/@media\(prefers-contrast:more\)/);
 assert.doesNotMatch(reportCss,/@keyframes|animation:.*infinite|will-change|@import|url\(https?:/);
 assert.ok(reportCss.split('\n').filter(line=>line.trim().startsWith('#app '))
  .every(line=>line.includes('.aps-board-shell .tt-native .tt-reports-command')||
   line.includes('.aps-board-shell .tt-native .tt-reports.tt-reports-command')));
});

test('One existing adaptive Pixi scene prioritizes Reports and retains other tabs',()=>{
 const reports=pixi.indexOf("'.tt-native .tt-reports-command .tt-pixi-backdrop'");
 const log=pixi.indexOf("'.tt-native .tt-log-command .tt-pixi-backdrop'");
 const overview=pixi.indexOf("'.tt-native .tt-overview .tt-pixi-backdrop'");
 const clock=pixi.indexOf("'.tt-native .tt-clock-stage .tt-pixi-backdrop'");
 const header=pixi.indexOf("'.tt-native .tt-app-header .tt-pixi-backdrop'");
 assert.ok(reports>0&&log>reports&&overview>log&&clock>overview&&header>clock);
 assert.match(pixi,/if\(current\?\.host===host\)return current\.app!==null/);
 assert.match(pixi,/stopTimeTrackerPixi\(\)/);
 assert.match(pixi,/PIXI_DECORATION_FPS=30/);
 assert.match(pixi,/canRunTimeTrackerPixi/);
 assert.match(app,/mountTimeTrackerPixi\(root\)/);
 assert.doesNotMatch(pixi,/new Worker|WebAssembly|\.style\./);
});

test('Reports CSS is published by Pages without new dependencies or CSP changes',()=>{
 assert.ok(index.indexOf('frontend/time-tracker-reports-command.css')>
  index.indexOf('frontend/time-tracker-log-command.css'));
 assert.match(smoke,/'frontend\/time-tracker-reports-command\.css'/);
 assert.match(index,/script type="module" src="\.\/frontend\/app\.js"/);
 assert.match(index,/style-src-attr 'none'/);
 assert.doesNotMatch(index,/react-three|pixi-viewport|pixi-spine|gsap/);
});
