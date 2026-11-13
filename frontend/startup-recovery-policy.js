/**
 * CP-CRM-CONN-01: bounded recovery for the two *read-only* signed startup
 * stages. Never wrap route handlers, writes, sign-in, refresh-token exchange
 * or any mutation. Existing server permissions remain authoritative.
 */
const TRANSIENT_STATUSES=new Set([408,429,500,502,503,504]);
const TRANSIENT_CODES=new Set(['NETWORK_UNAVAILABLE','REQUEST_TIMEOUT']);
export function transientStartupFailure(error){
 return TRANSIENT_CODES.has(error?.code)||
  TRANSIENT_STATUSES.has(error?.status)||
  (Number.isInteger(error?.status)&&error.status>=500&&error.status<=599);
}
export async function startupVerifiedRead(read,{
 canContinue=()=>true,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 retryDelayMs=350,onRetry=()=>{}
}={}){
 if(typeof read!=='function'||typeof canContinue!=='function')
  throw new TypeError('Invalid startup verification inputs.');
 if(!canContinue())throw new Error('Startup session changed.');
 for(let attempt=0;attempt<2;attempt++){
  try{
   const result=await read();
   if(!canContinue())throw new Error('Startup session changed.');
   return result;
  }catch(error){
   if(attempt!==0||!transientStartupFailure(error)||!canContinue())
    throw error;
   // A single delayed retry, only for an indeterminate read failure.
   // Callers must not pass mutating operations.
   onRetry();
   await wait(retryDelayMs);
   if(!canContinue())throw new Error('Startup session changed.');
  }
 }
 throw new Error('Startup read exhausted.'); // unreachable
}
export function startupFailureDescription(error,stage='authentication'){
 if(error?.status===403)
  return 'The signed account has no verified access to the requested workspace. Contact your administrator if your membership should be active.';
 const stageLabel=stage==='workspace'?'Workspace verification':
  stage==='route'?'Authorized page loading':'Session verification';
 const condition=error?.code==='REQUEST_TIMEOUT'?'took too long':
  error?.code==='NETWORK_UNAVAILABLE'?'lost its network connection':
  error?.status===429?'was rate limited':
  Number.isInteger(error?.status)&&error.status>=500?'is temporarily unavailable':
  error?.code==='INVALID_JSON_RESPONSE'?'returned an invalid server response':
  error?.code==='REQUEST_ABORTED'?'was cancelled':
  'encountered an unexpected client error';
 return stageLabel+' '+condition+'. Your existing signed session is preserved where valid. Retry the connection; no changes will be submitted automatically.';
}
