import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderTimeTrackerGps,validateTimeTrackerGps,summarizeGps} from '../time-tracker-gps.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';
const actor='10000000-0000-4000-8000-000000000011';
const ws='00000000-0000-4000-8000-000000000001';
const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const now=new Date('2026-11-04T08:00:00Z');
const snapshot={
 scope:'AUTHORIZED_WORKSPACE_GPS',actorId:actor,workspaceId:ws,boardId:board,
 from:'2026-11-01',to:'2026-11-04',truncated:false,
 events:[
  {userId:actor,recordId:'first',kind:'in',name:'Employee One',
   department:'Engineering',location:'Office-Base Duty',
   timestamp:'2026-11-02T01:00:00Z',latitude:6.993,longitude:125.481,
   accuracyM:20,source:'Browser GPS'},
  {userId:actor,recordId:'first',kind:'out',name:'Employee One',
   department:'Engineering',location:'Office-Base Duty',
   timestamp:'2026-11-02T09:00:00Z',latitude:6.993,longitude:125.481,
   accuracyM:40,source:'Browser GPS'}
 ]};
const data=validateTimeTrackerGps(snapshot,{userId:actor,workspaceId:ws,boardId:board});
const render=opts=>renderTimeTrackerGps({data,eligible:true,now,...opts});
const css=readFileSync('frontend/time-tracker-gps-command.css','utf8');
const scene=readFileSync('frontend/time-tracker-pixi-scene.js','utf8');
const app=readFileSync('frontend/app.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

test('GPS hero is restricted and uses the single shared decorative Pixi scene',()=>{
 const hidden=renderTimeTrackerGps({data,eligible:false,now});
 assert.match(hidden,/Privileged GPS authorization required/);
 assert.doesNotMatch(hidden,/tt-gps-command|tt-pixi-backdrop|Employee One|6\.993/);
 const html=render();
 assert.match(html,/class="tt-gps tt-gps-command" aria-label="Restricted GPS and Location Hub"/);
 assert.match(html,/tt-gps-heading tt-gps-command-hero/);
 assert.match(html,/APSYNTRA \/ LOCATION INTELLIGENCE/);
 assert.match(html,/class="tt-gps-graphics" aria-hidden="true"/);
 assert.match(html,/class="tt-gps-hero-telemetry" aria-label="Authorized GPS evidence snapshot"/);
 assert.equal((html.match(/class="tt-pixi-backdrop"/g)||[]).length,1);
 assert.doesNotMatch(html,/<canvas|<script|style=|onclick=/);
});
test('signed hero telemetry counts real attendance fixes but never renders raw coordinates',()=>{
 const html=render();
 const hero=html.slice(0,html.indexOf('</header>')+9);
 assert.equal(summarizeGps(data).points.length,2);
 assert.match(hero,/>2<\/strong><span>Recorded attendance/);
 assert.match(hero,/>1<\/strong><span>Clock-ins<\/span>/);
 assert.match(hero,/>1<\/strong><span>Members<\/span>/);
 assert.match(hero,/>±30 m<\/strong><span>Avg\. uncertainty<\/span>/);
 assert.doesNotMatch(hero,/6\.993|125\.481|Employee One|first/);
 const empty=render({data:null});
 const emptyHero=empty.slice(0,empty.indexOf('</header>')+9);
 assert.match(emptyHero,/>—<\/strong><span>Recorded attendance/);
 assert.match(emptyHero,/>—<\/strong><span>Clock-ins<\/span>/);
 assert.match(emptyHero,/Awaiting signed attendance evidence/);
});
test('GPS five views, Leaflet opt-in map, and map controls remain available',()=>{
 const html=render({mapEnabled:true});
 for(const s of ['Live Map','Geofence','Trail','Accuracy','Trends','tt-gps-map-shell',
  'tt-gps-map-modes','tt-gps-controls','tt-gps-records','tt-map-host',
  'tt-gps-load','tt-gps-user','tt-gps-from','tt-gps-to'])
  assert.ok(html.includes(s),s);
 assert.match(html,/role="tablist"/);
 assert.match(html,/aria-selected="true"/);
 for(const tab of ['geofence','trail','accuracy','trends']){
  const view=render({view:tab,filters:{userId:actor,referenceId:'first:in'}});
  assert.match(view,/GPS &amp; Location Hub/);
  assert.match(view,/Employee One/);
  assert.match(view,/tt-pixi-backdrop/);
 }
 assert.match(app,/case 'tt-gps-load'/);
 assert.match(app,/case 'tt-gps-view'/);
 assert.match(app,/setTimeTrackerMapTheme\(theme\)/);
});
test('privileged scope, map redaction, and tile origin policies remain unchanged',()=>{
 assert.throws(()=>validateTimeTrackerGps({...snapshot,workspaceId:board},
  {userId:actor,workspaceId:ws,boardId:board}),/scope mismatch/);
 const denied=renderTimeTrackerNative({
  view:'gps',gpsEligible:false,
  result:{status:'VERIFIED_READ',access:{moduleRole:'Employee'},records:[]}
 });
 assert.doesNotMatch(denied,/tt-gps-command-hero|Employee One/);
 assert.match(app,/gpsEligible:state\.roleVerified===true\|\|state\.ttAttendance\?\.access\?\.moduleRole==='Supervisor'/);
 assert.match(index,/img-src 'self' data: blob: https:\/\/tile\.openstreetmap\.org/);
 const map=readFileSync('frontend/time-tracker-map.js','utf8');
 assert.match(map,/TT_OSM_TILES/);
 assert.match(map,/L\.tileLayer/);
 assert.doesNotMatch(map,/maplibre|setHTML\(|innerHTML/);
});
test('GPS stylesheet is scoped, responsive, and reduced-motion accessible',()=>{
 assert.match(css,/\.tt-gps-heading\.tt-gps-command-hero\{\s*display:grid/);
 assert.match(css,/linear-gradient\(120deg,#0a1938/);
 assert.match(css,/\.tt-gps-graphics \.tt-pixi-backdrop canvas/);
 assert.match(css,/\.tt-gps-command \.tt-gps-map-shell/);
 assert.match(css,/:focus-visible/);
 for(const query of ['@media(max-width:1100px)','@media(max-width:720px)',
  '@media(max-width:400px)','@media(prefers-reduced-motion:reduce)',
  '@media(prefers-contrast:more)'])assert.ok(css.includes(query),query);
 assert.doesNotMatch(css,/@keyframes|animation:.*infinite|will-change|@import|url\(https?:/);
 assert.ok(css.split('\n').filter(x=>x.trim().startsWith('#app '))
  .every(x=>x.includes('.aps-board-shell .tt-native .tt-gps-command')||
   x.includes('.aps-board-shell .tt-native .tt-gps.tt-gps-command')));
});
test('GPS uses existing one-scene Pixi lifecycle, low-power guard, and no signed coordinates',()=>{
 const names=['calendar-command','overtime-command','my-hours-command','team-command',
  'monitor-command','gps-command','reports-command','log-command','overview',
  'clock-stage','app-header'];
 const indexes=names.map(name=>scene.indexOf("'.tt-native .tt-"+name+" .tt-pixi-backdrop'"));
 assert.ok(indexes.every(n=>n>=0),indexes.join(','));
 assert.ok(indexes.every((n,i)=>!i||n>indexes[i-1]));
 assert.match(scene,/if\(current\?\.host===host\)return current\.app!==null/);
 assert.match(scene,/stopTimeTrackerPixi\(\)/);
 assert.match(scene,/PIXI_DECORATION_FPS=30/);
 assert.match(scene,/canRunTimeTrackerPixi/);
 assert.doesNotMatch(scene,/latitude|longitude|recordId|source\.events|\.rpc\(|fetch\(|new Worker/);
});
test('GitHub Pages hashes GPS JS and new CSS under strict existing CSP',()=>{
 assert.ok(index.indexOf('frontend/time-tracker-gps-command.css')>
  index.indexOf('frontend/time-tracker-monitor-command.css'));
 assert.match(smoke,/'frontend\/time-tracker-gps-command\.css'/);
 assert.match(smoke,/'frontend\/time-tracker-gps\.js'/);
 assert.match(index,/style-src-attr 'none'/);
});
