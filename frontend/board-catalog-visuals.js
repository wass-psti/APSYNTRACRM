/**
 * CP-BOARDS-VIS01: overview-consistent, route-scoped catalog animation.
 * Native WAAPI only; navigation, search, signed state and data stay in app.js.
 * @typedef {{cancel?:()=>void}} Animatable
 */
let lastView=null;
let current=[];
/** @param {HTMLElement|null} catalog @param {string} view */
export function mountBoardCatalogMotion(catalog,view){
 const entered=lastView!==view;
 lastView=view;
 current.forEach(animation=>animation.cancel?.());
 current=[];
 if(!entered||view!=='boards'||!catalog?.isConnected||
    typeof window==='undefined'||typeof document==='undefined'||document.hidden||
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
 const targets=[...catalog.querySelectorAll('.boards-entrance')].slice(0,5);
 for(const [index,node] of targets.entries()){
  if(typeof node.animate!=='function')continue;
  current.push(node.animate([
   {opacity:.88,transform:'translate3d(0,9px,0)'},
   {opacity:1,transform:'translate3d(0,0,0)'}
  ],{duration:Math.min(270+index*30,400),delay:Math.min(index*45,150),
   easing:'cubic-bezier(.22,1,.36,1)',fill:'none'}));
 }
}
export function stopBoardCatalogMotion(){
 current.forEach(animation=>animation.cancel?.());
 current=[];
 lastView=null;
}
