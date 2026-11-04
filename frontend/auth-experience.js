/**
 * Login-only visual lifecycle. Never owns or reads credentials, tokens, roles,
 * routes, or the authentication client. Graphics never gate sign-in.
 * The login form appears immediately; decorative WebGL remains opportunistic.
 */

/** @typedef {{destroy:()=>void}} AuthExperienceHandle */
/** @param {HTMLElement|null} layout
 *  @param {{sceneLoader?:()=>Promise<unknown>,device?:object}} options
 *  @returns {AuthExperienceHandle}
 */
export function mountAuthExperience(layout,{sceneLoader=()=>import('./auth-scene.js'),
 device=typeof navigator==='undefined'?{}:navigator}={}){
 if(!layout||!layout.isConnected||typeof window==='undefined')
  return {destroy(){}};
 let active=true,scene=null,waiter=null,waiterKind=null;
 const prefers=(query)=>Boolean(window.matchMedia?.(query)?.matches);
 const reduced=prefers('(prefers-reduced-motion: reduce)');
 const lowPower=Boolean(device.connection?.saveData||
  (device.deviceMemory&&device.deviceMemory<=4)||
  (device.hardwareConcurrency&&device.hardwareConcurrency<=4));
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
  if(waiter!==null){
   if(waiterKind==='idle')window.cancelIdleCallback?.(waiter);
   else window.clearTimeout(waiter);
  }
  waiter=null;
  scene?.destroy?.();scene=null;
 }};
}
