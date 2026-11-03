import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sidebarIcon,animateSidebarSelection,stopSidebarSelection} from '../sidebar-visuals.js';

const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/sidebar-experience.css','utf8');
const html=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const sidebar=app.slice(app.indexOf('function sidebarNav('),
 app.indexOf('/** Signed session-local basemap opt-in.'));

test('signed sidebar preserves the required route vocabulary and active semantics',()=>{
 assert.match(sidebar,/class="sidebar aps-sidebar" aria-label="Workspace sidebar"/);
 assert.match(sidebar,/' aria-current="page"'/);
 assert.match(sidebar,/sidebarNav\('#\/overview','Overview','overview'/);
 assert.match(sidebar,/sidebarNav\('#\/boards','My boards','boards'/);
 assert.match(sidebar,/sidebarNav\('#\/foundation','12-board foundation','foundation'/);
 assert.match(sidebar,/sidebarNav\('#\/security','Access acceptance','security'/);
 assert.match(sidebar,/sidebarNav\('#\/settings','Settings','settings'/);
 assert.match(sidebar,/sidebarNav\('#\/acceptance','Pages acceptance','acceptance'/);
 assert.match(sidebar,/sidebarNav\('#\/role-configuration','Role Configuration','roles'/);
 assert.match(sidebar,/sidebarNav\('#\/user-role-management','User Role Management','users'/);
 assert.match(sidebar,/state\.roleVerified===true/);
 assert.match(sidebar,/\(admin\?'/);
 assert.match(sidebar,/aria-label="Primary"/);
 assert.match(sidebar,/aria-label="Recent boards"/);
});
test('workspace and recent board lists use existing authorized state only',()=>{
 assert.match(sidebar,/e\(workspaceName\(\)\)/);
 assert.match(sidebar,/state\.boards\.slice\(0,6\)/);
 assert.match(sidebar,/const currentBoard=state\.boardId/);
 assert.match(sidebar,/href="#\/boards\/'\+e\(b\.id\)/);
 assert.match(sidebar,/e\(title\)/);
 assert.match(sidebar,/e\(name\(\)\)/);
 assert.match(sidebar,/e\(state\.context\?\.profile\?\.platform_role/);
 assert.match(sidebar,/data-action="logout"/);
 assert.doesNotMatch(sidebar,/(?:fetch|XMLHttpRequest|setItem|localStorage)\s*\(/);
});
test('brand uses approved image and retains the signed shell controls',()=>{
 assert.match(sidebar,/src="\.\/frontend\/apsyntra-logo\.webp"/);
 assert.match(sidebar,/href="#\/overview" class="brand"/);
 assert.match(app,/function shell\(body\)\{/);
 assert.match(app,/class="shell">\$\{sidebar\(\)\}<main class="main"/);
 assert.match(app,/animateSidebarSelection\(root\.querySelector\('\.aps-sidebar'\),state\.view\)/);
 assert.match(app,/stopSidebarSelection\(\)/);
 assert.match(app,/state\.context\?\.profile\?\.platform_role/);
});
test('constant SVG icon set excludes user-controlled markup and interactive handlers',()=>{
 for(const name of ['overview','boards','foundation','security','roles',
  'users','settings','acceptance','recent','logout']){
  const icon=sidebarIcon(name);
  assert.match(icon,/^<svg class="sidebar-svg-icon"/);
  assert.match(icon,/aria-hidden="true"/);
  assert.match(icon,/<\/svg>$/);
  assert.doesNotMatch(icon,/\son\w+=|\sstyle=|<script/);
 }
 assert.equal(sidebarIcon('unknown'),sidebarIcon('boards'));
});
test('sidebar styling is exclusively scoped and retains responsive accessibility',()=>{
 assert.match(html,/frontend\/sidebar-experience\.css/);
 assert.match(css,/#app \.aps-sidebar/);
 assert.match(css,/@media\(max-width:810px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.match(css,/\.nav-link:focus-visible/);
 assert.match(css,/\.sign-out:focus-visible/);
 assert.match(css,/\.sidebar-nav-scroll/);
 assert.match(css,/overflow-y:auto/);
 assert.match(css,/overscroll-behavior:contain/);
 assert.match(css,/height:100dvh/);
 assert.doesNotMatch(css,/url\(\s*https?:|@import|animation:.*infinite/);
 assert.match(smoke,/'frontend\/sidebar-experience\.css'/);
 assert.match(smoke,/'frontend\/sidebar-visuals\.js'/);
});
test('view-only native motion cancels on replacement and respects reduced motion',()=>{
 const oldWindow=globalThis.window;
 let calls=0,cancels=0,selectorCalls=0;
 const current={animate(frames,opts){
  calls++;
  assert.equal(frames.length,2);
  assert.equal(opts.duration,190);
  return {cancel(){cancels++;}};
 }};
 const side={isConnected:true,querySelector(sel){
  selectorCalls++;
  assert.equal(sel,'.nav-link.active');
  return current;
 }};
 try{
  globalThis.window={matchMedia:()=>({matches:false})};
  stopSidebarSelection();
  animateSidebarSelection(side,'overview');
  assert.equal(calls,1);
  animateSidebarSelection(side,'overview');
  assert.equal(calls,1,'re-render on same route must not replay animation');
  animateSidebarSelection(side,'boards');
  assert.equal(calls,2);
  assert.equal(cancels,1,'same-route replacement releases the previous animation');
  stopSidebarSelection();
  assert.equal(cancels,2);
  globalThis.window={matchMedia:()=>({matches:true})};
  animateSidebarSelection(side,'settings');
  assert.equal(calls,2,'reduced motion must suppress animation');
  assert.equal(selectorCalls,2,'reduced motion must avoid selector/WAAPI work');
 }finally{
  stopSidebarSelection();
  globalThis.window=oldWindow;
 }
});
test('sidebar visuals never fetch, change permissions, create GPU loops or inject CSSOM',()=>{
 const source=readFileSync('frontend/sidebar-visuals.js','utf8');
 assert.doesNotMatch(source,/WebGL|requestAnimationFrame|fetch\(|XMLHttpRequest|new Worker/);
 assert.doesNotMatch(source,/setAttribute\(\s*['"]style|\.style\s*\.|\.cssText\s*=/);
 assert.doesNotMatch(source,/auth\.|db\.|roleVerified|grant|permission|token/i);
});
