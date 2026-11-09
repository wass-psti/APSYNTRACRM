import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lucideIconNodes,createLucideActionIcon} from '../action-menu-experience.js';
import {overviewIcon} from '../overview-visuals.js';
import {sidebarIcon} from '../sidebar-visuals.js';
import {foundationIcon} from '../foundation-visuals.js';
import {settingsIcon} from '../settings-visuals.js';
import {roleConfigurationIcon} from '../role-configuration-visuals.js';
import {pagesAcceptanceIcon} from '../pages-acceptance-visuals.js';

const group=[
 ['Overview','frontend/overview-experience.css','aps-overview','overview-svg-icon',overviewIcon('grid')],
 ['Sidebar','frontend/sidebar-experience.css','aps-sidebar','sidebar-svg-icon',sidebarIcon('boards')],
 ['Foundation','frontend/foundation-experience.css','aps-foundation','foundation-svg-icon',foundationIcon('layers')],
 ['Settings','frontend/settings-experience.css','aps-settings','settings-icon',settingsIcon('shield')],
 ['Role Configuration','frontend/role-configuration-experience.css','aps-role-configuration','role-icon',roleConfigurationIcon('roles')],
 ['Pages Acceptance','frontend/pages-acceptance-experience.css','aps-pages-acceptance','pages-icon',pagesAcceptanceIcon('checks')]
];
const action=readFileSync('frontend/action-menu-experience.js','utf8');
const actionCSS=readFileSync('frontend/action-menu-experience.css','utf8');
const overlay=readFileSync('frontend/foreground-overlay.js','utf8');
const index=readFileSync('index.html','utf8');
const manifest=readFileSync('scripts/priority5-style-manifest.mjs','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

test('six existing 24x24 UI icon families maintain square proportions after responsive width overrides',()=>{
 for(const [label,path,scope,klass,markup] of group){
  const css=readFileSync(path,'utf8');
  const selector='#app .'+scope+' .'+klass+'{';
  const start=css.indexOf(selector);
  assert.ok(start>=0,label+' selector');
  const end=css.indexOf('}',start);
  const block=css.slice(start,end);
  assert.match(block,/height:auto/,label+' must not use fixed height');
  assert.match(block,/aspect-ratio:1/,label+' must remain square at 15-20px');
  assert.match(block,/display:block/,label+' no inline baseline');
  assert.match(block,/flex:none/,label+' avoid flex shrink/stretch');
  assert.ok(markup.includes('viewBox="0 0 24 24"'),label+' geometry');
  assert.ok(markup.includes('aria-hidden="true"'),label+' accessible decoration');
  assert.ok(markup.includes('focusable="false"'),label+' focus');
  assert.match(markup,new RegExp('class="'+klass+'"'),label+' class');
  assert.ok(index.includes('frontend/apsyntra-styles.bundle.css')&&
   manifest.includes('frontend/'+path.split('/').at(-1)),label+' stylesheet bundled');
  assert.ok(smoke.includes(path),label+' deployment integrity');
 }
});

test('shared CSS uses existing component scopes, without stretching decorative SVG art or changing layout',()=>{
 for(const [,path,scope,klass] of group){
  const css=readFileSync(path,'utf8');
  assert.ok(css.includes('#app .'+scope+' .'+klass+'{'));
  const first=css.slice(css.indexOf('#app .'+scope+' .'+klass+'{'));
  const block=first.slice(0,first.indexOf('}'));
  assert.ok(!block.includes('transform:'),path+' no optical hacks');
  assert.ok(!block.includes('position:'),path+' do not move icons out of layout');
  assert.ok(!block.includes('!important'),path+' avoid cascade inflation');
 }
 assert.match(readFileSync('frontend/role-configuration-ui.js','utf8'),/class="role-hero-art" viewBox="0 0 420 210"/);
 assert.match(readFileSync('frontend/pages-acceptance-ui.js','utf8'),/viewBox="0 0 300 210"/);
});

test('shared pencil path occupies the intended full 24px icon grid instead of the bottom-right corner',()=>{
 const paths=lucideIconNodes('pencil');
 assert.deepEqual(paths,[
  ['path',{d:'M15 5l4 4'}],
  ['path',{d:'M4 20l4.5-1 11-11a2.12 2.12 0 0 0-3-3l-11 11L4 20Z'}]
 ]);
 assert.doesNotMatch(action,/M12 19l7-7 3 3-7 7-4 1 1-4Z/);
 const seen=[];
 const doc={createElementNS(_ns,tag){
  const item={tag,attrs:new Map(),children:[],
   setAttribute(k,v){this.attrs.set(k,String(v));},
   append(c){this.children.push(c);}};
  seen.push(item);return item;
 }};
 const svg=createLucideActionIcon('pencil',doc);
 assert.equal(svg.attrs.get('viewBox'),'0 0 24 24');
 assert.equal(svg.attrs.get('width'),'17');
 assert.equal(svg.attrs.get('height'),'17');
 assert.equal(svg.attrs.get('stroke'),'currentColor');
 assert.equal(svg.attrs.get('fill'),'none');
 assert.equal(svg.attrs.get('aria-hidden'),'true');
 assert.equal(svg.children.length,2);
});

test('previously corrected three-dot trigger geometry remains unchanged',()=>{
 const v=lucideIconNodes('ellipsis-vertical');
 const h=lucideIconNodes('ellipsis-horizontal');
 assert.deepEqual(v.map(x=>x[1]),[{cx:12,cy:5,r:1.5},{cx:12,cy:12,r:1.5},{cx:12,cy:19,r:1.5}]);
 assert.deepEqual(h.map(x=>x[1]),[{cx:5,cy:12,r:1.5},{cx:12,cy:12,r:1.5},{cx:19,cy:12,r:1.5}]);
 assert.match(actionCSS,/#app svg\.aps-action-icon\.aps-ellipsis-icon/);
 assert.match(actionCSS,/#app \.aps-action-popover>:is\(\[role="menuitem"\],button\[data-action\],a\[href\]\)>svg\.aps-action-icon/);
 assert.match(actionCSS,/#app \.aps-board-shell \.page-head \.board-actions-menu>summary\.aps-ellipsis-trigger/);
 assert.match(actionCSS,/@media\(prefers-reduced-motion:reduce\)/);
});

test('menu anchoring, event dispatch, authorization and CSP are preserved',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(action,/showForegroundPopover\(menu,trigger,\{/);
 assert.match(overlay,/calculateActionMenuPlacement\(anchor,before,viewport\)/);
 assert.match(overlay,/getBoundingClientRect\(\)/);
 assert.match(app,/root\.addEventListener\('click',event=>/);
 assert.match(app,/await db\.allowed\(id,'manage'\)/);
 assert.match(index,/style-src-attr 'none'/);
 assert.doesNotMatch(action,/\.innerHTML\s*=|setAttribute\('style'|\.style\s*\.|eval\(/);
 assert.doesNotMatch(actionCSS,/url\(https?:|@import/);
});

test('other icon classes and semantic charts remain separate from responsive fix',()=>{
 const untouched=[
  'frontend/time-tracker-pixi-experience.css',
  'frontend/metrics-experience.css',
  'frontend/foreground-overlay.css',
  'frontend/board-visual-refresh.css'
 ];
 for(const path of untouched)assert.ok(smoke.includes(path),path+' deployed asset still tracked');
 assert.ok(!readFileSync('frontend/metrics-experience.js','utf8').includes('svg-icon-alignment'));
});
