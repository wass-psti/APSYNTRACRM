import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WorkspaceInvitationManagementClient,WS11_INVITATION_MANAGEMENT_ENABLED,
 normalizeInvitationListing,normalizeInvitationRevocation}
 from '../workspace-invitation-management.js';
import {renderBoardAccessChoices,BOARD_GROUP_ACCESS_ENABLED,
 normalizeSignedBoardCandidates,BoardGroupAccessClient}
 from '../workspace-board-groups.js';
const actor='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
const invite='44444444-4444-4444-8444-444444444444';
const request='55555555-5555-4555-8555-555555555555';
const date='2026-11-11T03:00:00Z';
const record={id:invite,email:'person@example.com',state:'pending',
 role:'member',issuedAt:date,expiresAt:date};
const listing={schemaVersion:1,workspaceId:ws,authorized:true,invitations:[record]};
const result={schemaVersion:1,workspaceId:ws,invitationId:invite,state:'revoked'};
function mock({enabled=true,owner=actor,workspaceId=ws,reply=listing}={}){
 const calls=[];
 const auth={userId:actor,getVerifiedUser:async()=>({id:owner}),
  authorized:async(path,args)=>{calls.push({path,args});return reply;}};
 const api={context:async()=>({user_id:actor,workspace_id:workspaceId,
  profile:{status:'active'}})};
 return {calls,client:new WorkspaceInvitationManagementClient({auth,api,enabled})};
}
test('management defaults off and never leaks invitation listing or makes a request',async()=>{
 assert.equal(WS11_INVITATION_MANAGEMENT_ENABLED,false);
 const {calls,client}=mock({enabled:false});
 await assert.rejects(client.list(ws),{status:503});
 await assert.rejects(client.revoke({workspaceId:ws,invitationId:invite,requestId:request}),
  {status:503});
 assert.equal(calls.length,0);
});
test('only verified workspace-scoped server listings are shown',()=>{
 const good=normalizeInvitationListing(listing,{workspaceId:ws});
 assert.equal(good.status,'SIGNED_MANAGER_LIST');
 assert.equal(Object.isFrozen(good.invitations),true);
 for(const changed of [
  {...listing,authorized:false},{...listing,workspaceId:other},
  {...listing,invitations:[{...record,email:'<img>@example.com'}]},
  {...listing,invitations:[record,record]},
  {...listing,invitations:[{...record,state:'sent'}]},
  {...listing,invitations:[{...record,role:'admin'}]},
  {...listing,invitations:[{...record,issuedAt:'not a date'}]}
 ])assert.throws(()=>normalizeInvitationListing(changed,{workspaceId:ws}));
 assert.throws(()=>normalizeInvitationListing(listing,{workspaceId:other}));
 assert.deepEqual(normalizeInvitationRevocation(result,{workspaceId:ws,invitationId:invite}),
  {state:'revoked',workspaceId:ws,invitationId:invite});
 assert.throws(()=>normalizeInvitationRevocation(result,{workspaceId:other,invitationId:invite}));
});
test('signed manager listing and revocation require trustworthy server receipts',async()=>{
 let ctx=mock();
 assert.equal((await ctx.client.list(ws)).invitations[0].state,'pending');
 assert.deepEqual(ctx.calls.map(x=>[x.path,x.args.body.operation]),
  [['/functions/v1/ws02d-manage','list']]);
 ctx=mock({reply:result});
 assert.deepEqual(await ctx.client.revoke({workspaceId:ws,invitationId:invite,requestId:request}),
  {state:'revoked',workspaceId:ws,invitationId:invite});
 assert.deepEqual(ctx.calls[0].args.body,{operation:'revoke',
  workspaceId:ws,invitationId:invite,requestId:request});
 assert.equal(ctx.calls[0].args.retryUnauthorized,false);
 for(const setup of [{owner:other},{workspaceId:other}]){
  const rejected=mock(setup);
  await assert.rejects(rejected.client.list(ws),{status:403});
  assert.equal(rejected.calls.length,0);
 }
});
test('board invite picker exposes viewer grants only behind verified signed gate',()=>{
 assert.equal(BOARD_GROUP_ACCESS_ENABLED,false);
 const people=normalizeSignedBoardCandidates({status:'VERIFIED_READ',boardId:other,
  workspaceId:ws,manage:true,users:[
   {id:actor,name:'Alice',email:'alice@example.com',boardRole:null},
   {id:invite,name:'Bob',email:'bob@example.com',boardRole:'viewer'}
  ]},{boardId:other,workspaceId:ws});
 assert.equal(people.status,'VERIFIED_SIGNED_CANDIDATES');
 const off=renderBoardAccessChoices({people});
 assert.match(off,/disabled data-bs09-assign/);
 const on=renderBoardAccessChoices({people,enabled:true});
 assert.match(on,/data-bs09-assign="11111111-1111-4111-8111-111111111111"/);
 assert.match(on,/disabled data-bs09-assign="44444444-4444-4444-8444-444444444444"/);
 const calls=[];
 const client=new BoardGroupAccessClient({enabled:true,
  auth:{userId:actor,getVerifiedUser:async()=>({id:actor}),
   authorized:async(path,opts)=>{
    calls.push({path,opts});return {state:'committed',requestId:request,
     workspaceId:ws,boardId:other};
   }},
  api:{context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}})}
 });
 assert.equal((await client.changeBoardAccess({workspaceId:ws,boardId:other,
  subjectType:'member',subjectId:invite,requestId:request,role:'viewer'})).state,'committed');
 assert.equal(calls[0].path,'/functions/v1/bs09-board-access');
 await assert.rejects(client.changeBoardAccess({workspaceId:ws,boardId:other,
  subjectType:'member',subjectId:invite,requestId:request,role:'owner'}),{status:400});
});
test('trusted UI and migrations remain OFF until separate production activation',()=>{
 const ui=readFileSync('frontend/workspace-ui.js','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 const share=readFileSync('frontend/board-share.js','utf8');
 const sql=readFileSync('sql/ws11-invitation-management-CANDIDATE-NOT-APPLIED.sql','utf8');
 const board=readFileSync('sql/bs11-direct-board-access-CANDIDATE-NOT-APPLIED.sql','utf8');
 assert.match(ui,/data-ws11-refresh/);
 assert.match(ui,/data-ws11-revoke/);
 assert.match(ui,/manageList\.replaceChildren/);
 assert.match(ui,/options\.listInvitations/);
 assert.match(app,/WS11_INVITATION_MANAGEMENT_ENABLED/);
 assert.match(app,/BOARD_GROUP_ACCESS_ENABLED&&manage/);
 assert.match(share,/options\.onAssignBoard/);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.ws11_list_invitations/);
 assert.match(sql,/private\.ws02d_sender_authorized/);
 assert.match(board,/REVOKE ALL ON FUNCTION private\.bs11_change_board_access/);
 assert.match(board,/public\.work_board_access\(p_board,'manage'\)/);
 assert.match(board,/workspace_id=p_workspace/);
 assert.doesNotMatch(sql+board,/GRANT EXECUTE ON FUNCTION/);
});
