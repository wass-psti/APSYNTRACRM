import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD_MODULES,BOARD_CONTRACT_VERSION} from '../board-manifest.js';
import {renderFoundation} from '../board-foundation-ui.js';
import {foundationIcon,mountFoundationMotion,stopFoundationMotion} from '../foundation-visuals.js';

const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/foundation-experience.css','utf8');
const html=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const screen=readFileSync('frontend/board-foundation-ui.js','utf8');
const goodRows=BOARD_MODULES.map((module,index)=>({
 module,status:'ready',boardId:'11111111-1111-4111-8111-'+String(index+1).padStart(12,'0'),
 note:'Live details and typed columns verified',columns:8,items:0
}));

test('foundation stylesheet and markup are isolated to the signed foundation route',()=>{
 const rendered=renderFoundation({rows:goodRows,canProvision:true});
 assert.match(rendered,/^<div class="aps-foundation">/);
 assert.match(rendered,/<section class="page-head foundation-hero foundation-entrance"/);
 assert.match(rendered,/id="foundation-page-title"/);
 assert.match(rendered,/aria-label="Foundation readiness statistics"/);
 assert.match(rendered,/class="panel foundation-operations foundation-entrance"/);
 assert.match(rendered,/class="section-header foundation-heading foundation-entrance"/);
 assert.match(rendered,/class="panel foundation-table-panel foundation-entrance"/);
 assert.match(rendered,/class="note security-note csp-u052 foundation-security-note"/);
 assert.ok(rendered.endsWith('</div>'));
 assert.match(app,/classList\.toggle\('aps-foundation-shell',state\.view==='foundation'\)/);
 assert.match(app,/classList\.toggle\('aps-overview-shell',state\.view==='overview'\)/);
 assert.match(app,/classList\.toggle\('aps-boards-shell',state\.view==='boards'\)/);
 assert.match(app,/mountFoundationMotion\(root\.querySelector\('\.aps-foundation'\),state\.view\)/);
 assert.match(app,/stopFoundationMotion\(\)/);
 assert.match(html,/frontend\/foundation-experience\.css/);
 assert.match(smoke,/'frontend\/foundation-experience\.css'/);
 assert.match(smoke,/'frontend\/foundation-visuals\.js'/);
});

