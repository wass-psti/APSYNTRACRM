/** CP-USER-ROLE-VIS01: one-shot presentation motion, no security or state changes. */
let activeView=null;
let active=[];
export function mountUserRoleMotion(section,view){
 const entered=activeView!==view;
 activeView=view;
 for(const animation of active)animation.cancel?.();
 active=[];
 if(!entered||view!=='user-role-management'||!section?.isConnected||
  typeof window==='undefined'||typeof document==='undefined'||document.hidden||
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
 const nodes=[...section.querySelectorAll('.user-role-entrance')].slice(0,6);
 for(let i=0;i<nodes.length;i++){
  if(typeof nodes[i].animate!=='function')continue;
  active.push(nodes[i].animate([
   {opacity:.88,transform:'translate3d(0,8px,0)'},
   {opacity:1,transform:'translate3d(0,0,0)'}
  ],{duration:Math.min(260+i*24,390),delay:Math.min(i*35,145),
   easing:'cubic-bezier(.22,1,.36,1)',fill:'none'}));
 }
}
export function stopUserRoleMotion(){
 for(const animation of active)animation.cancel?.();
 active=[];
 activeView=null;
}
