/** CP-CRM-OVERLAY-01 — CSP-safe foreground surfaces.
 * A Popover API top-layer entry escapes parent overflow and stacking contexts.
 * CSS Anchor Positioning aligns it; neither inline style nor DOM reparenting.
 * Action buttons retain their original event-delegation ancestry.
 */
const KINDS=new Set(['select','action','search']);
const openByDocument=new WeakMap();

/** Explicit named anchors work even where implicit popover invokers differ. */
export function supportsForegroundPopover(doc=globalThis.document){
 const win=doc?.defaultView||globalThis.window;
 if(!doc?.createElement||typeof win?.CSS?.supports!=='function')return false;
 const probe=doc.createElement('div');
 return typeof probe.showPopover==='function'&&
  win.CSS.supports('position-anchor','--aps-foreground-select')&&
  win.CSS.supports('top','anchor(bottom)');
}

/** Show one DOM-owned menu in the browser top layer, without changing its parent.
 * Returns a reversible cleanup function, or null for a native/local fallback.
 */
export function showForegroundPopover(menu,trigger,{kind='select',onDismiss=null}={}){
 const doc=menu?.ownerDocument;
 if(!menu?.isConnected||!trigger?.isConnected||!KINDS.has(kind)||
    !supportsForegroundPopover(doc)||typeof menu.showPopover!=='function')
  return null;
 const old=openByDocument.get(doc);
 if(old&&old.menu!==menu)old.dismiss();
 const anchorClass='aps-foreground-anchor-'+kind;
 const surfaceClass='aps-foreground-'+kind;
 const previouslyPopover=menu.getAttribute('popover');
 let disposed=false;
 trigger.classList.add(anchorClass);
 menu.classList.add('aps-foreground-surface',surfaceClass);
 menu.setAttribute('popover','manual');
 try{menu.showPopover({source:trigger});}
 catch{
  // Some older engines support showPopover but not the source option.
  try{menu.showPopover();}
  catch{
   trigger.classList.remove(anchorClass);
   menu.classList.remove('aps-foreground-surface',surfaceClass);
   if(previouslyPopover===null)menu.removeAttribute('popover');
   else menu.setAttribute('popover',previouslyPopover);
   return null;
  }
 }
 const entry={menu,dismiss(){
  if(disposed)return;
  if(typeof onDismiss==='function')onDismiss();
  cleanup();
 }};
 function cleanup(){
  if(disposed)return;
  disposed=true;
  if(openByDocument.get(doc)===entry)openByDocument.delete(doc);
  try{
   if(menu.matches?.(':popover-open'))menu.hidePopover();
  }catch{/* DOM may have been detached during rerender. */}
  trigger.classList.remove(anchorClass);
  menu.classList.remove('aps-foreground-surface',surfaceClass);
  if(previouslyPopover===null)menu.removeAttribute('popover');
  else menu.setAttribute('popover',previouslyPopover);
 }
 openByDocument.set(doc,entry);
 return cleanup;
}
