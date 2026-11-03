/** CP-SECURITY-VIS01: route-scoped one-shot presentation motion.
 * No recurring renderer, network calls, state mutation, or monitoring.
 */
let previousView=null;
let active=[];
export function mountSecurityMotion(section,view){
 const entered=previousView!==view;
 previousView=view;
 active.forEach(a=>a.cancel?.());
 active=[];
 if(!entered||view!=='security'||!section?.isConnected||
  typeof window==='undefined'||typeof document==='undefined'||
  document.hidden||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
 const targets=[...section.querySelectorAll('.security-entrance')].slice(0,5);
 targets.forEach((element,index)=>{
  if(typeof element.animate!=='function')return;
  active.push(element.animate([
   {opacity:.88,transform:'translate3d(0,8px,0)'},
   {opacity:1,transform:'translate3d(0,0,0)'}
  ],{duration:Math.min(270+index*28,410),delay:Math.min(index*38,150),
   easing:'cubic-bezier(.22,1,.36,1)',fill:'none'}));
 });
}
export function stopSecurityMotion(){
 active.forEach(a=>a.cancel?.());
 active=[];
 previousView=null;
}
