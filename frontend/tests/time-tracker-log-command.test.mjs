import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderTimeTrackerLog,timeTrackerLogSummary,filterTimeTrackerLogRows,boundTimeTrackerLogWidth,timeTrackerLogWorkDuration} from '../time-tracker-log.js';

const now=new Date('2026-11-04T05:48:59Z');
const records=[
 {id:'a',ownerId:'cloud:one',name:'Signed Employee',
  clockIn:'2026-11-04T01:00:00Z',clockOut:null,status:'Active',
  location:'Office-Base Duty',department:'Engineering',classification:'Late',creditedMs:null},
 {id:'b',ownerId:'cloud:one',name:'Signed Employee',
  clockIn:'2026-11-03T01:00:00Z',clockOut:'2026-11-03T09:00:00Z',status:'Completed',
  location:'Local Field Works',department:'Engineering',classification:'On time',creditedMs:28800000}
];
const render=(extra={})=>renderTimeTrackerLog({records,now,...extra});
const css=readFileSync('frontend/time-tracker-log-command.css','utf8');
const adminCss=readFileSync('frontend/time-tracker-log-admin.css','utf8');
const pixi=readFileSync('frontend/time-tracker-pixi-scene.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const styleManifest=readFileSync('scripts/priority5-style-manifest.mjs','utf8');
const styleBundle=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');

test('Log renders one flat summary without decorative hero or Pixi host',()=>{
 const html=render();
 assert.match(html,/class="tt-log tt-log-command"/);
 assert.match(html,/class="tt-log-flat-stats" aria-label="Signed attendance history snapshot"/);
 assert.doesNotMatch(html,/tt-log-command-hero|tt-log-hero-telemetry|tt-pixi-backdrop|<canvas|<script|style=|onclick=/);
});

test('Hero counters use only selected, authorized Log records',()=>{
 const summary=timeTrackerLogSummary(records,now);
 const html=render();
 assert.equal(summary.sessions,2);
 assert.equal(summary.today,1);
 assert.equal(summary.completed,1);
 assert.equal(summary.active,1);
 assert.match(html,/>All sessions<span>2<\/span>/);
 assert.match(html,/>Today<span>1<\/span>/);
 assert.match(html,/>Completed<span>1<\/span>/);
 assert.match(html,/>Active<span>1<\/span>/);
 assert.match(html,/authorized sessions/);
 const filtered=render({filters:{period:'today'}});
 assert.match(filtered,/id="tt-log-visible-count">1<\/span>/);
 assert.equal(filterTimeTrackerLogRows(records,{period:'today'},now).length,1);
});

test('Existing filters, export, audit expansion and GPS authorization remain unchanged',()=>{
 const html=render();
 for(const token of ['tt-log-search','tt-log-period','tt-log-status',
  'tt-log-location','tt-log-sort','tt-log-export','Attendance Records',
  'LOCATION DISTRIBUTION','DAILY OPERATIONS','SHIFT PROGRESS','AUDIT DETAILS',
  'tt-log-detail','tt-log-filterable','tt-log-visible-count']){
  assert.ok(html.includes(token),token);
 }
 assert.match(html,/Precise GPS maps require a privileged signed session/);
 assert.doesNotMatch(html,/latitude|longitude|data-map-scope="log"/);
 const injected=renderTimeTrackerLog({records:[{...records[0],name:'<img src=x onerror=alert(1)>',
  latitude:10.9,longitude:123.8}],now});
 assert.match(injected,/&lt;img/);
 assert.doesNotMatch(injected,/<img src=x|10\.9|123\.8/);
});

test('Flat styling is scoped, adaptive and dark-mode aware',()=>{
 assert.match(css,/\.tt-log-flat-stats/);
 assert.match(css,/\.tt-log-command \.tt-log-controls/);
 assert.match(css,/\.tt-log-command \.tt-log-table/);
 assert.match(css,/data-aps-monday-theme="dark"/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.doesNotMatch(css,/@keyframes|animation:.*infinite|will-change|@import|url\(https?:/);
});

test('Record list has seven data columns plus selection, initials and a single live results count',()=>{
 const html=render();
 assert.deepEqual([...html.matchAll(/<th>([^<]+)<span class="tt-log-resize"/g)].map(m=>m[1]),['Clock In','Employee','Working Location','Department','Clock Out','Work Duration','Status']);
 assert.match(html,/class="tt-log-avatar" aria-hidden="true">SE<\/span>/);
 assert.equal((html.match(/id="tt-log-visible-count"/g)||[]).length,1);
 assert.ok(html.indexOf('tt-log-table')<html.indexOf('tt-log-secondary-analytics'));
 assert.match(html,/<details class="tt-log-secondary-analytics">/);
});

test('Attendance Log renders only the applicable empty state',()=>{
 const noRecords=renderTimeTrackerLog({records:[],now,adminEligible:true});
 assert.match(noRecords,/No authorized attendance sessions match these filters/);
 assert.doesNotMatch(noRecords,/No sessions match the current search/);
 const searchMiss=renderTimeTrackerLog({records,now,filters:{search:'no-such-employee'}});
 assert.match(searchMiss,/No sessions match the current search/);
 assert.doesNotMatch(searchMiss,/No authorized attendance sessions match these filters/);
 const filterMiss=renderTimeTrackerLog({records,now,filters:{period:'today',status:'Completed',search:'no-such-employee'}});
 assert.match(filterMiss,/No authorized attendance sessions match these filters/);
 assert.doesNotMatch(filterMiss,/No sessions match the current search/);
});

test('Single Pixi context prefers Log over header while preserving Clock and Overview',()=>{
 const log=pixi.indexOf("'.tt-native .tt-log-command .tt-pixi-backdrop'");
 const overview=pixi.indexOf("'.tt-native .tt-overview .tt-pixi-backdrop'");
 const clock=pixi.indexOf("'.tt-native .tt-clock-stage .tt-pixi-backdrop'");
 const header=pixi.indexOf("'.tt-native .tt-app-header .tt-pixi-backdrop'");
 assert.ok(log>0&&overview>log&&clock>overview&&header>clock);
 assert.match(pixi,/stopTimeTrackerPixi\(\)/);
 assert.match(pixi,/PIXI_DECORATION_FPS=30/);
 assert.match(pixi,/canRunTimeTrackerPixi/);
 assert.doesNotMatch(pixi,/new Worker|WebAssembly|\.style\./);
});

test('Pages includes new style after Overview without requiring a new build tool',()=>{
 assert.ok(index.indexOf('frontend/time-tracker-log-command.css')>
  index.indexOf('frontend/time-tracker-overview-command.css'));
 assert.ok(index.indexOf('frontend/time-tracker-log-admin.css')>
  index.indexOf('frontend/time-tracker-log-command.css'));
 assert.ok(styleManifest.indexOf('"frontend/time-tracker-log-admin.css"')>
  styleManifest.indexOf('"frontend/time-tracker-log-command.css"'),
  'Admin stylesheet must be included in the generated CSS bundle manifest');
 assert.match(styleBundle,/tt-log-admin-toolbar-copy/);
 assert.match(styleBundle,/tt-admin-delete-dialog/);
 assert.match(smoke,/'frontend\/time-tracker-log-admin\.css'/);
 assert.match(adminCss,/\.tt-log-admin-toolbar/);
 assert.match(adminCss,/\.tt-admin-delete-dialog/);
 assert.match(adminCss,/\.tt-admin-bulk-guidance/);
 assert.match(adminCss,/\.tt-admin-record-context/);
 assert.match(adminCss,/\.tt-admin-editor-backdrop/);
 assert.match(adminCss,/@media\(max-width:650px\)/);
 assert.match(smoke,/'frontend\/time-tracker-log-command\.css'/);
 assert.match(index,/script type="module" src="\.\/frontend\/app\.js"/);
});

test('Reference Log filters combine signed view, department, location, and inclusive Manila dates',()=>{
 assert.deepEqual(filterTimeTrackerLogRows(records,{view:'Active',department:'Engineering',period:'custom',start:'2026-11-04',end:'2026-11-04'},now).map(r=>r.id),['a']);
 assert.deepEqual(filterTimeTrackerLogRows(records,{view:'Completed',location:'Local Field Works',period:'last7'},now).map(r=>r.id),['b']);
 assert.equal(filterTimeTrackerLogRows(records,{department:'Finance'},now).length,0);
 const html=render({adminFullAccess:true,selectedIds:['a']});
 for(const token of ['tt-log-filter-popover','tt-log-department','tt-log-filter-apply','tt-log-filter-reset','tt-log-row-select','aria-checked="mixed"','tt-log-reference-header','tt-log-row-date'])assert.ok(html.includes(token),token);
 assert.match(html,/09:00:00/);
 assert.match(html,/Nov 4, 2026/);
 assert.doesNotMatch(render(),/data-action="tt-log-row-select"/);
});


test('Attendance Log keeps status separate from clock-out time and defines all eight columns',()=>{
 const source=readFileSync('frontend/time-tracker-log.js','utf8');
 const css=readFileSync('frontend/apps/TimeTracker/time-tracker-reference-shell.css','utf8');
 assert.match(source,/<colgroup>(?:<col class="tt-log-col-[a-z]+">){8}<\/colgroup>/);
 assert.match(source,/<td colspan="7"><details class="tt-log-detail"/);
 assert.match(source,/<\/span><span class="tt-log-row-status"><span class="tt-log-badge /);
 assert.match(css,/\.tt-log-search:has\(> \.aps-search-field\) > svg \{display:none\}/);
 assert.match(css,/\.tt-log-row-clock strong \{font-size:inherit/);
 assert.match(css,/grid-template-columns:13fr 24fr 15fr 15fr 11fr 10fr 9fr/);
});

 test('Exact Manila date intersects signed status and filters, including midnight boundary',()=>{
 const extra=[...records,{...records[0],id:'midnight',clockIn:'2026-11-03T16:00:00Z'}];
 assert.deepEqual(filterTimeTrackerLogRows(extra,{date:'2026-11-04',view:'Active'},now).map(r=>r.id),['a','midnight']);
 assert.deepEqual(filterTimeTrackerLogRows(extra,{date:'2026-11-03'},now).map(r=>r.id),['b']);
 assert.match(render({filters:{date:'2026-11-04'}}),/id="tt-log-date"[^>]*value="2026-11-04"/);
 });
 test('Work plan uses escaped signed text and only appears on offsite rows',()=>{
 const note='<script>plan & review</script>';
 const html=render({records:[{...records[0],location:'Offsite (Home)',workNote:note}]});
 assert.match(html,/class="tt-log-work-plan" title="&lt;script&gt;plan &amp; review&lt;\/script&gt;">&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>|\[Work Plan\]/);
 assert.doesNotMatch(render({records:[{...records[0],workNote:note}]}),/class="tt-log-work-plan"/);
 });
 test('Seven independent width-only handles use bounded static tokens',()=>{
 assert.equal((render().match(/data-tt-log-resize="/g)||[]).length,7);
 assert.equal(boundTimeTrackerLogWidth(1),96);
 assert.equal(boundTimeTrackerLogWidth(99999),960);
 assert.equal(boundTimeTrackerLogWidth(207),208);
 });

test('Log clock-out uses Philippine 12-hour time with seconds while clock-in and active placeholder stay unchanged',()=>{
 const rows=[...records,{...records[1],id:'noon',clockOut:'2026-11-03T04:00:00Z'},
  {...records[1],id:'midnight',clockOut:'2026-11-03T16:00:00Z'}];
 const html=render({records:rows});
 const times=[...html.matchAll(/class="tt-log-row-out"[^>]*>([^<]+)<\/span>/g)].map(match=>match[1]);
 assert.deepEqual(times.sort(),['—','05:00:00 PM','12:00:00 AM','12:00:00 PM'].sort());
 assert.match(html,/class="tt-log-row-clock"[^>]*><strong>09:00:00<\/strong>/);
});

test('Work Duration is blank until completion and short shifts have no lunch deduction',()=>{
 const active={...records[0],clockIn:'2026-11-04T00:00:00Z'};
 assert.equal(timeTrackerLogWorkDuration(active),'');
 const close=(clockOut,creditedMs)=>({...active,clockOut,status:'Completed',creditedMs});
 assert.equal(timeTrackerLogWorkDuration(close('2026-11-04T05:30:00Z',16200000)),'05:30:00');
 assert.equal(timeTrackerLogWorkDuration(close('2026-11-04T08:59:59Z',28799000)),'08:59:59');
 assert.equal(timeTrackerLogWorkDuration(close('2026-11-04T09:00:00Z',28800000)),'09:00:00');
 assert.equal(timeTrackerLogWorkDuration(close('2026-11-04T09:30:00Z',30600000)),'09:00:00');
 const closed=close('2026-11-04T10:00:00Z',32400000);
 assert.equal(timeTrackerLogWorkDuration(closed),'09:00:00');
 assert.equal(timeTrackerLogWorkDuration(close('2026-11-04T11:00:00Z',36000000)),'10:00:00');
 assert.equal(timeTrackerLogWorkDuration({...closed,workDurationMs:3600000}),'01:00:00');
 const html=render({records:[active,close('2026-11-04T05:30:00Z',16200000)]});
 assert.match(html,/class="tt-log-row-duration"[^>]*><\/span>/);
 assert.match(html,/class="tt-log-row-duration"[^>]*>05:30:00<\/span>/);
 assert.doesNotMatch(html,/data-tt-log-active-duration/);
 const styles=readFileSync('frontend/apps/TimeTracker/time-tracker-reference-shell.css','utf8');
 assert.match(styles,/data-tt-log-width-duration="96"/);
 assert.match(styles,/data-tt-log-width-duration="960"/);
});
