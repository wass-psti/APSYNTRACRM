import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 SEARCH_SELECTOR,MAX_SEARCH_SUGGESTIONS,MAX_SEARCH_CANDIDATES,
 LOCAL_SEARCH_SOURCES,isSearchField,normalizeSearchQuery,
 localSearchOptions,nextSearchOption,startSearchExperience
} from '../search-experience.js';
import {lucideIconNodes,createLucideActionIcon} from '../action-menu-experience.js';
import {loadPinnedFloatingUI,FLOATING_CORE_URL,FLOATING_SELECT_URL}
 from '../select-experience.js';

const source=readFileSync('frontend/search-experience.js','utf8');
const css=readFileSync('frontend/search-experience.css','utf8');
const actions=readFileSync('frontend/action-menu-experience.js','utf8');
const app=readFileSync('frontend/app.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

function input(type='search',className=''){
 return {tagName:'INPUT',type,disabled:false,readOnly:false,
  classList:{contains:value=>className.split(' ').includes(value)},
  hasAttribute:()=>type!=='text',
  closest:()=>null};
}
function searchable(value,title,{hidden=false,protectedByHidden=false}={}){
 return {hidden,getAttribute:key=>key==='data-searchable'?value:null,
  closest:()=>protectedByHidden?{}:null,
  querySelector:()=>({textContent:title})};
}
test('search field eligibility spans native search and legacy search-input, but excludes disabled and opted-out',()=>{
 assert.equal(isSearchField(input('search')),true);
 assert.equal(isSearchField(input('text','search-input')),true);
 assert.equal(isSearchField(input('text')),false);
 assert.equal(isSearchField({...input(),disabled:true}),false);
 assert.equal(isSearchField({...input(),readOnly:true}),false);
 assert.equal(isSearchField({...input(),closest:()=>({})}),false);
 assert.equal(isSearchField({...input(),tagName:'SELECT'}),false);
 assert.match(SEARCH_SELECTOR,/input\[type="search"\]/);
 assert.match(SEARCH_SELECTOR,/input\.search-input/);
});
test('local suggestion sources are an explicit allowlist of rendered, authorized pages',()=>{
 assert.deepEqual(Object.keys(LOCAL_SEARCH_SOURCES).sort(),[
  'board-search','filter-role-permission-modules','search-board-items',
  'search-issues','search-role-proposals','search-system-roles',
  'search-workspace-members'].sort());
 assert.ok(!Object.keys(LOCAL_SEARCH_SOURCES).some(id=>
  id.includes('gps')||id.includes('team')||id.includes('log')||
  id.includes('reports')||id.includes('attendance')));
 assert.equal(MAX_SEARCH_SUGGESTIONS,6);
 assert.equal(MAX_SEARCH_CANDIDATES,200);
});
test('local autocomplete uses visible labels, deduplicates, caps work and never includes hidden data',()=>{
 const list=[
  searchable('alpha board engineering','Alpha Board'),
  searchable('alpha board engineering','Alpha Board'),
  searchable('alpha protected','Hidden Alpha',{hidden:true}),
  searchable('alpha protected','Hidden Container Alpha',{protectedByHidden:true}),
  searchable('alpha board','Alpha Audit'),
  searchable('alpha board','Another Alpha')
 ];
 assert.deepEqual(localSearchOptions(list,' ALPHA ').map(x=>x.label),
  ['Alpha Board','Alpha Audit','Another Alpha']);
 assert.equal(localSearchOptions(list,'').length,0);
 assert.equal(localSearchOptions(list,'z').length,0);
 assert.equal(localSearchOptions(list,'alpha',{limit:1}).length,1);
 assert.ok(Object.isFrozen(localSearchOptions(list,'alpha')[0]));
 const overflow=Array.from({length:MAX_SEARCH_CANDIDATES+9},(_,i)=>
  searchable('beta',i<MAX_SEARCH_CANDIDATES?'Beta '+i:'Late secret'));
 assert.equal(localSearchOptions(overflow,'beta').length,MAX_SEARCH_SUGGESTIONS);
 assert.ok(localSearchOptions(overflow,'beta').every(x=>!x.label.includes('secret')));
});
test('source suggestions never expose fields absent from visible titles',()=>{
 const rows=[
  searchable('employee@example.test jules','Jules'),
  searchable('signed workspace finance','Finance'),
  searchable('latitude=6.9 longitude=125.5','Restricted Location')
 ];
 assert.equal(localSearchOptions(rows,'employee@example.test').length,0);
 assert.equal(localSearchOptions(rows,'latitude=6.9').length,0);
 assert.deepEqual(localSearchOptions(rows,'jules').map(x=>x.label),['Jules']);
 assert.equal(normalizeSearchQuery('   MIXED Case  '),'mixed case');
 assert.equal(normalizeSearchQuery('x'.repeat(400)).length,160);
});
test('keyboard suggestion movement wraps without touching source filter semantics',()=>{
 assert.equal(nextSearchOption([],0,1),-1);
 assert.equal(nextSearchOption([{},{},{}],-1,1),0);
 assert.equal(nextSearchOption([{},{},{}],2,1),0);
 assert.equal(nextSearchOption([{},{},{}],0,-1),2);
 assert.equal(nextSearchOption([{},{},{}],1,-1),0);
 for(const key of ["'ArrowDown'","'ArrowUp'","'Home'","'End'","'Enter'",
  "'Escape'","'Tab'"])assert.ok(source.includes(key),key);
 assert.match(source,/input\.dispatchEvent\(new Event\('input',\{bubbles:true\}\)\)/);
 assert.match(source,/queueMicrotask\(/);
 assert.match(source,/event\.stopPropagation\(\)/);
});
test('genuine WAI-ARIA combobox only where local autocomplete has authorized candidates',()=>{
 assert.match(source,/if\(source\)\{\s*input\.setAttribute\('role','combobox'\)/);
 for(const attr of ['role','aria-autocomplete','aria-haspopup','aria-expanded',
  'aria-controls','aria-activedescendant','aria-selected','aria-live'])
  assert.ok(source.includes(attr),attr);
 assert.match(source,/input\.setAttribute\('role','searchbox'\)/);
 assert.match(source,/menu\.setAttribute\('role','listbox'\)/);
 assert.match(source,/node\.setAttribute\('role','option'\)/);
 assert.match(source,/restore\('aria-controls',beforeControls\)/);
 assert.match(source,/input\.value=choice/);
 assert.match(source,/close\(\);/);
});
test('Lucide search and clear controls are local sanitized SVGs, without external icon dependencies',()=>{
 assert.ok(lucideIconNodes('search').some(([tag])=>tag==='circle'));
 assert.ok(lucideIconNodes('x').every(([tag])=>tag==='path'));
 const doc={createElementNS:(_ns,tag)=>({tag,children:[],
  setAttribute(){},append(child){this.children.push(child);}})};
 assert.equal(createLucideActionIcon('search',doc).children.length,2);
 assert.equal(createLucideActionIcon('x',doc).children.length,2);
 assert.match(actions,/'search':\[\['circle'/);
 assert.match(actions,/'x':\[\['path'/);
 assert.match(source,/clear\.setAttribute\('aria-label','Clear '/);
});
test('search enhancement progressively retains original inputs, IDs, handlers, labels and form semantics',()=>{
 assert.match(source,/input\.insertAdjacentElement\('beforebegin',shell\)/);
 assert.match(source,/shell\.append\(icon,input,clear,menu,status\)/);
 assert.match(source,/input\.classList\.add\('aps-search-source'\)/);
 assert.match(source,/input\.addEventListener\('input',queueUpdate/);
 assert.match(source,/clear\.addEventListener\('click'/);
 assert.match(source,/input\.value='';input\.focus\(\);syncClear\(\)/);
 assert.match(source,/controls\.set\(input,controller\)/);
 assert.match(source,/controls\.delete\(input\)/);
 assert.match(source,/observer\.disconnect\(\)/);
 assert.match(source,/new AbortController\(\)/);
 assert.match(app,/root\.addEventListener\('input',event=>/);
 assert.match(app,/if\(!event\.target\.matches\('\.search-input'\)\)return/);
 assert.match(app,/applyTimeTrackerLogSearch\(root/);
 assert.match(app,/applyTimeTrackerReportSearch\(root/);
});
test('shared Floating UI is lazy, pinned, collision-aware and strictly CSP-compliant',()=>{
 assert.equal(typeof loadPinnedFloatingUI,'function');
 assert.equal(FLOATING_CORE_URL,
  'https://unpkg.com/@floating-ui/core@1.8.0/dist/floating-ui.core.umd.min.js');
 assert.equal(FLOATING_SELECT_URL,
  'https://unpkg.com/@floating-ui/dom@1.8.0/dist/floating-ui.dom.umd.min.js');
 assert.match(source,/import \{loadPinnedFloatingUI\} from '\.\/select-experience\.js'/);
 for(const prop of ['computePosition','autoUpdate','offset','flip','shift','size'])
  assert.ok(source.includes('lib.'+prop),prop);
 assert.match(source,/strategy:'absolute'/);
 assert.match(source,/aps-search-above/);
 assert.match(source,/aps-search-align-end/);
 assert.doesNotMatch(source,/\.style\s*\.|\.style\s*=|\.cssText\s*=|setAttribute\s*\(\s*["']style["']/);
 assert.doesNotMatch(source,/\.innerHTML\s*=|insertAdjacentHTML|document\.write|eval\(/);
 assert.doesNotMatch(source,/fetch\(|geolocation|localStorage|sessionStorage|sendBeacon|new Worker/);
 assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame\(/);
 assert.match(index,/style-src-attr 'none'/);
 assert.match(index,/script-src 'self' https:\/\/unpkg\.com;/);
});
test('CSS respects existing role filters and TimeTracker layouts, keyboard, mobile and reduced motion',()=>{
 for(const part of ['--aps-search-accent','.aps-search-field',
  '.aps-search-source','.aps-search-mark','.aps-search-clear',
  '.aps-search-suggestions','.aps-search-option',
  '.role-search-wrap','.tt-log-search','.tt-ot-search',
  '.tt-team-toolbar','.aps-boards #board-search',
  ':focus-visible','@supports (anchor-name:',
  '@media(max-width:720px)','@media(prefers-reduced-motion:reduce)',
  '@media(prefers-contrast:more)','@media(forced-colors:active)'])
  assert.ok(css.includes(part),part);
 assert.match(css,/\.aps-search-suggestions\[hidden\]\{\s*display:none!important/);
 assert.doesNotMatch(css,/@import|url\(https?:|@keyframes|animation:.*infinite|will-change/);
 assert.match(source,/prefers-reduced-motion: reduce/);
 assert.match(source,/node\.animate\(\[/);
});
test('application startup and exact-commit GitHub Pages manifest cover shared search assets',()=>{
 assert.match(app,/import \{startSearchExperience\} from '\.\/search-experience\.js'/);
 assert.match(app,/startSearchExperience\(document\.body\)/);
 assert.ok(app.indexOf('startSearchExperience(document.body)')>
  app.indexOf('startActionMenuExperience(document.body)'));
 assert.ok(index.indexOf('frontend/search-experience.css')>
  index.indexOf('frontend/action-menu-experience.css'));
 assert.match(smoke,/'frontend\/search-experience\.js'/);
 assert.match(smoke,/'frontend\/search-experience\.css'/);
 assert.match(index,/script type="module" src="\.\/frontend\/app\.js"/);
 const stop=startSearchExperience(null);
 assert.equal(typeof stop,'function');assert.doesNotThrow(stop);
});
