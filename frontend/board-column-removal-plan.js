/** Choose the supported action without inventing a client-side delete grant.
 * Nonempty cells must not enter the empty-only destructive backend RPC.
 */
export function planBoardColumnRemoval({storedCount,recoveryReady=false}={}){
 if(!Number.isSafeInteger(storedCount)||storedCount<0)
  throw new TypeError('An authoritative column value count is required.');
 if(storedCount===0)return Object.freeze({kind:'delete-empty',submitLabel:'Delete empty column'});
 if(recoveryReady===true)
  return Object.freeze({kind:'delete-recoverable',submitLabel:'Delete with recovery'});
 return Object.freeze({kind:'hide-preserve',submitLabel:'Hide column (keep data)'});
}
