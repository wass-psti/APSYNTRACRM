/** A Board-catalog failure may be bypassed for the four native routes only
 * when the catalog read is indeterminate. A confirmed denial, invalid scope,
 * or missing resource must not be misreported as a temporary outage. The
 * native application's independent signed resolver remains authoritative. */
export function transientBoardCatalogFailure(error){
 const status=Number(error?.status);
 if(status>=400&&status<500&&status!==408&&status!==429)return false;
 return [408,429,500,502,503,504].includes(status)||
  (Number.isInteger(status)&&status>=500&&status<=599)||
  ['NETWORK_UNAVAILABLE','REQUEST_TIMEOUT'].includes(error?.code);
}

/** Two independent, signed, post-context read operations. No caching,
 * background work, identity data, or permission fallbacks. */
export async function readWorkspaceStartup({
 listBoards,verifyBootstrap,isCurrent,allowBoardListFailure=false
}){
 if(typeof listBoards!=='function'||typeof verifyBootstrap!=='function'||
    typeof isCurrent!=='function')throw Error('Invalid signed workspace startup inputs');
 const boardRead=Promise.resolve().then(listBoards).then(
  boards=>({boards,boardCatalogError:null}),
  error=>{
   if(allowBoardListFailure!==true||!transientBoardCatalogFailure(error))throw error;
   return {boards:[],boardCatalogError:error};
  }
 );
 // Generic board routes still require a successful signed catalog read.
 // Native standalone routes may continue only through their separate signed
 // canonical application resolver; this fallback never grants board access.
 const [boardResult,bootstrapVerified]=await Promise.all([
  boardRead,Promise.resolve().then(verifyBootstrap).catch(()=>false)
 ]);
 if(!isCurrent())throw Error('Signed workspace changed during initialization.');
 const result={boards:boardResult.boards,bootstrapVerified:bootstrapVerified===true};
 if(boardResult.boardCatalogError)result.boardCatalogError=boardResult.boardCatalogError;
 return result;
}
