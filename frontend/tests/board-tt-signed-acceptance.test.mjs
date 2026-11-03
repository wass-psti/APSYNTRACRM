import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ApiError} from '../session.js';
import {runBoardTtSignedReadOnly} from '../board-tt-signed-acceptance.js';

const user='20000000-0000-4000-8000-000000000001';
const ws='10000000-0000-4000-8000-000000000001';
const regular='30000000-0000-4000-8000-000000000001';
const tracker='30000000-0000-4000-8000-000000000003';
const regularBoard={id:regular,name:'New Board',description:'',member_role:'owner'};
const moduleBoard={id:tracker,name:'TimeTracker Attendance',
 description:'[APSYNTRA:MODULE:timetracker:v1] Verified domain board',member_role:'owner'};
const identity={id:user};
const ctx={user_id:user,workspace_id:ws,profile:{status:'active'}};
function fixture({role='Supervisor',isBootstrap=false,allowManage=true,
 gpsDenied=false,gpsUnexpected=false,boards=[regularBoard,moduleBoard],
 mismatched=false}={}){
 const calls=[];
 const auth={getVerifiedUser:async()=>{
  calls.push('getVerifiedUser');
  return mismatched?{id:regular}:identity;
 }};
 const api={
  context:async()=>{calls.push('context');return ctx;},
  boards:async kind=>{calls.push(['boards',kind]);return boards;},
  allowed:async(id,level)=>{calls.push(['allowed',id,level]);return allowManage;},
  rpc:async(name,args)=>{
   calls.push(['rpc',name,args]);
   if(name!=='timetracker_board_private_snapshot')
    throw new Error('Unexpected mutation RPC');
   if(gpsDenied)throw new ApiError('Restricted board GPS denied',403,'42501');
   if(gpsUnexpected)return {scope:'AUTHORIZED_ATTENDANCE_BOARD'};
   return {scope:'AUTHORIZED_ATTENDANCE_BOARD',actorId:user,workspaceId:ws,
    boardId:tracker,rows:[],hasMore:false};
  }
 };
 const timeTracker={snapshot:async boardId=>{
  calls.push(['snapshot',boardId]);
  return {status:'VERIFIED_READ',access:{moduleRole:role}};
 }};
 return {auth,api,timeTracker,isBootstrap,calls};
}
test('real-session runner verifies active identity, board-manager capability and privileged GPS without writes',async()=>{
 const f=fixture();
 const r=await runBoardTtSignedReadOnly(f);
 assert.equal(r.status,'PASS');
 assert.equal(r.checks.length,6);
 assert.ok(r.checks.every(c=>c.status==='PASS'));
 assert.ok(f.calls.some(c=>Array.isArray(c)&&c[0]==='rpc'&&
  c[1]==='timetracker_board_private_snapshot'));
 assert.equal(f.calls.some(c=>Array.isArray(c)&&
  (c[1]==='wm_board_card_mutate'||c[1]==='timetracker_attendance_commit_v2')),false);
 assert.equal(JSON.stringify(r).includes('latitude'),false);
 assert.equal(JSON.stringify(r).includes('longitude'),false);
});
test('ordinary employee receives expected real signed GPS denial',async()=>{
 const f=fixture({role:'Employee',gpsDenied:true,allowManage:false});
 const r=await runBoardTtSignedReadOnly(f);
 assert.equal(r.status,'PASS');
 assert.equal(r.checks.find(c=>c.id==='private-gps')?.status,'PASS');
});
test('ordinary signed employee receiving restricted GPS data is a FAILURE',async()=>{
 const f=fixture({role:'Employee',gpsUnexpected:true});
 const r=await runBoardTtSignedReadOnly(f);
 assert.equal(r.status,'FAIL');
 assert.equal(r.checks.find(c=>c.id==='private-gps')?.status,'FAIL');
});
test('signed identity mismatch fails closed before any private RPC',async()=>{
 const f=fixture({mismatched:true});
 const r=await runBoardTtSignedReadOnly(f);
 assert.equal(r.status,'FAIL');
 assert.equal(r.checks.length,1);
 assert.equal(f.calls.some(c=>Array.isArray(c)&&c[0]==='rpc'),false);
});
test('missing TimeTracker board is correctly blocked rather than invented as PASS',async()=>{
 const f=fixture({boards:[regularBoard]});
 const r=await runBoardTtSignedReadOnly(f);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.checks.find(c=>c.id==='private-gps')?.status,'BLOCKED');
});
test('non-authorization network error is BLOCKED, not a successful GPS denial',async()=>{
 const f=fixture({role:'Employee'});
 f.api.rpc=async()=>{throw new ApiError('Network unavailable',0)};
 const r=await runBoardTtSignedReadOnly(f);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.checks.find(c=>c.id==='private-gps')?.status,'BLOCKED');
});
test('Settings exposes nonsecret current-session integration acceptance with no write invocations',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const runner=readFileSync('frontend/board-tt-signed-acceptance.js','utf8');
 assert.match(app,/data-action="board-tt-signed-verify"/);
 assert.match(app,/case 'board-tt-signed-verify'/);
 assert.match(app,/await runBoardTtSignedReadOnly\(\{/);
 assert.match(app,/e\(c\.detail\)/);
 assert.match(app,/Read-only session checks do not certify Clock-In\/Out persistence/);
 assert.match(runner,/api\.rpc\('timetracker_board_private_snapshot'/);
 assert.doesNotMatch(runner,/wm_board_card_mutate|timetracker_attendance_commit_v2/);
 assert.doesNotMatch(runner,/access_token|refresh_token|navigator\.clipboard/);
});
