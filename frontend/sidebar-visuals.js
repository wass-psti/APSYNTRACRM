/**
 * APSYNTRA signed-workspace sidebar visual primitives.
 * SVG icons are constant, presentation-only markup. No untrusted SVG input.
 * @typedef {'overview'|'boards'|'ticket'|'clock'|'finance'|'fueltrack'|'tradelink'|'paseo'|'talkbox'|'foundation'|'security'|'roles'|'users'|'settings'|'acceptance'|'recent'|'logout'|'chevron'} SidebarIcon
 */
const icons=Object.freeze({
 overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 boards:'<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 10h18M9 10v10"/>',
 ticket:'<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7Z"/><path d="M9 7v10" stroke-dasharray="2 2"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 finance:'<path d="M3 7h18v12H3z"/><path d="M3 10h18M7 15h3M16 15h1"/><path d="M7 4h10"/>',
 fueltrack:'<path d="M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M5 10h11M8 7h5M16 8h2l2 2v7a2 2 0 0 0 2-2v-4"/><path d="M9 21v-5h4v5"/>',
 paseo:'<path fill="currentColor" stroke="none" d="M9.3 2.5a6.7 6.7 0 0 0-6.7 6.7c0 2.5 1.3 4.6 3.1 5.8l-1 2.1a2 2 0 0 0 3.6 1.8l1.5-3.1c3.7-.3 6.4-3.2 6.4-6.6a6.7 6.7 0 0 0-6.9-6.7Z"/><circle fill="currentColor" stroke="none" cx="19.4" cy="16.7" r="2.5"/>',
 talkbox:'<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M4.5 3h15A2.5 2.5 0 0 1 22 5.5v10a2.5 2.5 0 0 1-2.5 2.5H11l-5.7 4v-4h-.8A2.5 2.5 0 0 1 2 15.5v-10A2.5 2.5 0 0 1 4.5 3Zm2 5.1v1.6h11V8.1h-11Zm0 4v1.6h7.5v-1.6H6.5Z" clip-rule="evenodd"/>',
  tradelink:'<path d="m10 13 4-4"/><path d="M15 7.5 17.5 5a4 4 0 0 1 5.5 5.8l-3.2 3.2a4 4 0 0 1-5.7 0"/><path d="M9 16.5 6.5 19A4 4 0 0 1 1 13.2l3.2-3.2a4 4 0 0 1 5.7 0"/>',
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
/* Stable, dependency-free filled variants for the dark navigation. */
const solidIcons = Object.freeze({
  overview:
    '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  boards:
    '<path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 6h14V5H5v4Zm0 2v8h4v-8H5Zm6 0v8h8v-8h-8Z" fill-rule="evenodd"/>',
  ticket:
    '<path d="M4 5h16a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 1 2-2Zm7 2v10h2V7h-2Z" fill-rule="evenodd"/>',
  clock:
    '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 4h2v5.2l3.4 2-1 1.7L11 12V6Z" fill-rule="evenodd"/>',
  finance:
    '<path d="M3 5h18v14H3V5Zm0 4v3h18V9H3Zm4 6v2h4v-2H7Z" fill-rule="evenodd"/>',
  fueltrack:
    '<path d="M6 2h9a3 3 0 0 1 3 3v15h2v2H3v-2h2V5a3 3 0 0 1 1-3Zm1 4v6h9V6H7Zm2 9v5h5v-5H9Z" fill-rule="evenodd"/>',
  paseo: '<path d="M9.3 2.5a6.7 6.7 0 0 0-6.7 6.7c0 2.5 1.3 4.6 3.1 5.8l-1 2.1a2 2 0 0 0 3.6 1.8l1.5-3.1c3.7-.3 6.4-3.2 6.4-6.6a6.7 6.7 0 0 0-6.9-6.7Z"/><circle cx="19.4" cy="16.7" r="2.5"/>',
  talkbox: '<path d="M4.5 3h15A2.5 2.5 0 0 1 22 5.5v10a2.5 2.5 0 0 1-2.5 2.5H11l-5.7 4v-4h-.8A2.5 2.5 0 0 1 2 15.5v-10A2.5 2.5 0 0 1 4.5 3Zm2 5.1v1.6h11V8.1h-11Zm0 4v1.6h7.5v-1.6H6.5Z" fill-rule="evenodd"/>',
  tradelink:
    '<path d="M8.9 14.9a4 4 0 0 1-5.7-5.7l3-3a4 4 0 0 1 5.7 0l1.4 1.4-1.8 1.8L10.1 8a1.5 1.5 0 0 0-2.1 0l-3 3a1.5 1.5 0 0 0 2.1 2.1l1.4-1.4 1.8 1.8-1.4 1.4Zm6.2-5.8a4 4 0 0 1 5.7 5.7l-3 3a4 4 0 0 1-5.7 0l-1.4-1.4 1.8-1.8 1.4 1.4a1.5 1.5 0 0 0 2.1 0l3-3a1.5 1.5 0 0 0-2.1-2.1l-1.4 1.4-1.8-1.8 1.4-1.4Z"/><path d="m8 14 6-6 2 2-6 6Z"/>',
  foundation:
    '<path d="m12 2 10 5-10 5L2 7l10-5Zm-8 9 8 4 8-4 2 2-10 5-10-5 2-2Zm0 6 8 4 8-4 2 2-10 5L2 19l2-2Z"/>',
  security:
    '<path d="M12 2 21 5v7c0 6-5.4 9.4-9 10-3.6-.6-9-4-9-10V5l9-3Zm4.4 7.5-1.5-1.4-4.3 4.5-1.8-1.8-1.5 1.5 3.3 3.2 5.8-6Z" fill-rule="evenodd"/>',
  roles:
    '<path d="M5 2h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm7 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-6 12h12a6 6 0 0 0-12 0Z" fill-rule="evenodd"/>',
  users:
    '<path d="M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM2 19a7 7 0 0 1 14 0v2H2v-2Zm15-10a4 4 0 0 1 0-6 4 4 0 0 1 0 8v-2Zm0 4a6 6 0 0 1 5 6v2h-4v-2a10 10 0 0 0-1-6Z"/>',
  settings:
    '<path d="m10 2-.6 2.1L7.2 5 5 4.2 2.5 8.6l1.7 1.7v3.4l-1.7 1.7L5 19.8l2.2-.8 2.2.9L10 22h4l.6-2.1 2.2-.9 2.2.8 2.5-4.4-1.7-1.7v-3.4l1.7-1.7L19 4.2l-2.2.8-2.2-.9L14 2h-4Zm2 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" fill-rule="evenodd"/>',
  acceptance:
    '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 7.4-5.3 6-3.8-3.3 1.5-1.7 2.2 1.9 3.7-4.4 1.7 1.5Z" fill-rule="evenodd"/>',
  recent:
    '<path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 5v2h10V8H7Zm0 4v2h10v-2H7Zm0 4v2h7v-2H7Z" fill-rule="evenodd"/>',
  logout:
    '<path d="M5 2h7v3H5v14h7v3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm9 5 6 5-6 5v-3H8v-4h6V7Z"/>',
  chevron: '<path d="m9 4 8 8-8 8-2-2 6-6-6-6 2-2Z"/>',
});

/** @param {SidebarIcon} name */
export function sidebarIcon(name){
 return '<svg class="sidebar-svg-icon" viewBox="0 0 24 24" width="19" height="19" '+
  'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" '+
  'stroke-linejoin="round" aria-hidden="true" focusable="false">'+
  '<g class=\"icon-outline\">'+(Object.hasOwn(icons,name)?icons[name]:icons.boards)+'</g>'+
  '<g class=\"icon-solid\" fill=\"currentColor\" stroke=\"none\">'+
  (Object.hasOwn(solidIcons,name)?solidIcons[name]:solidIcons.boards)+'</g></svg>';
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
