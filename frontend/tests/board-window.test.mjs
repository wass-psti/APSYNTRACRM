import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardTable} from '../board-presentation.js';
import {boardItemsComplete} from '../board-grid.js';
import {BOARD_WINDOW_THRESHOLD,BOARD_WINDOW_SIZE,boardWindowSlice,
 resetBoardWindows,visibleBoardWindowIds} from '../board-window.js';
const id=i=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
const rows=Array.from({length:500},(_,i)=>({itemId:id(i),search:'record '+i,
 cells:{record:'Record '+i,status:'Ready'}}));
const columns=[{key:'record',title:'Item'},{key:'status',title:'Status'}];
test('small board tables retain all rows and existing selection structure',()=>{
 resetBoardWindows();
 const html=boardTable({columns,rows:rows.slice(0,BOARD_WINDOW_THRESHOLD-1),groupId:'small',
  selection:{enabled:true,selected:new Set()}});
 assert.equal((html.match(/data-bulk-row=/g)||[]).length,BOARD_WINDOW_THRESHOLD-1);
 assert.doesNotMatch(html,/data-board-virtual/);
 assert.match(html,/board-select-all-small/);
});
test('large, fully loaded boards render bounded rows with correct spacer geometry',()=>{
 resetBoardWindows();
 const html=boardTable({columns,rows,groupId:'large',selection:{enabled:true,selected:new Set()}});
 assert.match(html,/data-board-virtual="true" aria-rowcount="501"/);
 assert.ok((html.match(/data-bulk-row=/g)||[]).length<=BOARD_WINDOW_SIZE);
 assert.match(html,/board-virtual-spacer/);
 assert.equal(visibleBoardWindowIds('large').length,500);
 assert.match(html,/Record 0/);
 assert.doesNotMatch(html,/Record 499/);
 resetBoardWindows();assert.equal(visibleBoardWindowIds('large'),null);
});
test('window slices have bounded lengths and maintain full scroll height',()=>{
 for(const position of [0,1200,12000,25000]){
  const view=boardWindowSlice(500,position,900);
  assert.ok(view.start>=0&&view.end<=500&&view.end>=view.start);
  assert.ok(view.end-view.start<=BOARD_WINDOW_SIZE+18);
  assert.equal(view.above+view.below+(view.end-view.start)*52,500*52);
 }
});
test('partial server pages are never virtualized or mistaken for full loaded board data',()=>{
 const detail={items:rows.slice(0,250),pagination:{next_cursor:'opaque-cursor'}};
 assert.equal(boardItemsComplete(detail),false);
 assert.equal(boardItemsComplete({items:rows.slice(0,100),total_count:500}),false);
 assert.equal(boardItemsComplete({items:rows}),true);
 resetBoardWindows();
 const html=boardTable({columns,rows,groupId:'partial',virtualize:boardItemsComplete(detail)});
 assert.doesNotMatch(html,/data-board-virtual/);
 assert.equal((html.match(/data-searchable=/g)||[]).length,500);
});
test('Priority 2 integrates scoped local filtering, group selection and lifecycle disposal',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/resetBoardWindows\(\)/);
 assert.match(source,/mountBoardWindows\(root,syncBoardSelectionUi\)/);
 assert.match(source,/applyBoardItemFilter\(state\.boardItemSearch\)/);
 assert.match(source,/visibleGroupSelectionIds\(input\.dataset\.boardSelectAll\)/);
 assert.match(source,/visibleSelectionOrder\(\)/);
 assert.match(source,/if\(event\.target\.id==='search-board-items'&&state\.view==='board'&&state\.tab==='items'\)/);
 assert.doesNotMatch(readFileSync(new URL('../board-window.js',import.meta.url),'utf8'),
  /localStorage|sessionStorage|indexedDB|caches\.open/);
});

test('Priority 5 avoids unchanged-query DOM reconstruction and normalizes searchable rows once',()=>{
 const source=readFileSync(new URL('../board-window.js',import.meta.url),'utf8');
 assert.match(source,/lastQuery:''/);
 assert.match(source,/searchIndex:rows\.map\(row=>String\(row\.search\|\|''\)\.toLocaleLowerCase\(\)\)/);
 assert.match(source,/if\(model\.lastQuery===needle\)continue/);
 assert.match(source,/model\.searchIndex\[index\]\.includes\(needle\)/);
});
