/**
 * Login-only visual lifecycle. Never owns or reads credentials, tokens, roles,
 * routes, or the authentication client. Graphics never gate sign-in.
 * Native Web Animations API handles entrance motion; WebGL is opportunistic.
 */

/** @typedef {{destroy:()=>void}} AuthExperienceHandle */
/** @param {HTMLElement|null} layout
 *  @param {{sceneLoader?:()=>Promise<unknown>}} options
 *  @returns {AuthExperienceHandle}
 */
export function mountAuthExperience(layout,{sceneLoader=()=>import('./auth-scene.js')}={}){
 if(!layout||!layout.isConnected||typeof window==='undefined')
  return {destroy(){}};
 let active=true,scene=null,waiter=null,waiterKind=null;
 const animations=[];
 const prefers=(query)=>Boolean(window.matchMedia?.(query)?.matches);
 const reduced=prefers('(prefers-reduced-motion: reduce)');
 const client=typeof navigator==='undefined'?{}:navigator;
 const lowPower=Boolean(client.connection?.saveData||
  (client.deviceMemory&&client.deviceMemory<=4)||
  (client.hardwareConcurrency&&client.hardwareConcurrency<=4));
 if(!reduced&&typeof layout.querySelectorAll==='function'){
  const reveal=[...layout.querySelectorAll('.auth-reveal')];
  if(typeof layout.animate==='function'||reveal.some(el=>typeof el.animate==='function')){
   reveal.forEach((element,index)=>{
    if(typeof element.animate!=='function')return;
    const animation=element.animate([
     {opacity:0,transform:'translate3d(0,16px,0)'},
     {opacity:1,transform:'translate3d(0,0,0)'}
    ],{duration:500,delay:Math.min(index*65,260),easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
    animations.push(animation);
   });
  }
 }
 const host=layout.querySelector('[data-auth-scene]');
 const eligible=Boolean(!reduced&&!lowPower&&!document.hidden&&host?.isConnected&&
  window.WebGL2RenderingContext&&prefers('(min-width: 1021px)'));
 if(eligible){
  const load=async()=>{
   waiter=null;waiterKind=null;
   if(!active||!host.isConnected||document.hidden)return;
   try{
    const module=await sceneLoader();
    if(!active||!host.isConnected||document.hidden)return;
    const renderer=await module.createAuthScene?.(host);
    if(!active||!host.isConnected)renderer?.destroy?.();
    else scene=renderer||null;
   }catch{
    // The CSS fallback is complete; a blocked CDN, GPU or context must not
    // block the authentication form or produce a visible error overlay.
   }
  };
  if(typeof window.requestIdleCallback==='function'){
   waiterKind='idle';
   waiter=window.requestIdleCallback(load,{timeout:900});
  }else{
   waiterKind='timer';
   waiter=window.setTimeout(load,180);
  }
 }
 return {destroy(){
  if(!active)return;
  active=false;
  animations.forEach(animation=>animation.cancel?.());
  if(waiter!==null){
   if(waiterKind==='idle')window.cancelIdleCallback?.(waiter);
   else window.clearTimeout(waiter);
  }
  waiter=null;
  scene?.destroy?.();scene=null;
 }};
}
