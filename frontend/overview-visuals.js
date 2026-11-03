/**
 * CP-OVERVIEW-VIS01: presentation-only icons and interruptible one-shot motion.
 * No credentials, tracking, timers, data mutation, CSSOM injection or GPU loops.
 *
 * @typedef {'refresh'|'plus'|'grid'|'items'|'pulse'|'shield'|'arrow'|'check'|'lock'} OverviewIcon
 */
const paths=Object.freeze({
 refresh:'<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.4-2"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 items:'<path d="M8 6h13M8 12h13M8 18h13"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>',
 pulse:'<path d="M3 12h4l3-6 4 12 3-6h4"/><circle cx="12" cy="12" r="10"/>',
 shield:'<path d="M12 22s8-4.2 8-10V5l-8-3-8 3v7c0 5.8 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
 arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
 check:'<path d="m5 12 4.5 4.5L19 7"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
});
/** @param {OverviewIcon} icon */
export function overviewIcon(icon){
 return '<svg class="overview-svg-icon" viewBox="0 0 24 24" width="19" height="19" '+
  'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '+
  'stroke-linejoin="round" aria-hidden="true" focusable="false">'+
  (Object.hasOwn(paths,icon)?paths[icon]:paths.grid)+'</svg>';
}
let lastView=null;
let animations=[];
/**
 * Animate only entry into the overview, not every data refresh.
 * @param {HTMLElement|null} section
 * @param {string} view
 */
export function mountOverviewMotion(section,view){
 const changed=lastView!==view;
 lastView=view;
 animations.forEach(animation=>animation.cancel?.());
 animations=[];
 if(!section?.isConnected||view!=='overview'||!changed||
  typeof window==='undefined'||typeof document==='undefined'||document.hidden||
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
 const blocks=[...section.querySelectorAll('.overview-entrance')].slice(0,8);
 for(const [index,block] of blocks.entries()){
  if(typeof block.animate!=='function')continue;
  animations.push(block.animate([
   {opacity:.86,transform:'translate3d(0,9px,0)'},
   {opacity:1,transform:'translate3d(0,0,0)'}
  ],{duration:Math.min(300+index*25,450),delay:Math.min(index*45,180),
   easing:'cubic-bezier(.22,1,.36,1)',fill:'none'}));
 }
}
export function stopOverviewMotion(){
 animations.forEach(animation=>animation.cancel?.());
 animations=[];
 lastView=null;
}
