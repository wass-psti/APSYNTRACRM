import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 BOARD_GROUP_ACCESS_ENABLED,BOARD_GROUP_ROLE,
 normalizeSignedBoardCandidates,normalizeSignedWorkspaceGroups,
 validateBoardAccessAction,validateWorkspaceGroupDraft,
 renderBoardAccessChoices,BoardGroupAccessClient
} from '../workspace-board-groups.js';

const ws='11111111-1111-4111-8111-111111111111';
const board='22222222-2222-4222-8222-222222222222';
const admin='33333333-3333-4333-8333-333333333333';
const user='44444444-4444-4444-8444-444444444444';
const group='55555555-5555-4555-8555-555555555555';
const requestId='66666666-6666-4666-8666-666666666666';
const source={status:'VERIFIED_READ',boardId:board,workspaceId:ws,manage:true,
 users:[{id:user,name:'Pat Partner',email:'pat@example.test',boardRole:null}]};
const groups={schemaVersion:1,workspaceId:ws,boardId:board,authorized:true,
 groups:[{id:group,name:'Clients',memberCount:1,assignedToBoard:false}]};

test('workspace invitation and exact-board access are separate and off',()=>{
 assert.equal(BOARD_GROUP_ACCESS_ENABLED,false);
 assert.equal(BOARD_GROUP_ROLE,'viewer');
 const ui=readFileSync('frontend/board-share.js','utf8');
 const workspace=readFileSync('frontend/workspace-invitation-client.js','utf8');
 assert.match(ui,/Workspace membership alone does not grant/);
 assert.match(ui,/data-board-share-workspace-invite/);
 assert.match(workspace,/WS02D_INVITE_CLIENT_ENABLED=false/);
 assert.match(readFileSync('frontend/auth-account-flows.js','utf8'),
  /REGISTRATION_ADMISSION_ENABLED=false/);
});

test('board candidate directory requires manager signed exact board & workspace',()=>{
 const result=normalizeSignedBoardCandidates(source,{boardId:board,workspaceId:ws});
 assert.equal(result.status,'VERIFIED_SIGNED_CANDIDATES');
 assert.deepEqual(result.members.map(x=>x.name),['Pat Partner']);
 for(const bad of [
  {...source,status:'LOCKED'},
  {...source,manage:false},
  {...source,boardId:user},
  {...source,workspaceId:board},
  {...source,users:[...source.users,...source.users]},
  {...source,users:[{...source.users[0],boardRole:'admin'}]},
  {...source,users:[{...source.users[0],name:'<script>'}]},
  {...source,users:[{...source.users[0],email:'p@example.test,b@example.test'}]}
 ]){
  assert.equal(normalizeSignedBoardCandidates(bad,{boardId:board,workspaceId:ws}).status,
   'UNAVAILABLE');
 }
});

test('groups must be returned from a separately scoped signed backend',()=>{
 const g=normalizeSignedWorkspaceGroups(groups,{boardId:board,workspaceId:ws});
 assert.equal(g.status,'VERIFIED_GROUPS');
 assert.equal(g.groups[0].name,'Clients');
 assert.equal(g.groups[0].memberCount,1);
 for(const bad of [
  null,{...groups,authorized:false},
  {...groups,workspaceId:board},
  {...groups,boardId:user},
  {...groups,groups:[...groups.groups,...groups.groups]},
  {...groups,groups:[{...groups.groups[0],name:'<svg onload=x>'}]},
  {...groups,groups:[{...groups.groups[0],memberCount:1000}]}
 ]){
  assert.equal(normalizeSignedWorkspaceGroups(bad,{boardId:board,workspaceId:ws}).status,
   'UNAVAILABLE');
 }
});

test('group creation requires members selected from registered IDs, no emails',()=>{
 const valid=validateWorkspaceGroupDraft({
  workspaceId:ws,requestId,name:' Customers ',memberIds:[user]
 });
 assert.deepEqual(valid,{workspaceId:ws,requestId,name:'Customers',memberIds:[user]});
 for(const values of [
  {memberIds:[]},{memberIds:[user,user]},{memberIds:['pat@example.test']},
  {name:'<admin>'},{workspaceId:board+'junk'}
 ])assert.equal(validateWorkspaceGroupDraft({
  workspaceId:ws,requestId,name:'Clients',memberIds:[user],...values
 }),null);
});

