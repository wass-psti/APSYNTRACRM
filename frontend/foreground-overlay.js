/** CP-CRM-OVERLAY-03 — reliably positioned, CSP-safe foreground surfaces.
 * Three-dot menus use measured viewport coordinates in a same-origin CSS
 * stylesheet rule. They never depend on unresolved CSS anchor() coordinates.
 * Selects and search suggestions retain their existing progressive anchors.
 * No DOM reparenting, inline style attributes, or new external dependencies.
 */
const KINDS=new Set(['select','action','search']);
const openByDocument=new WeakMap();
const POSITION_TOLERANCE=34;
const ACTION_GAP=8;
const VIEWPORT_PADDING=10;

export function isForegroundPositionValid(anchor,menu,viewport=null){
 if(!anchor||!menu)return false;
 const values=[anchor.left,anchor.right,anchor.top,anchor.bottom,
  menu.left,menu.right,menu.top,menu.bottom,menu.width,menu.height];
 if(!values.every(Number.isFinite)||menu.width<=0||menu.height<=0||
    anchor.right<=anchor.left||anchor.bottom<=anchor.top)return false;
 const horizontalOverlap=menu.right>=anchor.left-POSITION_TOLERANCE&&
  menu.left<=anchor.right+POSITION_TOLERANCE;
 const verticalGap=Math.min(Math.abs(menu.top-anchor.bottom),
  Math.abs(menu.bottom-anchor.top));
 if(!horizontalOverlap||verticalGap>POSITION_TOLERANCE)return false;
 if(viewport&&Number.isFinite(viewport.width)&&Number.isFinite(viewport.height)){
  const left=Number(viewport.left)||0,top=Number(viewport.top)||0;
  if(menu.right<left||menu.bottom<top||
     menu.left>left+viewport.width||menu.top>top+viewport.height)return false;
 }
 return true;
}

/** Pure viewport-coordinate placement; never mixes scrollX or document offsets.
 * The visible visualViewport is used for pinch zoom and mobile browser chrome.
 */
export function calculateActionMenuPlacement(anchor,menu,viewport,{
 gap=ACTION_GAP,padding=VIEWPORT_PADDING
}={}){
 if(!anchor||!menu||!viewport)return null;
 const nums=[anchor.left,anchor.top,anchor.right,anchor.bottom,
  menu.width,menu.height,viewport.width,viewport.height];
 if(!nums.every(Number.isFinite)||anchor.right<=anchor.left||
    anchor.bottom<=anchor.top||menu.width<=0||menu.height<=0||
    viewport.width<=2*padding||viewport.height<=2*padding)return null;
 const vx=Number(viewport.left)||0,vy=Number(viewport.top)||0;
 const right=vx+viewport.width-padding,bottom=vy+viewport.height-padding;
 const left=vx+padding,top=vy+padding;
 if(anchor.right<=left||anchor.left>=right||
    anchor.bottom<=top||anchor.top>=bottom)return null;
 if(menu.width>viewport.width-2*padding+1)return null;
 const below=Math.max(0,bottom-anchor.bottom-gap);
 const above=Math.max(0,anchor.top-top-gap);
 const aboveFirst=below<menu.height&&above>below;
 const available=aboveFirst?above:below;
 if(available<40)return null;
 const height=Math.min(menu.height,available,370);
 const y=aboveFirst?anchor.top-gap-height:anchor.bottom+gap;
 const x=Math.max(left,Math.min(anchor.right-menu.width,right-menu.width));
 if(!Number.isFinite(x)||!Number.isFinite(y))return null;
 return Object.freeze({left:Math.round(x*100)/100,
  top:Math.round(y*100)/100,maxHeight:Math.round(available*100)/100,
  placement:aboveFirst?'top-end':'bottom-end'});
}
function currentViewport(win){
 const visual=win?.visualViewport;
 const left=visual?.offsetLeft??0,top=visual?.offsetTop??0;
 const width=visual?.width??win?.innerWidth;
 const height=visual?.height??win?.innerHeight;
 return {left,top,width,height};
}

