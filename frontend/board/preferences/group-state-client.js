/** Signed cross-device per-user Board group presentation preferences.
 * The database derives the user from auth.uid() and independently checks
 * current signed session/board access on every read and write.
 * Never persist record contents or authorization data in browser storage.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const valid=id=>typeof id==='string'&&UUID.test(id);
function verify(payload,boardId){
 if(!payload||payload.board_id!==boardId||!Array.isArray(payload.groups)||
    payload.groups.length>500||
    payload.groups.some(g=>!valid(g.group_id)||typeof g.collapsed!=='boolean'||
      !Number.isSafeInteger(g.revision)||g.revision<1))
  throw new Error('Invalid signed group preference receipt');
 if(new Set(payload.groups.map(g=>g.group_id)).size!==payload.groups.length)
  throw new Error('Duplicated group preference IDs');
 return payload.groups;
}
export class BoardGroupStateClient {
 constructor(api){this.api=api;}
 async read(boardId){
  if(!valid(boardId))throw new Error('Invalid board preference scope');
  return verify(await this.api.rpc('wm_board_group_view_read',{p_board_id:boardId}),boardId);
 }
 async set(boardId,groupId,collapsed,revision){
  if(!valid(boardId)||!valid(groupId)||typeof collapsed!=='boolean'||
    !Number.isSafeInteger(revision)||revision<1)
   throw new Error('Invalid Board preference change');
  const result=await this.api.rpc('wm_board_group_view_set',{
   p_board_id:boardId,p_group_id:groupId,p_collapsed:collapsed,
   p_expected_revision:revision
  });
  if(result?.board_id!==boardId||result?.group_id!==groupId||
     result?.collapsed!==collapsed||!Number.isSafeInteger(result.revision)||
     result.revision<=revision)
   throw new Error('Unverified Board group preference receipt');
  return result;
 }
 async setAll(boardId,collapsed){
  if(!valid(boardId)||typeof collapsed!=='boolean')
   throw new Error('Invalid Board group preference batch');
  return verify(await this.api.rpc('wm_board_group_view_set_all',{
   p_board_id:boardId,p_collapsed:collapsed}),boardId);
 }
}
