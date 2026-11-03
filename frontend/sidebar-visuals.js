/**
 * APSYNTRA signed-workspace sidebar visual primitives.
 * SVG icons are constant, presentation-only markup. No untrusted SVG input.
 * @typedef {'overview'|'boards'|'foundation'|'security'|'roles'|'users'|'settings'|'acceptance'|'recent'|'logout'|'chevron'} SidebarIcon
 */
const icons=Object.freeze({
 overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 boards:'<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 10h18M9 10v10"/>',
 foundation:'<path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/>',
 security:'<path d="M12 22s8-4.2 8-10V5l-8-3-8 3v7c0 5.8 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
 roles:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="9" r="2.5"/><path d="M7.5 17c.5-3 2-4.5 4.5-4.5s4 1.5 4.5 4.5"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 19v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 14c2.3.5 4 2.3 4 5"/>',
 settings:'<path d="m10 2-.5 2.1a8 8 0 0 0-2 1.2L5.4 4.6 3.2 8.4l1.6 1.5a8 8 0 0 0 0 2.2l-1.6 1.5 2.2 3.8 2.1-.7a8 8 0 0 0 2 1.2L10 20h4l.5-2.1a8 8 0 0 0 2-1.2l2.1.7 2.2-3.8-1.6-1.5a8 8 0 0 0 0-2.2l1.6-1.5-2.2-3.8-2.1.7a8 8 0 0 0-2-1.2L14 2h-4Z"/><circle cx="12" cy="11" r="3"/>',
 acceptance:'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
 recent:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h7"/>',
 logout:'<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M13 7l5 5-5 5M18 12H8"/>',
 chevron:'<path d="m9 18 6-6-6-6"/>'
});
/** @param {SidebarIcon} name */
export function sidebarIcon(name){
 return '<svg class="sidebar-svg-icon" viewBox="0 0 24 24" width="19" height="19" '+
  'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" '+
  'stroke-linejoin="round" aria-hidden="true" focusable="false">'+
  (Object.hasOwn(icons,name)?icons[name]:icons.boards)+'</svg>';
}

/** Minimal native compositor animation; no route hijacking, timers or graphics loop. */
let lastView=null;
let currentAnimation=null;
/** @param {HTMLElement|null} sidebar @param {string} view */
export function animateSidebarSelection(sidebar,view){
 if(!sidebar?.isConnected||typeof window==='undefined')return;
 const changed=lastView!==view;
 lastView=view;
 currentAnimation?.cancel?.();currentAnimation=null;
 if(!changed||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
 const selected=sidebar.querySelector('.nav-link.active');
 if(typeof selected?.animate!=='function')return;
 currentAnimation=selected.animate([
  {opacity:.76,transform:'translate3d(-5px,0,0)'},
  {opacity:1,transform:'translate3d(0,0,0)'}
 ],{duration:190,easing:'cubic-bezier(.2,.85,.2,1)',fill:'none'});
}
/** Stop active presentation animation on sign-out or login. */
export function stopSidebarSelection(){
 currentAnimation?.cancel?.();
 currentAnimation=null;
 lastView=null;
}
