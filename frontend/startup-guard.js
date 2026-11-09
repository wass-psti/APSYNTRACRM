/**
 * APSYNTRA startup availability boundary.
 *
 * Independent classic script loaded before the ESM entry graph: if an entry
 * dependency cannot load/evaluate, app.js never calls boot(), so its finally
 * cannot remove the server-rendered initialization overlay. This watchdog
 * provides a bounded, accessible fatal recovery state without touching tokens,
 * permissions, local storage, route, or the central AuthClient.
 */
(()=>{
 'use strict';
 const STATES=Object.freeze({
  INITIALIZING:'INITIALIZING',
  AUTHENTICATED:'AUTHENTICATED',
  UNAUTHENTICATED:'UNAUTHENTICATED',
  RECOVERABLE_ERROR:'RECOVERABLE_ERROR',
  FATAL_ERROR:'FATAL_ERROR'
 });
 const ENTRY_LIMIT_MS=12000;
 const BOOT_LIMIT_MS=75000;
 let state=STATES.INITIALIZING,started=false,deadline=null,settled=false;
 const overlay=()=>document.getElementById('apsyntra-init');
 const clearDeadline=()=>{if(deadline!==null){clearTimeout(deadline);deadline=null;}};
 const showFailure=()=>{
  if(settled)return;
  settled=true;state=STATES.FATAL_ERROR;clearDeadline();
  const node=overlay();
  if(!node)return;
  node.dataset.phase='fatal';
  node.dataset.graphics='fallback';
  node.removeAttribute('role');
  node.setAttribute('aria-live','assertive');
  const label=node.querySelector('#apsyntra-init-phase');
  if(label)label.textContent='Startup could not finish';
  const content=node.querySelector('.aps-init-content');
  if(!content)return;
  const panel=document.createElement('section');
  panel.className='aps-init-recovery';
  panel.setAttribute('role','alert');
  const heading=document.createElement('h2');
  heading.textContent='Application could not load';
  const message=document.createElement('p');
  message.textContent='A required application module did not initialize. Check your connection and retry. Your existing account session has not been cleared.';
  const button=document.createElement('button');
  button.type='button';button.className='aps-init-retry';
  button.textContent='Retry loading application';
  button.addEventListener('click',()=>window.location.reload());
  panel.append(heading,message,button);
  content.append(panel);
  button.focus({preventScroll:true});
 };
 const arm=(ms)=>{clearDeadline();deadline=setTimeout(showFailure,ms);};
 const guard={
  get state(){return state;},
  begin(){
   if(state===STATES.FATAL_ERROR||(started&&!settled)||
    (settled&&state!==STATES.RECOVERABLE_ERROR))return false;
   started=true;settled=false;
   state=STATES.INITIALIZING;
   // Same-page recoveries run after the startup overlay is removed. Their
   // network requests remain independently bounded by AuthClient.call().
   if(overlay())arm(BOOT_LIMIT_MS);
   return true;
  },
  resolve(outcome){
   if(state===STATES.FATAL_ERROR)return false;
   if(![STATES.AUTHENTICATED,STATES.UNAUTHENTICATED,
    STATES.RECOVERABLE_ERROR,STATES.FATAL_ERROR].includes(outcome))return false;
   settled=true;state=outcome;clearDeadline();
   return true;
  },
  fail:showFailure
 };
 Object.defineProperty(window,'__APSYNTRA_STARTUP',{
  value:guard,writable:false,configurable:false,enumerable:false
 });
 // ESM dependency failures happen *before* the bootstrap's try/finally.
 // Report only while the entry graph has not executed; later optional
 // graphics/modules should never be mistaken for a failed application boot.
 window.addEventListener('error',()=>{if(!started&&!settled)showFailure();});
 window.addEventListener('unhandledrejection',()=>{if(!started&&!settled)showFailure();});
 arm(ENTRY_LIMIT_MS);
})();
