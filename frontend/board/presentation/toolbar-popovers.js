/** Exclusive, dismissible Board toolbar popovers.
 * Applies only to the ordinary Board toolbar; never to native applications,
 * group actions, column context menus, or unrelated details components.
 */
export const BOARD_TOOLBAR_POPOVER_SELECTOR=
 '.aps-board-shell .board-customize-toolbar > details:is(.board-tool-menu,.board-column-menu,.board-actions-menu)';

function toolbarMenus(root){
 return [...root.querySelectorAll(BOARD_TOOLBAR_POPOVER_SELECTOR)];
}
export function closeBoardToolbarPopovers(root,except=null){
 for(const menu of toolbarMenus(root))
  if(menu!==except&&menu.open)menu.open=false;
}
export function installBoardToolbarPopoverBehavior(root,doc=document){
 if(!root?.addEventListener||!doc?.addEventListener)return ()=>{};
 const onToggle=event=>{
  const menu=event.target;
  if(menu?.open&&root.contains(menu)&&menu.matches?.(BOARD_TOOLBAR_POPOVER_SELECTOR))
   closeBoardToolbarPopovers(root,menu);
 };
 const dismissOutside=event=>{
  const open=toolbarMenus(root).filter(menu=>menu.open);
  if(open.length&&!open.some(menu=>menu.contains(event.target)))
   closeBoardToolbarPopovers(root);
 };
 const onEscape=event=>{
  if(event.key!=='Escape')return;
  const open=toolbarMenus(root).filter(menu=>menu.open);
  if(!open.length)return;
  const focused=open.find(menu=>menu.contains(doc.activeElement))||open[0];
  closeBoardToolbarPopovers(root);
  event.preventDefault();
  event.stopPropagation();
  focused.querySelector('summary')?.focus?.({preventScroll:true});
 };
 // The details toggle event does not bubble: capture is required.
 root.addEventListener('toggle',onToggle,true);
 // Pointer and synthetic/keyboard clicks outside must both dismiss menus.
 doc.addEventListener('pointerdown',dismissOutside,true);
 doc.addEventListener('click',dismissOutside,true);
 doc.addEventListener('focusin',dismissOutside,true);
 doc.addEventListener('keydown',onEscape,true);
 return ()=>{
  root.removeEventListener('toggle',onToggle,true);
  doc.removeEventListener('pointerdown',dismissOutside,true);
  doc.removeEventListener('click',dismissOutside,true);
  doc.removeEventListener('focusin',dismissOutside,true);
  doc.removeEventListener('keydown',onEscape,true);
 };
}
