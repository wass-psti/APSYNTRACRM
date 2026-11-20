/** Signed Team-to-Board viewer-invite client.
 * Team assignment is a distinct permission from individual board membership.
 * It does not backfill work_board_members or bypass existing board RLS.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable=Object.freeze({status:'UNAVAILABLE',teams:[]});
export function verifyBoardTeamCandidates(raw,{workspaceId,boardId,actorId}={}){
 if(!uuid.test(workspaceId||'')||!uuid.test(boardId||'')||
    !uuid.test(actorId||'')||raw?.contract!=='apsyntra-board-team-invite-v1'||
    raw.authorized!==true||raw.workspaceId!==workspaceId||
    raw.boardId!==boardId||raw.actorId!==actorId||
    !Number.isSafeInteger(raw.revision)||raw.revision<0||
    !Array.isArray(raw.rows)||raw.rows.length>300)return unavailable;
 const ids=new Set(),teams=[];
 for(const team of raw.rows){
  if(!uuid.test(team?.teamId||'')||ids.has(team.teamId)||
    typeof team.name!=='string'||team.name.length>100||
    !Number.isSafeInteger(team.memberCount)||team.memberCount<0||
    typeof team.hasAccess!=='boolean')return unavailable;
  ids.add(team.teamId);
  teams.push(Object.freeze({
   teamId:team.teamId,name:team.name,memberCount:team.memberCount,hasAccess:team.hasAccess
  }));
 }
 return Object.freeze({status:'VERIFIED_BOARD_TEAM_CANDIDATES',workspaceId,boardId,
  actorId,revision:raw.revision,teams:Object.freeze(teams)});
}
export class BoardTeamInviteClient{
 constructor(api){this.api=api;}
 async search({workspaceId,boardId,actorId,query=''}={}){
  if(!uuid.test(workspaceId||'')||!uuid.test(boardId||'')||!uuid.test(actorId||'')||
    typeof query!=='string'||query.length>120)throw Error('Invalid signed board/team query');
  let raw;
  try{
   raw=await this.api.rpc('apsyntra_board_team_invite_candidates',{
    p_workspace_id:workspaceId,p_board_id:boardId,p_query:query
   });
  }catch(error){
   if(error?.status===404&&error?.code==='PGRST202')return unavailable;
   throw error;
  }
  const candidate=verifyBoardTeamCandidates(raw,{workspaceId,boardId,actorId});
  if(candidate.status!=='VERIFIED_BOARD_TEAM_CANDIDATES')
   throw Error('Board team candidates failed signed verification');
  return candidate;
 }
 async invite({workspaceId,boardId,teamId,actorId,expectedRevision}={}){
  if(![workspaceId,boardId,teamId,actorId].every(x=>uuid.test(x||''))||
    !Number.isSafeInteger(expectedRevision)||expectedRevision<0)
    throw Error('Invalid signed board/team invite target');
  const receipt=await this.api.rpc('apsyntra_board_invite_team_viewer',{
   p_workspace_id:workspaceId,p_board_id:boardId,p_team_id:teamId,
   p_expected_revision:expectedRevision
  });
  if(receipt?.contract!=='apsyntra-board-team-invite-change-v1'||
    receipt.state!=='committed'||receipt.workspaceId!==workspaceId||
    receipt.boardId!==boardId||receipt.teamId!==teamId||
    receipt.actorId!==actorId||receipt.revision!==expectedRevision+1)
   throw Error('Team Viewer invite acknowledgement failed verification');
  return receipt;
 }
}
