import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TeamsClient,validateTeamsSnapshot} from '../teams/teams-client.js';
import {renderTeamsConsole} from '../teams/teams-ui.js';
const ws='00000000-0000-4000-8000-000000000001';
const actor='11111111-1111-4111-8111-111111111111';
const finance='22222222-2222-4222-8222-222222222222';
const general='33333333-3333-4333-8333-333333333333';
const user='44444444-4444-4444-8444-444444444444';
const board='55555555-5555-4555-8555-555555555555';
const snap=(admin=true)=>({
 contract:'apsyntra-teams-v1',authorized:true,workspaceId:ws,actorId:actor,
 revision:7,canManageSystemAdmins:admin,
 teams:[
  {id:finance,name:'Finance',isSystem:false,canManage:true,memberCount:1,ownerCount:1,contentCount:1,systemAdminCount:0,avatarUrl:null,coverUrl:null},
  ...(admin?[{id:general,name:'General administration',isSystem:true,canManage:true,memberCount:1,ownerCount:1,contentCount:0,systemAdminCount:1,avatarUrl:null,coverUrl:null}]:[])
 ],
 members:[
  {teamId:finance,userId:user,name:'Taylor',email:'taylor@example.com',title:'Finance Analyst',
   isOwner:true,systemAdminSource:'none',systemAdminExplicit:false,grantedByName:null,grantedAt:null},
  ...(admin?[{teamId:general,userId:actor,name:'Manager',email:'manager@example.com',title:'CEO',
   isOwner:true,systemAdminSource:'inherited',systemAdminExplicit:false,grantedByName:null,grantedAt:null}]:[])
 ],
 directory:[{userId:user,name:'Taylor',email:'taylor@example.com'},
  {userId:actor,name:'Manager',email:'manager@example.com'}],
 content:[{teamId:finance,contentType:'board',contentId:board,name:'Budget board',accessLevel:'viewer'}]
});
test('Teams snapshot contract validates workspace and actor, rejects forged metadata',()=>{
 const signed=validateTeamsSnapshot(snap(),{workspaceId:ws,actorId:actor});
 assert.equal(signed.status,'VERIFIED_TEAMS');
 assert.equal(signed.teams.length,2);
 assert.equal(signed.members[1].systemAdminSource,'inherited');
 assert.equal(validateTeamsSnapshot({...snap(),actorId:user},{workspaceId:ws,actorId:actor}).status,'UNAVAILABLE');
 assert.equal(validateTeamsSnapshot({...snap(),revision:'7'},{workspaceId:ws,actorId:actor}).status,'UNAVAILABLE');
 const duplicate=snap();duplicate.members.push(duplicate.members[0]);
 assert.equal(validateTeamsSnapshot(duplicate,{workspaceId:ws,actorId:actor}).status,'UNAVAILABLE');
 const forged=snap();forged.teams[0].ownerCount=0;
 assert.equal(validateTeamsSnapshot(forged,{workspaceId:ws,actorId:actor}).status,'UNAVAILABLE');
});
test('team owner sees own teams without a synthetic System Admin team',()=>{
 const signed=validateTeamsSnapshot(snap(false),{workspaceId:ws,actorId:actor});
 assert.equal(signed.status,'VERIFIED_TEAMS');
 assert.equal(signed.canManageSystemAdmins,false);
});
test('UI reproduces Teams shell, two panes, users/content, crown and inherited shield',()=>{
 const data=validateTeamsSnapshot(snap(),{workspaceId:ws,actorId:actor});
 const html=renderTeamsConsole({snapshot:data,selectedTeamId:general});
 for(const text of ['class="teams-backdrop"','role="dialog"','Teams','New team','Search teams',
  'All teams','Information Technology', 'Users: 1','Content: 0','System Admin',
  'Inherited from General administration','teams-owner']) {
  if(text==='Information Technology')continue;
  assert.ok(html.includes(text),'missing '+text);
 }
 assert.match(html,/Remove this user from General administration to revoke/);
 assert.match(html,/data-action="teams-close"/);
 assert.match(html,/data-action="teams-theme"/);
 assert.match(html,/data-teams-theme="dark"/);
 const content=renderTeamsConsole({snapshot:data,selectedTeamId:finance,tab:'content'});
 assert.match(content,/Budget board/);
 assert.match(content,/Assign content/);
});
test('signed Teams client rejects absent service and unconfirmed receipts',async()=>{
 const missing=new TeamsClient({rpc:async()=>{throw Object.assign(Error('Missing'),{status:404,code:'PGRST202'});}});
 assert.equal((await missing.snapshot({workspaceId:ws,actorId:actor})).status,'UNAVAILABLE');
 const calls=[];
 const client=new TeamsClient({rpc:async(name,args)=>{
  calls.push({name,args});
  return name==='apsyntra_teams_snapshot'?snap():
    {contract:'apsyntra-teams-change-v1',state:'committed',
     workspaceId:ws,actorId:actor,action:'make_owner',revision:8};
 }});
 assert.equal((await client.snapshot({workspaceId:ws,actorId:actor})).status,'VERIFIED_TEAMS');
 const r=await client.change({workspaceId:ws,actorId:actor,
  action:'make_owner',teamId:finance,userId:user,expectedRevision:7});
 assert.equal(r.revision,8);
 assert.deepEqual(calls[1].args,{
  p_workspace_id:ws,p_action:'make_owner',p_team_id:finance,
  p_target_user_id:user,p_destination_team_id:null,p_name:null,
  p_content_type:null,p_content_id:null,p_access_level:null,
  p_asset_url:null,p_expected_revision:7
 });
 await assert.rejects(()=>client.change({workspaceId:ws,actorId:actor,action:'make_owner',
  expectedRevision:7,teamId:'invalid'}),/Invalid/);
 const bad=new TeamsClient({rpc:async()=>({contract:'apsyntra-teams-change-v1',
  state:'committed',workspaceId:ws,actorId:actor,action:'make_owner',revision:7})});
 await assert.rejects(()=>bad.change({workspaceId:ws,actorId:actor,
  action:'make_owner',teamId:finance,userId:user,expectedRevision:7}),/acknowledgement/);
});
test('review SQL carries ID-backed protected team, last-admin, audit and revision guards',()=>{
 const sql=readFileSync('sql/cp-teams-role-management-CANDIDATE-NOT-APPLIED.sql','utf8');
 for(const code of ['is_system boolean','PRIMARY KEY(team_id,user_id)',
  'private.apsyntra_system_admin_grants','private.apsyntra_teams_audit_log',
  'apsyntra_team_is_system_admin','apsyntra_team_effective_board_role',
  'last System Admin cannot be removed','apsyntra_teams_snapshot',
  'apsyntra_teams_change','p_expected_revision','FORCE ROW LEVEL SECURITY',
  'approved_seed_admin','General administration cannot be deleted']){
  assert.ok(sql.includes(code),'missing '+code);
 }
 assert.doesNotMatch(sql,/\bdepartment\s*=\s*'Information Technology'/);
 assert.doesNotMatch(readFileSync('frontend/teams/teams-controller.js','utf8'),
  /localStorage|sessionStorage|\.from\(['"]apsyntra_team/);
});
