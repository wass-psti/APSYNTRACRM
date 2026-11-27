/** Presentation-only startup lifecycle for the shared application loader. */
const PHASES=Object.freeze({
 startup:'Preparing frontend…',
 authentication:'Restoring signed session…',
 authorization:'Verifying workspace access…',
 workspace:'Opening authorized workspace…'
});
let finished=false;
let started=false;
let removePending=null;
let visibilityHandler=null;
export function initializationPhaseLabel(phase){
 return PHASES[phase]||PHASES.startup;
}
export function setInitializationPhase(phase){
 if(finished||typeof document==='undefined')return;
 const node=document.getElementById('apsyntra-init');
 if(!node||node.dataset.phase==='fatal')return;
 const currentPhase=Object.hasOwn(PHASES,phase)?phase:'startup';
 node.dataset.phase=currentPhase;
 const label=node.querySelector('#apsyntra-init-phase');
 if(label&&label.textContent!==PHASES[currentPhase])label.textContent=PHASES[currentPhase];
}
export function startInitialization(){
 if(finished||started||typeof document==='undefined')return;
 const overlay=document.getElementById('apsyntra-init');
 if(!overlay||overlay.dataset.phase==='fatal')return;
 started=true;
 setInitializationPhase('startup');
 visibilityHandler=()=>{
  overlay.dataset.paused=String(document.hidden||overlay.dataset.phase==='fatal');
 };
 visibilityHandler();
 document.addEventListener('visibilitychange',visibilityHandler);
}
export function finishInitialization(){
 if(finished)return;
 finished=true;
 if(typeof document==='undefined')return;
 if(visibilityHandler){
  document.removeEventListener('visibilitychange',visibilityHandler);
  visibilityHandler=null;
 }
 const overlay=document.getElementById('apsyntra-init');
 if(!overlay||overlay.dataset.phase==='fatal')return;
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
