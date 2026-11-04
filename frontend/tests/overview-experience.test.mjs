import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {overviewIcon,mountOverviewMotion,stopOverviewMotion} from '../overview-visuals.js';

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
 assert.match(view,/state\.context\?\.profile\?\.platform_role\|\|'Member'/);
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
 assert.match(card,/class="board-card-symbol-link"/);
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
test('one-shot motion runs only upon entry, cleans up, and respects reduced motion',()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 let played=0,cancelled=0;
 const blocks=Array.from({length:4},()=>({animate(keyframes,options){
  played++;assert.equal(keyframes.length,2);
  assert.equal(options.fill,'none');
  return {cancel(){cancelled++;}};
 }}));
 const root={isConnected:true,querySelectorAll(selector){
  assert.equal(selector,'.overview-entrance');return blocks;
 }};
 try{
  globalThis.window={matchMedia:()=>({matches:false})};
  globalThis.document={hidden:false};
  stopOverviewMotion();
  mountOverviewMotion(root,'overview');
  assert.equal(played,4);
  mountOverviewMotion(root,'overview');
  assert.equal(played,4,'overview refresh should not replay entrance');
  assert.equal(cancelled,4);
  mountOverviewMotion(null,'boards');
  mountOverviewMotion(root,'overview');
  assert.equal(played,8);
  stopOverviewMotion();
  assert.equal(cancelled,8);
  globalThis.window={matchMedia:()=>({matches:true})};
  mountOverviewMotion(root,'overview');
  assert.equal(played,8,'reduced-motion must disable entrance');
 }finally{
  stopOverviewMotion();
  globalThis.window=oldWindow;globalThis.document=oldDocument;
 }
});