test('exact-board grant/revoke only supports a member or a group as Viewer',()=>{
 const values={workspaceId:ws,boardId:board,requestId,subjectId:user,
  subjectType:'member',action:'grant'};
 assert.deepEqual(validateBoardAccessAction(values),{...values,role:'viewer'});
 assert.equal(validateBoardAccessAction({...values,role:'editor'}),null);
 assert.equal(validateBoardAccessAction({...values,subjectType:'workspace'}),null);
 assert.equal(validateBoardAccessAction({...values,subjectId:'pat@example.test'}),null);
 assert.deepEqual(validateBoardAccessAction({
  ...values,subjectType:'group',subjectId:group,action:'revoke'
 }),{...values,subjectType:'group',subjectId:group,action:'revoke',role:'viewer'});
});

test('picker has People and Groups tabs, narrow private data, disabled mutations',()=>{
 const people=normalizeSignedBoardCandidates(source,{boardId:board,workspaceId:ws});
 const signedGroups=normalizeSignedWorkspaceGroups(groups,{boardId:board,workspaceId:ws});
 const html=renderBoardAccessChoices({people,groups:signedGroups});
 assert.match(html,/data-bs09-tab="people"/);
 assert.match(html,/data-bs09-tab="groups"/);
 assert.match(html,/Pat Partner/);
 assert.match(html,/pat@example.test/);
 assert.match(html,/disabled data-bs09-assign/);
 assert.match(html,/Workspace membership alone does not grant board access/);
 const second=renderBoardAccessChoices({people,groups:signedGroups,tab:'groups'});
 assert.match(second,/Clients/);
 assert.doesNotMatch(second,/pat@example.test/);
 assert.match(renderBoardAccessChoices({}),/directory requires approved server access/);
 assert.doesNotMatch(renderBoardAccessChoices({}),/pat@example.test/);
});

test('mutations stay off even when submitted with valid signed mock user',async()=>{
 let touched=0;
 const auth={userId:admin,getVerifiedUser:async()=>({id:admin}),
  authorized:async()=>{touched++;return {};}};
 const api={context:async()=>{touched++;return {};}};
 const client=new BoardGroupAccessClient({auth,api});
 await assert.rejects(client.changeBoardAccess({
  workspaceId:ws,boardId:board,requestId,subjectId:user,subjectType:'member'
 }),/not activated/i);
 assert.equal(touched,0);
});

test('activated simulated adapter requires exact signed workspace and validated receipt',async()=>{
 let called=0;
 const auth={userId:admin,getVerifiedUser:async()=>({id:admin}),
  authorized:async(path,{body,retryUnauthorized})=>{
   called++;
   assert.equal(path,'/functions/v1/bs09-board-access');
   assert.equal(retryUnauthorized,false);
   return {state:'committed',requestId:body.request.requestId,
    workspaceId:body.request.workspaceId,boardId:body.request.boardId};
  }};
 const api={context:async()=>({user_id:admin,workspace_id:ws,profile:{status:'active'}})};
 const client=new BoardGroupAccessClient({auth,api,enabled:true});
 const receipt=await client.changeBoardAccess({
  workspaceId:ws,boardId:board,requestId,subjectId:user,subjectType:'member'
 });
 assert.equal(receipt.state,'committed');
 assert.equal(called,1);
 await assert.rejects(
  new BoardGroupAccessClient({
   auth,api:{context:async()=>({user_id:admin,workspace_id:board,profile:{status:'active'}})},
   enabled:true
  }).changeBoardAccess({
   workspaceId:ws,boardId:board,requestId,subjectId:user,subjectType:'member'
  }),/identity changed/i);
 assert.equal(called,1);
});

test('SQL candidate is private, off, not wired into existing board ACL',()=>{
 const sql=readFileSync('sql/bs09-workspace-board-access-groups-candidate.sql','utf8');
 assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
 for(const table of [
  'bs09_groups','bs09_group_members','bs09_group_board_grants','bs09_access_events'
 ])assert.match(sql,new RegExp('ALTER TABLE private\\.'+table+' ENABLE ROW LEVEL SECURITY'));
 assert.match(sql,/p_user_id IS DISTINCT FROM auth\.uid\(\)/);
 assert.match(sql,/private\.ws01_signed_actor_session\(\)/);
 assert.match(sql,/public\.current_workspace_id\(p_user_id\)/);
 assert.match(sql,/wm\.active IS TRUE/);
 assert.match(sql,/gb\.revoked_at IS NULL/);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.bs09_group_allows_board/);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.work_board_access/);
 assert.doesNotMatch(sql,/\bINSERT INTO public\.workspace_members/i);
 assert.doesNotMatch(sql,/\bGRANT\s+EXECUTE\s+ON.*authenticated/i);
});
