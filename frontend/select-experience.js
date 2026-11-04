/** Shared APSYNTRA CRM select-only combobox enhancement.
 * Native selects remain authoritative for values, validity, and form events.
 * No application data, credentials, coordinates, or telemetry enter positioning.
 * If the pinned Floating UI module cannot load, selects remain native.
 */
export const FLOATING_CORE_URL='https://unpkg.com/@floating-ui/core@1.8.0/dist/floating-ui.core.umd.min.js';
export const FLOATING_SELECT_URL='https://unpkg.com/@floating-ui/dom@1.8.0/dist/floating-ui.dom.umd.min.js';
/** Load the two official, pinned UMD artifacts from the already-approved CSP host.
 * The consuming application and all dropdown behavior remain native ES modules.
 */
let floatingPromise=null;
/** One pinned loader is shared by select dropdowns and action menus. */
export function loadPinnedFloatingUI(){
 if(globalThis.FloatingUIDOM)return Promise.resolve(globalThis.FloatingUIDOM);
 if(floatingPromise)return floatingPromise;
 floatingPromise=(async()=>{
  const doc=globalThis.document;
  if(!doc?.head)throw Error('Floating UI needs a browser document');
  const inject=src=>new Promise((resolve,reject)=>{
   const script=doc.createElement('script');
   script.src=src;script.async=true;script.referrerPolicy='no-referrer';
   script.onload=resolve;
   script.onerror=()=>reject(Error('Floating UI asset unavailable'));
   doc.head.append(script);
  });
  if(!globalThis.FloatingUICore)await inject(FLOATING_CORE_URL);
  if(!globalThis.FloatingUIDOM)await inject(FLOATING_SELECT_URL);
  return globalThis.FloatingUIDOM;
 })().catch(error=>{floatingPromise=null;throw error;});
 return floatingPromise;
}
export const MAX_FLOATING_OPTIONS=400;
let sequence=0;
export function isStandardSelect(select){
 return select?.tagName==='SELECT'&&!select.multiple&&Number(select.size||0)<=1&&
  !!select.options?.length&&select.options.length<=MAX_FLOATING_OPTIONS&&
  !select.hasAttribute?.('data-aps-select-native')&&
  !select.closest?.('[data-aps-select-native]');
}
export function readSelectOptions(select){
 return Array.from(select?.options||[],(opt,index)=>{
  const group=opt.parentElement?.tagName==='OPTGROUP'?opt.parentElement:null;
  return Object.freeze({
   index,value:String(opt.value??''),
   text:String(opt.textContent??'').trim()||String(opt.value??''),
   disabled:!!opt.disabled||!!group?.disabled,
   group:group?String(group.label||''):''
  });
 });
}
export function nextSelectableIndex(options,current,step){
 if(!options?.some(x=>!x.disabled))return -1;
 for(let n=1;n<=options.length;n++){
  const i=((current+n*step)%options.length+options.length)%options.length;
  if(!options[i].disabled)return i;
 }
 return -1;
}
export function findSelectTypeahead(options,text,after=-1){
 const q=String(text||'').trim().toLocaleLowerCase();
 if(!q||!options?.length)return -1;
 for(let n=1;n<=options.length;n++){
  const i=(after+n+options.length)%options.length;
  if(!options[i].disabled&&
     options[i].text.toLocaleLowerCase().startsWith(q))return i;
 }
 return -1;
}
function accessibleLabel(select){
 const named=select.getAttribute('aria-label');
 if(named?.trim())return named.trim();
 for(const label of Array.from(select.labels||[])){
  const parts=[];
  for(const child of Array.from(label.childNodes||[])){
   if(child===select||child.nodeType===1&&
      (child.tagName==='SELECT'||child.contains?.(select)))continue;
   parts.push(child.textContent||'');
  }
  const labelText=parts.join(' ').replace(/\s+/g,' ').trim();
  if(labelText)return labelText.slice(0,160);
 }
 return String(select.getAttribute('title')||select.name||select.id||'Choose option')
  .replace(/[_-]+/g,' ').trim().slice(0,160);
}
function animateOpen(panel,win){
 if(typeof panel.animate!=='function'||win.matchMedia?.(
  '(prefers-reduced-motion: reduce)')?.matches)return;
 panel.animate([{opacity:0,transform:'translateY(-6px) scale(.985)'},
  {opacity:1,transform:'translateY(0) scale(1)'}],
  {duration:150,easing:'cubic-bezier(.2,.8,.2,1)'});
}
export function startSelectExperience(root=globalThis.document?.body,{
 loadFloating=loadPinnedFloatingUI
}={}){
 const doc=root?.ownerDocument||globalThis.document,win=globalThis.window;
 if(!root?.querySelectorAll||!doc||!win||typeof MutationObserver!=='function')
  return ()=>{};
 let running=true,active=null,libPromise=null;
 const controls=new Map(),pending=new WeakSet(),failed=new WeakSet();
 function library(){
  if(!libPromise){
   libPromise=Promise.resolve().then(loadFloating).then(lib=>{
    for(const key of ['computePosition','autoUpdate','offset','flip','shift','size'])
     if(typeof lib?.[key]!=='function')throw Error('Floating UI DOM unavailable');
    return lib;
   }).catch(()=>{libPromise=null;throw Error('Floating UI load failed');});
  }
  return libPromise;
 }
 function attach(select,lib){
  if(!running||!select.isConnected||controls.has(select)||!isStandardSelect(select))
   return;
  const id='aps-select-'+(++sequence),abort=new AbortController();
  const anchor=doc.createElement('span');
  anchor.className='aps-select-anchor';
  const trigger=doc.createElement('div');
  const text=doc.createElement('span'),chevron=doc.createElement('span');
  trigger.className='aps-select-trigger';
  trigger.setAttribute('role','combobox');
  trigger.setAttribute('aria-haspopup','listbox');
  trigger.setAttribute('aria-expanded','false');
  text.className='aps-select-caption';
  chevron.className='aps-select-chevron';
  chevron.setAttribute('aria-hidden','true');
  trigger.append(text,chevron);
  const originalTab=select.getAttribute('tabindex');
  const originalHidden=select.getAttribute('aria-hidden');
  let popup=null,stopPosition=null,items=[],nodes=[],cursor=-1;
  let typed='',typedAt=0,disposed=false;
  function close(focus=false){
   if(!popup)return;
   stopPosition?.();stopPosition=null;
   const old=popup;popup=null;items=[];nodes=[];cursor=-1;
   trigger.setAttribute('aria-expanded','false');
   trigger.removeAttribute('aria-controls');
   trigger.removeAttribute('aria-activedescendant');
   old.remove();
   if(active===controller)active=null;
   if(focus&&trigger.isConnected)trigger.focus();
  }
  function destroy(){
   if(disposed)return;
   close(false);disposed=true;abort.abort();
   trigger.remove();
   if(select.isConnected&&anchor.isConnected)anchor.insertAdjacentElement('afterend',select);
   anchor.remove();
   select.classList.remove('aps-select-source');
   if(originalTab===null)select.removeAttribute('tabindex');
   else select.setAttribute('tabindex',originalTab);
   if(originalHidden===null)select.removeAttribute('aria-hidden');
   else select.setAttribute('aria-hidden',originalHidden);
   controls.delete(select);
  }
  function sync(){
   if(disposed)return;
   if(!isStandardSelect(select)){destroy();return;}
   const options=readSelectOptions(select);
   const selected=options[select.selectedIndex]?.text||'Select an option';
   text.textContent=selected;
   trigger.dataset.placeholder=select.value===''?'true':'false';
   trigger.setAttribute('aria-label',accessibleLabel(select)+' — '+selected);
   trigger.setAttribute('aria-required',String(select.required));
   trigger.setAttribute('aria-disabled',String(select.disabled));
   trigger.tabIndex=select.disabled?-1:0;
   if(!select.validity?.valueMissing)trigger.removeAttribute('aria-invalid');
   if(popup&&(options.length!==items.length||options.some((opt,i)=>
      opt.text!==items[i].text||opt.value!==items[i].value||
      opt.disabled!==items[i].disabled)))close(false);
  }
  function activate(index){
   if(index<0||items[index]?.disabled||!nodes[index])return;
   cursor=index;
   nodes.forEach((node,i)=>{
    node.setAttribute('aria-selected',String(i===index));
    node.classList.toggle('is-active',i===index);
   });
   trigger.setAttribute('aria-activedescendant',nodes[index].id);
   nodes[index].scrollIntoView?.({block:'nearest'});
  }
  function choose(index,focus=true){
   const item=items[index];
   if(!item||item.disabled)return;
   const before=select.value;
   close(focus);
   if(before!==item.value){
    select.value=item.value;trigger.removeAttribute('aria-invalid');
    select.dispatchEvent(new Event('input',{bubbles:true}));
    select.dispatchEvent(new Event('change',{bubbles:true}));
   }
   sync();
  }
  function position(){
   if(!popup||disposed||!trigger.isConnected)return;
   const target=popup;
   // Floating UI determines collision/placement; audited CSS classes apply it.
   // No style attributes, CSSOM writes, or CSP exceptions are necessary.
   return lib.computePosition(trigger,target,{
    placement:'bottom-start',strategy:'absolute',
    middleware:[lib.offset(7),lib.flip({padding:9}),lib.shift({padding:9}),
     lib.size({padding:9,apply({availableHeight}){
      target.classList.toggle('aps-select-compact',availableHeight<180);
      target.classList.toggle('aps-select-medium',
       availableHeight>=180&&availableHeight<280);
     }})]
   }).then(({placement,middlewareData})=>{
    if(target!==popup||disposed)return;
    target.classList.toggle('aps-select-above',placement.startsWith('top'));
    const rect=trigger.getBoundingClientRect();
    const nearRight=rect.left+Math.max(170,rect.width)>win.innerWidth-9;
    target.classList.toggle('aps-select-end',
     nearRight||Number(middlewareData?.shift?.x||0)<-2);
   }).catch(()=>{if(target===popup){destroy();select.focus();}});
  }
  function open(){
   if(disposed||select.disabled||!select.isConnected)return;
   sync();if(disposed||popup)return;
   if(active&&active!==controller)active.close(false);
   items=readSelectOptions(select);
   const list=doc.createElement('div');
   list.className='aps-select-listbox is-open';list.id=id+'-listbox';
   list.setAttribute('role','listbox');
   list.setAttribute('aria-label',accessibleLabel(select));
   let group=null;nodes=[];
   for(const item of items){
    if(item.group&&item.group!==group){
     const heading=doc.createElement('div');
     heading.className='aps-select-group';
     heading.setAttribute('role','presentation');
     heading.textContent=item.group;list.append(heading);
    }
    group=item.group;
    const option=doc.createElement('div');
    option.className='aps-select-option';
    option.id=id+'-option-'+item.index;
    option.setAttribute('role','option');
    option.setAttribute('data-option-index',String(item.index));
    option.textContent=item.text;
    if(item.disabled)option.setAttribute('aria-disabled','true');
    list.append(option);nodes[item.index]=option;
   }
   list.addEventListener('pointerdown',event=>event.preventDefault(),
    {signal:abort.signal});
   list.addEventListener('pointermove',event=>{
    const option=event.target.closest?.('[data-option-index]');
    if(!option)return;
    const index=Number(option.getAttribute('data-option-index'));
    if(index!==cursor&&!items[index]?.disabled)activate(index);
   },{signal:abort.signal});
   list.addEventListener('click',event=>{
    const option=event.target.closest?.('[data-option-index]');
    if(option)choose(Number(option.getAttribute('data-option-index')));
   },{signal:abort.signal});
   popup=list;anchor.append(list);
   trigger.setAttribute('aria-controls',list.id);
   trigger.setAttribute('aria-expanded','true');
   active=controller;cursor=-1;
   const selected=select.selectedIndex;
   activate(selected>=0&&!items[selected]?.disabled?
    selected:nextSelectableIndex(items,-1,1));
   stopPosition=lib.autoUpdate(trigger,list,position,{
    ancestorScroll:true,ancestorResize:true,elementResize:true,layoutShift:true
   });
   void position();animateOpen(list,win);
  }
  function keydown(event){
   const key=event.key;
   if(key==='Escape'){
    if(popup){event.preventDefault();event.stopPropagation();close(true);}
    return;
   }
   if(key==='Tab'){
    if(popup){if(cursor>=0)choose(cursor,false);else close(false);}
    return;
   }
   const printable=key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey;
   if(!['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(key)&&
      !printable)return;
   if(event.altKey&&key!=='ArrowDown'&&key!=='ArrowUp')return;
   event.preventDefault();event.stopPropagation();
   const wasOpen=!!popup;if(!popup)open();
   if(!popup||!wasOpen&&(key==='Enter'||key===' '))return;
   if(key==='ArrowDown'||key==='ArrowUp')
    activate(nextSelectableIndex(items,cursor,key==='ArrowDown'?1:-1));
   else if(key==='Home')activate(nextSelectableIndex(items,-1,1));
   else if(key==='End')activate(nextSelectableIndex(items,0,-1));
   else if(key==='Enter'||key===' ')choose(cursor);
   else if(printable){
    const time=Date.now();
    typed=time-typedAt>700?key:typed+key;typedAt=time;
    let index=findSelectTypeahead(items,typed,cursor);
    if(index<0&&typed.length>1&&new Set(typed.toLocaleLowerCase()).size===1)
     index=findSelectTypeahead(items,key,cursor);
    if(index>=0)activate(index);
   }
  }
  const controller={select,trigger,sync,close,destroy,get popup(){return popup;}};
  trigger.addEventListener('click',event=>{
   event.preventDefault();
   if(popup)close(true);else{trigger.focus();open();}
  },{signal:abort.signal});
  trigger.addEventListener('keydown',keydown,{signal:abort.signal});
  trigger.addEventListener('focus',sync,{signal:abort.signal});
  // Existing inline editors can focus a select before asynchronous enhancement.
  // Preserve visible keyboard focus and legacy programmatic select.focus() calls.
  select.addEventListener('focus',()=>{
   if(!disposed&&!select.disabled)trigger.focus();
  },{signal:abort.signal});
  select.addEventListener('invalid',event=>{
   event.preventDefault();trigger.setAttribute('aria-invalid','true');trigger.focus();
  },{signal:abort.signal});
  for(const label of Array.from(select.labels||[])){
   label.addEventListener('click',event=>{
    if(trigger.contains(event.target)||event.target.closest?.(
      'button,a,input,textarea,[contenteditable="true"]'))return;
    event.preventDefault();trigger.focus();open();
   },{signal:abort.signal});
  }
  const wasFocused=doc.activeElement===select;
  select.classList.add('aps-select-source');
  select.setAttribute('aria-hidden','true');select.tabIndex=-1;
  select.insertAdjacentElement('afterend',anchor);
  anchor.append(select,trigger);
  controls.set(select,controller);sync();
  if(wasFocused)trigger.focus();
 }
 function offer(select){
  if(!running)return;
  const present=controls.get(select);
  if(present){present.sync();return;}
  if(!isStandardSelect(select)||pending.has(select)||failed.has(select))return;
  pending.add(select);
  void library().then(lib=>{
   pending.delete(select);
   if(running&&select.isConnected)attach(select,lib);
  }).catch(()=>{pending.delete(select);failed.add(select);});
 }
 function scan(node){
  if(node?.nodeType!==1)return;
  if(node.matches?.('select'))offer(node);
  node.querySelectorAll?.('select').forEach(offer);
 }
 const observer=new MutationObserver(records=>{
  if(!running)return;
  for(const record of records){
   if(record.type==='attributes'){
    const select=record.target.closest?.('select');
    if(select)offer(select);
   }else{
    const owner=record.target.closest?.('select');
    if(owner)offer(owner);
    record.addedNodes.forEach(scan);
   }
  }
  for(const control of controls.values())
   if(!control.select.isConnected)control.destroy();
 });
 observer.observe(root,{subtree:true,childList:true,attributes:true,
  attributeFilter:['disabled','required','selected','value','label']});
 const change=event=>{
  if(event.target?.tagName==='SELECT')controls.get(event.target)?.sync();
 };
 const reset=event=>win.requestAnimationFrame?.(()=>{
  event.target.querySelectorAll?.('select').forEach(s=>controls.get(s)?.sync());
 });
 const outside=event=>{
  if(active&&!active.trigger.contains(event.target)&&
     !active.popup?.contains(event.target))active.close(false);
 };
 doc.addEventListener('input',change,true);
 doc.addEventListener('change',change,true);
 doc.addEventListener('reset',reset,true);
 doc.addEventListener('pointerdown',outside,true);
 doc.addEventListener('focusin',outside,true);
 scan(root);
 return ()=>{
  if(!running)return;
  running=false;observer.disconnect();
  doc.removeEventListener('input',change,true);
  doc.removeEventListener('change',change,true);
  doc.removeEventListener('reset',reset,true);
  doc.removeEventListener('pointerdown',outside,true);
  doc.removeEventListener('focusin',outside,true);
  for(const control of controls.values())control.destroy();
  controls.clear();
 };
}
