/**
 * Classify terminal modal outcomes separately from retryable validation errors.
 * A partial destructive batch is never safe to submit again automatically.
 */
export function modalRecoveryKind(error,{disableOnConflict=false}={}){
 if(error?.code==='BOARD_DELETE_PARTIAL_OR_UNCERTAIN')return 'partial';
 const conflict=disableOnConflict&&(
  error?.status===409||error?.code==='40001'||
  error?.code==='BOARD_REVISION_STALE'||error?.code==='BOARD_METADATA_CHANGED');
 return conflict?'conflict':null;
}

/** Turn the disabled submit control into an enabled, non-submitting recovery action. */
export function installModalRecoveryAction(button,{label,action,close,onError}={}){
 if(!button||typeof action!=='function'||!String(label||'').trim())return false;
 let inFlight=false;
 button.type='button';
 button.disabled=false;
 button.textContent=label;
 button.classList?.remove('board-modal-danger','primary');
 button.classList?.add('secondary');
 button.addEventListener('click',async event=>{
  event.preventDefault?.();
  if(inFlight||button.disabled)return;
  inFlight=true;
  button.disabled=true;
  button.textContent='Refreshing…';
  button.setAttribute?.('aria-busy','true');
  try{
   await action();
   await close?.();
  }catch(error){
   onError?.(error);
   if(button.isConnected!==false){
    button.disabled=false;
    button.textContent=label;
   }
  }finally{
   inFlight=false;
   button.removeAttribute?.('aria-busy');
  }
 });
 return true;
}
