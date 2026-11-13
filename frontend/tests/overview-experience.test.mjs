import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {overviewIcon,mountOverviewMotion,stopOverviewMotion} from '../overview-visuals.js';
import {signedCrmRoleLabel,signedCrmIdentityLabel} from '../crm-role-context.js';
import {workspaceRelationLabel} from '../workspace-relation-context.js';

const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/overview-experience.css','utf8');
const html=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const start=app.indexOf('function overview(){');
const end=app.indexOf('function boardsPage(){',start);
const view=app.slice(start,end);
const card=app.slice(app.indexOf('function boardCard(board,index){'),app.indexOf('function empty(',app.indexOf('function boardCard(board,index){')));

test('overview is isolated from signed sidebar and other board views',()=>{
 assert.ok(start>0&&end>start);
 assert.match(view,/return \`<div class="aps-overview">/);
 assert.match(app,/root\.querySelector\('\.main'\)\?\.classList\.toggle\('aps-overview-shell',state\.view==='overview'\)/);
 assert.match(app,/mountOverviewMotion\(root\.querySelector\('\.aps-overview'\),state\.view\)/);
 assert.match(app,/stopOverviewMotion\(\)/);
 assert.match(app,/function shell\(body\)\{/);
 assert.match(app,/class="shell">\$\{sidebar\(\)\}<main class="main"/);
 assert.match(html,/frontend\/overview-experience\.css/);
 assert.match(smoke,/'frontend\/overview-experience\.css'/);
 assert.match(smoke,/'frontend\/overview-visuals\.js'/);
});
test('all four metrics remain based on authoritative signed board and role state',()=>{
 assert.match(view,/state\.boards\.reduce\(\(a,b\)=>a\+\(Number\(b\.item_count\)\|\|0\),0\)/);
 assert.match(view,/state\.boards\.length/);
 assert.match(view,/signedCrmRoleLabel\(state\.crmRoleSnapshot,state\.context\)/);
 for(const label of ['Active boards','Board items','Workspace status','Your access']){
  assert.ok(view.includes(label),label);
 }
 assert.match(view,/aria-label="Workspace statistics"/);
 assert.match(view,/class="stat-value csp-u041"/);
 assert.match(view,/class="stat-value csp-u042"/);
 assert.doesNotMatch(view,/\b94%\b|\b8 workflows\b/);
});
test('overview retains exact page navigation, refresh, new-board and board-card handlers',()=>{
 assert.match(view,/data-action="refresh"/);
 assert.match(view,/data-action="new-board"/);
 assert.match(view,/href="#\/boards"/);
 assert.match(view,/recent\.map\(boardCard\)/);
 assert.match(view,/state\.boards\.slice\(0,6\)/);
 assert.match(card,/return '<article class="board-card"/);
 assert.match(card,/class="board-card-actions"/);
 assert.match(card,/class="board-card-main"/);
 assert.match(card,/class="board-symbol '/);
 assert.doesNotMatch(card,/class="board-card-symbol-link"/);
 assert.match(card,/aria-label="Open '/);
 assert.match(card,/boardCardActionState\(board\)/);
 assert.match(card,/data-action="board-card-trash"/);
 assert.match(card,/data-action="board-card-edit"/);
 assert.match(card,/data-action="board-card-restore"/);
 assert.match(app,/await db\.allowed\(id,'manage'\)/);
 assert.match(app,/case 'refresh':/);
 assert.match(app,/case 'new-board':/);
});
test('overview uses escaped identity and board descriptions, no mock operational data',()=>{
 assert.match(view,/e\(name\(\)\.split\(' '\)\[0\]\)/);
 assert.match(card,/e\(board\.name\)/);
 assert.match(card,/e\(publicBoardDescription\(board\)\)/);
 assert.match(view,/Supabase Auth connected/);
 assert.match(view,/Board permissions are centralized/);
 assert.match(view,/Native issue transactions/);
 assert.match(view,/aria-labelledby="overview-title"/);
 assert.match(view,/aria-hidden="true"/);
 assert.doesNotMatch(view,/\sonclick=|\sonmouseover=|\sstyle="/);
});
test('overview board summary clarifies limited preview, formats signed counts and keeps paths',()=>{
 const render=new Function('state','name','e','overviewIcon','boardCard','empty',
  'signedCrmRoleLabel','signedCrmIdentityLabel','workspaceRelationLabel',
  view+'\nreturn overview();');
 const boards=Array.from({length:175},(_,i)=>({id:String(i),name:'Board '+i,item_count:i===0?6212:0}));
 const state={boards,roleVerified:false,context:{profile:{platform_role:'employee'}}};
 const html=render(state,()=> 'Example User',String,()=>'',b=>'<article data-id="'+b.id+'"></article>',
  ()=>'<div>Empty board</div>',signedCrmRoleLabel,signedCrmIdentityLabel,workspaceRelationLabel);
 assert.match(html,/role="group" aria-label="Active boards: 175"/);
 assert.match(html,/role="group" aria-label="Board items: 6,212"/);
 assert.match(html,/Showing 6 of 175 available boards/);
 assert.match(html,/aria-labelledby="overview-boards-title"/);
 assert.equal((html.match(/<article data-id=/g)||[]).length,6);
 assert.match(html,/href="#\/boards"/);
 assert.doesNotMatch(html,/Workspace essentials/);
 assert.match(css,/overview-board-count/);
 assert.match(css,/overview-hero \.head-actions button\{min-height:44px/);
 assert.match(css,/overview-board-grid \.board-card p\{font-size:12px/);
});
test('static SVG icons and CSS support reduced motion, focus and mobile without GPU loops',()=>{
 for(const icon of ['refresh','plus','grid','items','pulse','shield','arrow','lock','check']){
  const svg=overviewIcon(icon);
  assert.match(svg,/^<svg class="overview-svg-icon"/);
  assert.match(svg,/aria-hidden="true"/);
  assert.match(svg,/<\/svg>$/);
  assert.doesNotMatch(svg,/\son\w+=|\sstyle=|<script/);
 }
 assert.equal(overviewIcon('unsupported'),overviewIcon('grid'));
 assert.match(css,/#app \.aps-overview/);
 assert.match(css,/#app \.aps-overview-shell/);
 assert.match(css,/@media\(max-width:1250px\)/);
 assert.match(css,/@media\(max-width:1090px\)/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.match(css,/\.overview-hero button:focus-visible/);
 assert.match(css,/\.inline-link:focus-visible/);
 assert.match(css,/\.board-card-main:focus-visible/);
 assert.doesNotMatch(css,/@import|url\(\s*https?:|animation:.*infinite/);
 const visuals=readFileSync('frontend/overview-visuals.js','utf8');
 assert.doesNotMatch(visuals,/WebGL|requestAnimationFrame|setInterval|new Worker|fetch\(/);
 assert.doesNotMatch(visuals,/\.style\s*\.|\.cssText\s*=|setAttribute\s*\(\s*['"]style/);
});
test('mounted overview components remain stationary on entry and refresh',()=>{
 let queries=0,animations=0;
 const node={isConnected:true,querySelectorAll(){queries++;return [{animate(){animations++;}}]},
  animate(){animations++;}};
 stopOverviewMotion();
 mountOverviewMotion(node,'overview');
 mountOverviewMotion(node,'overview');
 mountOverviewMotion(null,'overview');
 mountOverviewMotion(node,'overview');
 stopOverviewMotion();
 assert.equal(queries,0,'no entrance element traversal');
 assert.equal(animations,0,'no mount-time animations');
 const source=readFileSync('frontend/overview-visuals.js','utf8');
 assert.doesNotMatch(source,/\.animate\s*\(|translate3d\(|requestAnimationFrame\s*\(/);
});

test('Workspace essentials is rendered only after verified bootstrap authority',()=>{
 // Execute only the pure Overview renderer with inert view dependencies.
 // Profile roles must never substitute for the verified bootstrap RPC gate.
 const render=new Function('state','name','e','overviewIcon','boardCard','empty',
  'signedCrmRoleLabel','signedCrmIdentityLabel','workspaceRelationLabel',
  view+'\nreturn overview();');
 const makeState=roleVerified=>({
  roleVerified,boards:[],context:{profile:{platform_role:'admin_general_manager'}}
 });
 const deps=[()=> 'Example User',String,v=>`<i>${v}</i>`,()=>'',()=>'<div>Empty board</div>'];
 for(const flag of [false,undefined,null,0]){
  const markup=render(makeState(flag),...deps,signedCrmRoleLabel,signedCrmIdentityLabel,workspaceRelationLabel);
  assert.doesNotMatch(markup,/Workspace essentials|overview-essentials|Supabase Auth connected|Native issue transactions/);
  assert.match(markup,/Your boards/);
  assert.match(markup,/Active boards/);
  assert.match(markup,/New board/);
 }
 const verified=render(makeState(true),...deps,signedCrmRoleLabel,signedCrmIdentityLabel,workspaceRelationLabel);
 assert.match(verified,/Workspace essentials/);
 assert.match(verified,/Supabase Auth connected/);
 assert.match(verified,/Board permissions are centralized/);
 assert.match(verified,/Native issue transactions/);
 assert.match(app,/roleConfig\.bootstrapVerified\(\)/);
 assert.match(app,/if\(roleChanged\|\|sensitive\)/);
});
