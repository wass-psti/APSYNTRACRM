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

/** Independent signed reads after the authoritative workspace context.
 * No caching, background work, identity data, or permission fallbacks.
 * The optional administrator read is included in the same startup fan-out. */
export async function readWorkspaceStartup({
 listBoards,verifyBootstrap,verifyAdmin,isCurrent,allowBoardListFailure=false
}){
 if(typeof listBoards!=='function'||typeof verifyBootstrap!=='function'||
    typeof isCurrent!=='function'||
    (verifyAdmin!==undefined&&typeof verifyAdmin!=='function'))
  throw Error('Invalid signed workspace startup inputs');
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
 const reads=[
  boardRead,
  Promise.resolve().then(verifyBootstrap)
 ];
 if(verifyAdmin)reads.push(Promise.resolve().then(verifyAdmin));
 const [boardResult,bootstrapVerified,adminVerified]=await Promise.all(reads);
 if(!isCurrent())throw Error('Signed workspace changed during initialization.');
 const result={boards:boardResult.boards,bootstrapVerified:bootstrapVerified===true};
 if(verifyAdmin)result.adminVerified=adminVerified===true;
 if(boardResult.boardCatalogError)result.boardCatalogError=boardResult.boardCatalogError;
 return result;
}
