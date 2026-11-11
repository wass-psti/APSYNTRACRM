import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardTable} from '../board-presentation.js';

const css=readFileSync('frontend/board-column-hover.css','utf8');
const page=readFileSync('index.html','utf8');
const app=readFileSync('frontend/app.js','utf8');
const ui=readFileSync('frontend/board-presentation.js','utf8');

test('BS03 stylesheet is loaded after bundled styles and keeps CSP-safe formatting',()=>{
 const bundle=page.indexOf('frontend/apsyntra-styles.bundle.css');
 const hover=page.indexOf('frontend/board-column-hover.css');
 assert.ok(bundle>=0&&hover>bundle);
 assert.doesNotMatch(css,/!important|style\s*=|expression\s*\(|@import/i);
 assert.match(css,/board-table-custom thead th/);
});
test('column menu remains a real accessible button and original actions remain wired',()=>{
 const html=boardTable({groupId:'11111111-1111-4111-8111-111111111111',
  columns:[{key:'record',title:'Record'},{key:'status',title:'Status'},
   {key:'asset',title:'Asset Tag No.'}],rows:[],virtualize:false});
 assert.match(html,/class="board-column-more" data-action="board-column-context"/);
 assert.match(html,/aria-haspopup="menu" aria-expanded="false"/);
 assert.match(html,/Column options for Asset Tag No\./);
 assert.match(html,/class="board-column-resize"/);
 assert.match(app,/case 'board-column-context':/);
 assert.match(app,/openBoardColumnContext\(button\)/);
 assert.match(app,/case 'board-column-hide':/);
 assert.match(app,/case 'board-column-set-width':/);
 assert.match(app,/function closeBoardColumnContext\(/);
 assert.match(ui,/board-column-handle/);
});
test('menu chrome hidden on mouse idle, but shown on hover, focus and while open',()=>{
 assert.match(css,/@media\s*\(hover:hover\)\s*and\s*\(pointer:fine\)/);
 assert.match(css,/opacity:0;\s*pointer-events:none/);
 assert.match(css,/:is\(:hover,:focus-within\)/);
 assert.match(css,/\[aria-expanded="true"\]/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\s*\(hover:none\),\s*\(pointer:coarse\)/);
 assert.match(css,/pointer-events:auto/);
 assert.match(css,/position:absolute/);
 assert.match(css,/border:1px solid transparent/);
 assert.match(css,/@media\s*\(prefers-reduced-motion:reduce\)/);
});
test('board-only selectors do not unintentionally hide global or group menus',()=>{
 assert.doesNotMatch(css,/\.board-actions-menu|\.board-group-actions|\.board-card-actions/);
 assert.match(css,/#app \.aps-board-shell \.board-table-custom thead th > \.board-column-more/);
});
