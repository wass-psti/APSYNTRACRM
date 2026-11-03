import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ApiError} from '../session.js';
import {
 TT_BOARD_GPS_PROJECTION_ENABLED,validateTimeTrackerBoardGps,
 loadTimeTrackerBoardGps,renderTimeTrackerBoardGps
} from '../time-tracker-board-projection.js';

const user='20000000-0000-4000-8000-000000000001';
const ws='10000000-0000-4000-8000-000000000001';
const board='30000000-0000-4000-8000-000000000001';
const rowId='80000000-0000-4000-8000-000000000001';
const itemId='80000000-0000-4000-8000-000000000002';
const fix=(latitude,longitude)=>({
 latitude,longitude,accuracyM:8.5,status:'captured',
 capturedAt:'2026-11-03T03:22:00Z'
});
const row={recordId:rowId,itemId,employeeName:'Employee <b>Sample</b>',
 clockInAt:'2026-11-03T03:21:00Z',clockOutAt:'2026-11-03T05:21:00Z',
 clockInGps:fix(10.123456,123.987654),clockOutGps:fix(10.765432,123.654321),
 creditedMs:7200000,status:'Completed'};
const response={scope:'AUTHORIZED_ATTENDANCE_BOARD',actorId:user,workspaceId:ws,
 boardId:board,rows:[row],hasMore:false};
const context={user_id:user,workspace_id:ws,profile:{status:'active'}};
const apiFactory=({ctx=context,answer=response}={})=>{
 const calls=[];
 return {calls,api:{
  context:async()=>{calls.push('context');return ctx;},
  rpc:async(name,args)=>{calls.push([name,args]);return answer;}
 }};
};
const auth=()=>({getVerifiedUser:async()=>({id:user})});

