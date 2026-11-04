import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 ACTION_MENU_SELECTORS,actionIconName,
 lucideIconNodes,createLucideActionIcon
} from '../action-menu-experience.js';
const js=readFileSync('frontend/action-menu-experience.js','utf8');
const css=readFileSync('frontend/action-menu-experience.css','utf8');
const app=readFileSync('frontend/app.js','utf8');
const board=readFileSync('frontend/board-presentation.js','utf8');
const overlay=readFileSync('frontend/foreground-overlay.js','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

function mockDocument(){
 return {createElementNS(namespace,name){
  assert.equal(namespace,'http://www.w3.org/2000/svg');
  return {tagName:name,attrs:new Map(),children:[],
   setAttribute(k,v){this.attrs.set(k,String(v));},
   append(child){this.children.push(child);},
   getAttribute(k){return this.attrs.get(k)||null;}};
 }};
}
test('vertical ellipsis has three identical filled dots symmetric in a 24px icon grid',()=>{
 const points=lucideIconNodes('ellipsis-vertical');
 assert.deepEqual(points,[
  ['circle',{cx:12,cy:5,r:1.5}],
  ['circle',{cx:12,cy:12,r:1.5}],
  ['circle',{cx:12,cy:19,r:1.5}]
 ]);
 const svg=createLucideActionIcon('ellipsis-vertical',mockDocument());
 assert.equal(svg.getAttribute('viewBox'),'0 0 24 24');
 assert.equal(svg.getAttribute('width'),'18');
 assert.equal(svg.getAttribute('height'),'18');
 assert.equal(svg.getAttribute('fill'),'currentColor');
 assert.equal(svg.getAttribute('stroke'),'none');
 assert.equal(svg.getAttribute('class'),'aps-action-icon aps-ellipsis-icon');
 assert.equal(svg.getAttribute('aria-hidden'),'true');
 assert.equal(svg.getAttribute('focusable'),'false');
 assert.deepEqual(svg.children.map(node=>node.tagName),['circle','circle','circle']);
 assert.equal(svg.children[0].attrs.get('r'),'1.5');
});
test('all other Lucide menu glyphs remain 17px stroke icons',()=>{
 const document=mockDocument();
 for(const name of ['pencil','trash-2','ruler','columns-3','rotate-ccw','users','settings-2']){
  const svg=createLucideActionIcon(name,document);
  assert.equal(svg.getAttribute('width'),'17',name);
  assert.equal(svg.getAttribute('height'),'17',name);
  assert.equal(svg.getAttribute('stroke'),'currentColor',name);
  assert.equal(svg.getAttribute('fill'),'none',name);
  assert.equal(svg.getAttribute('viewBox'),'0 0 24 24',name);
 }
 assert.equal(actionIconName('board-column-set-width'),'ruler');
 assert.equal(actionIconName('board-column-reset-width'),'rotate-ccw');
 assert.equal(actionIconName('board-column-manage'),'columns-3');
 assert.equal(actionIconName('board-column-delete-custom'),'trash-2');
});
test('global component selectors cover overview/card/group/board/column action menus',()=>{
 assert.deepEqual(ACTION_MENU_SELECTORS,[
  '.board-card-actions','.board-group-actions','.board-actions-menu'
 ]);
 for(const name of ACTION_MENU_SELECTORS)
  assert.ok(app.includes(name),name);
 assert.match(board,/class="board-column-more"/);
 assert.match(js,/button\.classList\.add\('aps-ellipsis-trigger'\)/);
 assert.match(js,/trigger\.classList\.add\('aps-ellipsis-trigger'\)/);
 assert.match(js,/if\(replaceTrigger&&!trigger\.querySelector\('\.aps-ellipsis-icon'\)\)/);
 assert.match(js,/trigger\.replaceChildren\(icon\)/);
 assert.match(js,/button\.replaceChildren\(svg\)/);
 assert.match(app,/class="board-card-actions"/);
 assert.match(app,/class="board-group-actions"/);
 assert.match(app,/class="board-actions-menu"/);
 assert.match(app,/node\.className='board-header-context-menu'/);
});
test('icon and menuitem CSS is global to #app, not dependent on .aps-board-shell',()=>{
 for(const expected of [
  '#app svg.aps-action-icon',
  '#app svg.aps-action-icon.aps-ellipsis-icon',
  '#app svg.aps-ellipsis-icon>circle',
  '#app :is(summary.aps-ellipsis-trigger,button.aps-ellipsis-trigger)',
  '#app .aps-action-popover',
  '#app .aps-action-popover>:is([role="menuitem"],button[data-action],a[href])',
  '#app .aps-action-popover>:is([role="menuitem"],button[data-action],a[href])>svg.aps-action-icon',
  '#app .board-actions-menu>summary.aps-ellipsis-trigger'
 ])assert.ok(css.includes(expected),expected);
 const chunk=css.slice(css.indexOf('/* CP-CRM-ACTION-ICON-02'));
 assert.ok(chunk.length>1500);
 assert.match(chunk,/width:17px;height:17px/);
 assert.match(chunk,/width:18px;height:18px/);
 assert.match(chunk,/display:inline-flex/);
 assert.match(chunk,/align-items:center;justify-content:center/);
 assert.match(chunk,/flex:0 0 17px/);
 assert.match(chunk,/max-width:17px;max-height:17px/);
 assert.match(chunk,/@media\(max-width:720px\)/);
 assert.match(chunk,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(chunk,/@media\(prefers-contrast:more\)/);
 assert.match(chunk,/@media\(forced-colors:active\)/);
 assert.doesNotMatch(chunk,/url\(|@import|z-index:\s*\d+|position:fixed|position-anchor/);
});
test('shared SVGs remain decorative with existing keyboard, action, and overlay behavior',()=>{
 assert.match(js,/setAttribute\('aria-hidden','true'\)/);
 assert.match(js,/setAttribute\('focusable','false'\)/);
 assert.match(js,/trigger\.setAttribute\('aria-haspopup','menu'\)/);
 assert.match(js,/trigger\.setAttribute\('aria-expanded',String\(details\.open\)\)/);
 assert.match(js,/menu\.addEventListener\('keydown',keyboard\.keydown/);
 assert.match(js,/showForegroundPopover\(menu,trigger,\{/);
 assert.match(overlay,/calculateActionMenuPlacement\(anchor,before,viewport\)/);
 assert.match(overlay,/sheet\.deleteRule\(index\)/);
 assert.match(js,/item\.prepend\(glyph\)/);
 assert.doesNotMatch(js,/\.innerHTML\s*=|setAttribute\('style'|\.style\s*\.|eval\(/);
 assert.match(smoke,/'frontend\/action-menu-experience\.js'/);
 assert.match(smoke,/'frontend\/action-menu-experience\.css'/);
});
