import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 FLOATING_CORE_URL,FLOATING_SELECT_URL,MAX_FLOATING_OPTIONS
 readSelectOptions,nextSelectableIndex,findSelectTypeahead,startSelectExperience
} from '../select-experience.js';

const source=readFileSync('frontend/select-experience.js','utf8');
const css=readFileSync('frontend/select-experience.css','utf8');
const index=readFileSync('index.html','utf8');
const app=readFileSync('frontend/app.js','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

function native(options=[{value:'',textContent:'Choose'},{value:'a',textContent:'Alpha'}]){
 return {tagName:'SELECT',multiple:false,size:0,options,
  hasAttribute:()=>false,closest:()=>null};
}
test('global selector supports normal single selects but preserves native special controls',()=>{
 assert.equal(isStandardSelect(native()),true);
 assert.equal(isStandardSelect({...native(),multiple:true}),false);
 assert.equal(isStandardSelect({...native(),size:4}),false);
 assert.equal(isStandardSelect({...native(),options:[]}),false);
 assert.equal(isStandardSelect({...native(),options:Array(401).fill({value:'x'})}),false);
 assert.equal(MAX_FLOATING_OPTIONS,400);
 assert.equal(isStandardSelect({...native(),hasAttribute:k=>k==='data-aps-select-native'}),false);
 assert.equal(isStandardSelect({...native(),closest:k=>k==='[data-aps-select-native]'?{}:null}),false);
});
test('option projection preserves native values, optgroup labels and disabled choices',()=>{
 const parent={tagName:'OPTGROUP',label:'Office',disabled:true};
 const values=readSelectOptions(native([
  {value:'',textContent:'Choose',disabled:false},
  {value:'101',textContent:'One',parentElement:parent},
  {value:'2',textContent:'Two',disabled:false}
 ]));
 assert.deepEqual(values.map(x=>x.value),['','101','2']);
 assert.deepEqual(values.map(x=>x.text),['Choose','One','Two']);
 assert.equal(values[1].group,'Office');
 assert.equal(values[1].disabled,true);
 assert.equal(values[2].disabled,false);
 assert.equal(Object.isFrozen(values[1]),true);
});
test('keyboard focus navigation wraps and excludes disabled items',()=>{
 const options=[{text:'Choose',disabled:true},{text:'Alpha',disabled:false},
  {text:'Bravo',disabled:true},{text:'Charlie',disabled:false}];
 assert.equal(nextSelectableIndex(options,-1,1),1);
 assert.equal(nextSelectableIndex(options,1,1),3);
 assert.equal(nextSelectableIndex(options,3,1),1);
 assert.equal(nextSelectableIndex(options,1,-1),3);
 assert.equal(nextSelectableIndex(options,0,-1),3);
 assert.equal(nextSelectableIndex([{disabled:true}],0,1),-1);
 assert.equal(nextSelectableIndex([],0,1),-1);
});
test('typeahead is case insensitive, cycles, and never selects disabled options',()=>{
 const opts=[{text:'Alpha',disabled:false},{text:'Beta',disabled:true},
  {text:'Blue',disabled:false},{text:'Bravo',disabled:false}];
 assert.equal(findSelectTypeahead(opts,'b',0),2);
 assert.equal(findSelectTypeahead(opts,'b',2),3);
 assert.equal(findSelectTypeahead(opts,'AL',2),0);
 assert.equal(findSelectTypeahead(opts,'beta'),-1);
 assert.equal(findSelectTypeahead(opts,'z'),-1);
});
test('pinned version-correct Floating UI and semantic select-only WAI-ARIA roles',()=>{
 assert.equal(FLOATING_CORE_URL,
  'https://unpkg.com/@floating-ui/core@1.8.0/dist/floating-ui.core.umd.min.js');
 assert.equal(FLOATING_SELECT_URL,
  'https://unpkg.com/@floating-ui/dom@1.8.0/dist/floating-ui.dom.umd.min.js');
 assert.match(source,/loadFloating=loadPinnedFloatingUI/);
 assert.match(source,/globalThis\.FloatingUIDOM/);
 assert.match(source,/doc\.head\.append\(script\)/);
 for(const attr of ["'combobox'","'listbox'","'option'","'aria-expanded'",
  "'aria-controls'","'aria-activedescendant'","'aria-selected'",
  "'aria-required'","'aria-disabled'"])
  assert.ok(source.includes(attr),attr);
 for(const key of ["'ArrowDown'","'ArrowUp'","'Home'","'End'",
  "'Escape'","'Enter'","'Tab'"])
  assert.ok(source.includes(key),key);
 assert.match(source,/event\.stopPropagation\(\);close\(true\)/);
 assert.match(source,/scrollIntoView\?\.\(\{block:'nearest'\}\)/);
});
test('native select stays the source of truth for form validation and delegated updates',()=>{
 assert.match(source,/select\.value=item\.value/);
 assert.match(source,/new Event\('input',\{bubbles:true\}\)/);
 assert.match(source,/new Event\('change',\{bubbles:true\}\)/);
 assert.match(source,/select\.addEventListener\('invalid'/);
 assert.match(source,/select\.setAttribute\('aria-hidden','true'\)/);
 assert.match(source,/select\.tabIndex=-1/);
 assert.match(source,/originalHidden/);
 assert.match(source,/originalTab/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|sendBeacon|geolocation|\.rpc\(|\.commit\(|eval\(/);
 assert.doesNotMatch(source,/\.innerHTML\s*=|insertAdjacentHTML|document\.write/);
});
test('floating positioning and motion use documented API with lifecycle disposal',()=>{
 for(const item of ['computePosition','autoUpdate','offset','flip','shift','size'])
  assert.ok(source.includes(item),item);
 assert.match(source,/strategy:'absolute'/);
 assert.match(source,/aps-select-above/);
 assert.match(source,/aps-select-compact/);
 assert.doesNotMatch(source,/\.style\s*\.|\.style\s*=|\.cssText\s*=|setAttribute\s*\(\s*['"]style['"]/);
 assert.match(source,/stopPosition\?\.\(\)/);
 assert.match(source,/observer\.disconnect\(\)/);
 assert.match(source,/new MutationObserver\(/);
 assert.match(source,/AbortController\(\)/);
 assert.match(source,/prefers-reduced-motion: reduce/);
 assert.match(source,/panel\.animate\(\[/);
 assert.match(source,/win\.requestAnimationFrame/);
 assert.match(source,/data-aps-select-native/);
});
test('startup and Pages smoke register global dropdown across all dynamic routes and dialogs',()=>{
 assert.match(app,/import \{startSelectExperience\} from '\.\/select-experience\.js'/);
 assert.match(app,/startSelectExperience\(document\.body\)/);
 assert.match(app,/root\.addEventListener\('change'/);
 assert.match(index,/frontend\/select-experience\.css/);
 assert.match(index,/script-src 'self' https:\/\/unpkg\.com;/);
 assert.doesNotMatch(index,/cdn\.jsdelivr\.net/);
 assert.match(index,/style-src-attr 'none'/);
 assert.match(smoke,/'frontend\/select-experience\.js'/);
 assert.match(smoke,/'frontend\/select-experience\.css'/);
 assert.match(readFileSync('frontend/user-role-management.js','utf8'),/data-action="user-role-select"/);
});
test('global selector styles have CSS variables, transforms, focus and high-contrast rules',()=>{
 for(const fragment of ['--aps-select-surface','--aps-select-focus',
  '.aps-select-source','.aps-select-anchor','.aps-select-trigger','.aps-select-listbox',
  '.aps-select-option','transform:translateY','border-radius:13px',
  ':focus-visible','@media(max-width:720px)',
  '@media(prefers-reduced-motion:reduce)','@media(prefers-contrast:more)',
  '@media(forced-colors:active)'])
  assert.ok(css.includes(fragment),fragment);
 assert.doesNotMatch(css,/@keyframes|animation:.*infinite|@import|url\(https?:/);
});
test('without a DOM, the enhancement is a no-op and native selects remain usable',()=>{
 const cleanup=startSelectExperience(null,{loadFloating:()=>{throw Error('Should not load');}});
 assert.equal(typeof cleanup,'function');
 assert.doesNotThrow(cleanup);
});

// A lightweight DOM harness exercises the full interaction without third-party packages.
class ElementFake{
 constructor(tag,doc){
  this.nodeType=1;this.tagName=tag.toUpperCase();this.doc=doc;
  this.children=[];this.parentElement=null;this.attributes=new Map();
  this.dataset={};this.style={};this.handlers=new Map();this.isConnected=true;
  const values=new Set();
  this.classList={
   add:name=>values.add(name),remove:name=>values.delete(name),
   contains:name=>values.has(name),
   toggle:(name,on)=>{if(on)values.add(name);else values.delete(name);}
  };
 }
 getAttribute(name){return this.attributes.has(name)?this.attributes.get(name):null;}
 setAttribute(name,value){this.attributes.set(name,String(value));}
 removeAttribute(name){this.attributes.delete(name);}
 hasAttribute(name){return this.attributes.has(name);}
 append(...nodes){
  for(const node of nodes){
   if(node.parentElement){
    const index=node.parentElement.children.indexOf(node);
    if(index>=0)node.parentElement.children.splice(index,1);
   }
   node.parentElement=this;node.isConnected=true;this.children.push(node);
  }
 }
 insertAdjacentElement(position,node){
  assert.equal(position,'afterend');
  const index=this.parentElement.children.indexOf(this);
  this.parentElement.children.splice(index+1,0,node);
  node.parentElement=this.parentElement;node.isConnected=true;
 }
 remove(){
  if(this.parentElement){
   const index=this.parentElement.children.indexOf(this);
   if(index>=0)this.parentElement.children.splice(index,1);
  }
  this.parentElement=null;this.isConnected=false;
 }
 contains(node){
  while(node){if(node===this)return true;node=node.parentElement;}
  return false;
 }
 querySelectorAll(sel){
  const all=[];
  function collect(node){
   for(const child of node.children){
    if(sel==='select'&&child.tagName==='SELECT')all.push(child);
    collect(child);
   }
  }
  collect(this);return all;
 }
 matches(sel){return sel==='select'&&this.tagName==='SELECT';}
 closest(sel){
  if(sel==='select')return this.tagName==='SELECT'?this:this.parentElement?.closest(sel);
  if(sel==='[data-option-index]')return this.hasAttribute('data-option-index')?this:null;
  return null;
 }
 addEventListener(event,handler){
  const list=this.handlers.get(event)||[];list.push(handler);this.handlers.set(event,list);
 }
 dispatchEvent(event){
  this.doc.events.push(event.type);
  for(const handler of this.handlers.get(event.type)||[])handler(event);
  return true;
 }
 emit(type,props={}){
  const e={type,target:this,preventDefault(){this.prevented=true;},
   stopPropagation(){this.stopped=true;},...props};
  for(const callback of this.handlers.get(type)||[])callback(e);
  return e;
 }
 focus(){this.doc.focused=this;}
 getBoundingClientRect(){return {left:16,right:256,width:240,top:32,bottom:74,height:42};}
 scrollIntoView(){}
}
test('mock DOM: popup opens, chooses native value, dispatches change, and disposes',async()=>{
 const saved={document:globalThis.document,window:globalThis.window,
  MutationObserver:globalThis.MutationObserver};
 let observer;
 const doc={events:[],addEventListener(){},removeEventListener(){}};
 doc.createElement=tag=>new ElementFake(tag,doc);
 doc.body=doc.createElement('body');
 const select=doc.createElement('select');
 select.options=[{value:'',textContent:'Choose'},
  {value:'valid-id',textContent:'Verified Member'}];
 select.name='member';select.labels=[];
 select.selectedIndex=0;select.disabled=false;select.required=true;
 select.validity={valueMissing:false};
 Object.defineProperty(select,'value',{
  get(){return this.options[this.selectedIndex].value;},
  set(value){this.selectedIndex=this.options.findIndex(opt=>opt.value===value);}
 });
 doc.body.append(select);
 const win={innerWidth:950,requestAnimationFrame:fn=>fn(),
  matchMedia:()=>({matches:false})};
 class MO{
  constructor(callback){this.callback=callback;observer=this;}
  observe(){}disconnect(){}
 }
 const lib={
  computePosition:async()=>({x:25,y:50}),
  autoUpdate(_ref,_panel,callback){void callback();return ()=>{};},
  offset:()=>({}),flip:()=>({}),shift:()=>({}),size:()=>({})
 };
 try{
  Object.defineProperty(globalThis,'document',{value:doc,configurable:true});
  Object.defineProperty(globalThis,'window',{value:win,configurable:true});
  Object.defineProperty(globalThis,'MutationObserver',{value:MO,configurable:true});
  const stop=startSelectExperience(doc.body,{loadFloating:async()=>lib});
  for(let i=0;i<8;i++)await Promise.resolve();
  const anchor=doc.body.children.find(n=>n.className==='aps-select-anchor');
  assert.ok(anchor,'a select positioning anchor is rendered');
  const trigger=anchor.children.find(n=>n.getAttribute('role')==='combobox');
  assert.ok(trigger,'a progressive combobox is rendered');
  assert.equal(select.getAttribute('aria-hidden'),'true');
  assert.equal(select.tabIndex,-1);
  trigger.emit('click');
  const list=anchor.children.find(n=>n.getAttribute('role')==='listbox');
  assert.ok(list,'a popup listbox is positioned in the select anchor');
  assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.equal(trigger.getAttribute('aria-controls'),list.id);
  const option=list.children.find(n=>n.getAttribute('data-option-index')==='1');
  list.emit('click',{target:option});
  assert.equal(select.value,'valid-id');
  assert.deepEqual(doc.events.filter(x=>x==='input'||x==='change'),['input','change']);
  assert.equal(trigger.getAttribute('aria-expanded'),'false');
  assert.ok(!anchor.children.find(n=>n.getAttribute('role')==='listbox'));
  select.remove();
  observer.callback([{type:'childList',target:doc.body,addedNodes:[]}]);
  assert.equal(trigger.isConnected,false);
  stop();
 }finally{
  for(const [name,value] of Object.entries(saved)){
   if(value===undefined)delete globalThis[name];
   else Object.defineProperty(globalThis,name,{value,configurable:true});
  }
 }
});
