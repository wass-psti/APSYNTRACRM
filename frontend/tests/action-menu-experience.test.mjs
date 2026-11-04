import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 ACTION_MENU_SELECTORS,ACTION_MENU_MAX_ITEMS,actionIconName,
 lucideIconNodes,createLucideActionIcon,nextActionIndex,actionTypeahead,
 enhanceActionContextMenu,startActionMenuExperience
} from '../action-menu-experience.js';
import {loadPinnedFloatingUI,FLOATING_CORE_URL,FLOATING_SELECT_URL}
 from '../select-experience.js';

const source=readFileSync('frontend/action-menu-experience.js','utf8');
const css=readFileSync('frontend/action-menu-experience.css','utf8');
const app=readFileSync('frontend/app.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const board=readFileSync('frontend/board-presentation.js','utf8');

test('global enhancement targets real action menus, not generic disclosure controls',()=>{
 assert.deepEqual(ACTION_MENU_SELECTORS,[
  '.board-card-actions','.board-group-actions','.board-actions-menu'
 ]);
 assert.equal(ACTION_MENU_MAX_ITEMS,32);
 for(const name of ACTION_MENU_SELECTORS)
  assert.match(app,new RegExp(name.slice(1)));
 assert.match(source,/querySelectorAll\?\.\(ACTION_MENU_SELECTORS\.join\(','\)\)/);
 assert.doesNotMatch(ACTION_MENU_SELECTORS.join(' '),/board-bulk-probe-details|tt-log-detail|board-column-menu/);
 assert.match(source,/if\(!trigger\|\|!menu\)return/);
});

test('Lucide SVG geometry is local, decorative, bounded and never injects HTML',()=>{
 const names=['ellipsis-vertical','pencil','trash-2','rotate-ccw','users',
  'settings-2','columns-3','check-square','ruler','layout-grid','shield-alert'];
 for(const name of names){
  const nodes=lucideIconNodes(name);
  assert.ok(nodes.length>=1,name);
  assert.ok(nodes.every(([tag,attrs])=>
   ['path','circle','rect'].includes(tag)&&Object.keys(attrs)
    .every(key=>['d','x','y','width','height','rx','cx','cy','r'].includes(key))),name);
 }
 const seen=[];
 const doc={createElementNS:(ns,tag)=>{
  assert.equal(ns,'http://www.w3.org/2000/svg');
  const node={tag,attributes:{},children:[],
   setAttribute(name,value){this.attributes[name]=String(value);},
   append(child){this.children.push(child);}};
  seen.push(node);return node;
 }};
 const svg=createLucideActionIcon('ellipsis-vertical',doc);
 assert.equal(svg.tag,'svg');
 assert.equal(svg.attributes['aria-hidden'],'true');
 assert.equal(svg.attributes.stroke,'none');
 assert.equal(svg.attributes.fill,'currentColor');
 assert.equal(svg.attributes.class,'aps-action-icon aps-ellipsis-icon');
 assert.equal(svg.children.length,3);
 assert.ok(svg.children.every(x=>x.tag==='circle'));
 assert.equal(createLucideActionIcon('pencil',null),null);
 assert.doesNotMatch(source,/innerHTML\s*=|insertAdjacentHTML|setHTML\(|eval\(/);
 assert.doesNotMatch(source,/fetch\(|\.rpc\(|\.commit\(|geolocation|localStorage|sessionStorage|sendBeacon/);
});

test('action icon mapping remains decorative and never changes authorization',()=>{
 assert.equal(actionIconName('board-card-trash'),'trash-2');
 assert.equal(actionIconName('board-card-restore'),'rotate-ccw');
 assert.equal(actionIconName('board-card-edit'),'pencil');
 assert.equal(actionIconName('group-select-visible'),'check-square');
 assert.equal(actionIconName('board-members'),'users');
 assert.equal(actionIconName('board-column-set-width'),'ruler');
 assert.equal(actionIconName('board-column-delete-custom'),'trash-2');
 assert.equal(actionIconName('unexpected'),'settings-2');
 assert.match(app,/await db\.allowed\(id,'manage'\)/);
 assert.match(app,/await boardCardLifecycle\.trash\(board/);
 assert.match(app,/state\.boardManage/);
});

test('menu keyboard indexing wraps, skips disabled, and honors typeahead',()=>{
 const entries=[
  {disabled:false,label:'Edit'},
  {disabled:true,label:'Delete'},
  {disabled:false,label:'Restore'},
  {disabled:false,label:'Reset'}
 ];
 assert.equal(nextActionIndex(entries,-1,1),0);
 assert.equal(nextActionIndex(entries,0,1),2);
 assert.equal(nextActionIndex(entries,3,1),0);
 assert.equal(nextActionIndex(entries,0,-1),3);
 assert.equal(nextActionIndex(entries,0,0),0);
 assert.equal(nextActionIndex([{disabled:true}],0,1),-1);
 assert.equal(nextActionIndex([],0,1),-1);
 assert.equal(actionTypeahead(entries,'r',0),2);
 assert.equal(actionTypeahead(entries,'r',2),3);
 assert.equal(actionTypeahead(entries,'de',0),-1);
 assert.equal(actionTypeahead(entries,'E',3),0);
 assert.equal(actionTypeahead(entries,'notfound'),-1);
});

test('WAI-ARIA button/menu/menuitem semantics and keyboard support are implemented',()=>{
 for(const fragment of ["'button'","'menu'","'menuitem'","'aria-haspopup'",
  "'aria-expanded'","'aria-controls'","'aria-labelledby'",
  "'aria-disabled'","'Escape'","'Tab'","'ArrowDown'","'ArrowUp'",
  "'Home'","'End'","'Enter'"])
  assert.ok(source.includes(fragment),fragment);
 assert.match(source,/trigger\.setAttribute\('aria-expanded',String\(details\.open\)\)/);
 assert.match(source,/event\.stopPropagation\(\);/);
 assert.match(source,/event\.preventDefault\(\);/);
 assert.match(source,/close\(true\)/);
 assert.match(source,/queueMicrotask\(/);
 assert.match(source,/details\.addEventListener\('focusout'/);
 assert.match(source,/details\.addEventListener\('toggle'/);
 assert.match(source,/details\.open=false/);
});

test('app continues dispatching original data-action commands for authorized board actions',()=>{
 for(const action of ['board-card-edit','board-card-trash','board-card-restore',
  'group-inline-edit','group-select-visible','board-members','board-structure',
  'board-layout-reset','board-column-context','board-column-set-width',
  'board-column-reset-width','board-column-delete-custom']){
  assert.ok(app.includes(action),action);
 }
 assert.match(app,/root\.addEventListener\('click',event=>/);
 assert.match(app,/Promise\.resolve\(action\(target\.dataset\.action,target\)\)/);
 assert.match(app,/state\.edit\?'<details class="board-group-actions"/);
 assert.match(app,/boardCardActionState\(board\)/);
 assert.match(board,/class="board-column-more"/);
 assert.match(source,/item\.setAttribute\('role','menuitem'\)/);
 assert.match(source,/item\.tabIndex=-1/);
});

test('column-header context menu reuses unified semantics but retains existing close and handlers',()=>{
 assert.match(app,/enhanceActionContextMenu\(trigger,node,\{/);
 assert.match(app,/boardColumnMenuCleanup\?\.\(\)/);
 assert.match(app,/closeBoardColumnContext\(\)/);
 assert.match(app,/case 'board-column-context'/);
 assert.match(app,/case 'board-column-manage'/);
 assert.match(app,/case 'board-column-delete-custom'/);
 assert.match(source,/export function enhanceActionContextMenu/);
 assert.match(source,/trigger\.setAttribute\('aria-haspopup','menu'\)/);
 assert.match(source,/keyboard\.focusBoundary\(\)/);
});

test('Floating UI is shared, pinned, no extra CSP origin or inline CSS required',()=>{
 assert.equal(FLOATING_CORE_URL,
  'https://unpkg.com/@floating-ui/core@1.8.0/dist/floating-ui.core.umd.min.js');
 assert.equal(FLOATING_SELECT_URL,
  'https://unpkg.com/@floating-ui/dom@1.8.0/dist/floating-ui.dom.umd.min.js');
 assert.equal(typeof loadPinnedFloatingUI,'function');
 assert.match(source,/import \{loadPinnedFloatingUI\} from '\.\/select-experience\.js'/);
 for(const key of ['computePosition','autoUpdate','offset','flip','shift','size'])
  assert.ok(source.includes('lib.'+key),key);
 assert.match(source,/strategy:'absolute'/);
 assert.match(source,/classList\.toggle\('aps-menu-above'/);
 assert.doesNotMatch(source,/\.style\s*\.|\.style\s*=|\.cssText\s*=|setAttribute\s*\(\s*["']style["']/);
 assert.match(index,/script-src 'self' https:\/\/unpkg\.com;/);
 assert.match(index,/style-src-attr 'none'/);
 assert.doesNotMatch(index,/cdn\.jsdelivr\.net/);
 assert.doesNotMatch(source,/new Worker|WebAssembly|Motion\.|motion\(/);
});

test('lifecycle uses one observer and no recurring timers or telemetry',()=>{
 assert.match(source,/new MutationObserver\(/);
 assert.match(source,/observer\.disconnect\(\)/);
 assert.match(source,/new AbortController\(/);
 assert.match(source,/doc\.addEventListener\('pointerdown',outside,true\)/);
 assert.match(source,/doc\.removeEventListener\('pointerdown',outside,true\)/);
 assert.match(source,/controller\.destroy\(\)/);
 assert.match(source,/stopPosition\?\.\(\)/);
 assert.match(source,/prefers-reduced-motion: reduce/);
 assert.match(source,/menu\.animate\(\[/);
 assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame\(|sendBeacon|performance\.observer/i);
 assert.equal(typeof startActionMenuExperience(null),'function');
});

test('shared CSS is strict-CSP, keyboard focused, responsive and reduced-motion aware',()=>{
 for(const piece of ['--aps-action-ink','--aps-action-accent',
  '.aps-action-surface','.aps-action-popover','.aps-action-icon',
  '.board-column-more','.board-header-context-menu',
  '.aps-menu-above','.aps-menu-align-start',
  ':focus-visible','@supports (anchor-name:',
  '@media(max-width:720px)','@media(prefers-reduced-motion:reduce)',
  '@media(prefers-contrast:more)','@media(forced-colors:active)'])
  assert.ok(css.includes(piece),piece);
 assert.doesNotMatch(css,/@import|url\(https?:|@keyframes|animation:.*infinite|will-change/);
 assert.match(css,/box-shadow:var\(--aps-action-shadow\)/);
});

test('Pages registers global action menu assets after global selection assets',()=>{
 assert.match(app,/import \{startActionMenuExperience,enhanceActionContextMenu\} from '\.\/action-menu-experience\.js'/);
 assert.ok(app.indexOf('startActionMenuExperience(document.body)')>
  app.indexOf('startSelectExperience(document.body)'));
 assert.ok(index.indexOf('frontend/action-menu-experience.css')>
  index.indexOf('frontend/select-experience.css'));
 assert.match(smoke,/'frontend\/action-menu-experience\.js'/);
 assert.match(smoke,/'frontend\/action-menu-experience\.css'/);
 assert.match(index,/script type="module" src="\.\/frontend\/app\.js"/);
});
