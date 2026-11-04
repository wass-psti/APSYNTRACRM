import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 FORM_FIELD_SELECTOR,FORM_FIELD_TYPES,isFormField,describeFieldValidity,
 appendDescriptionId,removeDescriptionId,startInputExperience
} from '../input-experience.js';
import {createLucideActionIcon,lucideIconNodes} from '../action-menu-experience.js';

const source=readFileSync('frontend/input-experience.js','utf8');
const css=readFileSync('frontend/input-experience.css','utf8');
const app=readFileSync('frontend/app.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

function field(type='text',extra={}){
 return {tagName:'INPUT',type,disabled:false,readOnly:false,
  classList:{contains:()=>false},
  closest:()=>null,hasAttribute:()=>false,
  validity:{valid:true},value:'',...extra};
}
test('field eligibility covers forms across the app without replacing select/search/boolean controls',()=>{
 for(const type of ['text','email','password','tel','url','number','date','time',
  'datetime-local','month','week'])assert.equal(isFormField(field(type)),true,type);
 assert.deepEqual([...FORM_FIELD_TYPES].sort(),
  ['text','email','password','tel','url','number','date','time',
   'datetime-local','month','week'].sort());
 assert.equal(isFormField({...field(),tagName:'TEXTAREA',type:undefined}),true);
 for(const type of ['search','checkbox','radio','hidden','range','color','file',
  'submit','reset','button','image'])assert.equal(isFormField(field(type)),false,type);
 assert.equal(isFormField({...field(),tagName:'SELECT'}),false);
 assert.equal(isFormField({...field(),disabled:true}),false);
 assert.equal(isFormField({...field(),readOnly:true}),false);
 assert.equal(isFormField({...field(),hasAttribute:()=>true}),false);
 assert.equal(isFormField({...field(),closest:()=>({})}),false);
 assert.equal(isFormField({...field(),classList:{contains:name=>name==='search-input'}}),false);
 assert.match(FORM_FIELD_SELECTOR,/textarea$/);
 assert.doesNotMatch(FORM_FIELD_SELECTOR,/select|checkbox":/);
});
test('native Constraint Validation API projects bounded and safe required/format errors',()=>{
 const required=field('text',{validity:{valid:false,valueMissing:true}});
 assert.equal(describeFieldValidity(required),'This field is required.');
 const badEmail=field('email',{validity:{valid:false,typeMismatch:true}});
 const badUrl=field('url',{validity:{valid:false,typeMismatch:true}});
 assert.equal(describeFieldValidity(badEmail),'Enter a valid email address.');
 assert.equal(describeFieldValidity(badUrl),'Enter a valid web address.');
 assert.equal(describeFieldValidity(field('number',{validity:{valid:false,badInput:true}})),
  'Enter a valid number, date, or time.');
 assert.equal(describeFieldValidity(field('text',{validity:{valid:false,patternMismatch:true}})),
  'Use the required format.');
 assert.equal(describeFieldValidity(field('text',{validity:{valid:false,stepMismatch:true}})),
  'Use an allowed increment.');
 assert.equal(describeFieldValidity(field('text',{validity:{valid:false,customError:true}})),
  'Review the required value for this field.');
 assert.equal(describeFieldValidity(field()),'');
});
test('length and range messages respect native limits but never interpolate entered values',()=>{
 const secret='SuperSecretShouldNotBeDisplayed';
 const inputs=[
  field('password',{value:secret,minLength:12,validity:{valid:false,tooShort:true}}),
  field('text',{value:secret,maxLength:60,validity:{valid:false,tooLong:true}}),
  field('number',{value:secret,min:'1',validity:{valid:false,rangeUnderflow:true}}),
  field('date',{value:secret,max:'2026-11-30',validity:{valid:false,rangeOverflow:true}})
 ];
 const messages=inputs.map(describeFieldValidity);
 assert.deepEqual(messages,['Use at least 12 characters.','Use no more than 60 characters.',
  'Enter a value on or after 1.','Enter a value on or before 2026-11-30.']);
 assert.ok(messages.every(x=>!x.includes(secret)));
});
test('feedback ids append once, remove only the generated id and preserve original help text',()=>{
 assert.equal(appendDescriptionId('','aps-1'),'aps-1');
 assert.equal(appendDescriptionId('original-help','aps-1'),'original-help aps-1');
 assert.equal(appendDescriptionId('original-help aps-1','aps-1'),
  'original-help aps-1');
 assert.equal(removeDescriptionId('other aps-1 another','aps-1'),'other another');
 assert.equal(removeDescriptionId('aps-1','aps-1'),'');
});
test('Lucide error icons are sanitized local SVG and do not load external assets',()=>{
 const nodes=lucideIconNodes('circle-alert');
 assert.equal(nodes[0][0],'circle');
 assert.ok(nodes.some(([tag,attrs])=>tag==='path'&&attrs.d==='M12 8v4'));
 const created=[];
 const doc={createElementNS:(ns,tag)=>{
  assert.equal(ns,'http://www.w3.org/2000/svg');
  const node={tag,attributes:{},children:[],
   setAttribute(name,value){this.attributes[name]=value;},
   append(child){this.children.push(child);}};
  created.push(node);return node;
 }};
 const svg=createLucideActionIcon('circle-alert',doc);
 assert.equal(svg.attributes['aria-hidden'],'true');
 assert.ok(svg.children.length>=3);
 assert.match(source,/createLucideActionIcon\('circle-alert',doc\)/);
 assert.doesNotMatch(source,/<svg|\.innerHTML\s*=|insertAdjacentHTML|document\.write/);
});
test('CSS provides composable visual states while retaining native date, time and textarea semantics',()=>{
 for(const name of ['--aps-field-surface','--aps-field-focus','--aps-field-error',
  'input.aps-field-control','textarea.aps-field-control',
  '.aps-field-invalid','.aps-field-valid','.aps-field-feedback',
  '.aps-field-feedback-compact','.aps-auth-v2',
  '.board-inline-cell-form','.tt-native',':focus-visible',
  '@media(max-width:720px)','@media(prefers-reduced-motion:reduce)',
  '@media(prefers-contrast:more)','@media(forced-colors:active)'])
  assert.ok(css.includes(name),name);
 assert.match(css,/box-shadow:0 0 0 4px/);
 assert.match(css,/transform:translateY\(-1px\)/);
 assert.doesNotMatch(css,/@import|url\(https?:|@keyframes|animation:.*infinite|will-change/);
 assert.doesNotMatch(css,/input\[type="checkbox"\]\.aps-field-control/);
});
test('input enhancement preserves HTML form ownership, signed actions, native validity and strict CSP',()=>{
 assert.match(source,/control\.insertAdjacentElement\('afterend',feedback\)/);
 assert.match(source,/control\.addEventListener\('input',onInput/);
 assert.match(source,/control\.addEventListener\('change',onChange/);
 assert.match(source,/control\.addEventListener\('blur',onBlur/);
 assert.match(source,/control\.addEventListener\('invalid',onInvalid/);
 assert.match(source,/control\?\.validity/);
 assert.match(source,/new AbortController\(\)/);
 assert.match(source,/new MutationObserver\(/);
 assert.match(source,/observer\.disconnect\(\)/);
 assert.match(source,/doc\.addEventListener\('reset',reset,true\)/);
 assert.doesNotMatch(source,/event\.preventDefault\(\)|setCustomValidity\(|\.checkValidity\(|\.reportValidity\(/);
 assert.doesNotMatch(source,/\.style\s*\.|\.style\s*=|\.cssText\s*=|setAttribute\s*\(\s*["']style["']/);
 assert.doesNotMatch(source,/fetch\(|geolocation|localStorage|sessionStorage|sendBeacon|new Worker/);
 assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame\(/);
 assert.match(index,/style-src-attr 'none'/);
 assert.match(index,/script-src 'self' https:\/\/unpkg\.com;/);
 assert.match(app,/await db\.allowed\(id,'manage'\)/);
});
test('validation is accessible, passive until touched, and respects reduced-motion preferences',()=>{
 assert.match(source,/feedback\.setAttribute\('role','status'\)/);
 assert.match(source,/feedback\.setAttribute\('aria-live','polite'\)/);
 assert.match(source,/feedback\.setAttribute\('aria-atomic','true'\)/);
 assert.match(source,/control\.setAttribute\('aria-invalid','true'\)/);
 assert.match(source,/appendDescriptionId\(control\.getAttribute\('aria-describedby'\),id\)/);
 assert.match(source,/removeOwnDescription\(\)/);
 assert.match(source,/if\(!shown\)\{shown=true;showErrorAnimation\(feedback,doc\);\}/);
 assert.match(source,/prefers-reduced-motion: reduce/);
 assert.match(source,/node\.animate\(\[/);
 assert.match(source,/if\(interacted\)refresh\(\)/);
});
test('production shell and Pages smoke register shared input assets after search menus',()=>{
 assert.match(app,/import \{startInputExperience\} from '\.\/input-experience\.js'/);
 assert.match(app,/startInputExperience\(document\.body\)/);
 assert.ok(app.indexOf('startInputExperience(document.body)')>
  app.indexOf('startSearchExperience(document.body)'));
 assert.ok(index.indexOf('frontend/input-experience.css')>
  index.indexOf('frontend/search-experience.css'));
 assert.match(smoke,/'frontend\/input-experience\.js'/);
 assert.match(smoke,/'frontend\/input-experience\.css'/);
 assert.match(index,/script type="module" src="\.\/frontend\/app\.js"/);
 const stop=startInputExperience(null);
 assert.equal(typeof stop,'function');
 assert.doesNotThrow(stop);
});
class FakeNode{
 constructor(tag,doc){
  this.nodeType=1;this.tagName=tag.toUpperCase();this.ownerDocument=doc;
  this.children=[];this.parentElement=null;this.attributes=new Map();
  this.listeners=new Map();this.isConnected=true;this.hidden=false;
  const tokens=new Set();
  this.classList={add:key=>tokens.add(key),remove:key=>tokens.delete(key),
   contains:key=>tokens.has(key),toggle:(key,flag)=>{
    if(flag)tokens.add(key);else tokens.delete(key);return flag;}};
 }
 getAttribute(key){return this.attributes.has(key)?this.attributes.get(key):null;}
 setAttribute(key,value){this.attributes.set(key,String(value));}
 removeAttribute(key){this.attributes.delete(key);}
 hasAttribute(key){return this.attributes.has(key);}
 append(...items){
  for(const item of items){
   if(item.parentElement){
    const prior=item.parentElement.children.indexOf(item);
    if(prior>=0)item.parentElement.children.splice(prior,1);
   }
   item.parentElement=this;item.isConnected=true;this.children.push(item);
  }
 }
 insertAdjacentElement(location,node){
  const target=this.parentElement;
  assert.ok(target);
  const at=target.children.indexOf(this);
  target.children.splice(at+(location==='afterend'?1:0),0,node);
  node.parentElement=target;node.isConnected=true;
 }
 remove(){
  if(this.parentElement){
   const at=this.parentElement.children.indexOf(this);
   if(at>=0)this.parentElement.children.splice(at,1);
  }
  this.parentElement=null;this.isConnected=false;
 }
 contains(other){
  while(other){if(other===this)return true;other=other.parentElement;}
  return false;
 }
 matches(selector){
  return selector===FORM_FIELD_SELECTOR&&['INPUT','TEXTAREA'].includes(this.tagName);
 }
 querySelectorAll(selector){
  const result=[];
  const scan=node=>{
   for(const child of node.children){
    if(child.matches(selector))result.push(child);
    scan(child);
   }
  };
  scan(this);return result;
 }
 closest(){return null;}
 addEventListener(event,fn){
  const list=this.listeners.get(event)||[];
  list.push(fn);this.listeners.set(event,list);
 }
 dispatch(event){
  const e={type:event,prevented:false,preventDefault(){this.prevented=true;}};
  for(const fn of this.listeners.get(event)||[])fn(e);
  return e;
 }
}
test('DOM integration: blur/invalid update ARIA without blocking native submit, then input and reset clear error',async()=>{
 const prev={document:globalThis.document,MutationObserver:globalThis.MutationObserver};
 let observed;
 const doc={defaultView:{matchMedia:()=>({matches:true})},listeners:new Map(),
  addEventListener(type,fn){
   const l=this.listeners.get(type)||[];l.push(fn);this.listeners.set(type,l);
  },removeEventListener(type,fn){
   const l=this.listeners.get(type)||[];this.listeners.set(type,l.filter(x=>x!==fn));
  },createElement:tag=>new FakeNode(tag,doc),
  createElementNS:(_ns,tag)=>new FakeNode(tag,doc)};
 doc.body=doc.createElement('body');
 const form=doc.createElement('form');
 doc.body.append(form);
 const input=doc.createElement('input');
 input.tagName='INPUT';input.type='email';input.value='';
 input.disabled=false;input.readOnly=false;input.validity={valid:false,valueMissing:true};
 input.setAttribute('aria-describedby','original-help');
 form.append(input);
 class Observer{constructor(fn){this.fn=fn;observed=this;}observe(){}disconnect(){}}
 try{
  globalThis.document=doc;
  globalThis.MutationObserver=Observer;
  const stop=startInputExperience(doc.body);
  assert.equal(input.classList.contains('aps-field-control'),true);
  assert.equal(form.children.length,2);
  const feedback=form.children[1];
  assert.equal(feedback.hidden,true);
  assert.equal(input.hasAttribute('aria-invalid'),false);
  const nativeInvalid=input.dispatch('invalid');
  assert.equal(nativeInvalid.prevented,false,'native invalid event is not cancelled');
  assert.equal(feedback.hidden,false);
  assert.equal(input.getAttribute('aria-invalid'),'true');
  assert.match(input.getAttribute('aria-describedby'),/original-help aps-field-validation-/);
  assert.equal(feedback.children.at(-1).textContent,'This field is required.');
  input.value='member@example.test';
  input.validity={valid:true};
  input.dispatch('input');
  assert.equal(feedback.hidden,true);
  assert.equal(input.getAttribute('aria-describedby'),'original-help');
  assert.equal(input.hasAttribute('aria-invalid'),false);
  assert.equal(input.classList.contains('aps-field-valid'),true);
  input.value='';
  input.validity={valid:false,valueMissing:true};
  input.dispatch('blur');
  assert.equal(feedback.hidden,false);
  for(const resetFn of doc.listeners.get('reset')||[])resetFn({target:form});
  await Promise.resolve();
  assert.equal(feedback.hidden,true);
  assert.equal(input.hasAttribute('aria-invalid'),false);
  assert.equal(input.getAttribute('aria-describedby'),'original-help');
  stop();
  assert.equal(input.classList.contains('aps-field-control'),false);
  assert.equal(form.children.length,1);
  assert.equal(doc.listeners.get('reset').length,0);
  assert.ok(observed);
 }finally{
  for(const [key,value] of Object.entries(prev)){
   if(value===undefined)delete globalThis[key];
   else globalThis[key]=value;
  }
 }
});
