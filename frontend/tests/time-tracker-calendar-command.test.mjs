import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 renderTimeTrackerCalendar,timeTrackerCalendarData,
 shiftTimeTrackerCalendarMonth,timeTrackerCalendarHolidays
} from '../time-tracker-calendar.js';

const now=new Date('2026-11-04T08:00:00.000Z');
const rows=[
 {id:'a',ownerId:'cloud:a',name:'Employee One',department:'HR',
  location:'Office-Base Duty',clockIn:'2026-11-04T00:15:00.000Z',
  clockOut:null,status:'Active',classification:'Late'},
 {id:'b',ownerId:'cloud:b',name:'Employee Two',department:'Engineering',
  location:'Offsite (Home)',clockIn:'2026-11-04T02:00:00.000Z',
  clockOut:null,status:'Active',classification:'Late'},
 {id:'c',ownerId:'cloud:a',name:'Employee One',department:'HR',
  location:'Office-Base Duty',clockIn:'2026-11-02T01:00:00.000Z',
  clockOut:'2026-11-02T07:00:00.000Z',status:'Completed'},
 {id:'future',ownerId:'cloud:b',name:'Future Entry',department:'Engineering',
  clockIn:'2026-11-05T00:00:00.000Z',status:'Active'}
];
const render=opts=>renderTimeTrackerCalendar({records:rows,scope:'AUTHORIZED_WORKSPACE_TEAM',month:'2026-11',now,...opts});
const css=readFileSync('frontend/time-tracker-calendar-command.css','utf8');
const scene=readFileSync('frontend/time-tracker-pixi-scene.js','utf8');
const app=readFileSync('frontend/app.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

test('Calendar now renders a distinct command hero and one passive Pixi host',()=>{
 const markup=render();
 assert.match(markup,/class="tt-calendar tt-calendar-command" aria-label="TimeTracker monthly attendance calendar"/);
 assert.match(markup,/class="tt-cal-header tt-cal-command-hero" aria-label="Authorized attendance calendar intelligence"/);
 assert.match(markup,/APSYNTRA \/ WORKFORCE CALENDAR/);
 assert.match(markup,/class="tt-cal-graphics" aria-hidden="true"/);
 assert.match(markup,/class="tt-cal-hero-telemetry" aria-label="Authorized monthly attendance snapshot"/);
 assert.match(markup,/SIGNED MONTHLY SNAPSHOT/);
 assert.match(markup,/Read-only · Authorized workspace team/);
 assert.match(markup,/November 2026/);
 assert.equal((markup.match(/class="tt-pixi-backdrop"/g)||[]).length,1);
 assert.equal((markup.match(/data-action="tt-refresh"/g)||[]).length,1);
 assert.doesNotMatch(markup,/<canvas|<script|style=|onclick=/);
});

test('Hero figures agree with signed projected records, including exclusion of future rows',()=>{
 const data=timeTrackerCalendarData(rows,'2026-11',now);
 assert.equal(data.sessions,3);
 assert.equal(data.activeDays,2);
 assert.equal(data.peak,2);
 assert.equal(data.coverage,50);
 const markup=render();
 assert.match(markup,/>3<\/strong><span>Authorized clock-ins/);
 assert.match(markup,/>2<\/strong><span>Active days<\/span>/);
 assert.match(markup,/>2<\/strong><span>Peak day<\/span>/);
 assert.match(markup,/>50%<\/strong><span>Day coverage<\/span>/);
 assert.doesNotMatch(markup,/Future Entry/);
 const past=render({month:'2026-10'});
 assert.match(past,/>0<\/strong><span>Authorized clock-ins/);
 const empty=render({records:[],month:'2026-12'});
 assert.match(empty,/>—<\/strong><span>Day coverage<\/span>/);
});

test('Signed own-attendance input cannot reveal unauthorized colleagues or GPS evidence',()=>{
 const own=render({records:[rows[0],rows[2]],scope:'OWN_ATTENDANCE_ONLY',selectedDay:'2026-11-04'});
 assert.match(own,/Your authorized sessions/);
 assert.match(own,/Employee One/);
 assert.doesNotMatch(own,/Employee Two|Future Entry|latitude|longitude|geo/i);
 const attack=render({records:[{...rows[0],name:'<img src=x onerror=alert(1)>',
  department:'<svg onload=alert(1)>',geo:{latitude:10.3201,longitude:123.9187}}],
  scope:'OWN_ATTENDANCE_ONLY',selectedDay:'2026-11-04'});
 assert.match(attack,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(attack,/<img src=x|<svg onload|123\.9187|10\.3201/);
});

test('Month/day navigation, analytics, holidays and details remain available',()=>{
 const markup=render({selectedDay:'2026-11-04'});
 for(const token of ['tt-calendar-prev','tt-calendar-next','tt-calendar-today',
  'tt-calendar-day','tt-cal-grid','tt-cal-analytics','tt-cal-weekbars',
  'tt-cal-trend','tt-cal-selected','ATTENDANCE CALENDAR','HOLIDAYS THIS MONTH',
  'Daily Attendance Trend','Avg Attendance by Day of Week','Attendance for Wed, Nov 4',
  'Bonifacio Day','2026 Proclamation No. 1006'])
  assert.ok(markup.includes(token),'Expected retained element '+token);
 assert.match(markup,/aria-pressed="true"/);
 assert.match(markup,/aria-label="Daily authorized attendance trend"/);
 assert.match(markup,/data-day="2026-11-04"/);
 assert.match(markup,/aria-label="Previous month"/);
 assert.match(markup,/aria-label="Next month"/);
 assert.equal(shiftTimeTrackerCalendarMonth('2026-12',1),'2027-01');
 assert.equal(timeTrackerCalendarHolidays('2027-11').length,0);
 assert.match(app,/case 'tt-calendar-prev'/);
 assert.match(app,/case 'tt-calendar-next'/);
 assert.match(app,/case 'tt-calendar-today'/);
 assert.match(app,/case 'tt-calendar-day'/);
});

test('Calendar CSS is tightly scoped, responsive, accessible and avoids continuous CSS animations',()=>{
 assert.match(css,/\.tt-cal-header\.tt-cal-command-hero\{\s*display:grid/);
 assert.match(css,/linear-gradient\(120deg,#0a1938/);
 assert.match(css,/\.tt-cal-graphics \.tt-pixi-backdrop canvas/);
 assert.match(css,/\.tt-calendar-command \.tt-cal-grid/);
 assert.match(css,/\.tt-calendar-command :is\(button,a\):focus-visible/);
 assert.match(css,/@media\(max-width:1100px\)/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/@media\(max-width:400px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.doesNotMatch(css,/@keyframes|animation:.*infinite|will-change|@import|url\(https?:/);
 assert.ok(css.split('\n').filter(x=>x.trim().startsWith('#app '))
  .every(x=>x.includes('.aps-board-shell .tt-native .tt-calendar-command')||
   x.includes('.aps-board-shell .tt-native .tt-calendar.tt-calendar-command')));
});

test('One Pixi scene selects Calendar first; existing tabs remain and disposal is unchanged',()=>{
 const names=['calendar-command','reports-command','log-command','overview','clock-stage','app-header'];
 const indexes=names.map(n=>scene.indexOf("'.tt-native .tt-"+n+" .tt-pixi-backdrop'"));
 assert.ok(indexes.every(n=>n>=0),indexes.join(','));
 assert.ok(indexes.every((n,i)=>!i||n>indexes[i-1]));
 assert.match(scene,/if\(current\?\.host===host\)return current\.app!==null/);
 assert.match(scene,/stopTimeTrackerPixi\(\)/);
 assert.match(scene,/PIXI_DECORATION_FPS=30/);
 assert.match(scene,/canRunTimeTrackerPixi/);
 assert.match(app,/mountTimeTrackerPixi\(root\)/);
 assert.doesNotMatch(scene,/new Worker|WebAssembly|\.style\./);
});

test('Calendar style is registered and verified through Pages with strict CSP intact',()=>{
 assert.ok(index.indexOf('frontend/time-tracker-calendar-command.css')>
  index.indexOf('frontend/time-tracker-reports-command.css'));
 assert.match(smoke,/'frontend\/time-tracker-calendar-command\.css'/);
 assert.match(index,/style-src-attr 'none'/);
 assert.match(index,/script type="module" src="\.\/frontend\/app\.js"/);
});
