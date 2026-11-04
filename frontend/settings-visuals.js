/** CP-SETTINGS-VIS01 — settings-only SVG decoration and interruptible entrance motion.
 * No changes to identity, token access, verification requests or backend state.
 */
const iconPaths=Object.freeze({
 shield:'<path d="M12 22s8-4.2 8-10V5l-8-3-8 3v7c0 5.8 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 email:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
 check:'<path d="m5 12 5 5L20 7"/>',
 building:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h2M14 7h1M9 11h2M14 11h1M9 15h6"/>',
 fingerprint:'<path d="M7 9a5 5 0 0 1 10 0v3M4 10a8 8 0 0 1 16 0v3M10 9a2 2 0 0 1 4 0v6M7 13v2a9 9 0 0 1-2 5M17 15c0 2 .5 3 2 4M10 19l-1 2M14 19l1 2"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
 logout:'<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>',
 activity:'<path d="M3 12h4l3-7 4 14 3-7h4"/>'
});
/** @param {keyof typeof iconPaths} kind */
export function settingsIcon(kind){
 return '<svg class="settings-icon" viewBox="0 0 24 24" width="20" height="20" '+
  'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" '+
  'stroke-linejoin="round" aria-hidden="true" focusable="false">'+
  (Object.hasOwn(iconPaths,kind)?iconPaths[kind]:iconPaths.shield)+'</svg>';
}
let lastView=null;
let animations=[];
/** @param {HTMLElement|null} section @param {string} view */
export function mountSettingsMotion(section,view){
 const entered=lastView!==view;
 lastView=view;
 for(const animation of animations)animation.cancel?.();
 animations=[];
 if(!entered||view!=='settings'||!section?.isConnected||
  typeof window==='undefined'||typeof document==='undefined'||document.hidden||
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
 const elements=[...section.querySelectorAll('.settings-entrance')].slice(0,5);
 elements.forEach((node,index)=>{
  if(typeof node.animate!=='function')return;
  animations.push(node.animate([
   {opacity:.9,transform:'translate3d(0,7px,0)'},
   {opacity:1,transform:'translate3d(0,0,0)'}
  ],{duration:Math.min(270+index*28,390),delay:Math.min(index*42,155),
   easing:'cubic-bezier(.22,1,.36,1)',fill:'none'}));
 });
}
export function stopSettingsMotion(){
 for(const animation of animations)animation.cancel?.();
 animations=[];
 lastView=null;
}
