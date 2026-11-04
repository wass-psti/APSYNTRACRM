import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountBoardCatalogMotion,stopBoardCatalogMotion} from '../board-catalog-visuals.js';

const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/board-catalog-experience.css','utf8');
const html=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const start=app.indexOf('function boardsPage(){');
const end=app.indexOf('function groupRows(',start);
const catalog=app.slice(start,end);
const card=app.slice(app.indexOf('function boardCard(board,index){'),
 app.indexOf('function empty(',app.indexOf('function boardCard(board,index){')));

test('My boards catalogue is isolated to its own signed view and keeps the shared card renderer',()=>{
 assert.ok(start>0&&end>start);
 assert.match(catalog,/return \`<div class="aps-boards">/);
 assert.match(app,/classList\.toggle\('aps-boards-shell',state\.view==='boards'\)/);
 assert.match(app,/classList\.toggle\('aps-overview-shell',state\.view==='overview'\)/);
 assert.match(app,/mountBoardCatalogMotion\(root\.querySelector\('\.aps-boards'\),state\.view\)/);
 assert.match(app,/stopBoardCatalogMotion\(\)/);
 assert.match(catalog,/items\.map\(boardCard\)\.join\(''\)/);
 assert.match(catalog,/class="card-grid boards-catalog-grid boards-entrance"/);
 assert.match(html,/frontend\/board-catalog-experience\.css/);
 assert.match(smoke,/'frontend\/board-catalog-experience\.css'/);
 assert.match(smoke,/'frontend\/board-catalog-visuals\.js'/);
});

test('all ten requested areas retain exact functional hooks and signed state',()=>{
 assert.match(catalog,/id="boards-page-title"/);
 assert.match(catalog,/Everything your team is working on/);
 assert.match(catalog,/data-action="new-board"/);
 assert.match(catalog,/aria-label="Board status" role="group"/);
 assert.match(catalog,/data-action="active-boards"/);
 assert.match(catalog,/data-action="archived-boards"/);
 assert.match(catalog,/data-action="trashed-boards"/);
 assert.match(catalog,/BOARD_CARD_LIFECYCLE_ENABLED\?/);
 assert.match(catalog,/aria-pressed="/);
 assert.match(catalog,/id="board-search"/);
 assert.match(catalog,/type="search" class="search-input"/);
 assert.match(catalog,/aria-label="Search boards"/);
 assert.ok(catalog.includes('value="`+e(state.boardSearch)+`"'));
 assert.match(catalog,/id="board-search-result" role="status" aria-live="polite"/);
 assert.match(catalog,/items\.length/);
 assert.match(catalog,/class="boards-hero-decor"/);
 assert.match(app,/class="top-pill"/);
 assert.match(app,/class="avatar top-avatar"/);
 assert.match(app,/data-action="board-card-edit"/);
 assert.match(app,/data-action="board-card-restore"/);
 assert.match(app,/data-action="board-card-trash"/);
});

test('tab filters, search and lifecycle authorization behavior remain unchanged',()=>{
 assert.match(catalog,/const items=cards\(\)\.filter\(b=>matchBoardSearch\(b,state\.boardSearch\)\)/);
 assert.match(catalog,/const active=!state\.showArchived&&!state\.showTrash/);
 assert.match(app,/case 'active-boards':\{state\.showArchived=false;state\.showTrash=false;render\(\);break;\}/);
 assert.match(app,/case 'archived-boards':\{state\.showArchived=true;state\.showTrash=false/);
 assert.match(app,/case 'trashed-boards':\{if\(!BOARD_CARD_LIFECYCLE_ENABLED\)return;/);
 assert.match(app,/if\(event\.target\.id==='board-search'\)state\.boardSearch=event\.target\.value\.slice\(0,160\)/);
 assert.match(app,/row\.hidden=!row\.dataset\.searchable/);
 assert.match(app,/if\(result\)result\.textContent=matched\+' matching board'/);
 assert.match(app,/if\(hint\)hint\.hidden=matched!==0/);
 assert.match(catalog,/id="board-search-no-results" class="board-search-no-results" hidden/);
 assert.match(card,/boardCardActionState\(board\)/);
 assert.match(card,/status==='PROTECTED'/);
 assert.match(card,/class="board-card-actions"/);
 assert.match(card,/class="board-card-actions-list"/);
 assert.match(card,/class="board-card-main"/);
 assert.match(card,/class="board-symbol '/);
 assert.doesNotMatch(card,/class="board-card-symbol-link"/);
 assert.match(card,/aria-label="Open '/);
 assert.match(card,/data-id="'\+e\(board\.id\)/);
 assert.match(app,/await db\.allowed\(id,'manage'\)/);
 assert.match(app,/closeBoardCardMenus\(\)/);
});

test('filter layout, responsive cards, focus and hidden search items are explicitly styled',()=>{
 assert.match(css,/#app \.aps-boards-shell/);
 assert.match(css,/#app \.aps-boards/);
 assert.match(css, /@media\(max-width:1150px\)/);
 assert.match(css, /@media\(max-width:850px\)/);
 assert.match(css, /@media\(max-width:650px\)/);
 assert.match(css, /@media\(max-width:395px\)/);
 assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css, /@media\(prefers-contrast:more\)/);
 assert.match(css, /\.board-card\[hidden\]\{display:none!important\}/);
 assert.match(css, /\.boards-status-segments \.segment:focus-visible/);
 assert.match(css, /\.boards-create-button:focus-visible/);
 assert.match(css, /#board-search:focus-visible/);
 assert.match(css, /\.board-card-actions>summary:focus-visible/);
 assert.match(css, /\.board-card-actions-list button:focus-visible/);
 assert.match(css, /\.board-card-menu-open\{z-index:40\}/);
 assert.doesNotMatch(css, /@import|url\(\s*https?:|animation:.*infinite/);
 assert.doesNotMatch(catalog, /\sstyle="|\sonclick=|\soninput=/);
});

test('mounted boards components remain stationary on entry and refresh',()=>{
 let queries=0,animations=0;
 const node={isConnected:true,querySelectorAll(){queries++;return [{animate(){animations++;}}]},
  animate(){animations++;}};
 stopBoardCatalogMotion();
 mountBoardCatalogMotion(node,'boards');
 mountBoardCatalogMotion(node,'boards');
 mountBoardCatalogMotion(null,'overview');
 mountBoardCatalogMotion(node,'boards');
 stopBoardCatalogMotion();
 assert.equal(queries,0,'no entrance element traversal');
 assert.equal(animations,0,'no mount-time animations');
 const source=readFileSync('frontend/board-catalog-visuals.js','utf8');
 assert.doesNotMatch(source,/\.animate\s*\(|translate3d\(|requestAnimationFrame\s*\(/);
});
test('short, hidden and reduced-motion states cannot start a continuous GPU loop',()=>{
 const js=readFileSync('frontend/board-catalog-visuals.js','utf8');
 assert.doesNotMatch(js,/WebGL|requestAnimationFrame|setInterval|fetch\(|XMLHttpRequest|new Worker/);
 assert.doesNotMatch(js,/\.style\s*\.|\.cssText\s*=|setAttribute\s*\(\s*['"]style/);
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 let played=0;
 const root={isConnected:true,querySelectorAll(){return [{animate(){played++;}}];}};
 try{
  globalThis.window={matchMedia:()=>({matches:false})};
  globalThis.document={hidden:true};
  stopBoardCatalogMotion();
  mountBoardCatalogMotion(root,'boards');
  assert.equal(played,0);
  stopBoardCatalogMotion();
  globalThis.document={hidden:false};
  mountBoardCatalogMotion({...root,isConnected:false},'boards');
  assert.equal(played,0);
 }finally{
  stopBoardCatalogMotion();
  globalThis.window=oldWindow;globalThis.document=oldDocument;
 }
});
