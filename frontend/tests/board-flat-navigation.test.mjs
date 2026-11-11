import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/soft-minimalist.css','utf8');
const flat=css.slice(css.indexOf('/* APSYNTRA board hierarchy'));
test('board page identifies workspace and board, while view navigation declares active route',()=>{
 assert.match(app,/Workspace \/ \$\{e\(workspaceName\(\)\)\} \/ Board/);
 assert.match(app,/data-board-tab=/);
 assert.match(app,/aria-selected=/);
 assert.match(app,/aria-current="page"/);
 assert.match(app,/class="tabs board-draggable-tabs"/);
});
test('flat page, tab navigation and toolbar avoid nested boxed cards',()=>{
 assert.match(flat,/\.page-head\{[\s\S]*?background:transparent;[\s\S]*?box-shadow:none;/);
 assert.match(flat,/\.tabs\.board-draggable-tabs\{[\s\S]*?border-bottom:1px solid/);
 assert.match(flat,/\.board-tab-slot > \.tab\[aria-current="page"\]/);
 assert.match(flat,/border-bottom-color:var\(--sm-accent\)/);
 assert.match(flat,/\.toolbar\.board-customize-toolbar\{[\s\S]*?background:transparent;/);
 assert.match(flat,/\.group-heading\{[\s\S]*?box-shadow:none;/);
});
test('grid remains bounded and drag and column menus are preserved',()=>{
 assert.match(flat,/\.panel\.board-group-panel\{[\s\S]*?border-left:3px solid/);
 assert.match(app,/drag to reorder; Alt\+Shift/i);
 assert.match(app,/case 'board-column-context':/);
 assert.match(app,/moveBoardPresentation\(kind,key,to\)/);
 assert.match(flat,/sidebar-recent-link\.active\[aria-current="page"\]/);
 assert.doesNotMatch(flat,/@import|@charset|url\(/);
});
