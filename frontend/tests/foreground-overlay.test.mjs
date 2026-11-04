import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 supportsForegroundPopover,showForegroundPopover,isForegroundPositionValid
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
 return {add:(...names)=>names.forEach(name=>data.add(name)),
  remove:(...names)=>names.forEach(name=>data.delete(name)),
  contains:name=>data.has(name)};
}
function fixture({supported=true}={}){
 const document={
  defaultView:{CSS:{supports:(key,value)=>{
   if(!supported)return false;
   return key==='position-anchor'&&value==='auto'||
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
 assert.match(css,/position-anchor:auto!important/);
});
test('board, group and column action menus stay in the delegated click hierarchy',()=>{
 assert.match(action,/showForegroundPopover\(menu,trigger,\{/);
 assert.match(action,/kind:'action',onDismiss:\(\)=>close\(false\)/);
 assert.match(action,/stopForeground\?\.\(\);stopForeground=null/);
 assert.match(action,/const stopForeground=showForegroundPopover\(menu,trigger/);
 assert.match(action,/trigger\.setAttribute\('aria-haspopup','menu'\)/);
 assert.match(action,/keyboard\.focusBoundary\(\)/);
 assert.doesNotMatch(implementation,/appendChild|append\(menu\)|document\.body\.append/);
 assert.match(css,/\.aps-action-popover\.aps-foreground-action:popover-open/);
 assert.match(css,/position-anchor:auto!important/);
});
test('search suggestions retain input focus and original filtering with top-layer positioning',()=>{
 assert.match(search,/stopForeground=showForegroundPopover\(menu,input,\{/);
 assert.match(search,/kind:'search',onDismiss:\(\)=>close\(\)/);
 assert.match(search,/stopForeground\?\.\(\);stopForeground=null/);
 assert.match(search,/input\.dispatchEvent\(new Event\('input',\{bubbles:true\}\)\)/);
 assert.match(css,/\.aps-search-suggestions\.aps-foreground-search:popover-open/);
 assert.match(css,/\.aps-search-suggestions\.aps-foreground-search:popover-open/);
});
test('overlay CSS uses browser top layer and anchors without global z-index inflation or CSP bypass',()=>{
 for(const token of [
  'position-anchor:auto!important',
  'aps-foreground-pending',
  'position-try-fallbacks:flip-block,flip-inline',
  'top:calc(anchor(bottom)',
  'bottom:calc(anchor(top)',
  'right:anchor(right)',
  'width:anchor-size(width)',
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

test('explicit implicit anchor avoids unnamed top-left popovers in all three menu categories',()=>{
 assert.match(implementation,/menu\.showPopover\(\{source:trigger\}\)/);
 assert.match(implementation,/win\.CSS\.supports\('position-anchor','auto'\)/);
 assert.match(implementation,/getBoundingClientRect\(\)/);
 assert.match(css,/\.aps-action-popover\.aps-foreground-action:popover-open/);
 assert.match(css,/\.aps-select-listbox\.aps-foreground-select:popover-open/);
 assert.match(css,/\.aps-search-suggestions\.aps-foreground-search:popover-open/);
 assert.match(css,/position-anchor:auto!important/);
 assert.doesNotMatch(css,/position-anchor:--aps-foreground-/);
 assert.doesNotMatch(implementation,/menu\.showPopover\(\)/);
});
test('viewport-relative geometry accepts adjacent dropdowns at all edges and rejects 0,0 regressions',()=>{
 const trigger={left:1020,right:1060,top:590,bottom:628};
 const flipped={left:845,right:1060,top:370,bottom:582,width:215,height:212};
 const below={left:845,right:1060,top:636,bottom:780,width:215,height:144};
 const misplaced={left:0,right:215,top:0,bottom:144,width:215,height:144};
 const viewport={width:1100,height:820};
 assert.equal(isForegroundPositionValid(trigger,flipped,viewport),true);
 assert.equal(isForegroundPositionValid(trigger,below,viewport),true);
 assert.equal(isForegroundPositionValid(trigger,misplaced,viewport),false);
 assert.equal(isForegroundPositionValid(
  {left:12,right:50,top:12,bottom:48},
  {left:12,right:222,top:56,bottom:220,width:210,height:164},viewport),true);
 assert.equal(isForegroundPositionValid(trigger,{...below,left:NaN},viewport),false);
 assert.equal(isForegroundPositionValid(trigger,{...below,width:0},viewport),false);
});
function measuredFixture(){
 const f=fixture(),win=f.document.defaultView;
 const frames=[],events=new Map();
 win.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};
 win.cancelAnimationFrame=()=>{};
 win.innerWidth=1100;win.innerHeight=820;
 win.addEventListener=(event,callback)=>events.set('window:'+event,callback);
 win.removeEventListener=(event)=>events.delete('window:'+event);
 f.document.addEventListener=(event,callback)=>events.set('document:'+event,callback);
 f.document.removeEventListener=(event)=>events.delete('document:'+event);
 let trigger={left:960,right:1000,top:360,bottom:398};
 let menu={left:790,right:1000,top:406,bottom:550,width:210,height:144};
 f.trigger.getBoundingClientRect=()=>trigger;
 f.menu.getBoundingClientRect=()=>menu;
 return {f,events,flush(){const next=frames.splice(0);next.forEach(cb=>cb());},
  moveTrigger(rect){trigger=rect;},moveMenu(rect){menu=rect;}};
}
test('unresolved top-left placement is never displayed: hidden until checked then restored to local fallback',()=>{
 const m=measuredFixture(),failures=[];
 const stop=showForegroundPopover(m.f.menu,m.f.trigger,{
  kind:'action',onPlacementFailure:()=>failures.push('failed anchor')
 });
 assert.equal(m.f.menu.classList.contains('aps-foreground-pending'),true);
 assert.equal(m.f.open,true);
 m.moveMenu({left:0,right:210,top:0,bottom:144,width:210,height:144});
 m.flush();
 assert.deepEqual(failures,['failed anchor']);
 assert.equal(m.f.open,false);
 assert.equal(m.f.menu.classList.contains('aps-foreground-pending'),false);
 assert.equal(m.f.menu.getAttribute('popover'),null);
 assert.doesNotThrow(stop);
});
test('valid placement reveals menu, tracks scroll/resize and disposes listeners when closed',()=>{
 const m=measuredFixture();
 const stop=showForegroundPopover(m.f.menu,m.f.trigger,{kind:'action'});
 m.flush();
 assert.equal(m.f.open,true);
 assert.equal(m.f.menu.classList.contains('aps-foreground-pending'),false);
 assert.equal(typeof m.events.get('document:scroll'),'function');
 assert.equal(typeof m.events.get('window:resize'),'function');
 m.moveTrigger({left:500,right:540,top:100,bottom:138});
 m.moveMenu({left:330,right:540,top:146,bottom:290,width:210,height:144});
 m.events.get('document:scroll')();
 m.flush();
 assert.equal(m.f.open,true);
 stop();
 assert.equal(m.events.size,0);
 assert.equal(m.f.open,false);
});
test('engines rejecting showPopover source cannot silently open an unanchored menu',()=>{
 const f=fixture();
 let calls=0;
 f.menu.showPopover=()=>{calls++;throw Error('no source support');};
 assert.equal(showForegroundPopover(f.menu,f.trigger,{kind:'action'}),null);
 assert.equal(calls,1);
 assert.equal(f.menu.getAttribute('popover'),null);
 assert.equal(f.menu.classList.contains('aps-foreground-surface'),false);
});