/** CSSOM is intentionally used on the existing same-origin linked CSS file.
 * It is not an inline style and does not violate style-src-attr 'none'.
 * Reject cross-origin, absent, or restricted stylesheets; fail closed.
 */
function getPlacementSheet(doc){
 const sheets=Array.from(doc?.styleSheets||[]);
 for(const sheet of sheets){
  // Priority 5 combines foreground-overlay.css into the same-origin bundle.
  // The old name-only lookup silently disabled the browser top layer, allowing
  // the board toolbar and cards to paint over an otherwise open action menu.
  let url;
  try{url=new URL(String(sheet?.href||''),doc.baseURI);}catch{continue;}
  if(url.origin!==doc.defaultView?.location?.origin||
     !/^\/(?:APSYNTRACRM\/)?frontend\/(?:foreground-overlay|apsyntra-styles\.bundle)\.css$/.test(url.pathname))continue;
  try{
   if(sheet.cssRules&&typeof sheet.insertRule==='function'&&
      typeof sheet.deleteRule==='function')return sheet;
  }catch{/* CSSOM may be unreadable; retain the original local menu. */}
 }
 return null;
}
function actionRuleId(menu){
 const id=String(menu?.id||'');
 return /^[A-Za-z][A-Za-z0-9_-]{0,120}$/.test(id)?id:null;
}
function createActionRule(doc,menu){
 const sheet=getPlacementSheet(doc),id=actionRuleId(menu);
 if(!sheet||!id||!menu.closest?.('#app'))return null;
 // Two concrete ID selectors outrank all original board/Overview top-layer
 // and legacy anchor declarations, without increasing any global z-index.
 const selector='#app #'+id+':popover-open';
 const ruleText=selector+'{position:fixed!important;position-anchor:none!important;'+
  'inset:auto!important;left:-10000px!important;top:-10000px!important;'+
  'right:auto!important;bottom:auto!important;margin:0!important;'+
  'overflow-y:auto!important;max-height:370px!important;}';
 let rule;
 try{
  const idx=sheet.insertRule(ruleText,sheet.cssRules.length);
  rule=sheet.cssRules[idx];
  if(!rule?.style?.setProperty)throw Error('CSSStyleDeclaration unavailable');
 }catch{
  if(rule){
   try{const idx=Array.from(sheet.cssRules).indexOf(rule);
    if(idx>=0)sheet.deleteRule(idx);}catch{}
  }
  return null;
 }
 let disposed=false;
 return {
  place(position){
   if(disposed||!position)return false;
   try{
    rule.style.setProperty('top',position.top+'px','important');
    rule.style.setProperty('left',position.left+'px','important');
    rule.style.setProperty('max-height',
     Math.min(position.maxHeight,370)+'px','important');
    return true;
   }catch{return false;}
  },
  dispose(){
   if(disposed)return;
   disposed=true;
   try{
    const index=Array.from(sheet.cssRules).indexOf(rule);
    if(index>=0)sheet.deleteRule(index);
   }catch{/* Never mutate other stylesheet rules on cleanup. */}
  }
 };
}
/** Implicit popover anchors remain useful for selects and search fields.
 * Three-dot actions require a readable same-origin CSSOM placement sheet.
 */
export function supportsForegroundPopover(doc=globalThis.document){
 const win=doc?.defaultView||globalThis.window;
 if(!doc?.createElement||typeof win?.CSS?.supports!=='function')return false;
 const probe=doc.createElement('div');
 return typeof probe.showPopover==='function'&&
  win.CSS.supports('position-anchor','auto')&&
  win.CSS.supports('top','anchor(bottom)');
}
/** Keep the menu in its original details/form hierarchy; only paint in the
 * browser top layer. Every successful action popup has measured coordinates.
 */
