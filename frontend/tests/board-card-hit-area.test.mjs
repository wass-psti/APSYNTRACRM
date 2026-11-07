import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD_CARD_LIFECYCLE_ENABLED,boardCardActionState}
 from '../board-card-lifecycle.js';

const app=readFileSync('frontend/app.js','utf8');
const catalogCss=readFileSync('frontend/board-catalog-experience.css','utf8');
const sharedCss=readFileSync('frontend/styles.css','utf8');
const start=app.indexOf('function boardCard(board,index){');
const end=app.indexOf('function empty(',start);
assert.ok(start>=0&&end>start);
const source=app.slice(start,end);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const renderCard=new Function('boardCardActionState','BOARD_CARD_LIFECYCLE_ENABLED',
 'e','iconColor','publicBoardDescription','displayDate',
 source+';return boardCard;')(
 boardCardActionState,BOARD_CARD_LIFECYCLE_ENABLED,esc,()=> 'blue',
 board=>board.description||'Description',()=> 'Nov 4, 2026'
);
const id='30000000-0000-4000-8000-000000000001';
const board={id,name:'Contacts',description:'Team contact list',
 item_count:3,member_role:'owner',updated_at:'2026-11-04T00:00:00Z',status:'active'};

test('catalog card uses one semantic navigational link and decorative icon',()=>{
 const markup=renderCard(board,0);
 assert.equal((markup.match(/<a\b/g)||[]).length,1);
 assert.equal((markup.match(/<\/a>/g)||[]).length,1);
 assert.match(markup,new RegExp('class="board-card-main" href="#/boards/'+id+'" aria-label="Open Contacts"'));
 assert.match(markup,/<span class="board-symbol blue" aria-hidden="true">C<\/span>/);
 assert.doesNotMatch(markup,/board-card-symbol-link|onclick=|role="button"|tabindex="0"/);
 assert.ok(markup.indexOf('</div><a class="board-card-main"')>markup.indexOf('</details>'));
 assert.match(app,/if\(parts\[0\]==='boards'&&validUuid\(parts\[1\]\)\)/);
 assert.match(app,/await loadBoard\(parts\[1\],requested(?:,|\))/);
});

test('stretched link covers card geometry including top whitespace and right side',()=>{
 assert.match(catalogCss,/#app \.aps-boards \.boards-catalog-grid \.board-card\{\s*position:relative;isolation:isolate/);
 assert.match(catalogCss,/\.board-card-main::after\{\s*content:"";position:absolute;inset:0;z-index:1;/);
 assert.match(catalogCss,/\.board-card-top\{\s*position:relative;z-index:2;pointer-events:none;/);
 assert.match(catalogCss,/\.board-card-actions\{\s*pointer-events:auto;position:relative;z-index:3;/);
 assert.doesNotMatch(catalogCss,/\.board-card-symbol-link:focus-visible/);
 assert.match(catalogCss,/\.board-card-main:focus-visible::after\{\s*outline:3px/);
 assert.doesNotMatch(catalogCss,/(?:^|\n)\s*body\s*\{/);
});

test('three-dot summary and menu actions remain separate from navigation',()=>{
 const markup=renderCard(board,0);
 const summary=markup.indexOf('<summary aria-label="Board actions for Contacts"');
 const details=markup.indexOf('<details class="board-card-actions">');
 const nav=markup.indexOf('<a class="board-card-main"');
 assert.ok(details>=0&&summary>details&&nav>summary);
 assert.ok(markup.indexOf('</details>')<nav,'no nested menu and navigation');
 assert.match(markup,/<button type="button" data-action="board-card-edit"/);
 assert.match(markup,/<button type="button" class="board-card-danger" data-action="board-card-trash"/);
 assert.match(sharedCss,/\.board-card-actions>summary:focus-visible/);
 assert.match(sharedCss,/touch-action:manipulation/);
 assert.match(app,/document\.addEventListener\('click',event=>\{/);
 assert.match(app,/closeBoardCardMenus\(active\)/);
 assert.match(app,/root\.addEventListener\('toggle',event=>\{/);
 assert.match(app,/case 'board-card-edit'/);
 assert.match(app,/case 'board-card-trash'/);
 assert.match(app,/case 'board-card-restore'/);
});

test('protected and non-owner board menus keep established server-guarded actions',()=>{
 for(const b of [
  {...board,name:'TimeTracker Attendance',
   description:'[APSYNTRA:MODULE:timetracker:v1] Attendance module'},
  {...board,member_role:'editor'}
 ]){
  const markup=renderCard(b,2);
  assert.match(markup,/class="board-card-actions"/);
  assert.match(markup,/class="board-card-actions-info"/);
  assert.equal((markup.match(/<a\b/g)||[]).length,1);
  assert.doesNotMatch(markup,/data-action="board-card-edit"|data-action="board-card-trash"/);
 }
 assert.match(app,/await db\.allowed\(id,'manage'\)/);
 assert.match(app,/closeBoardCardMenus\(\);hideModal\(\)/);
});

test('all boards share the renderer and responsive layout with independent focus',()=>{
 assert.match(app,/items\.map\(boardCard\)\.join\(''\)/);
 assert.match(catalogCss,/@media\(max-width:1150px\)/);
 assert.match(catalogCss,/@media\(max-width:650px\)/);
 assert.match(catalogCss,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(catalogCss,/\.board-card-actions>summary:focus-visible/);
 assert.match(catalogCss,/\.board-card-menu-open\{z-index:40\}/);
 assert.doesNotMatch(source,/addEventListener|stopPropagation\(|preventDefault\(/);
});
