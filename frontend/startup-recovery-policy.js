import {classifyAuthFailure} from './auth/failure-classification.js';

/**
 * CP-CRM-CONN-01: bounded recovery for the two *read-only* signed startup
 * stages. Never wrap route handlers, writes, sign-in, refresh-token exchange
 * or any mutation. Existing server permissions remain authoritative.
 */
export function transientStartupFailure(error,operation='startup'){
 if(Number(error?.retryAttempts)>0)return false;
 const failure=classifyAuthFailure(error,{operation});
 return failure.retryable===true;
}
export async function startupVerifiedRead(read,{
 operation='startup',canContinue=()=>true,
 wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
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
   const failure=classifyAuthFailure(error,{operation});
   if(attempt!==0||!transientStartupFailure(error,operation)||!canContinue())throw error;
   // Respect a server-supplied Retry-After value, while retaining the
   // existing minimum delay and the single-retry ceiling.
   const retryDelay=failure.retryAfterMs===null?retryDelayMs:
    Math.max(retryDelayMs,failure.retryAfterMs);
   onRetry();
   await wait(retryDelay);
   if(!canContinue())throw new Error('Startup session changed.');
  }
 }
 throw new Error('Startup read exhausted.'); // unreachable
}
export function startupFailureDescription(error,stage='authentication'){
 if(error?.status===403)
  return 'The signed account has no verified access to the requested workspace. Contact your administrator if your membership should be active.';
 const operation=stage==='workspace'?'workspace-context':
  stage==='authentication'?'session-read':'startup';
 const failure=classifyAuthFailure(error,{operation});
 const stageLabel=stage==='workspace'?'Workspace verification':
  stage==='route'?'Authorized page loading':'Session verification';
 const condition=failure.category==='AUTH_REQUEST_TIMEOUT'?'took too long':
  failure.category==='NETWORK_UNAVAILABLE'?'lost its network connection':
  failure.category==='AUTH_RATE_LIMITED'?'was rate limited':
  failure.category==='AUTH_SERVICE_UNAVAILABLE'?'is temporarily unavailable':
  failure.category==='AUTH_RESPONSE_INVALID'?'returned an invalid server response':
  failure.category==='AUTH_STORAGE_UNAVAILABLE'?'could not access browser session storage':
  failure.category==='REQUEST_CANCELLED'?'was cancelled':
  failure.category==='WORKSPACE_CONTEXT_UNAVAILABLE'?'could not restore the existing workspace context':
  'encountered an unexpected client error';
 return stageLabel+' '+condition+'. Your existing signed session is preserved where valid. Retry the connection; no changes will be submitted automatically.';
}
