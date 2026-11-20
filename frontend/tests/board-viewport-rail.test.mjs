import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardHorizontalMetrics} from '../board/presentation/horizontal-rail.js';

test('viewport rail appears only for true horizontal overflow and uses widest group',()=>{
 assert.deepEqual(boardHorizontalMetrics([{scrollWidth:1460},{scrollWidth:1710}],1000),
  {contentWidth:1710,overflow:true});
 assert.deepEqual(boardHorizontalMetrics([{scrollWidth:920}],1000),
  {contentWidth:920,overflow:false});
 assert.deepEqual(boardHorizontalMetrics([],1000),
  {contentWidth:0,overflow:false});
 assert.equal(boardHorizontalMetrics([{scrollWidth:1001}],1000).overflow,false);
 assert.equal(boardHorizontalMetrics([{scrollWidth:1002}],1000).overflow,true);
});

test('board viewport rail is mounted in both full and incremental render paths',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/import \{mountBoardHorizontalRail\} from '\.\/board\/presentation\/horizontal-rail\.js'/);
 assert.match(app,/data-board-horizontal-rail-slot/);
 assert.match(app,/data-board-horizontal-rail-spacer/);
 assert.match(app,/mountBoardPaginationUi\(\);\s*mountBoardHorizontalRail\(root\);/);
 assert.match(app,/mountBoardPaginationUi\(\);\s*}\s*mountBoardHorizontalRail\(root\);/);
 assert.match(app,/board-collapsed-rollup-scroll,\[data-board-horizontal-rail\]/);
});

test('single search icon and raised popovers are included in delivered CSS',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const css=readFileSync('frontend/monday-inspired-ui.css','utf8');
 const bundle=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
 assert.match(app,/class="search-wrap board-toolbar-search"/);
 assert.match(app,/class="board-toolbar-search-icon"/);
 assert.match(app,/placeholder="Search"/);
 assert.doesNotMatch(app,/placeholder="⌕ Search…"/);
 assert.match(css,/board-toolbar-search::before\{\s*content:none!important/);
 assert.match(css,/#search-board-items\{[^}]*padding:0 12px 0 35px!important/s);
 assert.match(css,/board-customize-toolbar:has\(>details\[open\]\)/);
 assert.match(css,/board-horizontal-rail-slot\{\s*position:sticky;bottom:0/);
 assert.match(bundle,/BOARD-VIEWPORT-RAIL-01/);
});
