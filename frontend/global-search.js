/** APSYNTRA CRM — application-wide command palette.
 * Reads only the current workspace's existing board/module content. Navigation
 * continues through the existing hash router; no writes or persisted history.
 */
import {BOARD_MODULES} from './board/services/manifest.js';

export const GLOBAL_SEARCH_MIN_QUERY=2;
export const GLOBAL_SEARCH_MAX_QUERY=160;
export const GLOBAL_SEARCH_MAX_RESULTS=30;
export const GLOBAL_SEARCH_RECORD_LIMIT=40;

export function normalizeGlobalSearchQuery(value){
 return String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase().slice(0,GLOBAL_SEARCH_MAX_QUERY);
}

export function isGlobalSearchShortcut(event,platform=''){
 if(!event||event.defaultPrevented||event.repeat||event.isComposing||
    event.altKey||event.shiftKey||String(event.key||'').toLocaleLowerCase()!=='k')return false;
 const mac=/mac|iphone|ipad|ipod/i.test(String(platform));
 return mac?event.metaKey===true&&event.ctrlKey!==true:
  event.ctrlKey===true&&event.metaKey!==true;
}

export function isGlobalSearchEditableTarget(target){
 const tag=String(target?.tagName||'').toUpperCase();
 return ['INPUT','TEXTAREA','SELECT'].includes(tag)||target?.isContentEditable===true||
  target?.getAttribute?.('contenteditable')==='true'||
  target?.getAttribute?.('role')==='textbox';
}

function matchScore(value,query){
 const text=String(value||'').toLocaleLowerCase();
 const tokens=query.split(/\s+/).filter(Boolean);
 if(!tokens.length||!tokens.every(token=>text.includes(token)))return null;
 if(text===query)return 0;
 if(text.startsWith(query))return 1;
 if(text.includes(query))return 2;
 return 3;
}

function result(type,title,subtitle,href,score,extra={}){
 return {id:String(extra.id||[type,href,title].join('|')),type,title:String(title||''),
  subtitle:String(subtitle||''),href,score,...extra};
}