test('four statistics preserve signed live derived values and declared contract version',()=>{
 const rows=[goodRows[0],{module:BOARD_MODULES[1],status:'missing'},
  {module:BOARD_MODULES[2],status:'denied'}];
 const rendered=renderFoundation({rows});
 assert.ok(rendered.includes('1 / 12'));
 assert.ok(rendered.includes('Still missing</div><div class="stat-value">1</div>'));
 assert.ok(rendered.includes('Configuration problems</div><div class="stat-value">1</div>'));
 assert.ok(rendered.includes('>v'+BOARD_CONTRACT_VERSION+'</div>'));
 for(const value of ['Dedicated boards verified','Signed PostgreSQL board RPC checks',
  'No fabricated board records','Mismatch / denied / duplicate','Per-module typed schemas']){
  assert.ok(rendered.includes(value),value);
 }
 assert.match(screen,/const summary=summarizeFoundation\(rows\)/);
 assert.match(screen,/const found=new Map\(rows\.map/);
 assert.match(screen,/boardColumns\(module\)\.length/);
 assert.match(screen,/esc\(row\?\.note\|\|'Awaiting live inspection'\)/);
 assert.doesNotMatch(screen,/mockReadiness|fakeStatus|fabricatedSuccess/);
});

test('refresh, provisioning and controlled checks preserve authorizations and disabled behavior',()=>{
 const denied=renderFoundation({rows:goodRows,canProvision:false});
 const enabled=renderFoundation({rows:goodRows,canProvision:true});
 const busy=renderFoundation({rows:goodRows,canProvision:true,loading:true,provisioning:true,testing:true});
 assert.match(denied,/data-action="foundation-refresh"/);
 assert.match(denied,/data-action="foundation-provision" disabled/);
 assert.match(denied,/Provisioning requires the existing platform administrator role/);
 assert.match(denied,/data-action="foundation-operational-test" disabled/);
 assert.match(enabled,/data-action="foundation-provision" >/);
 assert.match(enabled,/data-action="foundation-operational-test" >/);
 assert.match(busy,/data-action="foundation-refresh" disabled/);
 assert.match(busy,/data-action="foundation-provision" disabled/);
 assert.match(busy,/data-action="foundation-operational-test" disabled/);
 assert.match(screen,/summary\.ready===12\?/);
 assert.match(app,/case 'foundation-refresh'/);
 assert.match(app,/case 'foundation-provision'/);
 assert.match(app,/case 'foundation-operational-test'/);
 assert.match(app,/state\.context\?\.profile\?\.platform_role!=='admin_general_manager'/);
 assert.match(app,/PROVISION 12 BOARDS/);
 assert.match(app,/RUN 12 BOARD CHECKS/);
 assert.match(app,/provisionMissingBoards\(db/);
 assert.match(app,/runTwelveBoardQa\(db/);
});

test('readiness table preserves 12 typed contracts, signed links and restricted-domain warning',()=>{
 const result=renderFoundation({rows:goodRows,canProvision:true});
 assert.equal((result.match(/Open verified board/g)||[]).length,12);
 assert.equal((result.match(/class="status done"/g)||[]).length,12);
 assert.match(result,/<caption class="foundation-visually-hidden">Module-to-board readiness<\/caption>/);
 for(const title of ['Domain module','Expected fields','Board contract','Record source',
  'Module-to-board readiness','No application data created'])assert.ok(result.includes(title),title);
 assert.match(result,/TimeTracker and other restricted domains:/);
 assert.match(result,/do not expose employee identifiers, exact attendance times, GPS coordinates/);
 assert.match(result,/No signed live CRUD or cross-workspace test is claimed/);
 assert.match(result,/href="#\/boards\/11111111-1111-4111-8111-000000000001"/);
 const denied=renderFoundation({rows:[{module:BOARD_MODULES[0],status:'denied',note:'denied'}]});
 assert.match(denied,/No certified source projection/);
 assert.doesNotMatch(denied,/Open verified board/);
});

test('live errors, progress and row annotations remain escaped and accessible',()=>{
 const result=renderFoundation({rows:[{module:BOARD_MODULES[0],status:'denied',
  note:'<script>bad</script>'}],error:'<img src=x onerror=alert(1)>',
  log:['<b>unsafe</b>'],canProvision:false});
 assert.doesNotMatch(result,/<script>|<img src=x|<b>unsafe<\/b>/);
 assert.match(result,/&lt;script&gt;bad&lt;\/script&gt;/);
 assert.match(result,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(result,/&lt;b&gt;unsafe&lt;\/b&gt;/);
 assert.match(result,/class="error-banner csp-u045" role="alert"/);
 assert.match(result,/aria-labelledby="foundation-page-title"/);
 assert.match(result,/scope="col"/);
 assert.match(result,/role="note"/);
 assert.doesNotMatch(result,/\sonclick=|\sonload=|\sstyle="/);
});

test('scoped responsive CSS and static SVG maintain accessibility and avoid continuous GPU cost',()=>{
 for(const icon of ['refresh','grid','missing','warning','layers','shield','database']){
  const img=foundationIcon(icon);
  assert.match(img,/^<svg class="foundation-svg-icon"/);
  assert.match(img,/aria-hidden="true"/);
  assert.match(img,/<\/svg>$/);
  assert.doesNotMatch(img,/\son\w+=|<script|\sstyle=/);
 }
 assert.equal(foundationIcon('unknown'),foundationIcon('grid'));
 for(const rule of ['#app .aps-foundation-shell','#app .aps-foundation',
   '@media(max-width:1250px)','@media(max-width:820px)','@media(max-width:650px)',
   '@media(max-width:395px)','@media(prefers-reduced-motion:reduce)',
   '@media(prefers-contrast:more)']){
  assert.ok(css.includes(rule),rule);
 }
 for(const selector of ['.foundation-refresh:focus-visible',
  '.foundation-provision-button:focus-visible','.foundation-qa-button:focus-visible',
  '.foundation-board-link:focus-visible','.foundation-table-scroll']){
  assert.ok(css.includes(selector),selector);
 }
 assert.match(css,/overflow-x:auto/);
 assert.doesNotMatch(css,/@import|url\(\s*https?:|animation:.*infinite/);
 const graphics=readFileSync('frontend/foundation-visuals.js','utf8');
 assert.doesNotMatch(graphics,/WebGL|requestAnimationFrame|setInterval|fetch\(|XMLHttpRequest|new Worker/);
 assert.doesNotMatch(graphics,/\.style\s*\.|\.cssText\s*=|setAttribute\s*\(\s*['"]style/);
});

test('mounted foundation components remain stationary on entry and refresh',()=>{
 let queries=0,animations=0;
 const node={isConnected:true,querySelectorAll(){queries++;return [{animate(){animations++;}}]},
  animate(){animations++;}};
 stopFoundationMotion();
 mountFoundationMotion(node,'foundation');
 mountFoundationMotion(node,'foundation');
 mountFoundationMotion(null,'overview');
 mountFoundationMotion(node,'foundation');
 stopFoundationMotion();
 assert.equal(queries,0,'no entrance element traversal');
 assert.equal(animations,0,'no mount-time animations');
 const source=readFileSync('frontend/foundation-visuals.js','utf8');
 assert.doesNotMatch(source,/\.animate\s*\(|translate3d\(|requestAnimationFrame\s*\(/);
});
