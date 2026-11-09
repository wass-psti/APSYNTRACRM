/** Two independent, signed, post-context read operations. No caching,
 * background work, identity data, or permission fallbacks. */
export async function readWorkspaceStartup({listBoards,verifyBootstrap,isCurrent}){
 if(typeof listBoards!=='function'||typeof verifyBootstrap!=='function'||
    typeof isCurrent!=='function')throw Error('Invalid signed workspace startup inputs');
 // The board-list failure must still reject startup. Bootstrap verification
 // already fails closed to false on read errors and never grants access.
 const [boards,bootstrapVerified]=await Promise.all([
  listBoards(),Promise.resolve().then(verifyBootstrap).catch(()=>false)
 ]);
 if(!isCurrent())throw Error('Signed workspace changed during initialization.');
 return {boards,bootstrapVerified:bootstrapVerified===true};
}
