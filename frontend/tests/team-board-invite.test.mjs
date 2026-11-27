import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoardTeamInviteClient,verifyBoardTeamCandidates} from '../teams/team-board-invite.js';
import {renderBoardInviteDialog} from '../board/collaboration/invite.js';

const workspaceId='11111111-1111-4111-8111-111111111111';
const boardId='22222222-2222-4222-8222-222222222222';
const actorId='33333333-3333-4333-8333-333333333333';
const teamId='44444444-4444-4444-8444-444444444444';
const people={status:'SIGNED_MEMBERSHIP',people:[]};
const directory={status:'VERIFIED_SIGNED_CANDIDATES',members:[]};
const signed=()=>({
 contract:'apsyntra-board-team-invite-v1',authorized:true,
 workspaceId,boardId,actorId,revision:5,
 rows:[{teamId,name:'Information Technology (IT)',memberCount:2,hasAccess:false}]
});

test('signed exact-board workspace team search cannot be forged',()=>{
 const signedData=verifyBoardTeamCandidates(signed(),{workspaceId,boardId,actorId});
 assert.equal(signedData.status,'VERIFIED_BOARD_TEAM_CANDIDATES');
 assert.equal(signedData.teams[0].memberCount,2);
 for(const invalid of [
  {...signed(),authorized:false},
  {...signed(),boardId:teamId},
  {...signed(),actorId:teamId},
  {...signed(),revision:'5'},
  {...signed(),rows:[signed().rows[0],signed().rows[0]]},
  {...signed(),rows:[{...signed().rows[0],hasAccess:'false'}]}
 ]){
  assert.equal(verifyBoardTeamCandidates(invalid,{workspaceId,boardId,actorId}).status,
   'UNAVAILABLE');
 }
});

test('Board Invite lists authorized teams with viewer-only inheritance',()=>{
 const teamDirectory=verifyBoardTeamCandidates(signed(),{workspaceId,boardId,actorId});
 const html=renderBoardInviteDialog({
  people,directory,teamDirectory,workspaceName:'WAO',manage:true,
  accessEnabled:true,teamInviteEnabled:true,query:'Tech'
 });
 assert.match(html,/data-aps-invite-team="44444444-/);
 assert.match(html,/Viewer access for the team/);
 assert.match(html,/Search workspace people or teams/);
 const noGrant=renderBoardInviteDialog({people,directory,teamDirectory,
  manage:true,teamInviteEnabled:false,query:'Tech'});
 assert.match(noGrant,/data-aps-invite-team="44444444-[^>]* disabled/);
 const missing=renderBoardInviteDialog({people,directory,
  teamDirectory:{status:'UNAVAILABLE'},manage:true,teamInviteEnabled:true,query:'Tech'});
 assert.doesNotMatch(missing,/data-aps-invite-team=/);
});
test('team Viewer invite uses a signed revisioned server RPC, never browser table writes',async()=>{
 const requests=[];
 const api={rpc:async(name,args)=>{
  requests.push([name,args]);
  if(name==='apsyntra_board_team_invite_candidates')return signed();
  return {contract:'apsyntra-board-team-invite-change-v1',state:'committed',
   workspaceId,boardId,actorId,teamId,revision:6};
 }};
 const client=new BoardTeamInviteClient(api);
 const list=await client.search({workspaceId,boardId,actorId,query:'Tech'});
 assert.equal(list.status,'VERIFIED_BOARD_TEAM_CANDIDATES');
 const result=await client.invite({workspaceId,boardId,teamId,actorId,expectedRevision:5});
 assert.equal(result.revision,6);
 assert.deepEqual(requests[1],[
  'apsyntra_board_invite_team_viewer',
  {p_workspace_id:workspaceId,p_board_id:boardId,p_team_id:teamId,
   p_expected_revision:5}
 ]);
 assert.doesNotMatch(readFileSync('frontend/teams/team-board-invite.js','utf8'),/\.from\(/);
 assert.match(readFileSync('frontend/app.js','utf8'),/onInviteTeam:boardTeamClient\?inviteBoardTeam/);
});
test('team Viewer invite candidate is outside automatically applied migrations',()=>{
 const sql=readFileSync('sql/cp-teams-board-invite-CANDIDATE-NOT-APPLIED.sql','utf8');
 for(const source of ['private.ws01_signed_actor_session','apsyntra_board_team_invite_candidates',
  'apsyntra_board_invite_team_viewer','apsyntra_team_is_system_admin',
  'p_expected_revision','apsyntra_teams_audit_log','work_board_members',
  'viewer','Stale team directory'])
  assert.ok(sql.includes(source),'missing '+source);
});
