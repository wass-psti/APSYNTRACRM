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
   if(allowBoardListFailure!==true)throw error;
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