/** Pure ranking function used by the live palette and regression tests. */
export function buildGlobalSearchResults(query,{boards=[],modules=BOARD_MODULES,
 navigation=[],records=[],limit=GLOBAL_SEARCH_MAX_RESULTS}={}){
 const q=normalizeGlobalSearchQuery(query),out=[],seen=new Set();
 const add=item=>{
  if(!item?.title||item.href==null)return;
  const key=item.type+'|'+item.id;
  if(seen.has(key))return;
  seen.add(key);out.push(item);
 };
 const visibleBoards=Array.isArray(boards)?boards.filter(board=>
  board&&typeof board.id==='string'&&['active','archived'].includes(board.status)):[];
 const nav=Array.isArray(navigation)?navigation:[];
 const moduleList=Array.isArray(modules)?modules:[];
 const recordList=Array.isArray(records)?records:[];

 if(!q){
  for(const item of nav.slice(0,6))add(result('page',item.title,item.subtitle||'Go to page',
   item.href,0,{id:item.href,...(item.isApplication===true?{isApplication:true}:{})}));
  for(const module of moduleList.slice(0,6)){
   const board=visibleBoards.find(entry=>String(entry.name||'').toLocaleLowerCase()===
    String(module.name||'').toLocaleLowerCase());
   add(result('module',module.name,module.recordType||module.description,
    board?'#/boards/'+board.id:'#/boards',0,{id:module.key,boardId:board?.id||null}));
  }
  return out.slice(0,Math.max(1,Math.min(GLOBAL_SEARCH_MAX_RESULTS,limit)));
 }

 for(const module of moduleList){
  const score=matchScore([module.name,module.description,module.recordType].join(' '),q);
  if(score===null)continue;
  const board=visibleBoards.find(entry=>String(entry.name||'').toLocaleLowerCase()===
   String(module.name||'').toLocaleLowerCase());
  add(result('module',module.name,module.recordType||module.description,
   board?'#/boards/'+board.id:'#/boards',score,{id:module.key,boardId:board?.id||null}));
 }

 for(const item of nav){
  const score=matchScore([item.title,item.subtitle].join(' '),q);
  if(score!==null)add(result('page',item.title,item.subtitle||'Navigation',item.href,
   score,{id:item.href,...(item.isApplication===true?{isApplication:true}:{})}));
 }

 for(const board of visibleBoards){
  const score=matchScore([board.name,board.description].join(' '),q);
  if(score===null)continue;
  const status=board.status==='archived'?'Archived board':'Board';
  add(result('board',board.name,[status,board.description].filter(Boolean).join(' · '),
   '#/boards/'+board.id,score,{id:board.id,boardId:board.id}));
 }

 for(const row of recordList){
  if(row?.native===true&&typeof row.href==='string'&&row.href.startsWith('#/')){
   const score=Number.isFinite(row.score)?row.score:
    matchScore([row.title,row.subtitle,row.excerpt].join(' '),q);
   if(score===null)continue;
   add(result('native-record',row.title,row.subtitle,row.href,score,{
    id:row.id,application:row.application,applicationId:row.applicationId,
    recordType:row.recordType,recordId:row.recordId,
    excerpt:row.excerpt||'',query:row.query||q,
    navigationScope:row.navigationScope||'',native:true
   }));
   continue;
  }
  if(!row||typeof row.board_id!=='string'||typeof row.item_id!=='string')continue;
  const score=matchScore([row.item_title,row.board_name,row.group_title,
   row.match_field,row.match_excerpt].join(' '),q)??2;
  const subtitle=[row.board_name,row.group_title,row.match_field].filter(Boolean).join(' · ');
  add(result('record',row.item_title||'Untitled record',subtitle,
   '#/boards/'+row.board_id+'/items',score,{
    id:row.item_id,boardId:row.board_id,itemId:row.item_id,
    excerpt:row.match_excerpt||'',archived:row.is_archived===true,
    boardStatus:row.board_status||'active'
   }));
 }

 const typeOrder={module:0,page:1,board:2,'native-record':3,record:4};
 out.sort((a,b)=>a.score-b.score||(typeOrder[a.type]??9)-(typeOrder[b.type]??9)||
  a.title.localeCompare(b.title));
 return out.slice(0,Math.max(1,Math.min(GLOBAL_SEARCH_MAX_RESULTS,limit)));
}

/** Presentation only: native application launch links retain their page type,
 * score and href; module results and application shortcuts share one label. */
export function globalSearchResultKind(item){
 if(item.type==='module'||(item.type==='page'&&item.isApplication===true))return 'Application';
 if(item.type==='native-record')return item.recordType||'Application record';
 if(item.type==='record')return 'Record';
 if(item.type==='board')return 'Board';
 return 'Page';
}

function collectNavigation(doc){
 const applicationHrefs=new Set([...doc.querySelectorAll('#app .aps-sidebar a[data-global-search-application="true"]')]
  .map(anchor=>anchor.getAttribute('href')));
 return [...doc.querySelectorAll('#app .aps-sidebar nav a[href^="#/"],#app .main-content a[href^="#/"]')]
  .filter(anchor=>!anchor.closest('[hidden],[aria-hidden="true"]'))
  .map(anchor=>({title:String(anchor.getAttribute('aria-label')||anchor.textContent||'')
   .replace(/\s+/g,' ').trim().slice(0,100),
   subtitle:'Navigation',href:anchor.getAttribute('href'),
   isApplication:applicationHrefs.has(anchor.getAttribute('href'))}))
  .filter(item=>item.title&&item.href&&item.href.startsWith('#/'));
}

function platformName(win){
 return String(win?.navigator?.userAgentData?.platform||win?.navigator?.platform||
  win?.navigator?.userAgent||'');
}

