/** APSYNTRA CRM — progressive search-bar and authorized suggestion experience.
 * Existing inputs and delegated input handlers remain the source of truth.
 * No remote search, telemetry, persisted history, raw GPS, or permissions changes.
 * CSP-safe: Floating UI results only toggle predefined CSS classes.
 */
import {createLucideActionIcon} from './action-menu-experience.js';
import {loadPinnedFloatingUI} from './select-experience.js';
import {showForegroundPopover,supportsForegroundPopover} from './foreground-overlay.js';

export const SEARCH_SELECTOR='input[type="search"],input.search-input:not([type]),input.search-input[type="text"]';
export const MAX_SEARCH_SUGGESTIONS=6;
export const MAX_SEARCH_CANDIDATES=200;
export const LOCAL_SEARCH_SOURCES=Object.freeze({
 'board-search':'.board-card[data-searchable]',
 'search-issues':'.issue-row[data-searchable]',
 'search-board-items':'[data-searchable]',
 'search-system-roles':'tr[data-searchable]',
 'search-workspace-members':'tr[data-searchable]',
 'filter-role-permission-modules':'tr[data-searchable]',
 'search-role-proposals':'tr[data-searchable]'
});
let serial=0;
export function isSearchField(input){
 return input?.tagName==='INPUT'&&
  (input.type==='search'||input.classList?.contains?.('search-input')&&
    (input.type==='text'||!input.hasAttribute?.('type')))&&
  !input.disabled&&!input.readOnly&&!input.closest?.('[data-aps-search-native]');
}
export function normalizeSearchQuery(value){
 return String(value||'').trim().toLocaleLowerCase().slice(0,160);
}
export function localSearchOptions(nodes,query,{limit=MAX_SEARCH_SUGGESTIONS}={}){
 const q=normalizeSearchQuery(query);
 if(!q||!Array.isArray(nodes))return [];
 const out=[],seen=new Set();
 for(const node of nodes.slice(0,MAX_SEARCH_CANDIDATES)){
  if(!node||node.hidden||node.closest?.('[hidden],[aria-hidden="true"]'))continue;
  const haystack=String(node.getAttribute?.('data-searchable')||'').toLocaleLowerCase();
  if(!haystack.includes(q))continue;
  const visible=node.querySelector?.('h3,strong,.board-item-open,.board-heading-label');
  const label=String(visible?.textContent||'').replace(/\s+/g,' ').trim().slice(0,100);
  if(!label||!label.toLocaleLowerCase().includes(q)||seen.has(label.toLocaleLowerCase()))
   continue;
  seen.add(label.toLocaleLowerCase());
  out.push(Object.freeze({label}));
  if(out.length>=Math.max(1,Math.min(MAX_SEARCH_SUGGESTIONS,limit)))break;
 }
 return out;
}
export function nextSearchOption(options,current,direction=1){
 if(!options.length)return -1;
 return ((current+direction)%options.length+options.length)%options.length;
}
function accessibleName(input){
 const named=input.getAttribute('aria-label');
 if(named?.trim())return named.trim();
 const label=input.labels?.[0]?.textContent?.replace(/\s+/g,' ').trim();
 return String(label||input.getAttribute('placeholder')||'Search').slice(0,180);
}
function enterAnimation(node,win){
 if(typeof node.animate!=='function'||win?.matchMedia?.(
  '(prefers-reduced-motion: reduce)')?.matches)return;
 node.animate([{opacity:0,transform:'translateY(-5px) scale(.985)'},
  {opacity:1,transform:'translateY(0) scale(1)'}],
  {duration:140,easing:'cubic-bezier(.2,.8,.2,1)'});
}
function positionSuggestions(input,menu,stillOpen){
 let disposed=false,stop=null;
 void loadPinnedFloatingUI().then(lib=>{
  if(disposed||!stillOpen()||!lib?.computePosition||!lib?.autoUpdate)return;
  const position=()=>lib.computePosition(input,menu,{
   placement:'bottom-start',strategy:'absolute',
   middleware:[lib.offset(8),lib.flip({padding:9}),lib.shift({padding:9}),
    lib.size({padding:9,apply({availableHeight}){
     menu.classList.toggle('aps-search-compact',availableHeight<170);
     menu.classList.toggle('aps-search-medium',availableHeight>=170&&availableHeight<260);
    }})]
  }).then(({placement,middlewareData})=>{
   if(disposed||!stillOpen())return;
   menu.classList.toggle('aps-search-above',placement.startsWith('top'));
   menu.classList.toggle('aps-search-align-end',
    placement.endsWith('end')||Number(middlewareData?.shift?.x||0)<-6);
  }).catch(()=>{});
  stop=lib.autoUpdate(input,menu,position,{
   ancestorScroll:true,ancestorResize:true,elementResize:true,layoutShift:true
  });
  void position();
 }).catch(()=>{});
 return ()=>{disposed=true;stop?.();stop=null;};
}
/** Enhances present and future search inputs, including authorization-gated routes. */
export function startSearchExperience(root=globalThis.document?.body){
 const doc=root?.ownerDocument||globalThis.document;
 if(!root?.querySelectorAll||!doc||typeof MutationObserver!=='function')return ()=>{};
 const win=doc.defaultView||globalThis.window;
 let running=true,active=null;
 const controls=new Map();
 function attach(input){
  if(!running||!input?.isConnected||controls.has(input)||!isSearchField(input))return;
  // In older engines without top-layer anchors keep the existing search filter,
  // but never show an autocomplete popup that may be clipped.
  const source=win?.CSS?.supports&&!supportsForegroundPopover(doc)?
   null:LOCAL_SEARCH_SOURCES[input.id]||null;
  const id='aps-search-'+(++serial);
  const abort=new AbortController();
  const shell=doc.createElement('span');
  shell.className='aps-search-field';
  const icon=doc.createElement('span');
  icon.className='aps-search-mark';
  icon.setAttribute('aria-hidden','true');
  const glyph=createLucideActionIcon('search',doc);
  if(glyph)icon.append(glyph);
  const clear=doc.createElement('button');
  clear.className='aps-search-clear';
  clear.type='button';
  clear.setAttribute('aria-label','Clear '+accessibleName(input));
  clear.setAttribute('title','Clear search');
  const cross=createLucideActionIcon('x',doc);
  if(cross)clear.append(cross);
  const menu=doc.createElement('span');
  menu.id=id+'-listbox';
  menu.className='aps-search-suggestions';
  menu.setAttribute('role','listbox');
  menu.setAttribute('aria-label',accessibleName(input)+' suggestions');
  menu.hidden=true;
  const status=doc.createElement('span');
  status.className='aps-search-status';
  status.id=id+'-status';
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  const beforeLabel=input.getAttribute('aria-label');
  const beforeRole=input.getAttribute('role');
  const beforeAutocomplete=input.getAttribute('aria-autocomplete');
  const beforeHasPopup=input.getAttribute('aria-haspopup');
  const beforeExpanded=input.getAttribute('aria-expanded');
  const beforeControls=input.getAttribute('aria-controls');
  const beforeActivedescendant=input.getAttribute('aria-activedescendant');
  const beforeDescribedby=input.getAttribute('aria-describedby');
  const initialFocus=doc.activeElement===input;
  // Use a local wrapper so search input's original form, ID, name, and events survive.
  input.insertAdjacentElement('beforebegin',shell);
  shell.append(icon,input,clear,menu,status);
  input.classList.add('aps-search-source');
  if(!beforeLabel&&!input.labels?.length)
   input.setAttribute('aria-label',accessibleName(input));
  if(source){
   input.setAttribute('role','combobox');
   input.setAttribute('aria-autocomplete','list');
   input.setAttribute('aria-haspopup','listbox');
   input.setAttribute('aria-expanded','false');
  }else if(!beforeRole){
   input.setAttribute('role','searchbox');
  }
  // Native search, keyboard, and browser autofill continue to use the original input.
  let suggestions=[],optionNodes=[],cursor=-1,stopPosition=null,
   stopForeground=null,disposed=false;
  function restore(name,original){
   if(original===null)input.removeAttribute(name);
   else input.setAttribute(name,original);
  }
  function close(){
   if(menu.hidden)return;
   stopPosition?.();stopPosition=null;
   stopForeground?.();stopForeground=null;
   menu.hidden=true;menu.replaceChildren();
   menu.classList.remove('aps-search-above','aps-search-align-end',
    'aps-search-compact','aps-search-medium');
   if(source)input.setAttribute('aria-expanded','false');
   restore('aria-controls',beforeControls);
   restore('aria-activedescendant',beforeActivedescendant);
   suggestions=[];optionNodes=[];cursor=-1;
   if(active===controller)active=null;
  }
  function destroy(){
   if(disposed)return;
   close();disposed=true;abort.abort();
   input.classList.remove('aps-search-source');
   restore('role',beforeRole);restore('aria-autocomplete',beforeAutocomplete);
   restore('aria-haspopup',beforeHasPopup);restore('aria-expanded',beforeExpanded);
   restore('aria-controls',beforeControls);
   restore('aria-activedescendant',beforeActivedescendant);
   restore('aria-describedby',beforeDescribedby);
   restore('aria-label',beforeLabel);
   if(input.isConnected&&shell.isConnected)shell.insertAdjacentElement('beforebegin',input);
   shell.remove();controls.delete(input);
  }
  function syncClear(){
   clear.hidden=!input.value||input.disabled||input.readOnly;
  }
  function activate(index){
   if(index<0||index>=suggestions.length)return;
   cursor=index;
   optionNodes.forEach((node,i)=>{
    node.classList.toggle('is-active',i===index);
    node.setAttribute('aria-selected',String(i===index));
   });
   input.setAttribute('aria-activedescendant',optionNodes[index].id);
   optionNodes[index].scrollIntoView?.({block:'nearest'});
  }
  function accept(index){
   if(!suggestions[index])return;
   const choice=suggestions[index].label;
   close();
   if(input.value!==choice){
    input.value=choice;
    input.focus();
    input.dispatchEvent(new Event('input',{bubbles:true}));
   }else input.focus();
  }
  function update(){
   if(disposed||!input.isConnected)return;
   syncClear();
   if(!source||doc.activeElement!==input||!normalizeSearchQuery(input.value)){
    close();return;
   }
   const context=input.closest('.main-content')||root;
   const matches=Array.from(context.querySelectorAll(source));
   const found=localSearchOptions(matches,input.value);
   if(!found.length){status.textContent='No local suggestions';close();return;}
   const same=suggestions.length===found.length&&found.every((o,i)=>o.label===suggestions[i]?.label);
   if(same&&!menu.hidden)return;
   close();
   suggestions=found;
   menu.replaceChildren();optionNodes=[];
   for(let i=0;i<found.length;i++){
    const node=doc.createElement('span');
    node.id=id+'-option-'+i;
    node.className='aps-search-option';
    node.setAttribute('role','option');
    node.setAttribute('aria-selected','false');
    node.setAttribute('data-suggestion-index',String(i));
    node.textContent=found[i].label;
    optionNodes.push(node);menu.append(node);
   }
   if(active&&active!==controller)active.close();
   active=controller;menu.hidden=false;
   stopForeground=showForegroundPopover(menu,input,{
    kind:'search',onDismiss:()=>close()
   });
   input.setAttribute('aria-expanded','true');
   input.setAttribute('aria-controls',menu.id);
   status.textContent=String(found.length)+' local suggestion'+(found.length===1?'':'s');
   if(!stopForeground)
    stopPosition=positionSuggestions(input,menu,()=>!menu.hidden&&input.isConnected);
   enterAnimation(menu,win);
  }
  function queueUpdate(){
   // Update after the application's existing synchronous input/filter handling.
   queueMicrotask(()=>{if(!disposed)update();});
  }
  function onKey(event){
   if(event.key==='Escape'){
    if(!menu.hidden){event.preventDefault();event.stopPropagation();close();}
    return;
   }
   if(event.key==='Tab'){close();return;}
   if(!source)return;
   if(!['ArrowDown','ArrowUp','Home','End','Enter'].includes(event.key))return;
   if(menu.hidden){
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
     update();
     if(menu.hidden)return;
    }else return;
   }
   event.preventDefault();event.stopPropagation();
   if(event.key==='ArrowDown')activate(nextSearchOption(suggestions,cursor,1));
   else if(event.key==='ArrowUp')activate(nextSearchOption(suggestions,cursor,-1));
   else if(event.key==='Home')activate(0);
   else if(event.key==='End')activate(suggestions.length-1);
   else if(event.key==='Enter'&&cursor>=0)accept(cursor);
  }
  const controller={input,close,destroy,update};
  input.addEventListener('input',queueUpdate,{signal:abort.signal});
  input.addEventListener('focus',queueUpdate,{signal:abort.signal});
  input.addEventListener('keydown',onKey,{signal:abort.signal});
  input.addEventListener('blur',()=>queueMicrotask(()=>{
   if(!shell.contains(doc.activeElement))close();
  }),{signal:abort.signal});
  menu.addEventListener('pointerdown',event=>event.preventDefault(),
   {signal:abort.signal});
  menu.addEventListener('click',event=>{
   const node=event.target.closest?.('[data-suggestion-index]');
   if(node)accept(Number(node.getAttribute('data-suggestion-index')));
  },{signal:abort.signal});
  clear.addEventListener('click',()=>{
   if(!input.value)return;
   close();
   input.value='';input.focus();syncClear();
   input.dispatchEvent(new Event('input',{bubbles:true}));
  },{signal:abort.signal});
  controls.set(input,controller);
  syncClear();
  if(initialFocus)input.focus();
 }
 function scan(node){
  if(node?.nodeType!==1)return;
  if(node.matches?.(SEARCH_SELECTOR))attach(node);
  node.querySelectorAll?.(SEARCH_SELECTOR).forEach(attach);
 }
 const observer=new MutationObserver(records=>{
  if(!running)return;
  for(const record of records)
   if(record.type==='childList')record.addedNodes.forEach(scan);
  for(const control of controls.values())
   if(!control.input.isConnected)control.destroy();
 });
 observer.observe(root,{childList:true,subtree:true});
 const outside=event=>{
  if(active&&!active.input.parentElement?.contains(event.target))active.close();
 };
 doc.addEventListener('pointerdown',outside,true);
 scan(root);
 return ()=>{
  if(!running)return;
  running=false;observer.disconnect();
  doc.removeEventListener('pointerdown',outside,true);
  for(const control of controls.values())control.destroy();
  controls.clear();
 };
}