test('default-disabled GPS projection performs no signed backend calls',async()=>{
 assert.equal(TT_BOARD_GPS_PROJECTION_ENABLED,false);
 const fixture=apiFactory(),result=await loadTimeTrackerBoardGps({
  auth:auth(),api:fixture.api,boardId:board,workspaceId:ws
 });
 assert.equal(result.status,'DISABLED');
 assert.deepEqual(fixture.calls,[]);
});
test('enabled restricted GPS read checks actor/workspace and post-request session',async()=>{
 const fixture=apiFactory();
 const result=await loadTimeTrackerBoardGps({
  auth:auth(),api:fixture.api,boardId:board,workspaceId:ws,enabled:true
 });
 assert.equal(result.status,'VERIFIED_READ');
 assert.equal(result.rows[0].clockInGps.latitude,10.123456);
 assert.equal(result.rows[0].clockOutGps.latitude,10.765432);
 assert.deepEqual(fixture.calls.filter(x=>Array.isArray(x)),[
  ['timetracker_board_private_snapshot',{p_board_id:board,p_limit:50}]
 ]);
 assert.equal(fixture.calls.filter(x=>x==='context').length,2);
});
test('rejects foreign board, actor, workspace, bad GPS and duplicate source lineage',()=>{
 for(const mutated of [
  {...response,actorId:itemId},{...response,boardId:itemId},
  {...response,workspaceId:itemId},{...response,rows:[row,row]},
  {...response,rows:[{...row,clockInGps:fix(91,123)}]},
  {...response,rows:[{...row,clockOutGps:fix(10,181)}]},
  {...response,rows:[{...row,creditedMs:-1}]},
  {...response,rows:[{...row,clockOutAt:null,clockOutGps:row.clockOutGps}]},
  {...response,rows:[{...row,clockOutGps:null}]},
  {...response,hasMore:'false'}
 ])assert.throws(()=>validateTimeTrackerBoardGps(mutated,{
  userId:user,workspaceId:ws,boardId:board
 }),ApiError);
});
test('denied or changed authenticated session fails closed without rendering GPS',async()=>{
 const denied=apiFactory({ctx:{...context,workspace_id:itemId}});
 await assert.rejects(()=>loadTimeTrackerBoardGps({
  auth:auth(),api:denied.api,boardId:board,workspaceId:ws,enabled:true
 }),ApiError);
 assert.equal(denied.calls.some(Array.isArray),false);
 const noAccess=apiFactory();
 noAccess.api.rpc=async()=>{throw new ApiError('GPS access denied',403)};
 await assert.rejects(()=>loadTimeTrackerBoardGps({
  auth:auth(),api:noAccess.api,boardId:board,workspaceId:ws,enabled:true
 }),/GPS access denied/);
 const session={calls:0,getVerifiedUser:async function(){
  return {id:++this.calls===1?user:itemId};
 }};
 const existing=apiFactory();
 await assert.rejects(()=>loadTimeTrackerBoardGps({
  auth:session,api:existing.api,boardId:board,workspaceId:ws,enabled:true
 }),/Signed session changed/);
});
test('authorized table shows independent GPS fixes without unsafe HTML',()=>{
 const verified=validateTimeTrackerBoardGps(response,{userId:user,workspaceId:ws,boardId:board});
 const html=renderTimeTrackerBoardGps(verified);
 for(const h of ['Clock-In Time','Clock-In GPS','Clock-Out Time','Clock-Out GPS',
  'Attendance Status','Working Duration'])assert.match(html,new RegExp(h));
 assert.match(html,/10\.123456, 123\.987654/);
 assert.match(html,/10\.765432, 123\.654321/);
 assert.match(html,/2\.00 h/);
 assert.match(html,/Employee &lt;b&gt;Sample&lt;\/b&gt;/);
 assert.doesNotMatch(html,/<b>Sample<\/b>/);
 assert.match(html,/role="region" tabindex="0"/);
});
test('active attendance preserves empty clock-out GPS and duration',()=>{
 const inOnly={...row,clockOutAt:null,clockOutGps:null,
  creditedMs:null,status:'Active'};
 const data=validateTimeTrackerBoardGps({...response,rows:[inOnly]},{
  userId:user,workspaceId:ws,boardId:board
 });
 const html=renderTimeTrackerBoardGps(data);
 assert.equal(data.rows[0].clockOutGps,null);
 assert.doesNotMatch(html,/10\.765432/);
 assert.match(html,/Active/);
});
test('frontend wiring keeps private GPS separate from normal board item projection',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const css=readFileSync('frontend/styles.css','utf8');
 const manifest=readFileSync('frontend/board-manifest.js','utf8');
 assert.match(app,/TT_BOARD_GPS_PROJECTION_ENABLED/);
 assert.match(app,/async function openTimeTrackerBoardProjectedGps\(\)/);
 assert.match(app,/case 'tt-board-gps'/);
 assert.match(app,/moduleKey==='timetracker'&&TT_BOARD_GPS_PROJECTION_ENABLED/);
 assert.match(app,/renderTimeTrackerBoardGps\(details\)/);
 assert.match(css,/\.tt-projection-table-wrap\{overflow-x:auto/);
 assert.match(manifest,/"GPS coordinates and location"/);
 assert.doesNotMatch(app,/work_board_item_values.*clockInGps|boardGrid\(.*clockOutGps/);
});

test('activated private GPS control is available only to signed bootstrap/Supervisor board viewers',()=>{
 assert.equal(TT_BOARD_GPS_PROJECTION_ENABLED,true);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/state\.ttBoardGpsEligible=false;state\.ttRunId\+\+/);
 assert.match(app,/timeTracker\.snapshot\(boardId\)/);
 assert.match(app,/signed\?\.access\?\.moduleRole==='Supervisor'/);
 assert.match(app,/state\.roleVerified===true\|\|state\.ttBoardGpsEligible===true/);
 assert.match(app,/!activeBoardLayout\(\)\|\|state\.tab!=='items'/);
 assert.match(app,/await loadTimeTrackerBoardGps\(\{/);
 assert.doesNotMatch(app,/work_board_item_values.*clockInGps/);
});
