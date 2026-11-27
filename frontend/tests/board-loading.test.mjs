import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderBoardLoading,renderBoardLoadingError,setBoardLoadingVisibility} from '../board/presentation/loading.js';
const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/board-loading.css','utf8');
test('all applications render the same accessible indeterminate splash',()=>{
 const markup=renderBoardLoading();
 for(const application of ['TimeTracker','Fund Tracker','FuelTrack+','TradeLink','Board'])
  assert.equal(renderBoardLoading({application}),markup);
 assert.match(markup,/class="apx-loader" role="status" aria-live="polite" aria-atomic="true"/);
 assert.match(markup,/apsyntra-logo\.webp/);
 assert.match(markup,/Loading your workspace…/);
 assert.match(markup,/apx-loader__track" aria-hidden="true"/);
 assert.doesNotMatch(markup,/TimeTracker|aps-board-loading-preview|orbit|aria-valuenow|<script|<canvas|style=/);
});
test('visibility and reduced motion retain static loading status',()=>{
 assert.match(renderBoardLoading({hidden:true,lowPower:true}),/data-paused="true" data-quality="low"/);
 const node={dataset:{paused:'false'}};
 const root={querySelector(selector){assert.equal(selector,'.apx-loader');return node;}};
 setBoardLoadingVisibility(root,true);
 assert.equal(node.dataset.paused,'true');
 setBoardLoadingVisibility(root,false);
 assert.equal(node.dataset.paused,'false');
 setBoardLoadingVisibility(null,true);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/animation-play-state:paused/);
 assert.match(css,/data-aps-monday-theme="dark"/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/width:96px;height:3px/);
 assert.match(css,/width:64px;height:64px/);
});
test('denial remains actionable and escapes untrusted messages',()=>{
 const markup=renderBoardLoadingError('<svg onload="alert(1)">& test',{application:'TimeTracker'});
 assert.match(markup,/role="alert"/);
 assert.match(markup,/TimeTracker unavailable/);
 assert.match(markup,/href="#\/boards"/);
 assert.match(markup,/&lt;svg onload=&quot;alert\(1\)&quot;&gt;&amp; test/);
 assert.doesNotMatch(markup,/<svg|class="apx-loader"/);
});
test('native authorization and attendance read both use the shared splash',()=>{
 assert.ok(app.includes("if(applicationRouteRead){shell(sharedApplicationLoading());return;}"));
 assert.ok(app.includes("beginApplicationRouteRead('TimeTracker')"));
 assert.ok(app.includes("isCurrentApplicationRouteRead(token,applicationRouteRead"));
 assert.match(readFileSync('frontend/application-loading.js','utf8'),/currentHash===token.hash/);
 assert.match(app,/if\(\(state\.ttReadLoading\|\|state\.nativeInitialRead==='attendance'\)&&!state\.ttAttendance\)/);
 assert.match(app,/if\(\(state\.frtFinanceBusy\|\|state\.nativeInitialRead==='finance'\)&&!state\.frtFinance\)/);
 assert.match(app,/if\(\(state\.fuelTrackBackendBusy\|\|state\.nativeInitialRead==='fueltrack'\)&&!hasCurrentData\)/);
 assert.match(app,/if\(\(state\.loading\|\|state\.nativeInitialRead==='talkbox'\|\|talkBoxState\.busy\)&&!hasCurrentPage\)/);
 assert.ok(app.includes("state.ttReadLoading=false;state.ttBusy=false;render()"));
 assert.ok(app.includes("setBoardLoadingVisibility(root,document.hidden)"));
 for(const path of ['frontend/fm1/components.js','frontend/fueltrans-lazy.js','frontend/fueltrans/app.js'])
  assert.match(readFileSync(path,'utf8'),/renderBoardLoading\(\)/);
 assert.match(readFileSync('frontend/fueltrans-native.js','utf8'),/board-loading\.css/);
});
