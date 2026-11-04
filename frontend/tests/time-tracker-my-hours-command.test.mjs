import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 renderTimeTrackerMyHours,timeTrackerMyHoursData,TT_MY_HOURS_WEEK_TARGET
} from '../time-tracker-my-hours.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';

const user='10000000-0000-4000-8000-000000000011';
const other='10000000-0000-4000-8000-000000000012';
const access={userId:user,name:'Signed Employee',moduleRole:'Employee'};
const now=new Date('2026-11-04T08:00:00.000Z');
const records=[
 {id:'credited',ownerId:'cloud:'+user,clockIn:'2026-11-04T00:00:00Z',
  clockOut:'2026-11-04T09:00:00Z',status:'Completed',
  classification:'On time',creditedMs:6*3600000,
  location:'Office-Base Duty',department:'Engineering'},
 {id:'late',ownerId:'cloud:'+user,clockIn:'2026-11-02T01:30:00Z',
  clockOut:'2026-11-02T05:30:00Z',status:'Completed',
  classification:'Late',creditedMs:3*3600000,
  location:'Offsite (Home)',department:'Engineering'},
 {id:'foreign',ownerId:'cloud:'+other,clockIn:'2026-11-03T00:00:00Z',
  clockOut:'2026-11-03T09:00:00Z',status:'Completed',
  classification:'On time',creditedMs:9*3600000,
  location:'Private colleague location',department:'Private'}
];
const render=options=>renderTimeTrackerMyHours({records,access,now,month:'2026-11',...options});
const css=readFileSync('frontend/time-tracker-my-hours-command.css','utf8');
const scene=readFileSync('frontend/time-tracker-pixi-scene.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const app=readFileSync('frontend/app.js','utf8');

test('My Hours has one passive Pixi scene and a distinct personal intelligence hero',()=>{
 const markup=render();
 assert.match(markup,/class="tt-my-hours tt-my-hours-command" aria-label="My signed attendance hours"/);
 assert.match(markup,/tt-hours-header tt-hours-command-hero/);
 assert.match(markup,/APSYNTRA \/ PERSONAL TIME INTELLIGENCE/);
 assert.match(markup,/class="tt-hours-graphics" aria-hidden="true"/);
 assert.match(markup,/class="tt-hours-hero-telemetry" aria-label="Signed personal attendance snapshot"/);
 assert.match(markup,/SIGNED WEEKLY SNAPSHOT/);
 assert.match(markup,/Read-only · Your signed sessions/);
 assert.equal((markup.match(/class="tt-pixi-backdrop"/g)||[]).length,1);
 assert.equal((markup.match(/data-action="tt-refresh"/g)||[]).length,1);
 assert.doesNotMatch(markup,/<canvas|<script|style=|onclick=/);
});
test('hero data is sourced from the signed self-only projection and excludes other employees',()=>{
 const data=timeTrackerMyHoursData({records,userId:user,at:now,month:'2026-11'});
 assert.equal(data.weekCreditedMs,9*3600000);
 assert.equal(data.monthCreditedMs,9*3600000);
 assert.equal(data.sessions,2);
 assert.equal(data.late,1);
 const markup=render();
 assert.match(markup,/>9\.0h<\/strong><span>Credited this week/);
 assert.match(markup,/>9\.0h<\/strong><span>Month total<\/span>/);
 assert.match(markup,/>2<\/strong><span>Sessions<\/span>/);
 assert.match(markup,/>1<\/strong><span>Late<\/span>/);
 assert.doesNotMatch(markup,/Private colleague location|Private/);
 assert.equal(TT_MY_HOURS_WEEK_TARGET,45);
 const empty=render({records:[]});
 assert.match(empty,/>0\.0h<\/strong><span>Credited this week/);
});
test('My Hours controls and correction approval gates remain unchanged',()=>{
 const markup=render({busy:true,selectedDay:'2026-11-04'});
 for(const action of [
  'tt-hours-week-prev','tt-hours-week-next','tt-hours-week-current',
  'tt-hours-month-prev','tt-hours-month-next','tt-hours-month-current',
  'tt-hours-day','tt-refresh'
 ])assert.ok(markup.includes(action),action);
 assert.match(markup,/data-action="tt-refresh" disabled/);
 assert.match(markup,/Request Correction<\/button>/);
 assert.match(markup,/button type="button" disabled title="Correction submission requires an approved signed backend workflow"/);
 assert.match(markup,/aria-pressed="true"/);
 assert.match(markup,/Credited weekly hours toward 45-hour target/);
 assert.match(app,/case 'tt-hours-week-prev'/);
 const firstWeek=render({weekOffset:-104});
 assert.match(firstWeek,/data-action="tt-hours-week-prev" aria-label="Previous week" disabled/);
 const lastWeek=render({weekOffset:104});
 assert.match(lastWeek,/data-action="tt-hours-week-next" aria-label="Next week" disabled/);
 const firstMonth=render({month:'2000-01'});
 assert.match(firstMonth,/data-action="tt-hours-month-prev" aria-label="Previous month" disabled/);
 const lastMonth=render({month:'2100-12'});
 assert.match(lastMonth,/data-action="tt-hours-month-next" aria-label="Next month" disabled/);
});
test('My Hours does not show data to unsigned users or leak other identities and raw GPS',()=>{
 const unsigned=renderTimeTrackerMyHours({records,access:{},now});
 assert.match(unsigned,/Signed employee identity is required/);
 assert.doesNotMatch(unsigned,/tt-pixi-backdrop|Signed Employee|Private/);
 const attack=render({access:{...access,name:'<svg onload=alert(1)>'},
  records:[{...records[0],location:'<img src=x onerror=alert(1)>',department:'<script>evil</script>'}],
  selectedDay:'2026-11-04'});
 assert.match(attack,/&lt;svg/);
 assert.match(attack,/&lt;img/);
 assert.doesNotMatch(attack,/<svg onload|<img src=x|<script>evil/);
 const native=renderTimeTrackerNative({result:{
  status:'VERIFIED_READ',access,records,log:{scope:'AUTHORIZED_WORKSPACE_TEAM',rows:[
   {name:'Private colleague',clockIn:'2026-11-03T00:00:00Z'}]}
 },view:'hours',now});
 assert.doesNotMatch(native,/Private colleague/);
});
test('My Hours stylesheet is scoped and has accessible keyboard, contrast and motion rules',()=>{
 assert.match(css,/\.tt-hours-header\.tt-hours-command-hero\{\s*display:grid/);
 assert.match(css,/linear-gradient\(120deg,#0a1938/);
 assert.match(css,/\.tt-hours-graphics \.tt-pixi-backdrop canvas/);
 assert.match(css,/\.tt-my-hours-command \.tt-hours-kpis/);
 assert.match(css,/:focus-visible/);
 for(const query of ['@media(max-width:1100px)','@media(max-width:720px)',
  '@media(max-width:400px)','@media(prefers-reduced-motion:reduce)',
  '@media(prefers-contrast:more)'])assert.ok(css.includes(query),query);
 assert.doesNotMatch(css,/@keyframes|animation:.*infinite|will-change|@import|url\(https?:/);
 assert.ok(css.split('\n').filter(x=>x.trim().startsWith('#app '))
  .every(x=>x.includes('.aps-board-shell .tt-native .tt-my-hours-command')||
   x.includes('.aps-board-shell .tt-native .tt-my-hours.tt-my-hours-command')));
});
test('shared Pixi prioritizes Calendar, OT, and My Hours without adding a second renderer',()=>{
 const names=['calendar-command','overtime-command','my-hours-command','reports-command',
  'log-command','overview','clock-stage','app-header'];
 const indexes=names.map(n=>scene.indexOf("'.tt-native .tt-"+n+" .tt-pixi-backdrop'"));
 assert.ok(indexes.every(n=>n>=0),indexes.join(','));
 assert.ok(indexes.every((n,i)=>!i||n>indexes[i-1]));
 assert.match(scene,/if\(current\?\.host===host\)return current\.app!==null/);
 assert.match(scene,/stopTimeTrackerPixi\(\)/);
 assert.match(scene,/PIXI_DECORATION_FPS=30/);
 assert.match(scene,/canRunTimeTrackerPixi/);
 assert.doesNotMatch(scene,/new Worker|WebAssembly|\.style\./);
});
test('GitHub Pages loads and verifies My Hours CSS under strict CSP',()=>{
 assert.ok(index.indexOf('frontend/time-tracker-my-hours-command.css')>
  index.indexOf('frontend/time-tracker-overtime-command.css'));
 assert.match(smoke,/'frontend\/time-tracker-my-hours-command\.css'/);
 assert.match(smoke,/'frontend\/time-tracker-my-hours\.js'/);
 assert.match(index,/style-src-attr 'none'/);
 assert.match(index,/script type="module" src="\.\/frontend\/app\.js"/);
});
