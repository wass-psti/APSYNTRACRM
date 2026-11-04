/** CP-CRM-OVERLAY-02 — one foreground layer, one authoritative anchor.
 * showPopover({source}) establishes the implicit anchor. CSS uses
 * position-anchor:auto — never a named anchor from outside the top layer.
 * No runtime style/CSSOM writes, DOM reparenting or new dependencies.
 */
const KINDS=new Set(['select','action','search']);
const openByDocument=new WeakMap();
const POSITION_TOLERANCE=34;

/** Validate adjacency against viewport-relative rectangles (never page scroll coordinates).
 * The gap is measured at either vertical edge to support automatic block flipping.
 */
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
  if(menu.right<0||menu.bottom<0||menu.left>viewport.width||
     menu.top>viewport.height)return false;
 }
 return true;
}

/** Implicit CSS anchor requires an invoker, the top layer, and opt-in auto.
 * A showPopover() without source is not equivalent and is never attempted.
 */
export function supportsForegroundPopover(doc=globalThis.document){
 const win=doc?.defaultView||globalThis.window;
 if(!doc?.createElement||typeof win?.CSS?.supports!=='function')return false;
 const probe=doc.createElement('div');
 return typeof probe.showPopover==='function'&&
  win.CSS.supports('position-anchor','auto')&&
  win.CSS.supports('top','anchor(bottom)');
}

/** Keep the original menu under its existing details/form node; the browser
 * moves its paint layer, not its event-delegation ancestor.
 * If the anchor cannot be resolved, restore local menu rendering immediately.
 */
export function showForegroundPopover(menu,trigger,{
 kind='select',onDismiss=null,onPlacementFailure=null
}={}){
 const doc=menu?.ownerDocument,win=doc?.defaultView||globalThis.window;
 if(!menu?.isConnected||!trigger?.isConnected||!KINDS.has(kind)||
    !supportsForegroundPopover(doc)||typeof menu.showPopover!=='function')
  return null;
 const existing=openByDocument.get(doc);
 if(existing&&existing.menu!==menu)existing.dismiss();
 const anchorClass='aps-foreground-anchor-'+kind;
 const surfaceClass='aps-foreground-'+kind;
 const previousPopover=menu.getAttribute('popover');
 let disposed=false,raf=null,observer=null;
 const canValidate=typeof win?.requestAnimationFrame==='function'&&
  typeof trigger.getBoundingClientRect==='function'&&
  typeof menu.getBoundingClientRect==='function';
 const schedule=()=>{
  if(disposed||!canValidate||raf!==null)return;
  raf=win.requestAnimationFrame(()=>{
   raf=null;
   if(disposed)return;
   if(!menu.isConnected||!trigger.isConnected){
    cleanup();return;
   }
   const ok=isForegroundPositionValid(trigger.getBoundingClientRect(),
    menu.getBoundingClientRect(),{
     width:win.innerWidth,height:win.innerHeight
    });
   if(ok){menu.classList.remove('aps-foreground-pending');return;}
   // Never expose an unanchored (often 0,0) top-layer menu.
   // The original local menu stays in its original DOM hierarchy as a fallback.
   cleanup();
   if(typeof onPlacementFailure==='function')onPlacementFailure();
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
  try{
   if(menu.matches?.(':popover-open'))menu.hidePopover();
  }catch{/* The menu may have been removed by a route transition. */}
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
  // In engines without a supported source parameter, do not open unanchored.
  cleanup();
  return null;
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