export function showForegroundPopover(menu,trigger,{
 kind='select',onDismiss=null,onPlacementFailure=null
}={}){
 const doc=menu?.ownerDocument,win=doc?.defaultView||globalThis.window;
 if(!menu?.isConnected||!trigger?.isConnected||!KINDS.has(kind)||
    typeof menu.showPopover!=='function')return null;
 if(kind!=='action'&&!supportsForegroundPopover(doc))return null;
 const actionRule=kind==='action'?createActionRule(doc,menu):null;
 if(kind==='action'&&!actionRule)return null;
 const existing=openByDocument.get(doc);
 if(existing&&existing.menu!==menu)existing.dismiss();
 const anchorClass='aps-foreground-anchor-'+kind;
 const surfaceClass='aps-foreground-'+kind;
 const previousPopover=menu.getAttribute('popover');
 let disposed=false,raf=null,observer=null;
 const canValidate=typeof win?.requestAnimationFrame==='function'&&
  typeof trigger.getBoundingClientRect==='function'&&
  typeof menu.getBoundingClientRect==='function';
 // Action menus require real geometry. Never show an unmeasured top layer.
 if(kind==='action'&&!canValidate){
  actionRule?.dispose();return null;
 }
 const placementFailed=()=>{
  cleanup();
  if(typeof onPlacementFailure==='function')onPlacementFailure();
 };
 const schedule=()=>{
  if(disposed||!canValidate||raf!==null)return;
  raf=win.requestAnimationFrame(()=>{
   raf=null;
   if(disposed)return;
   if(!menu.isConnected||!trigger.isConnected){
    cleanup();return;
   }
   const anchor=trigger.getBoundingClientRect();
   const before=menu.getBoundingClientRect();
   const viewport=currentViewport(win);
   if(actionRule){
    const placement=calculateActionMenuPlacement(anchor,before,viewport);
    if(!placement||!actionRule.place(placement)){placementFailed();return;}
   }
   const after=menu.getBoundingClientRect();
   if(isForegroundPositionValid(anchor,after,viewport)){
    menu.classList.remove('aps-foreground-pending');return;
   }
   placementFailed();
  });
 };
 function cleanup(){
  if(disposed)return;
  disposed=true;
  if(openByDocument.get(doc)===entry)openByDocument.delete(doc);
  if(raf!==null&&typeof win?.cancelAnimationFrame==='function')
   win.cancelAnimationFrame(raf);
  raf=null;
  observer?.disconnect();observer=null;
  doc.removeEventListener?.('scroll',schedule,true);
  win?.removeEventListener?.('resize',schedule);
  win?.visualViewport?.removeEventListener?.('resize',schedule);
  win?.visualViewport?.removeEventListener?.('scroll',schedule);
  try{if(menu.matches?.(':popover-open'))menu.hidePopover();}
  catch{/* The menu may have been removed during a route change. */}
  actionRule?.dispose();
  menu.classList.remove('aps-foreground-surface',surfaceClass,
   'aps-foreground-pending');
  trigger.classList.remove(anchorClass);
  if(previousPopover===null)menu.removeAttribute('popover');
  else menu.setAttribute('popover',previousPopover);
 }
 const entry={menu,dismiss(){
  if(disposed)return;
  cleanup();
  if(typeof onDismiss==='function')onDismiss();
 }};
 trigger.classList.add(anchorClass);
 menu.classList.add('aps-foreground-surface',surfaceClass);
 if(canValidate)menu.classList.add('aps-foreground-pending');
 menu.setAttribute('popover','manual');
 try{menu.showPopover({source:trigger});}
 catch{
  // Do not call unanchored showPopover(); remain with the existing local menu.
  cleanup();return null;
 }
 openByDocument.set(doc,entry);
 if(canValidate){
  doc.addEventListener?.('scroll',schedule,true);
  win.addEventListener?.('resize',schedule,{passive:true});
  win.visualViewport?.addEventListener?.('resize',schedule,{passive:true});
  win.visualViewport?.addEventListener?.('scroll',schedule,{passive:true});
  if(typeof win.ResizeObserver==='function'){
   observer=new win.ResizeObserver(schedule);
   observer.observe(trigger);observer.observe(menu);
  }
  schedule();
 }
 return cleanup;
}
