import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 renderBoardLoading,renderBoardLoadingError,setBoardLoadingVisibility
} from '../board-loading.js';

const app=readFileSync('frontend/app.js','utf8');
const html=readFileSync('index.html','utf8');
const css=readFileSync('frontend/board-loading.css','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

test('loading is scoped to signed board initialization, with honest status and indeterminate progress',()=>{
 const markup=renderBoardLoading();
 assert.match(markup,/class="panel aps-board-loading"/);
 assert.match(markup,/role="status" aria-live="polite" aria-atomic="true"/);
 assert.match(markup,/Retrieving authorized board details…/);
 assert.match(markup,/aps-board-loading-progress[^"]*" aria-hidden="true"/);
 assert.match(markup,/class="aps-board-loading-preview" aria-hidden="true"/);
 assert.match(markup,/Loading board…/);
 assert.doesNotMatch(markup,/aria-valuenow|aria-valuemax|progress="\d+"|\b\d{1,3}%\b/);
 assert.doesNotMatch(markup,/<script|<canvas|style=|<iframe|<form/i);
});

test('adaptive states use static presentation flags and never add active timers',()=>{
 const paused=renderBoardLoading({hidden:true,lowPower:true});
 assert.match(paused,/data-paused="true"/);
 assert.match(paused,/data-quality="low"/);
 const active=renderBoardLoading({hidden:false,lowPower:false});
 assert.match(active,/data-paused="false"/);
 assert.match(active,/data-quality="full"/);
 assert.doesNotMatch(paused,/setTimeout|requestAnimationFrame|setInterval|WebGL/);
});

test('visibility changes only pause the current loading panel without listeners',()=>{
 const node={dataset:{paused:'false'}};
 const root={querySelector(selector){
  assert.equal(selector,'.aps-board-loading');return node;
 }};
 setBoardLoadingVisibility(root,true);
 assert.equal(node.dataset.paused,'true');
 setBoardLoadingVisibility(root,false);
 assert.equal(node.dataset.paused,'false');
 setBoardLoadingVisibility({querySelector:()=>null},true);
 setBoardLoadingVisibility(null,true);
});

test('board errors remain actionable, do not retain loading animation, and escape untrusted messages',()=>{
 const message='<svg onload="alert(1)">& test';
 const markup=renderBoardLoadingError(message);
 assert.match(markup,/role="alert"/);
 assert.match(markup,/Board unavailable/);
 assert.match(markup,/Back to boards/);
 assert.match(markup,/href="#\/boards"/);
 assert.match(markup,/&lt;svg onload=&quot;alert\(1\)&quot;&gt;&amp; test/);
 assert.doesNotMatch(markup,/<svg|class="aps-board-loading"/);
});

test('only the board loading and unavailable branches use new presentation',()=>{
 assert.match(app,/if\(state\.loading\)return renderBoardLoading\(\{/);
 assert.match(app,/if\(!state\.board\)return renderBoardLoadingError\(state\.error\)/);
 assert.match(app,/state\.view='board';state\.boardId=boardId;state\.tab=tab;state\.loading=true/);
 assert.match(app,/finally\{if\(seq===routeSerial\)\{state\.loading=false;render\(\);\}\}/);
 assert.match(app,/setBoardLoadingVisibility\(root,document\.hidden\)/);
 assert.match(app,/navigator\.connection\?\.saveData===true/);
 assert.match(app,/navigator\.deviceMemory<=4/);
});

test('effects remain board-scoped, compositor-friendly, accessible, and dependency free',()=>{
 assert.match(css,/#app \.aps-board-shell \.aps-board-loading/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.match(css,/animation-play-state:paused/);
 assert.match(css,/translateX\(/);
 assert.match(css,/rotate\(/);
 assert.doesNotMatch(css,/animation:\s*.*(?:top|left|width|height)|will-change|@import|url\(https?:|backdrop-filter/);
 assert.doesNotMatch(css,/(?:^|\n)\s*body\s*\{|(?:^|\n)\s*\.page-head\s*\{/);
 assert.doesNotMatch(readFileSync('frontend/board-loading.js','utf8'),
  /from ['"](?:react|three|gsap|@react-three|motion)/);
});

test('loader assets are linked after the shared visual system and checked in Pages CI',()=>{
 const loaderLink='./frontend/board-loading.css';
 assert.ok(html.includes(loaderLink));
 assert.ok(html.indexOf(loaderLink)>html.indexOf('./frontend/board-visual-refresh.css'));
 assert.match(smoke,/frontend\/board-loading\.js/);
 assert.match(smoke,/frontend\/board-loading\.css/);
});
