import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 normalizeAdminBoardCandidates,adminBoardChangeTarget,BOARD_GROUP_ACCESS_ENABLED
} from '../workspace-board-groups.js';
import {BOARD_COL01_DIRECTORY_ENABLED} from '../board/columns/col01-readers.js';

const ws='11111111-1111-4111-8111-111111111111';
const board='22222222-2222-4222-8222-222222222222';
const actor='33333333-3333-4333-8333-333333333333';
const viewer='44444444-4444-4444-8444-444444444444';
const editor='55555555-5555-4555-8555-555555555555';
const unassigned='66666666-6666-4666-8666-666666666666';
const snapshot=()=>({
 workspaceId:ws,adminVerified:true,boards:[{id:board,name:'QA'}],
 users:[
  {id:actor,name:'Admin',email:'admin@example.com',protected:true,activeWorkspaceCount:1},
  {id:viewer,name:'Viewer',email:'viewer@example.com',protected:false,activeWorkspaceCount:1},
  {id:editor,name:'Editor',email:'editor@example.com',protected:false,activeWorkspaceCount:1},
  {id:unassigned,name:'Jerome Nunez',email:'jerome@example.com',protected:false,activeWorkspaceCount:1}
 ],
 boardAssignments:[
  {boardId:board,userId:actor,role:'owner'},
  {boardId:board,userId:viewer,role:'viewer',updatedAt:'2026-11-20T00:00:00Z'},
  {boardId:board,userId:editor,role:'editor'}
 ]
});
const norm=raw=>normalizeAdminBoardCandidates(raw,{workspaceId:ws,boardId:board,actorId:actor});
test('exact-board signed CRM administrator snapshot provides existing workspace members',()=>{
 const result=norm(snapshot());
 assert.equal(result.status,'VERIFIED_SIGNED_CANDIDATES');
 assert.equal(result.source,'SIGNED_ADMIN_BOARD_DIRECTORY');
 assert.deepEqual(result.members.map(p=>p.boardRole),['owner','viewer','editor',null]);
 assert.equal(result.members.find(p=>p.id===unassigned).name,'Jerome Nunez');
 assert.equal(result.members.find(p=>p.id===actor).protected,true);
});
test('board role preflight grants viewer only, allows editor/viewer removal, never owner or self',()=>{
 const data=norm(snapshot());
 assert.deepEqual(adminBoardChangeTarget(data,{memberId:unassigned,action:'grant',actorId:actor}),
  {role:'viewer',expectedUpdatedAt:null});
 assert.deepEqual(adminBoardChangeTarget(data,{memberId:editor,action:'revoke',actorId:actor}),
  {role:'editor',expectedUpdatedAt:null});
 assert.deepEqual(adminBoardChangeTarget(data,{memberId:viewer,action:'revoke',actorId:actor}),
  {role:'viewer',expectedUpdatedAt:'2026-11-20T00:00:00Z'});
 for(const target of [
  {memberId:actor,action:'revoke',actorId:actor},
  {memberId:actor,action:'grant',actorId:actor},
  {memberId:viewer,action:'grant',actorId:actor},
  {memberId:editor,action:'grant',actorId:actor},
  {memberId:unassigned,action:'revoke',actorId:actor},
  {memberId:'00000000-0000-4000-8000-000000000000',action:'grant',actorId:actor},
  {memberId:unassigned,action:'promote',actorId:actor}
 ])assert.equal(adminBoardChangeTarget(data,target),null);
});
test('forged, different-workspace, missing board, duplicate and malformed snapshots fail closed',()=>{
 const base=snapshot();
 for(const input of [
  {...base,adminVerified:false},
  {...base,workspaceId:'99999999-9999-4999-8999-999999999999'},
  {...base,boards:[]},
  {...base,users:[...base.users,base.users[0]]},
  {...base,users:[{...base.users[0],id:'invalid'}]},
  {...base,users:[{...base.users[0],activeWorkspaceCount:0}]},
  {...base,boardAssignments:[...base.boardAssignments,{boardId:board,userId:viewer,role:'viewer'}]},
  {...base,boardAssignments:[{boardId:board,userId:viewer,role:'owner-with-extra-access'}]},
  {...base,boardAssignments:null}
 ]){
  const result=norm(input);
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(adminBoardChangeTarget(result,{memberId:unassigned,action:'grant',actorId:actor}),null);
 }
});
test('protected workspace accounts cannot be assigned board roles through invite picker',()=>{
 const data=snapshot();data.users[3].protected=true;
 assert.equal(adminBoardChangeTarget(norm(data),{
  memberId:unassigned,action:'grant',actorId:actor
 }),null);
});
test('invite flow uses server-admin snapshot and existing signed role mutator, never browser table writes',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const invite=readFileSync('frontend/board/collaboration/invite.js','utf8');
 assert.match(app,/apsyntra_role_user_management_snapshot/);
 assert.match(app,/normalizeAdminBoardCandidates/);
 assert.match(app,/adminBoardChangeTarget/);
 assert.match(app,/userRoleManager\.mutate\(/);
 assert.match(app,/scope:'board',resourceId:boardId/);
 assert.match(app,/loadBoardInvitableDirectory\(db,boardId,\{enabled:true/);
 assert.match(app,/await db\.allowed\(boardId,'manage'\)/);
 assert.doesNotMatch(invite,/>Agents</);
 assert.match(invite,/const searchEnabled=manage/);
 assert.doesNotMatch(invite,/\bfrom\('profiles'\)|wm_add_board_member\(/);
 assert.equal(BOARD_GROUP_ACCESS_ENABLED,false);
 assert.equal(BOARD_COL01_DIRECTORY_ENABLED,false);
});
