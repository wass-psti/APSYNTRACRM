import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 supportsForegroundPopover,showForegroundPopover,isForegroundPositionValid,calculateActionMenuPlacement
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
function fixture({supported=true,cssom=true,
 href='https://wass-psti.github.io/APSYNTRACRM/frontend/foreground-overlay.css'}={}){
 const rules=[],pending=[];
 const sheet={
  href,
  cssRules:rules,
  insertRule(text,index){
   const values=new Map();
   const rule={cssText:text,style:{
    setProperty:(name,value)=>values.set(name,value),
    getPropertyValue:name=>values.get(name)||''
   }};
   rules.splice(index,0,rule);return index;
  },
  deleteRule(index){rules.splice(index,1);}
 };
 const listeners=new Map();
 const window={
  CSS:{supports:(key,value)=>{
   if(!supported)return false;
   return key==='position-anchor'&&value==='auto'||
    key==='top'&&value==='anchor(bottom)';
  }},
  innerWidth:1100,innerHeight:820,
  location:{origin:'https://wass-psti.github.io'},
  requestAnimationFrame:callback=>{pending.push(callback);return pending.length;},
  cancelAnimationFrame:()=>{},
  addEventListener:(name,fn)=>listeners.set('window:'+name,fn),
  removeEventListener:name=>listeners.delete('window:'+name),
 };
 const document={
  defaultView:window,
  baseURI:'https://wass-psti.github.io/APSYNTRACRM/',
  styleSheets:cssom?[sheet]:[],
  createElement:()=>({showPopover(){}}),
  addEventListener:(name,fn)=>listeners.set('document:'+name,fn),
  removeEventListener:name=>listeners.delete('document:'+name)
 };
 const trigger={isConnected:true,classList:classSet(),
  getBoundingClientRect:()=>({left:700,right:738,top:310,bottom:348})};
 const attributes=new Map();
 let open=false,shown=0,hidden=0;
 const menu={
  id:'aps-action-menu-fixture',ownerDocument:document,isConnected:true,
  classList:classSet(),closest:selector=>selector==='#app'?{}:null,
  getBoundingClientRect(){
   const match=rules.find(rule=>rule.cssText.startsWith('#app #'+this.id));
   const left=Number.parseFloat(match?.style.getPropertyValue('left'));
   const top=Number.parseFloat(match?.style.getPropertyValue('top'));
   const x=Number.isFinite(left)?left:0,y=Number.isFinite(top)?top:0;
   return {left:x,top:y,right:x+210,bottom:y+120,width:210,height:120};
  },
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
 return {document,window,sheet,rules,listeners,trigger,menu,
  flush(){
   const jobs=pending.splice(0);jobs.forEach(fn=>fn(0));
  },
  get open(){return open;},get shown(){return shown;},
  get hidden(){return hidden;}
 };
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
 assert.match(action,/if\(!stopForeground\)\{\s*queueMicrotask/);
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
 assert.match(implementation,/rule\.style\.setProperty\('top'/);
 assert.doesNotMatch(implementation,/menu\.style\.|trigger\.style\.|setAttribute\s*\(\s*['"]style['"]/);
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
 const f=fixture();
 let trigger={left:960,right:1000,top:360,bottom:398};
 const defaultRect=f.menu.getBoundingClientRect.bind(f.menu);
 f.trigger.getBoundingClientRect=()=>trigger;
 f.menu.getBoundingClientRect=()=>defaultRect();
 return {f,events:f.listeners,flush:()=>f.flush(),
  moveTrigger(rect){trigger=rect;},
  moveMenu(rect){f.menu.getBoundingClientRect=()=>rect;}
 };
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

test('measured action menus use actual trigger geometry rather than CSS anchors',()=>{
 const corners=[
  [{left:10,right:48,top:12,bottom:50},{width:220,height:120}],
  [{left:1040,right:1078,top:12,bottom:50},{width:220,height:120}],
  [{left:10,right:48,top:760,bottom:798},{width:220,height:120}],
  [{left:1040,right:1078,top:760,bottom:798},{width:220,height:120}]
 ];
 for(const [anchor,menu] of corners){
  const pos=calculateActionMenuPlacement(anchor,menu,{width:1100,height:820});
  assert.ok(pos,'must position a menu near each corner');
  const drawn={left:pos.left,top:pos.top,right:pos.left+220,
   bottom:pos.top+Math.min(pos.maxHeight,120),
   width:220,height:Math.min(pos.maxHeight,120)};
  assert.equal(isForegroundPositionValid(anchor,drawn,{width:1100,height:820}),true);
  assert.ok(drawn.left>=0&&drawn.right<=1100);
  assert.ok(drawn.top>=0&&drawn.bottom<=820);
 }
 assert.equal(calculateActionMenuPlacement({left:1,right:2,top:1,bottom:2},
  {width:120,height:120},{width:0,height:0}),null);
});
test('CSSOM action rule opens with measured fixed viewport coordinates and is removed on close',()=>{
 const f=fixture();
 const done=showForegroundPopover(f.menu,f.trigger,{kind:'action'});
 assert.equal(typeof done,'function');
 assert.equal(f.rules.length,1);
 assert.match(f.rules[0].cssText,/#app #aps-action-menu-fixture:popover-open/);
 assert.match(f.rules[0].cssText,/left:-10000px!important/);
 f.flush();
 assert.equal(f.menu.classList.contains('aps-foreground-pending'),false);
 const x=Number.parseFloat(f.rules[0].style.getPropertyValue('left'));
 const y=Number.parseFloat(f.rules[0].style.getPropertyValue('top'));
 assert.equal(x,528);assert.equal(y,356);
 f.trigger.getBoundingClientRect=()=>({left:360,right:398,top:260,bottom:298});
 f.listeners.get('document:scroll')();
 f.flush();
 assert.equal(Number.parseFloat(f.rules[0].style.getPropertyValue('left')),188);
 assert.equal(Number.parseFloat(f.rules[0].style.getPropertyValue('top')),306);
 done();
 assert.equal(f.rules.length,0,'no CSSOM rule leaks after dismissal');
 assert.equal(f.listeners.size,0,'no hanging scroll/resize listeners');
});
test('three-dot foreground fails safely to local native details when CSSOM is blocked',()=>{
 const f=fixture({cssom:false});
 const result=showForegroundPopover(f.menu,f.trigger,{kind:'action'});
 assert.equal(result,null);
 assert.equal(f.open,false);
 assert.equal(f.rules.length,0);
 assert.equal(f.menu.getAttribute('popover'),null);
});
test('top-left geometry failure triggers cleanup without exposing detached menu',()=>{
 const m=measuredFixture(),failures=[];
 const done=showForegroundPopover(m.f.menu,m.f.trigger,{
  kind:'action',onPlacementFailure:()=>failures.push('invalid position')
 });
 m.moveMenu({left:0,right:210,top:0,bottom:120,width:210,height:120});
 m.flush();
 assert.deepEqual(failures,['invalid position']);
 assert.equal(m.f.open,false);
 assert.equal(m.f.rules.length,0);
 assert.doesNotThrow(done);
});

test('Priority 5 bundled CSS restores top-layer action menus without weakening same-origin checks',()=>{
 const bundle=fixture({href:'https://wass-psti.github.io/APSYNTRACRM/frontend/apsyntra-styles.bundle.css?v=1'});
 const stop=showForegroundPopover(bundle.menu,bundle.trigger,{kind:'action'});
 assert.equal(typeof stop,'function');
 bundle.flush();
 assert.equal(bundle.open,true);
 assert.equal(bundle.menu.classList.contains('aps-foreground-pending'),false);
 assert.equal(bundle.rules.length,1);
 assert.match(bundle.rules[0].cssText,/position:fixed!important/);
 stop();assert.equal(bundle.rules.length,0);
 for(const href of [
  'https://evil.example/APSYNTRACRM/frontend/apsyntra-styles.bundle.css',
  'https://wass-psti.github.io/another/frontend/apsyntra-styles.bundle.css',
  'https://wass-psti.github.io/APSYNTRACRM/frontend/user-data.css'
 ]){
  const excluded=fixture({href});
  assert.equal(showForegroundPopover(excluded.menu,excluded.trigger,{kind:'action'}),null);
  assert.equal(excluded.rules.length,0);
 }
});