export function startGlobalSearch({root=globalThis.document?.body,
 getScope=()=>null,getBoards=async()=>[],searchRecords=async()=>[],
 navigate=()=>{},modules=BOARD_MODULES,onError=()=>{}}={}){
 const doc=root?.ownerDocument||globalThis.document;
 if(!doc?.createElement||!doc.body)return {open:()=>false,close:()=>{},syncScope:()=>{},destroy:()=>{}};
 const win=doc.defaultView||globalThis.window;
 const id='aps-global-search';
 const backdrop=doc.createElement('div');
 backdrop.className='aps-global-search-backdrop';backdrop.hidden=true;
 backdrop.setAttribute('data-global-search-layer','true');
 const dialog=doc.createElement('section');
 dialog.className='aps-global-search-dialog';dialog.setAttribute('role','dialog');
 dialog.setAttribute('data-global-search-layer','true');
 dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby',id+'-title');
 dialog.setAttribute('aria-describedby',id+'-description');
 const heading=doc.createElement('div');heading.className='aps-global-search-heading';
 const headingCopy=doc.createElement('div');
 const title=doc.createElement('h2');title.id=id+'-title';title.textContent='Search APSYNTRA CRM';
 const description=doc.createElement('p');description.id=id+'-description';
 description.textContent='Find applications, boards, records and workspace content.';
 headingCopy.append(title,description);
 const closeButton=doc.createElement('button');closeButton.type='button';
 closeButton.className='aps-global-search-close';closeButton.textContent='×';
 closeButton.setAttribute('aria-label','Close search');closeButton.setAttribute('data-global-search-focusable','true');
 heading.append(headingCopy,closeButton);
 const inputWrap=doc.createElement('div');inputWrap.className='aps-global-search-input-wrap';
 const searchGlyph=doc.createElement('span');searchGlyph.className='aps-global-search-glyph';
 searchGlyph.setAttribute('aria-hidden','true');searchGlyph.textContent='⌕';
 const input=doc.createElement('input');input.type='text';input.className='aps-global-search-input';
 input.placeholder='Search applications, boards and records…';input.autocomplete='off';
 input.spellcheck=false;input.maxLength=GLOBAL_SEARCH_MAX_QUERY;
 input.setAttribute('role','combobox');input.setAttribute('aria-label','Search applications, boards and records');
 input.setAttribute('aria-autocomplete','list');
 input.setAttribute('aria-haspopup','listbox');input.setAttribute('aria-expanded','false');
 input.setAttribute('aria-controls',id+'-results');input.setAttribute('aria-activedescendant','');
 input.setAttribute('data-aps-search-native','true');input.setAttribute('data-aps-input-native','true');
 const shortcut=doc.createElement('kbd');shortcut.className='aps-global-search-shortcut';
 shortcut.setAttribute('aria-hidden','true');shortcut.textContent=/mac|iphone|ipad|ipod/i.test(platformName(win))?'⌘ K':'Ctrl K';
 inputWrap.append(searchGlyph,input,shortcut);
 const status=doc.createElement('p');status.className='aps-global-search-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
 const list=doc.createElement('div');list.className='aps-global-search-results';
 list.id=id+'-results';list.setAttribute('role','listbox');list.setAttribute('aria-label','Search results');
 const footer=doc.createElement('div');footer.className='aps-global-search-footer';
 const footerHints=[['↑','↓','Navigate'],['↵','Open'],['Esc','Close']];
 for(const hint of footerHints){
  const group=doc.createElement('span');
  for(const key of hint.slice(0,-1)){const kbd=doc.createElement('kbd');kbd.textContent=key;group.append(kbd);}
  const label=doc.createElement('span');label.textContent=hint.at(-1);group.append(label);footer.append(group);
 }
 dialog.append(heading,inputWrap,status,list,footer);backdrop.append(dialog);doc.body.append(backdrop);

 let opened=false,activeIndex=-1,results=[],boards=[],records=[],navigation=[],previousFocus=null,
  currentScopeKey='',requestSerial=0,debounceHandle=null,disposed=false;
 const currentScope=()=>{
  const scope=getScope()||{};
  return scope.userId&&scope.workspaceId?String(scope.userId)+'|'+String(scope.workspaceId):'';
 };
 const syncTriggers=expanded=>doc.querySelectorAll('[data-global-search-open]').forEach(button=>{
  button.setAttribute('aria-expanded',String(expanded));
  const mac=/mac|iphone|ipad|ipod/i.test(platformName(win));
  button.setAttribute('aria-keyshortcuts',mac?'Meta+K':'Control+K');
  const key=button.querySelector('[data-global-search-key]');
  if(key)key.textContent=mac?'⌘ K':'Ctrl K';
 });
 syncTriggers(false);
 const setStatus=value=>{status.textContent=value;};
 function render(){
  results=buildGlobalSearchResults(input.value,{boards,modules,navigation,records});
  list.replaceChildren();activeIndex=-1;input.removeAttribute('aria-activedescendant');
  for(let index=0;index<results.length;index++){
   const item=results[index],option=doc.createElement('div');
   option.id=id+'-option-'+index;option.className='aps-global-search-option';
   option.setAttribute('role','option');option.setAttribute('aria-selected','false');
   option.dataset.resultIndex=String(index);
   const icon=doc.createElement('span');icon.className='aps-global-search-option-icon';
   icon.setAttribute('aria-hidden','true');icon.textContent=
    item.type==='record'||item.type==='native-record'?'▤':item.type==='board'?'▦':item.type==='module'?'◈':'↗';
   const copy=doc.createElement('span');copy.className='aps-global-search-option-copy';
   const label=doc.createElement('strong');label.className='aps-global-search-option-title';label.textContent=item.title;
   const meta=doc.createElement('span');meta.className='aps-global-search-option-subtitle';meta.textContent=item.subtitle;
   copy.append(label,meta);
   const kind=doc.createElement('span');kind.className='aps-global-search-option-kind';
   kind.textContent=globalSearchResultKind(item);
   if(kind.textContent==='Application')kind.classList.add('is-application');
   option.append(icon,copy,kind);
   if(item.excerpt){
    const excerpt=doc.createElement('span');excerpt.className='aps-global-search-option-excerpt';
    excerpt.textContent=item.excerpt;option.append(excerpt);
   }
   list.append(option);
  }
  if(!results.length){
   const empty=doc.createElement('div');empty.className='aps-global-search-empty';
   empty.textContent=normalizeGlobalSearchQuery(input.value).length>=GLOBAL_SEARCH_MIN_QUERY?
    'No matching applications, boards or records.':'Type at least 2 characters to search.';
   list.append(empty);
  }
  input.setAttribute('aria-expanded',String(results.length>0));
 }
 function setActive(index){
  if(!results.length){activeIndex=-1;return;}
  activeIndex=((index%results.length)+results.length)%results.length;
  const options=list.querySelectorAll('[role="option"]');
  options.forEach((option,i)=>{
   const selected=i===activeIndex;
   option.classList.toggle('is-active',selected);
   option.setAttribute('aria-selected',String(selected));
  });
  const selected=options[activeIndex];
  if(selected){input.setAttribute('aria-activedescendant',selected.id);
   selected.scrollIntoView?.({block:'nearest'});}
 }
 function scopeStillCurrent(){return opened&&currentScopeKey===currentScope();}
 async function runSearch(){
  const query=normalizeGlobalSearchQuery(input.value),serial=++requestSerial;
  records=[];render();
  if(query.length<GLOBAL_SEARCH_MIN_QUERY){
   setStatus(query?'Enter one more character to search records.':'Search across the current workspace.');
   return;
  }
  setStatus('Searching workspace records…');
  const scopeAtStart=currentScopeKey;
  try{
   const found=await searchRecords(query,{limit:GLOBAL_SEARCH_RECORD_LIMIT});
   if(serial!==requestSerial||!scopeStillCurrent()||scopeAtStart!==currentScopeKey)return;
   records=Array.isArray(found)?found:[];
   render();
   setStatus(results.length?results.length+' results':'No matching applications, boards or records.');
  }catch(error){
   if(serial!==requestSerial||!scopeStillCurrent())return;
   records=[];render();
   setStatus('Record search is temporarily unavailable. Navigation and board search remain available.');
   onError(error);
  }
 }
 function onInput(){
  requestSerial++;if(debounceHandle!==null)win.clearTimeout(debounceHandle);
  records=[];render();
  const query=normalizeGlobalSearchQuery(input.value);
  if(query.length<GLOBAL_SEARCH_MIN_QUERY){
   setStatus(query?'Enter one more character to search records.':'Search across the current workspace.');
   return;
  }
  setStatus('Filtering applications and boards…');
  debounceHandle=win.setTimeout(()=>{debounceHandle=null;void runSearch();},180);
 }
 function close({restoreFocus=true}={}){
  if(!opened)return;
  opened=false;requestSerial++;
  if(debounceHandle!==null){win.clearTimeout(debounceHandle);debounceHandle=null;}
  backdrop.hidden=true;doc.body.classList.remove('aps-global-search-open');
  syncTriggers(false);input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
  currentScopeKey='';boards=[];records=[];navigation=[];results=[];list.replaceChildren();
  const focus=previousFocus;previousFocus=null;
  if(restoreFocus&&focus?.isConnected)focus.focus({preventScroll:true});
  else if(!restoreFocus)doc.activeElement?.blur?.();
 }
 async function open(){
  if(disposed||!currentScope())return false;
  if(opened){input.focus({preventScroll:true});return true;}
  opened=true;currentScopeKey=currentScope();previousFocus=doc.activeElement;
  input.value='';records=[];boards=[];navigation=collectNavigation(doc);
  backdrop.hidden=false;doc.body.classList.add('aps-global-search-open');syncTriggers(true);
  render();setStatus('Loading workspace content…');input.focus({preventScroll:true});
  const scopeAtStart=currentScopeKey;
  try{
   const found=await getBoards();
   if(!scopeStillCurrent()||scopeAtStart!==currentScopeKey)return true;
   boards=Array.isArray(found)?found:[];navigation=collectNavigation(doc);render();
   setStatus('Search applications, boards and records.');
  }catch(error){
   if(scopeStillCurrent()){
    boards=[];render();setStatus('Workspace board search is temporarily unavailable.');onError(error);
   }
  }
  return true;
 }
 async function select(index){
  const item=results[index];if(!item)return;
  close({restoreFocus:false});
  try{await navigate(item);}catch(error){onError(error);}
 }
 function onDocumentKeydown(event){
  if(opened){
   if(event.key==='Escape'){
    event.preventDefault();event.stopPropagation();close();return;
   }
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();event.stopPropagation();
    setActive(activeIndex+(event.key==='ArrowDown'?1:-1));return;
   }
   if(event.key==='Enter'){
    if(results.length){event.preventDefault();event.stopPropagation();
     void select(activeIndex>=0?activeIndex:0);}
    return;
   }
   if(event.key==='Tab'){
    const active=doc.activeElement;
    if(active===input){event.preventDefault();closeButton.focus();}
    else if(active===closeButton){event.preventDefault();input.focus();}
    return;
   }
   return;
  }
  if(!isGlobalSearchShortcut(event,platformName(win))||isGlobalSearchEditableTarget(event.target)||
     event.target?.closest?.('[role="dialog"][aria-modal="true"]:not([data-global-search-layer])'))return;
  event.preventDefault();event.stopPropagation();void open();
 }
 function onDocumentClick(event){
  const trigger=event.target?.closest?.('[data-global-search-open]');
  if(trigger){event.preventDefault();void open();return;}
  if(opened&&event.target===backdrop)close();
  if(opened){
   const option=event.target?.closest?.('[data-result-index]');
   if(option&&list.contains(option))void select(Number(option.dataset.resultIndex));
  }
 }
 input.addEventListener('input',onInput);
 closeButton.addEventListener('click',()=>close());
 doc.addEventListener('keydown',onDocumentKeydown,true);
 doc.addEventListener('click',onDocumentClick);
 const controller={open,close,syncScope(){syncTriggers(opened);if(opened&&!scopeStillCurrent())close({restoreFocus:false});},
  destroy(){if(disposed)return;close({restoreFocus:false});disposed=true;
   input.removeEventListener('input',onInput);doc.removeEventListener('keydown',onDocumentKeydown,true);
   doc.removeEventListener('click',onDocumentClick);backdrop.remove();}};
 return controller;
}
