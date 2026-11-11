import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardTable} from '../board-presentation.js';
const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/soft-minimalist.css','utf8');
test('board view labels are native draggable links, with no visible reorder-arrow buttons',()=>{
 assert.match(app,/class="tabs board-draggable-tabs"/);
 assert.match(app,/data-board-tab=/);
 assert.match(app,/draggable=/);
 assert.doesNotMatch(app,/class="board-tab-reorder"/);
 assert.match(app,/aria-keyshortcuts="Alt\+Shift\+ArrowLeft Alt\+Shift\+ArrowRight"/);
});
test('column headers are draggable and focusable, with no grip button',()=>{
 const html=boardTable({groupId:'11111111-1111-4111-8111-111111111111',
  columns:[{key:'record',title:'Record'},{key:'status',title:'Status'},
   {key:'owner',title:'Owner'},{key:'quantity',title:'Quantity'}],rows:[],virtualize:false});
 assert.match(html,/data-column-key="owner" draggable="true" tabindex="0"/);
 assert.match(html,/data-column-key="quantity" draggable="true" tabindex="0"/);
 assert.doesNotMatch(html,/board-column-handle|Drag to reorder .* column/);
 assert.match(html,/class="board-column-more" data-action="board-column-context"/);
 assert.match(html,/class="board-column-resize"/);
 assert.match(css,/th\[draggable="true"\]:focus-visible/);
 assert.doesNotMatch(css.slice(css.indexOf('/* BS03')),/board-column-handle/);
});
test('pointer gestures drag header surfaces without stealing menus, selections or resize',()=>{
 assert.match(app,/event\.target\.closest\('th\[data-column-key\]\[draggable="true"\]'\)/);
 assert.match(app,/event\.target\.closest\('button,input,textarea,select,\[contenteditable\]'\)/);
 assert.match(app,/BOARD_REQUIRED_COLUMNS\.includes\(key\)/);
 assert.match(app,/moveBoardPresentation\(kind,key,to\)/);
 assert.match(app,/event\.target\.closest\('\.board-column-more,\.board-column-resize,input,textarea,select,\[contenteditable\]'\)/);
});
test('keyboard reordering shares existing authorization-aware persistence',()=>{
 assert.match(app,/root\.addEventListener\('keydown',event=>\{/);
 assert.match(app,/event\.altKey\|\|!event\.shiftKey/);
 assert.match(app,/moveBoardPresentation\(kind,key,to\)/);
 assert.match(app,/moveManagedTimeTrackerTab\(from,to\)/);
 assert.match(app,/persistItemOnlyColumnOrder\(reorderVisible\(movable,from,to\)\)/);
});
