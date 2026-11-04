import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 projectTimeTrackerTeamDirectory,renderTimeTrackerTeam,
 timeTrackerTeamSummary,filterTimeTrackerTeam
} from '../time-tracker-team.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';
const actor='10000000-0000-4000-8000-000000000011';
const colleague='10000000-0000-4000-8000-000000000012';
const workspace='00000000-0000-4000-8000-000000000001';
const snapshot={bootstrapVerified:true,mode:'staged_only',workspaceId:workspace,
 users:[
  {id:actor,displayName:'Bootstrap Member',email:'bootstrap@example.test',status:'active'},
  {id:colleague,displayName:'Team Member',email:'member@example.test',status:'inactive'}
 ],assignments:[
  {userId:actor,moduleId:'time-tracker',role:'System Admin',enabled:true},
  {userId:colleague,moduleId:'time-tracker',role:'Employee',enabled:true}
 ]};
const directory=projectTimeTrackerTeamDirectory(snapshot,{workspaceId:workspace,actorId:actor});
const access={bootstrapTeamEligible:true,workspaceId:workspace,userId:actor};
const render=options=>renderTimeTrackerTeam({directory,access,now:new Date('2026-11-04T08:00:00Z'),...options});
const css=readFileSync('frontend/time-tracker-team-command.css','utf8');
const scene=readFileSync('frontend/time-tracker-pixi-scene.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const app=readFileSync('frontend/app.js','utf8');

test('verified Team hero has one decorative Pixi host and signed directory metrics',()=>{
 const html=render();
 assert.match(html,/class="tt-team-directory tt-team-command" aria-label="Bootstrap-only TimeTracker Team Directory"/);
 assert.match(html,/tt-team-head tt-team-command-hero/);
 assert.match(html,/APSYNTRA \/ WORKFORCE DIRECTORY/);
 assert.match(html,/class="tt-team-graphics" aria-hidden="true"/);
 assert.match(html,/class="tt-team-hero-telemetry" aria-label="Signed workspace team snapshot"/);
 assert.match(html,/Bootstrap verified · Read-only directory/);
 assert.equal((html.match(/class="tt-pixi-backdrop"/g)||[]).length,1);
 assert.match(html,/>2<\/strong><span>Authorized members/);
 assert.match(html,/>1<\/strong><span>Active<\/span>/);
 assert.match(html,/>1<\/strong><span>Deactivated<\/span>/);
 assert.match(html,/>1<\/strong><span>Active admins<\/span>/);
 assert.deepEqual(timeTrackerTeamSummary(directory),
  {total:2,active:1,deactivated:1,unknown:0,admins:1});
 assert.doesNotMatch(html,/<canvas|<script|style=|onclick=/);
});

test('Team scene and protected data remain unavailable without matching signed bootstrap scope',()=>{
 for(const revoked of [
  {bootstrapTeamEligible:false,workspaceId:workspace,userId:actor},
  {...access,workspaceId:'00000000-0000-4000-8000-000000000002'},
  {...access,userId:colleague}
 ]){
  const html=render({access:revoked});
  assert.doesNotMatch(html,/tt-pixi-backdrop|SIGNED WORKSPACE SNAPSHOT|member@example\.test/);
  assert.doesNotMatch(html,/MEMBER LIST/);
 }
 const loading=render({directory:null,loading:true});
 assert.match(loading,/Verifying bootstrap authorization/);
 assert.doesNotMatch(loading,/tt-pixi-backdrop|member@example\.test/);
 const native=renderTimeTrackerNative({
  view:'team',teamEligible:false,
  result:{status:'VERIFIED_READ',access:{moduleRole:'Employee'},records:[]}
 });
 assert.doesNotMatch(native,/data-target="team"|Team Directory|member@example\.test/);
});

test('Team controls remain connected to existing role filters, layouts and fresh signed export',()=>{
 const html=render({filters:{role:'Employee',layout:'grid',search:'member'}});
 for(const attr of ['tt-team-refresh','tt-team-export','tt-team-role',
  'tt-team-layout','tt-team-search'])assert.ok(html.includes(attr),attr);
 assert.match(html,/aria-label="Grid view" aria-pressed="true"/);
 assert.match(html,/aria-label="List view" aria-pressed="false"/);
 assert.match(html,/role="group" aria-label="Filter Team by TimeTracker role"/);
 assert.equal(filterTimeTrackerTeam(directory,{role:'Employee'}).members.length,1);
 assert.match(app,/case 'tt-team-refresh'/);
 assert.match(app,/case 'tt-team-role'/);
 assert.match(app,/case 'tt-team-export'/);
 assert.match(app,/await timeTracker\.teamDirectory\(boardId\)/);
 assert.doesNotMatch(html,/data-action="tt-team-role-change"/);
});

test('Team names and emails are HTML-escaped, including when rendered in a hero',()=>{
 const bad={...snapshot,users:[
  {...snapshot.users[0],displayName:'<svg onload=alert(1)>'},
  {...snapshot.users[1],email:'<img src=x onerror=alert(1)>'}
 ]};
 const safe=projectTimeTrackerTeamDirectory(bad,{workspaceId:workspace,actorId:actor});
 const html=render({directory:safe});
 assert.match(html,/&lt;svg/);
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<svg onload|<img src=x|<script|onclick=/);
 assert.match(html,/>2<\/strong><span>Authorized members/);
});

