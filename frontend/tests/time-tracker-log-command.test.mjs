import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderTimeTrackerLog,timeTrackerLogSummary,filterTimeTrackerLogRows} from '../time-tracker-log.js';

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
const pixi=readFileSync('frontend/time-tracker-pixi-scene.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

test('Log creates a distinct graphical command hero and one decorative Pixi host',()=>{
 const html=render();
 assert.match(html,/class="tt-log tt-log-command"/);
 assert.match(html,/class="tt-log-hero tt-log-command-hero"/);
 assert.match(html,/aria-label="Authorized attendance history"/);
 assert.match(html,/class="tt-log-hero-telemetry" aria-label="Signed attendance history snapshot"/);
 assert.match(html,/class="tt-log-graphics" aria-hidden="true"/);
 assert.match(html,/class="tt-pixi-backdrop" data-pixi="fallback"/);
 assert.equal((html.match(/class="tt-pixi-backdrop"/g)||[]).length,1);
 assert.doesNotMatch(html,/<canvas|<script|style=|onclick=/);
});

test('Hero counters use only selected, authorized Log records',()=>{
 const summary=timeTrackerLogSummary(records,now);
 const html=render();
 assert.equal(summary.sessions,2);
 assert.equal(summary.today,1);
 assert.equal(summary.completed,1);
 assert.equal(summary.active,1);
 assert.match(html,/>2<\/strong><span>Sessions in selected period<\/span>/);
 assert.match(html,/>1<\/strong><span>Today<\/span>/);
 assert.match(html,/>1<\/strong><span>Completed<\/span>/);
 assert.match(html,/>1<\/strong><span>Active<\/span>/);
 assert.match(html,/Authorized team history|Your attendance history/);
 const filtered=render({filters:{period:'today'}});
 assert.match(filtered,/>1<\/strong><span>Sessions in selected period<\/span>/);
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

test('New styling is scoped and adaptive without expensive perpetual effects',()=>{
 assert.match(css,/\.tt-log-hero\.tt-log-command-hero\{\s*position:relative/);
 assert.match(css,/linear-gradient\(122deg,#0b1939/);
 assert.match(css,/\.tt-log-command \.tt-log-controls/);
 assert.match(css,/\.tt-log-command \.tt-log-panel/);
 assert.match(css,/@media\(max-width:1100px\)/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.doesNotMatch(css,/@keyframes|animation:.*infinite|will-change|@import|url\(https?:/);
 assert.ok(css.split('\n').filter(x=>x.trim().startsWith('#app '))
  .every(x=>x.includes('.aps-board-shell .tt-native .tt-log-command')||
   x.includes('.aps-board-shell .tt-native .tt-log.tt-log-command')));
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
 assert.match(smoke,/'frontend\/time-tracker-log-command\.css'/);
 assert.match(index,/script type="module" src="\.\/frontend\/app\.js"/);
});
