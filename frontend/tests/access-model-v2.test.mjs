import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderWorkspaceRoles} from '../access-v2/workspace-ui.js';
import {renderAccessModelHelp} from '../access-v2/help-ui.js';
import {verifyAppRolesSnapshot,renderAppRolesSettings} from '../access-v2/app-roles-ui.js';
import {renderBoardInviteDialog} from '../board/collaboration/invite.js';

const workspaceId='11111111-1111-4111-8111-111111111111';
const actorId='22222222-2222-4222-8222-222222222222';
const teamId='33333333-3333-4333-8333-333333333333';
const userId='44444444-4444-4444-8444-444444444444';
const boardId='55555555-5555-4555-8555-555555555555';
const appId='66666666-6666-4666-8666-666666666666';
const roleId='77777777-7777-4777-8777-777777777777';

const teamsSnapshot=()=>({
 status:'VERIFIED_TEAMS',workspaceId,actorId,revision:4,canManageSystemAdmins:true,
 teams:[{id:teamId,name:'Information Technology (IT)',isSystem:false,
  memberCount:2,ownerCount:1,contentCount:1,systemAdminCount:0,canManage:true}],
 members:[{teamId,userId,name:'Lex Mariun B. Señagan',email:'lex@example.test',
  title:'IT Support Specialist',isOwner:true,systemAdminSource:'none',systemAdminExplicit:false},
  {teamId,userId:actorId,name:'Lucky Ampalayohan',email:'lucky@example.test',
   title:'OJT - IT Specialists',isOwner:false,systemAdminSource:'none',systemAdminExplicit:false}],
 directory:[{userId,name:'Lex Mariun B. Señagan',email:'lex@example.test'},
  {userId:actorId,name:'Lucky Ampalayohan',email:'lucky@example.test'}],
 content:[{teamId,contentType:'board',contentId:boardId,name:'I.T - Daily Activities',accessLevel:'editor'}]
});
test('workspace screenshot layout includes exact section hierarchy and no global app roles',()=>{
 const html=renderWorkspaceRoles({snapshot:teamsSnapshot(),selectedTeamId:teamId});
 for(const item of ['User Role Management','Search teams','All teams',
  'Information Technology (IT)','Users · 2','Board access · 1',
  'Search by name or email','Workspace role','Team owner','Member',
  'Board access for this team','Every member gets this level on the board',
  'I.T - Daily Activities','Settings &gt; Roles.'])
  assert.ok(html.includes(item),'Missing UI: '+item);
 assert.doesNotMatch(html,/Permission matrix|Stage module capability|Approver<\/td>/);
 assert.match(html,/data-action="teams-content-role"/);
 assert.match(html,/data-access-level="viewer"/);
 assert.match(html,/data-access-level="editor"/);
});
test('unverified workspace snapshot fails closed rather than showing fake sample staff',()=>{
 const html=renderWorkspaceRoles({snapshot:null,error:'signed Teams endpoint unavailable'});
 assert.match(html,/not available yet/i);
 assert.match(html,/signed Teams endpoint unavailable/i);
 assert.doesNotMatch(html,/Lex Mariun|Lucky Ampalayohan|I\.T - Daily/);
});
test('app roles fail closed for mismatched actor, scope or fake capabilities',()=>{
 const good={
  contract:'apsyntra-app-roles-v2',authorized:true,appId,appKey:'fueltrans',
  actorId,workspaceId,revision:7,canManage:true,
  roles:[{id:roleId,key:'approver',name:'Approver',description:'Approves fuel requests.',
   isAdminRole:false,memberCount:1,capabilities:[
    {featureKey:'fuel_requests',capability:'view',allowed:true},
    {featureKey:'fuel_requests',capability:'approve',allowed:true}]},
   {id:'88888888-8888-4888-8888-888888888888',key:'app_administrator',
    name:'App administrator',description:'App administration.',
    isAdminRole:true,memberCount:0,capabilities:[]}],
  features:[{key:'fuel_requests',name:'Fuel requests',availableCapabilities:['view','create','edit','approve']}],
  people:[{roleId,userId,name:'Alex P. Señagan'}]
 };
 const valid=verifyAppRolesSnapshot(good,{appKey:'fueltrans',workspaceId,actorId});
 assert.equal(valid.status,'VERIFIED_APP_ROLES');
 assert.match(renderAppRolesSettings({snapshot:valid,appKey:'fueltrans',selectedRoleId:roleId}),/Approver/);
 assert.match(renderAppRolesSettings({snapshot:valid,appKey:'fueltrans',selectedRoleId:roleId}),/type="checkbox"/);
 assert.equal(verifyAppRolesSnapshot({...good,actorId:userId},{appKey:'fueltrans',workspaceId,actorId}).status,'UNAVAILABLE');
 const forged=structuredClone(good);forged.roles[0].capabilities.push({featureKey:'not_an_app_feature',capability:'delete',allowed:true});
 assert.equal(verifyAppRolesSnapshot(forged,{appKey:'fueltrans',workspaceId,actorId}).status,'UNAVAILABLE');
 assert.match(renderAppRolesSettings({appKey:'fueltrans',error:'Role RPC missing'}),/Role RPC missing/);
});
test('board invite supports two tabs and owner protection without fake Editor write authority',()=>{
 const people={status:'SIGNED_MEMBERSHIP',people:[
  {id:userId,name:'Board Owner',role:'owner',avatarPath:null},
  {id:actorId,name:'Board Viewer',role:'viewer',avatarPath:null}
 ]};
 const directory={status:'VERIFIED_SIGNED_CANDIDATES',members:[]};
 const html=renderBoardInviteDialog({people,directory,manage:true,accessEnabled:true,query:'',workspaceName:'APSGroup of Companies'});
 for(const item of ['Invite to this board','Search by name, team or email',
  'People','Teams','Viewer','Owner','Editor','Only invited people can access this board'])
  assert.ok(html.includes(item),'Missing board Invite: '+item);
 assert.match(html,/data-aps-invite-role="22222222-[^>]*disabled/);
 assert.doesNotMatch(html,/data-aps-invite-revoke="44444444-/);
});
test('help screen summarizes workspace, board and app layers',()=>{
 const html=renderAccessModelHelp();
 for(const text of ['HOW ACCESS WORKS','Three layers of access',
  'Workspace','Board','Application','HOW THEY COMBINE'])
  assert.match(html,new RegExp(text));
});
test('production drops old global matrix and Stage module capability but preserves source roles',()=>{
 const ui=readFileSync('frontend/role-configuration-ui.js','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 assert.doesNotMatch(ui,/function matrix\(|Permission matrix/);
 assert.doesNotMatch(app,/Stage module capability/);
 const data=readFileSync('frontend/user-role-management.js','utf8');
 assert.match(data,/employee/);
 assert.match(data,/FUELTRANS_WORKSPACE_ROLES/);
});
test('SQL and REST are staged, auth-scoped and protect board owner and app roles',()=>{
 const sql=readFileSync('sql/ACCESS_MODEL_V2_REVIEW_ONLY.sql','utf8');
 for(const phrase of ["CREATE TYPE access_v2.board_role AS ENUM ('viewer','editor')",
  'CREATE TABLE access_v2.app_roles','CREATE TABLE access_v2.app_role_capabilities',
  'CREATE TABLE access_v2.app_role_members','CREATE TABLE access_v2.board_team_access',
  'CREATE FUNCTION access_v2.effective_board_role','CREATE FUNCTION access_v2.has_app_capability',
  'enforce_last_board_owner','audit_immutable','legacy_app_role_mappings'])
  assert.ok(sql.includes(phrase.replaceAll("\\'","'")),'Missing '+phrase);
 const service=readFileSync('supabase/functions/access-v2/index.ts','utf8');
 assert.match(service,/APSYNTRA_ACCESS_V2_ENABLED/);
 assert.match(service,/\/auth\/v1\/user/);
 assert.doesNotMatch(service,/SERVICE_ROLE|service_role|supabase\.from\(/);
 assert.match(service,/403/);
 assert.match(service,/409/);
 assert.match(service,/503/);
});
