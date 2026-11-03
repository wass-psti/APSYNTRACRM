/**
 * CP-FOUNDATION-VIS01 — presentation-only foundation icon and motion helpers.
 * No permissions, backend calls, timers, CSSOM injection, telemetry or GPU loop.
 *
 * @typedef {'refresh'|'grid'|'missing'|'warning'|'layers'|'shield'|'check'|'database'|'play'} FoundationIcon
 */
const icons=Object.freeze({
 refresh:'<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.4-2"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 missing:'<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
 warning:'<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 17h.01"/>',
 layers:'<path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/>',
 shield:'<path d="M12 22s8-4.2 8-10V5l-8-3-8 3v7c0 5.8 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
 check:'<path d="M4 12.5 9.5 18 20 6"/>',
 database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
 play:'<path d="m8 5 11 7-11 7V5Z"/>'
});
/** @param {FoundationIcon} kind */
export function foundationIcon(kind){
 return '<svg class="foundation-svg-icon" width="20" height="20" viewBox="0 0 24 24" '+
  'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '+
  'stroke-linejoin="round" aria-hidden="true" focusable="false">'+
  (Object.hasOwn(icons,kind)?icons[kind]:icons.grid)+'</svg>';
}
let lastView=null;
let animations=[];
/** One-shot route entrance only. Never animates live metrics or a status change.
 * @param {HTMLElement|null} section
 * @param {string} view
 */
export function mountFoundationMotion(section,view){
 const entered=lastView!==view;
 lastView=view;
 for(const animation of animations)animation.cancel?.();
 animations=[];
 if(!entered||view!=='foundation'||!section?.isConnected||
   typeof window==='undefined'||typeof document==='undefined'||document.hidden||
   window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
 const targets=[...section.querySelectorAll('.foundation-entrance')].slice(0,6);
 for(const [index,node] of targets.entries()){
  if(typeof node.animate!=='function')continue;
  animations.push(node.animate([
   {opacity:.87,transform:'translate3d(0,9px,0)'},
   {opacity:1,transform:'translate3d(0,0,0)'}
  ],{duration:Math.min(270+index*25,410),delay:Math.min(index*42,170),
   easing:'cubic-bezier(.22,1,.36,1)',fill:'none'}));
 }
}
export function stopFoundationMotion(){
 for(const animation of animations)animation.cancel?.();
 animations=[];
 lastView=null;
}
