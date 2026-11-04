import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 renderTimeTrackerOvertime,timeTrackerOtMetrics,TT_OT_WRITES_ACCEPTED
} from '../time-tracker-overtime.js';

const now=new Date('2026-11-04T08:00:00.000Z');
const rows=[
 {id:'sub',name:'Employee One',ownerId:'cloud:one',date:'2026-11-04',
  status:'Submitted',start:'18:00',end:'20:00',durationMinutes:120,
  task:'Emergency engineering work'},
 {id:'approved',name:'Employee Two',ownerId:'cloud:two',date:'2026-11-02',
  status:'Approved',start:'18:00',end:'20:00',durationMinutes:120,
  task:'Extra site inspection'},
 {id:'rejected',name:'Employee Three',ownerId:'cloud:three',date:'2026-11-03',
  status:'Rejected',start:'18:00',end:'19:00',durationMinutes:60,
  task:'Nonessential overtime'},
 {id:'outside',name:'Outside Member',ownerId:'cloud:outside',date:'2026-10-20',
  status:'Approved',start:'18:00',end:'19:00',durationMinutes:60,
  task:'Outside this week'}
];
const render=opts=>renderTimeTrackerOvertime({requests:rows,now,...opts});
const css=readFileSync('frontend/time-tracker-overtime-command.css','utf8');
const scene=readFileSync('frontend/time-tracker-pixi-scene.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const app=readFileSync('frontend/app.js','utf8');

test('OT uses a distinct, data-driven command hero and one optional passive Pixi host',()=>{
 const markup=render();
 assert.match(markup,/class="tt-overtime tt-overtime-command"/);
 assert.match(markup,/tt-ot-header tt-ot-command-hero/);
 assert.match(markup,/APSYNTRA \/ OVERTIME INTELLIGENCE/);
 assert.match(markup,/class="tt-ot-graphics" aria-hidden="true"/);
 assert.match(markup,/class="tt-ot-hero-telemetry" aria-label="Authorized weekly overtime snapshot"/);
 assert.match(markup,/SIGNED WEEKLY SNAPSHOT/);
 assert.match(markup,/Read-only · Signed request scope/);
 assert.equal((markup.match(/class="tt-pixi-backdrop"/g)||[]).length,1);
 assert.equal((markup.match(/data-action="tt-refresh"/g)||[]).length,1);
 assert.doesNotMatch(markup,/<canvas|<script|style=|onclick=/);
 const m=timeTrackerOtMetrics(rows,{},now);
 assert.equal(m.all.length,3);
 assert.equal(m.approvedMinutes,120);
 assert.match(markup,/>2h 00m<\/strong><span>Approved overtime/);
 assert.match(markup,/>1<\/strong><span>Pending<\/span>/);
 assert.match(markup,/>1<\/strong><span>Approved<\/span>/);
 assert.match(markup,/>1<\/strong><span>Rejected<\/span>/);
 assert.doesNotMatch(markup,/Outside Member/);
});
test('existing OT navigation, role checks, search and staged write restrictions remain',()=>{
 const employee=render({modalOpen:true,filters:{status:'Approved'}});
 for(const token of ['tt-ot-prev','tt-ot-next','tt-ot-current','tt-ot-status',
  'tt-ot-sort','tt-ot-search','tt-ot-open','tt-ot-chart','tt-ot-requestor',
  'tt-ot-form','tt-ot-date','tt-ot-start','tt-ot-end'])
  assert.ok(employee.includes(token),token);
 assert.match(employee,/type="submit" disabled/);
 assert.doesNotMatch(employee,/tt-ot-review-actions/);
 const bootstrap=render({access:{bootstrapApprover:true},filters:{status:'Submitted'}});
 assert.match(bootstrap,/Read-only · Bootstrap review scope/);
 assert.match(bootstrap,/tt-ot-review-actions/);
 assert.match(bootstrap,/data-action="tt-ot-approve"[^>]* disabled/);
 assert.match(bootstrap,/data-action="tt-ot-reject"[^>]* disabled/);
 assert.equal(TT_OT_WRITES_ACCEPTED,false);
 assert.match(app,/TT_OT_WRITES_ACCEPTED/);
});
test('OT metrics, request details and charts remain escaped and accessible',()=>{
 const attack=render({requests:[{...rows[0],name:'<img src=x onerror=alert(1)>',
  task:'<svg onload=alert(1)>'}],filters:{status:'Submitted'}});
 assert.match(attack,/&lt;img/);
 assert.doesNotMatch(attack,/<img src=x|<svg onload/);
 assert.match(attack,/aria-label="Sunday approved overtime minutes"/);
 assert.match(attack,/aria-label="Saturday approved overtime minutes"/);
 assert.match(attack,/aria-pressed="true"/);
 assert.match(attack,/aria-label="Previous week"/);
 const earliest=render({filters:{weekOffset:-104}});
 assert.match(earliest,/data-action="tt-ot-prev"[^>]* disabled/);
 const latest=render({filters:{weekOffset:104}});
 assert.match(latest,/data-action="tt-ot-next"[^>]* disabled/);
});
test('OT stylesheet is scoped, responsive, keyboard accessible and motion safe',()=>{
 assert.match(css,/\.tt-ot-header\.tt-ot-command-hero\{\s*display:grid/);
 assert.match(css,/linear-gradient\(120deg,#0a1938/);
 assert.match(css,/\.tt-ot-graphics \.tt-pixi-backdrop canvas/);
 assert.match(css,/\.tt-overtime-command \.tt-ot-metrics/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(max-width:1100px\)/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/@media\(max-width:400px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.doesNotMatch(css,/@keyframes|animation:.*infinite|will-change|@import|url\(https?:/);
 assert.ok(css.split('\n').filter(x=>x.trim().startsWith('#app '))
  .every(x=>x.includes('.aps-board-shell .tt-native .tt-overtime-command')||
   x.includes('.aps-board-shell .tt-native .tt-overtime.tt-overtime-command')));
});
test('shared one-scene Pixi prioritizes Calendar and OT, preserving disposal',()=>{
 const names=['calendar-command','overtime-command','reports-command','log-command',
  'overview','clock-stage','app-header'];
 const indexes=names.map(n=>scene.indexOf("'.tt-native .tt-"+n+" .tt-pixi-backdrop'"));
 assert.ok(indexes.every(n=>n>=0),indexes.join(','));
 assert.ok(indexes.every((n,i)=>!i||n>indexes[i-1]));
 assert.match(scene,/if\(current\?\.host===host\)return current\.app!==null/);
 assert.match(scene,/stopTimeTrackerPixi\(\)/);
 assert.match(scene,/PIXI_DECORATION_FPS=30/);
 assert.match(scene,/canRunTimeTrackerPixi/);
 assert.doesNotMatch(scene,/new Worker|WebAssembly|\.style\./);
});
test('GitHub Pages registers and verifies OT CSS under strict CSP',()=>{
 assert.ok(index.indexOf('frontend/time-tracker-overtime-command.css')>
  index.indexOf('frontend/time-tracker-calendar-command.css'));
 assert.match(smoke,/'frontend\/time-tracker-overtime-command\.css'/);
 assert.match(index,/style-src-attr 'none'/);
 assert.match(index,/script type="module" src="\.\/frontend\/app\.js"/);
});
