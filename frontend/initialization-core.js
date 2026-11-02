/**
 * APSYNTRA Neural Core: presentation-only startup controller.
 * Never controls session, RBAC, routes or network readiness.
 * The browser paints accessible CSS immediately; WebGL starts opportunistically.
 */
const PHASES=Object.freeze({
 startup:'Preparing frontend…',
 authentication:'Restoring signed session…',
 authorization:'Verifying workspace access…',
 workspace:'Opening authorized workspace…'
});
let currentPhase='startup';
let finished=false;
let controller=null;
let scenePromise=null;
let removePending=null;
export function initializationPhaseLabel(phase){
 return PHASES[phase]||PHASES.startup;
}
export function setInitializationPhase(phase){
 if(finished||typeof document==='undefined')return;
 const node=document.getElementById('apsyntra-init');
 if(!node)return;
 currentPhase=Object.hasOwn(PHASES,phase)?phase:'startup';
 node.dataset.phase=currentPhase;
 const label=node.querySelector('#apsyntra-init-phase');
 if(label&&label.textContent!==PHASES[currentPhase])label.textContent=PHASES[currentPhase];
 controller?.setPhase?.(currentPhase);
}
export function startInitialization(){
 if(finished||typeof document==='undefined'||scenePromise)return;
 const host=document.getElementById('apsyntra-init-scene');
 const overlay=document.getElementById('apsyntra-init');
 if(!host||!overlay)return;
 setInitializationPhase('startup');
 if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
  overlay.dataset.graphics='reduced';
  return;
 }
 if(!window.WebGL2RenderingContext){
  overlay.dataset.graphics='fallback';
  return;
 }
 // Never await graphics before auth/session initialization. Start only after
 // first paint; if the CRM is already ready, the import is not requested.
 const schedule=window.requestAnimationFrame||((fn)=>window.setTimeout(fn,0));
 scenePromise=new Promise(resolve=>schedule(resolve)).then(async()=>{
  if(finished||!overlay.isConnected)return;
  try{
   const module=await import('./initialization-neural-scene.js');
   if(finished||!overlay.isConnected)return;
   const handle=await module.createNeuralScene(host);
   if(finished||!overlay.isConnected){handle?.destroy?.();return;}
   controller=handle;
   controller?.setPhase?.(currentPhase);
   overlay.dataset.graphics=handle?'webgl':'fallback';
  }catch{
   if(!finished&&overlay.isConnected)overlay.dataset.graphics='fallback';
  }
 });
}
export function finishInitialization(){
 if(finished)return;
 finished=true;
 controller?.destroy?.();
 controller=null;
 if(typeof document==='undefined')return;
 const overlay=document.getElementById('apsyntra-init');
 if(!overlay)return;
 overlay.setAttribute('aria-hidden','true');
 overlay.classList.add('aps-init-exiting');
 // A finished loading UI must not intercept newly ready app interactions.
 overlay.inert=true;
 const remove=()=>{
  overlay.removeEventListener('transitionend',onEnd);
  if(removePending!==null)window.clearTimeout(removePending);
  removePending=null;
  overlay.remove();
 };
 const onEnd=event=>{if(event.target===overlay)remove();};
 if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||
    document.hidden){remove();return;}
 overlay.addEventListener('transitionend',onEnd);
 removePending=window.setTimeout(remove,280);
}
