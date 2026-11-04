/** Global three-dot action menus — accessible progressive enhancement.
 * Native <details> and existing signed data-action handlers remain authoritative.
 * Floating UI shares the strict-CSP, pinned loader with select-experience.js.
 * Decorative SVG path data are from Lucide (ISC license), rendered as DOM nodes.
 * No new permissions, remote data access, inline styles or CSSOM mutations.
 */
import {loadPinnedFloatingUI} from './select-experience.js';

export const ACTION_MENU_SELECTORS=[
 '.board-card-actions','.board-group-actions','.board-actions-menu'
];
export const ACTION_MENU_MAX_ITEMS=32;
let serial=0;

const LUCIDE_NODES=Object.freeze({
 'circle-alert':[['circle',{cx:12,cy:12,r:10}],['path',{d:'M12 8v4'}],['path',{d:'M12 16h.01'}]],
 'circle-check':[['circle',{cx:12,cy:12,r:10}],['path',{d:'m8 12 2.5 2.5L16 9'}]],
 'search':[['circle',{cx:11,cy:11,r:8}],['path',{d:'m21 21-4.35-4.35'}]],
 'x':[['path',{d:'M18 6 6 18'}],['path',{d:'m6 6 12 12'}]],
 'ellipsis-vertical':[['circle',{cx:12,cy:5,r:1}],['circle',{cx:12,cy:12,r:1}],['circle',{cx:12,cy:19,r:1}]],
 'pencil':[['path',{d:'M12 19l7-7 3 3-7 7-4 1 1-4Z'}],['path',{d:'m18 13 3 3'}]],
 'trash-2':[['path',{d:'M3 6h18'}],['path',{d:'M8 6V4h8v2'}],['path',{d:'m19 6-1 14H6L5 6'}],['path',{d:'M10 11v6'}],['path',{d:'M14 11v6'}]],
 'rotate-ccw':[['path',{d:'M3 11a9 9 0 1 1 2.65 6.35'}],['path',{d:'M3 3v8h8'}]],
 'users':[['path',{d:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'}],['circle',{cx:9,cy:7,r:4}],['path',{d:'M22 21v-2a4 4 0 0 0-3-3.87'}],['path',{d:'M16 3.13a4 4 0 0 1 0 7.75'}]],
 'settings-2':[['path',{d:'M4 21v-7'}],['path',{d:'M4 10V3'}],['path',{d:'M12 21v-9'}],['path',{d:'M12 8V3'}],['path',{d:'M20 21v-5'}],['path',{d:'M20 12V3'}],['path',{d:'M1 14h6'}],['path',{d:'M9 8h6'}],['path',{d:'M17 16h6'}]],
 'columns-3':[['rect',{x:3,y:3,width:18,height:18,rx:2}],['path',{d:'M9 3v18'}],['path',{d:'M15 3v18'}]],
 'check-square':[['rect',{x:3,y:3,width:18,height:18,rx:2}],['path',{d:'m9 12 2 2 4-4'}]],
 'ruler':[['path',{d:'M21.3 8.7 15.3 2.7a1 1 0 0 0-1.4 0L2.7 13.9a1 1 0 0 0 0 1.4l6 6a1 1 0 0 0 1.4 0L21.3 10.1a1 1 0 0 0 0-1.4Z'}],['path',{d:'m7.5 10.5 2 2'}],['path',{d:'m10.5 7.5 2 2'}],['path',{d:'m13.5 4.5 2 2'}]],
 'layout-grid':[['rect',{x:3,y:3,width:7,height:7,rx:1}],['rect',{x:14,y:3,width:7,height:7,rx:1}],['rect',{x:3,y:14,width:7,height:7,rx:1}],['rect',{x:14,y:14,width:7,height:7,rx:1}]],
 'shield-alert':[['path',{d:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z'}],['path',{d:'M12 8v4'}],['path',{d:'M12 16h.01'}]],
 'archive':[['rect',{x:2,y:4,width:20,height:4,rx:1}],['path',{d:'M4 8v12h16V8'}],['path',{d:'M10 12h4'}]],
 'info':[['circle',{cx:12,cy:12,r:10}],['path',{d:'M12 16v-4'}],['path',{d:'M12 8h.01'}]],
 'arrow-left-right':[['path',{d:'M8 3 4 7l4 4'}],['path',{d:'M4 7h16'}],['path',{d:'m16 21 4-4-4-4'}],['path',{d:'M20 17H4'}]]
});
const ACTION_ICONS=Object.freeze({
 'board-card-edit':'pencil','board-card-restore':'rotate-ccw',
 'board-card-trash':'trash-2','board-members':'users',
 'board-structure':'columns-3','board-layout-reset':'rotate-ccw',
 'group-inline-edit':'pencil','group-select-visible':'check-square',
 'group-delete':'trash-2','group-delete-request':'shield-alert',
 'board-column-set-width':'ruler','board-column-reset-width':'rotate-ccw',
 'board-column-manage':'columns-3','board-column-delete-custom':'trash-2'
});
export function actionIconName(action){
 const value=String(action||'').toLowerCase();
 if(ACTION_ICONS[value])return ACTION_ICONS[value];
 if(/delete|trash|remove/.test(value))return 'trash-2';
 if(/restore|reset|revert/.test(value))return 'rotate-ccw';
 if(/edit|rename/.test(value))return 'pencil';
 if(/member|people|user/.test(value))return 'users';
 if(/width|size/.test(value))return 'ruler';
 if(/column|layout|view/.test(value))return 'columns-3';
 return 'settings-2';
}
export function lucideIconNodes(name){
 return LUCIDE_NODES[name]||LUCIDE_NODES['settings-2'];
}
export function createLucideActionIcon(name,doc=globalThis.document){
 if(!doc?.createElementNS)return null;
 const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('class','aps-action-icon');
 svg.setAttribute('width','17');svg.setAttribute('height','17');
 svg.setAttribute('viewBox','0 0 24 24');
 svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
 svg.setAttribute('stroke-width','1.8');
 svg.setAttribute('stroke-linecap','round');
 svg.setAttribute('stroke-linejoin','round');
 svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 for(const [tag,attributes] of lucideIconNodes(name)){
  const node=doc.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  svg.append(node);
 }
 return svg;
}
export function nextActionIndex(items,current,step=1){
 if(!items?.length)return -1;
 for(let count=1;count<=items.length;count++){
  const n=((current+step*count)%items.length+items.length)%items.length;
  if(!items[n]?.disabled)return n;
 }
 return -1;
}
export function actionTypeahead(items,text,after=-1){
 const query=String(text||'').trim().toLocaleLowerCase();
 if(!query||!items?.length)return -1;
 for(let count=1;count<=items.length;count++){
  const i=(after+count+items.length)%items.length;
  if(!items[i].disabled&&String(items[i].label||'').toLocaleLowerCase().startsWith(query))
   return i;
 }
 return -1;
}
function menuButtons(menu){
 return Array.from(menu?.children||[]).filter(element=>
  element.matches?.('button[data-action],a[href]')).slice(0,ACTION_MENU_MAX_ITEMS);
}
function optionsFor(menu){
 return menuButtons(menu).map(node=>({node,disabled:node.disabled||
  node.getAttribute('aria-disabled')==='true',label:node.textContent?.trim()||''}));
}
function labelSummary(summary){
 const before=summary.getAttribute('aria-label')||summary.textContent?.trim()||
  summary.getAttribute('title')||'More actions';
 return String(before).replace(/^[··•⋮\s]+$/,'More actions').slice(0,180);
}
function enhanceVisuals(trigger,menu,{replaceTrigger=false}={}){
 const doc=trigger.ownerDocument;
 if(replaceTrigger&&!trigger.querySelector('.aps-action-icon')){
  const label=labelSummary(trigger);
  trigger.setAttribute('aria-label',label);
  trigger.setAttribute('title',trigger.getAttribute('title')||label);
  const icon=createLucideActionIcon('ellipsis-vertical',doc);
  if(icon){trigger.replaceChildren(icon);}
 }
 for(const item of menuButtons(menu)){
  if(item.querySelector('.aps-action-icon'))continue;
  const glyph=createLucideActionIcon(actionIconName(item.dataset?.action),doc);
  if(glyph)item.prepend(glyph);
 }
}
function animateMenu(menu){
 const win=menu.ownerDocument?.defaultView||globalThis.window;
 if(typeof menu.animate!=='function'||win?.matchMedia?.(
  '(prefers-reduced-motion: reduce)')?.matches)return;
 menu.animate([{opacity:0,transform:'translateY(-5px) scale(.985)'},
  {opacity:1,transform:'translateY(0) scale(1)'}],
  {duration:145,easing:'cubic-bezier(.2,.8,.2,1)'});
}
function createKeyboardBehavior(trigger,menu,close){
 let typed='',lastType=0;
 const actions=()=>optionsFor(menu);
 const focus=(index)=>{
  const opts=actions();
  if(index>=0&&opts[index]&&!opts[index].disabled)opts[index].node.focus();
 };
 function move(step){
  const opts=actions();
  const index=opts.findIndex(option=>option.node===menu.ownerDocument.activeElement);
  focus(nextActionIndex(opts,index,step));
 }
 function keydown(event){
  if(event.key==='Escape'){
   event.preventDefault();event.stopPropagation();
   close(true);return;
  }
  if(event.key==='Tab'){
   close(false);return;
  }
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();event.stopPropagation();
   move(event.key==='ArrowDown'?1:-1);return;
  }
  if(event.key==='Home'||event.key==='End'){
   event.preventDefault();event.stopPropagation();
   const opts=actions(),index=event.key==='Home'?
    nextActionIndex(opts,-1,1):nextActionIndex(opts,0,-1);
   focus(index);return;
  }
  if(event.key==='Enter'||event.key===' '){
   const current=menu.ownerDocument.activeElement;
   if(!current?.matches?.('button[data-action],a[href]'))return;
   event.preventDefault();event.stopPropagation();
   if(current.disabled||current.getAttribute('aria-disabled')==='true')return;
   current.click();return;
  }
  if(event.key.length===1&&!event.altKey&&!event.ctrlKey&&!event.metaKey){
   const now=Date.now();
   typed=now-lastType>700?event.key:typed+event.key;lastType=now;
   const opts=actions(),index=opts.findIndex(o=>o.node===menu.ownerDocument.activeElement);
   const to=actionTypeahead(opts,typed,index);
   if(to>=0){event.preventDefault();event.stopPropagation();focus(to);}
  }
 }
 function focusBoundary(edge='first'){
  const opts=actions();
  focus(edge==='last'?nextActionIndex(opts,0,-1):nextActionIndex(opts,-1,1));
 }
 return {keydown,focusBoundary};
}
/** Existing script CSP has no inline style attribute exemption.
 * Floating UI calculates collisions; predefined CSS classes position the menus.
 * CSS anchors cover supporting engines; native <details> is always the fallback.
 */
function attachFloatingPosition(trigger,menu,alive){
 let cleanup=null,disposed=false;
 void loadPinnedFloatingUI().then(lib=>{
  if(disposed||!alive()||!lib?.autoUpdate||!lib?.computePosition)return;
  const reposition=()=>lib.computePosition(trigger,menu,{
   strategy:'absolute',placement:'bottom-end',
   middleware:[lib.offset(8),lib.flip({padding:10}),lib.shift({padding:10}),
    lib.size({padding:10,apply({availableHeight}){
     menu.classList.toggle('aps-menu-compact',availableHeight<180);
     menu.classList.toggle('aps-menu-medium',availableHeight>=180&&availableHeight<270);
    }})]
  }).then(({placement,middlewareData})=>{
   if(disposed||!alive())return;
   menu.classList.toggle('aps-menu-above',placement.startsWith('top'));
   menu.classList.toggle('aps-menu-align-start',
    placement.endsWith('start')||Number(middlewareData?.shift?.x||0)<-6);
  }).catch(()=>{});
  cleanup=lib.autoUpdate(trigger,menu,reposition,{
   ancestorScroll:true,ancestorResize:true,elementResize:true,layoutShift:true
  });
  void reposition();
 }).catch(()=>{});
 return ()=>{disposed=true;cleanup?.();cleanup=null;};
}
/** Enhance the existing column header context menu, preserving its action dispatch. */
export function enhanceActionContextMenu(trigger,menu,{close=()=>{}}={}){
 if(!trigger?.isConnected||!menu?.isConnected)return ()=>{};
 const doc=menu.ownerDocument,abort=new AbortController();
 trigger.setAttribute('aria-haspopup','menu');
 trigger.setAttribute('aria-expanded','true');
 menu.classList.add('aps-action-popover');
 menu.setAttribute('role','menu');
 menu.setAttribute('aria-label',menu.getAttribute('aria-label')||
  trigger.getAttribute('aria-label')||'Column actions');
 enhanceVisuals(trigger,menu);
 for(const item of menuButtons(menu)){
  item.setAttribute('role','menuitem');item.tabIndex=-1;
  if(item.disabled)item.setAttribute('aria-disabled','true');
 }
 const keyboard=createKeyboardBehavior(trigger,menu,focus=>{
  close();if(focus&&trigger.isConnected)trigger.focus();
 });
 menu.addEventListener('keydown',keyboard.keydown,{signal:abort.signal});
 menu.addEventListener('click',event=>{
  if(event.target.closest?.('[role="menuitem"]'))
   queueMicrotask(()=>{if(menu.isConnected)close();});
 },{signal:abort.signal});
 const stopPosition=attachFloatingPosition(trigger,menu,()=>menu.isConnected);
 animateMenu(menu);
 keyboard.focusBoundary();
 return ()=>{abort.abort();stopPosition();};
}
/** Dynamically enhance <details> action menus while leaving other details alone. */
export function startActionMenuExperience(root=globalThis.document?.body){
 const doc=root?.ownerDocument||globalThis.document;
 if(!root?.querySelectorAll||!doc||typeof MutationObserver!=='function')return ()=>{};
 let running=true,opened=null;
 const controllers=new Map(),columnButtons=new WeakSet();
 function attach(details){
  if(!details?.isConnected||controllers.has(details))return;
  const trigger=details.querySelector(':scope > summary');
  const menu=details.querySelector(
   ':scope > .board-card-actions-list,:scope > .board-group-actions-list,:scope > .board-actions-popover');
  if(!trigger||!menu)return;
  const abort=new AbortController(),hasItems=menuButtons(menu).length>0;
  const menuId=menu.id||'aps-action-menu-'+(++serial);
  const triggerId=trigger.id||menuId+'-trigger';
  trigger.id=triggerId;menu.id=menuId;
  trigger.setAttribute('role','button');
  trigger.setAttribute('aria-expanded',String(details.open));
  if(hasItems){
   trigger.setAttribute('aria-haspopup','menu');
   trigger.setAttribute('aria-controls',menuId);
   menu.setAttribute('role','menu');
   menu.setAttribute('aria-labelledby',triggerId);
   for(const action of menuButtons(menu)){
    action.setAttribute('role','menuitem');
    action.tabIndex=-1;
    if(action.disabled)action.setAttribute('aria-disabled','true');
   }
  }
  details.classList.add('aps-action-surface');
  menu.classList.add('aps-action-popover');
  enhanceVisuals(trigger,menu,{replaceTrigger:true});
  let stopPosition=null,shown=false;
  const close=(focus=false)=>{
   if(!details.open)return;
   details.open=false;
   sync();
   if(focus&&trigger.isConnected)trigger.focus();
  };
  const keyboard=createKeyboardBehavior(trigger,menu,close);
  const controller={details,close,destroy(){
   stopPosition?.();stopPosition=null;
   abort.abort();if(opened===controller)opened=null;
   controllers.delete(details);
  }};
  function sync(){
   const open=details.open;
   trigger.setAttribute('aria-expanded',String(open));
   if(!open){
    shown=false;
    stopPosition?.();stopPosition=null;
    if(opened===controller)opened=null;
    menu.classList.remove('aps-menu-above','aps-menu-align-start',
     'aps-menu-compact','aps-menu-medium');
   }else if(!shown){
    if(opened&&opened!==controller)opened.close();
    shown=true;opened=controller;
    if(hasItems)stopPosition=attachFloatingPosition(trigger,menu,()=>details.open&&details.isConnected);
    animateMenu(menu);
   }
  }
  trigger.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&details.open){
    event.preventDefault();event.stopPropagation();close(true);return;
   }
   if(!hasItems||!['Enter',' ','ArrowDown','ArrowUp'].includes(event.key))return;
   event.preventDefault();event.stopPropagation();
   details.open=true;sync();
   keyboard.focusBoundary(event.key==='ArrowUp'?'last':'first');
  },{signal:abort.signal});
  menu.addEventListener('keydown',keyboard.keydown,{signal:abort.signal});
  menu.addEventListener('click',event=>{
   const item=event.target.closest?.('[role="menuitem"]');
   if(item&&!item.disabled)queueMicrotask(()=>{
    if(details.isConnected)close(false);
   });
  },{signal:abort.signal});
  details.addEventListener('toggle',sync,{signal:abort.signal});
  details.addEventListener('focusout',()=>queueMicrotask(()=>{
   if(details.open&&!details.contains(doc.activeElement))close(false);
  }),{signal:abort.signal});
  controllers.set(details,controller);
  if(details.open)sync();
 }
 function scan(node){
  if(node?.nodeType!==1)return;
  if(node.matches?.(ACTION_MENU_SELECTORS.join(',')))attach(node);
  node.querySelectorAll?.(ACTION_MENU_SELECTORS.join(',')).forEach(attach);
  const buttons=node.matches?.('.board-column-more')?[node]:Array.from(
   node.querySelectorAll?.('.board-column-more')||[]);
  for(const button of buttons){
   if(columnButtons.has(button))continue;
   columnButtons.add(button);
   const svg=createLucideActionIcon('ellipsis-vertical',doc);
   if(svg)button.replaceChildren(svg);
   button.setAttribute('aria-haspopup','menu');
   if(!button.hasAttribute('aria-expanded'))
    button.setAttribute('aria-expanded','false');
  }
 }
 const observer=new MutationObserver(records=>{
  if(!running)return;
  for(const record of records)
   if(record.type==='childList')record.addedNodes.forEach(scan);
  for(const controller of controllers.values())
   if(!controller.details.isConnected)controller.destroy();
 });
 observer.observe(root,{subtree:true,childList:true});
 const outside=event=>{
  for(const controller of controllers.values()){
   if(controller.details.open&&!controller.details.contains(event.target))
    controller.close(false);
  }
 };
 doc.addEventListener('pointerdown',outside,true);
 scan(root);
 return ()=>{
  if(!running)return;
  running=false;observer.disconnect();
  doc.removeEventListener('pointerdown',outside,true);
  for(const controller of controllers.values())controller.destroy();
  controllers.clear();
 };
}