test('Team stylesheet is fully scoped and respects keyboard, touch, motion and contrast',()=>{
 assert.match(css,/\.tt-team-head\.tt-team-command-hero\{\s*display:grid/);
 assert.match(css,/linear-gradient\(120deg,#0a1938/);
 assert.match(css,/\.tt-team-graphics \.tt-pixi-backdrop canvas/);
 assert.match(css,/\.tt-team-command \.tt-team-members/);
 assert.match(css,/:focus-visible/);
 for(const media of ['@media(max-width:1100px)','@media(max-width:720px)',
  '@media(max-width:400px)','@media(prefers-reduced-motion:reduce)',
  '@media(prefers-contrast:more)'])assert.ok(css.includes(media),media);
 assert.doesNotMatch(css,/@keyframes|animation:.*infinite|will-change|@import|url\(https?:/);
 assert.ok(css.split('\n').filter(x=>x.trim().startsWith('#app '))
  .every(x=>x.includes('.aps-board-shell .tt-native .tt-team-command')||
   x.includes('.aps-board-shell .tt-native .tt-team-directory.tt-team-command')));
});

test('shared Pixi targets Team alongside existing tabs and retains one-scene lifecycle',()=>{
 const names=['calendar-command','overtime-command','my-hours-command','team-command',
  'reports-command','log-command','overview','clock-stage','app-header'];
 const indexes=names.map(name=>scene.indexOf("'.tt-native .tt-"+name+" .tt-pixi-backdrop'"));
 assert.ok(indexes.every(n=>n>=0),indexes.join(','));
 assert.ok(indexes.every((n,i)=>!i||n>indexes[i-1]));
 assert.match(scene,/if\(current\?\.host===host\)return current\.app!==null/);
 assert.match(scene,/stopTimeTrackerPixi\(\)/);
 assert.match(scene,/PIXI_DECORATION_FPS=30/);
 assert.match(scene,/canRunTimeTrackerPixi/);
 assert.doesNotMatch(scene,/new Worker|WebAssembly|\.style\./);
});

test('GitHub Pages registers and hashes Team visual assets without relaxing CSP',()=>{
 assert.ok(index.indexOf('frontend/time-tracker-team-command.css')>
  index.indexOf('frontend/time-tracker-my-hours-command.css'));
 assert.match(smoke,/'frontend\/time-tracker-team-command\.css'/);
 assert.match(smoke,/'frontend\/time-tracker-team\.js'/);
 assert.match(index,/style-src-attr 'none'/);
 assert.match(index,/script type="module" src="\.\/frontend\/app\.js"/);
});
