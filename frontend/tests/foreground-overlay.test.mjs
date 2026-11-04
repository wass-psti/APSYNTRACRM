import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 supportsForegroundPopover,showForegroundPopover
} from '../foreground-overlay.js';

const implementation=readFileSync('frontend/foreground-overlay.js','utf8');
const css=readFileSync('frontend/foreground-overlay.css','utf8');
const select=readFileSync('frontend/select-experience.js','utf8');
const action=readFileSync('frontend/action-menu-experience.js','utf8');
const search=readFileSync('frontend/search-experience.js','utf8');
const html=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

function classSet(){
 const data=new Set();
 return {add:name=>data.add(name),remove:name=>data.delete(name),
  contains:name=>data.has(name)};
}
function fixture({supported=true}={}){
 const document={
  defaultView:{CSS:{supports:(key,value)=>{
   if(!supported)return false;
   return key==='position-anchor'&&value==='--aps-foreground-select'||
    key==='top'&&value==='anchor(bottom)';
  }}},
  createElement:()=>({showPopover(){}})
 };
 const trigger={isConnected:true,classList:classSet()};
 const attributes=new Map();
 let open=false,shown=0,hidden=0;
 const menu={
  ownerDocument:document,isConnected:true,
  classList:classSet(),
  getAttribute:name=>attributes.has(name)?attributes.get(name):null,
  setAttribute:(name,value)=>attributes.set(name,String(value)),
  removeAttribute:name=>attributes.delete(name),
  showPopover({source}={}){
   if(!source)throw Error('source is required by test fixture');
   assert.equal(source,trigger);open=true;shown++;
  },
  hidePopover(){open=false;hidden++;},
  matches:selector=>selector===':popover-open'&&open
 };
 return {document,trigger,menu,
  get open(){return open;},get shown(){return shown;},
  get hidden(){return hidden;}};
}
test('feature detection fails closed without CSS anchors or native Popover API',()=>{
 const yes=fixture();
 assert.equal(supportsForegroundPopover(yes.document),true);
 const no=fixture({supported:false});
 assert.equal(supportsForegroundPopover(no.document),false);
 assert.equal(supportsForegroundPopover(null),false);
 const docs={defaultView:yes.document.defaultView,createElement:()=>({})};
 assert.equal(supportsForegroundPopover(docs),false);
 assert.equal(showForegroundPopover(no.menu,no.trigger),null);
 assert.equal(no.open,false);
});
test('foreground overlay is top-layer, keeps native DOM ancestry and cleans up all mutations',()=>{
 const f=fixture();
 const parent={name:'original form and delegated event ancestor'};
 f.menu.parentElement=parent;
 const stop=showForegroundPopover(f.menu,f.trigger,{kind:'select'});
 assert.equal(typeof stop,'function');
 assert.equal(f.shown,1);
 assert.equal(f.open,true);
 assert.equal(f.menu.parentElement,parent,'popover must not move the DOM');
 assert.equal(f.menu.getAttribute('popover'),'manual');
 assert.equal(f.trigger.classList.contains('aps-foreground-anchor-select'),true);
 assert.equal(f.menu.classList.contains('aps-foreground-select'),true);
 stop();
 assert.equal(f.open,false);
 assert.equal(f.hidden,1);
 assert.equal(f.menu.getAttribute('popover'),null);
 assert.equal(f.trigger.classList.contains('aps-foreground-anchor-select'),false);
 assert.equal(f.menu.classList.contains('aps-foreground-surface'),false);
 assert.doesNotThrow(stop);
});
test('opening another surface dismisses earlier popover and invokes its state reset',()=>{
 const first=fixture(),second=fixture();
 // Both surfaces reside in the same logical document.
 second.menu.ownerDocument=first.document;
 const closed=[];
 const endFirst=showForegroundPopover(first.menu,first.trigger,{
  kind:'select',onDismiss:()=>closed.push('old dropdown closed')
 });
 assert.equal(first.open,true);
 const endSecond=showForegroundPopover(second.menu,second.trigger,{
  kind:'action',onDismiss:()=>closed.push('new menu closed')
 });
 assert.deepEqual(closed,['old dropdown closed']);
 assert.equal(first.open,false);
 assert.equal(second.open,true);
 endFirst();
 endSecond();
 assert.equal(second.open,false);
});
test('modal and command menu existing popover state is restored on cleanup',()=>{
 const f=fixture();
 f.menu.setAttribute('popover','auto');
 const done=showForegroundPopover(f.menu,f.trigger,{kind:'search'});
 done();
 assert.equal(f.menu.getAttribute('popover'),'auto');
 assert.equal(f.menu.classList.contains('aps-foreground-surface'),false);
});
test('only approved surface categories can use the shared top layer',()=>{
 const f=fixture();
 assert.equal(showForegroundPopover(f.menu,f.trigger,{kind:'tooltip'}),null);
 assert.equal(f.shown,0);
 assert.equal(showForegroundPopover({...f.menu,isConnected:false},f.trigger),null);
 assert.equal(showForegroundPopover(f.menu,{...f.trigger,isConnected:false}),null);
 assert.match(implementation,/new WeakMap\(\)/);
 assert.match(implementation,/new Set\(\['select','action','search'\]\)/);
});
test('select options retain their original native form and work outside clipped board cells',()=>{
 assert.match(select,/import \{showForegroundPopover,supportsForegroundPopover\} from '\.\/foreground-overlay\.js'/);
 assert.match(select,/stopForeground=showForegroundPopover\(list,trigger,\{/);
 assert.match(select,/kind:'select',onDismiss:\(\)=>close\(false\)/);
 assert.match(select,/stopForeground\?\.\(\);stopForeground=null/);
 assert.match(select,/if\(win\.CSS\?\.supports&&!supportsForegroundPopover\(doc\)\)return/);
 assert.match(select,/select\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\)/);
 assert.match(select,/anchor\.append\(select,trigger\)/);
 assert.match(select,/anchor\.append\(list\)/);
 assert.match(css,/\.aps-select-listbox\.aps-foreground-select:popover-open/);
 assert.match(css,/position-anchor:--aps-foreground-select/);
});
test('board, group and column action menus stay in the delegated click hierarchy',()=>{
 assert.match(action,/showForegroundPopover\(menu,trigger,\{/);
 assert.match(action,/kind:'action',onDismiss:\(\)=>close\(false\)/);
 assert.match(action,/stopForeground\?\.\(\);stopForeground=null/);
 assert.match(action,/const stopForeground=showForegroundPopover\(menu,trigger/);
 assert.match(action,/trigger\.setAttribute\('aria-haspopup','menu'\)/);
 assert.match(action,/keyboard\.focusBoundary\(\)/);
 assert.doesNotMatch(implementation,/appendChild|append\(menu\)|document\.body\.append/);
 assert.match(css,/#app \.aps-board-shell \.aps-action-surface\[open\]>summary\.aps-foreground-anchor-action/);
});
test('search suggestions retain input focus and original filtering with top-layer positioning',()=>{
 assert.match(search,/stopForeground=showForegroundPopover\(menu,input,\{/);
 assert.match(search,/kind:'search',onDismiss:\(\)=>close\(\)/);
 assert.match(search,/stopForeground\?\.\(\);stopForeground=null/);
 assert.match(search,/input\.dispatchEvent\(new Event\('input',\{bubbles:true\}\)\)/);
 assert.match(css,/#app \.aps-search-field \.aps-search-source\.aps-foreground-anchor-search:focus/);
 assert.match(css,/\.aps-search-suggestions\.aps-foreground-search:popover-open/);
});
test('overlay CSS uses browser top layer and anchors without global z-index inflation or CSP bypass',()=>{
 for(const token of [
  'position-anchor:--aps-foreground-select',
  'position-anchor:--aps-foreground-action',
  'position-anchor:--aps-foreground-search',
  'position-try-fallbacks:flip-block,flip-inline',
  'top:calc(anchor(bottom)',
  'bottom:calc(anchor(top)',
  'right:anchor(right)',
  'width:max(140px,anchor-size(width))',
  ':popover-open','@media(prefers-reduced-motion:reduce)'
 ])assert.ok(css.includes(token),token);
 assert.doesNotMatch(css,/z-index:\s*\d+|@import|url\(https?:|will-change|animation:.*infinite/);
 assert.doesNotMatch(implementation,/\.style\s*\.|\.cssText\s*=|setAttribute\s*\(\s*['"]style['"]/);
 assert.match(html,/style-src-attr 'none'/);
 assert.match(html,/script-src 'self' https:\/\/unpkg\.com;/);
});
test('production Pages manifest protects shared overlay code and overlay CSS',()=>{
 assert.match(html,/frontend\/foreground-overlay\.css/);
 assert.ok(html.indexOf('frontend/foreground-overlay.css')>
  html.indexOf('frontend/platform-sync.css'));
 assert.match(smoke,/'frontend\/foreground-overlay\.js'/);
 assert.match(smoke,/'frontend\/foreground-overlay\.css'/);
 assert.doesNotMatch(implementation,/fetch\(|\.rpc\(|setTimeout\(|setInterval\(|localStorage|sessionStorage|sendBeacon/);
});
