import test from 'node:test';
import assert from 'node:assert/strict';
import {DomainApi} from '../data.js';
import {
 NATIVE_APPLICATIONS,normalizeNativeApplicationBoardContext,
 nativeApplicationModuleForBoardId,nativeApplicationModuleForBoardRoute,
 nativeApplicationModuleForRoute,workspaceRouteAllowsBoardCatalogFallback
} from '../native-application-access.js';

const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const workspaceId='00000000-0000-4000-8000-000000000001';
const make=(moduleId,overrides={})=>{
 const expected=NATIVE_APPLICATIONS[moduleId];
 return {
  contract:'native-app-board-v1',moduleId,userId,workspaceId,role:'User',
  groups:[],columns:[],
  board:{
   id:expected.boardId,workspace_id:workspaceId,name:expected.name,
   description:expected.marker+' canonical application board',
   status:'active',archived_at:null,trashed_at:null,created_at:'2026-01-01T00:00:00Z',
   updated_at:'2026-11-19T00:00:00Z'
  },
  ...overrides
 };
};

test('native application registry maps the four existing canonical boards only',()=>{
 assert.deepEqual(Object.keys(NATIVE_APPLICATIONS).sort(),
  ['fueltrack-plus','fund-released-tracker','time-tracker','tradelink']);
 assert.equal(NATIVE_APPLICATIONS['time-tracker'].name,'TimeTracker Attendance');
 assert.equal(NATIVE_APPLICATIONS['fund-released-tracker'].name,'Fund Released Tracker');
 assert.equal(NATIVE_APPLICATIONS['fueltrack-plus'].name,'FuelTrack+ v3');
 assert.equal(NATIVE_APPLICATIONS.tradelink.name,'TradeLink');
});

test('canonical context normalizes a minimal native shell without granting generic board membership',()=>{
 for(const moduleId of Object.keys(NATIVE_APPLICATIONS)){
  const context=normalizeNativeApplicationBoardContext(make(moduleId),{
   moduleId,userId,workspaceId
  });
  assert.equal(context.moduleId,moduleId);
  assert.equal(context.userId,userId);
  assert.equal(context.workspaceId,workspaceId);
  assert.equal(context.role,'User');
  assert.equal(context.board.member_role,null);
  assert.equal(context.detail.board.id,NATIVE_APPLICATIONS[moduleId].boardId);
  for(const key of ['groups','members','columns','items','values'])
   assert.deepEqual(context.detail[key],[]);
 }
});

test('native context rejects stale users, workspaces, module IDs and noncanonical boards',()=>{
 const valid=make('time-tracker');
 const invalid=[
  {...valid,contract:'other'},
  {...valid,userId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
  {...valid,workspaceId:'00000000-0000-4000-8000-000000000002'},
  {...valid,workspaceId:'00000000-0000-4000-8000-000000000002',
   board:{...valid.board,workspace_id:'00000000-0000-4000-8000-000000000002'}},
  {...valid,moduleId:'fueltrack-plus'},
  {...valid,board:{...valid.board,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}},
  {...valid,board:{...valid.board,workspace_id:'00000000-0000-4000-8000-000000000002'}},
  {...valid,board:{...valid.board,name:'Duplicate TimeTracker Attendance'}},
  {...valid,board:{...valid.board,status:'archived'}},
  {...valid,board:{...valid.board,archived_at:'2026-11-01T00:00:00Z'}},
  {...valid,board:{...valid.board,trashed_at:'2026-11-01T00:00:00Z'}},
  {...valid,board:{...valid.board,description:'unmarked board'}},
  {...valid,role:''}
 ];
 for(const payload of invalid)
  assert.throws(()=>normalizeNativeApplicationBoardContext(payload,{
   moduleId:'time-tracker',userId,workspaceId
  }));
});

test('TradeLink receives only its column/group schema and never a generic item collection',()=>{
 const column={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',column_key:'custom:person',
  name:'Person',data_type:'people',system_key:null,position:1,visible:true,
  required:false,config:{}};
 const group={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  title:'Active',position:0,accent_color:'#334155'};
 const context=normalizeNativeApplicationBoardContext(make('tradelink',{
  columns:[column],groups:[group]
 }),{moduleId:'tradelink',userId,workspaceId});
 assert.deepEqual(context.detail.columns,[column]);
 assert.deepEqual(context.detail.groups,[group]);
 assert.deepEqual(context.detail.items,[]);
 assert.deepEqual(context.detail.values,[]);
});

test('standalone native routes are recognized without requiring a generic board catalog',()=>{
 const cases=[
  ['#/time-tracker','time-tracker'],
  ['#/fund-tracker','fund-released-tracker'],
  ['#/fueltrack/dashboard','fueltrack-plus'],
  ['#/tradelink/documents','tradelink'],
  ['#/tradelink/activity?from=sidebar','tradelink']
 ];
 for(const [route,moduleId] of cases)
  assert.equal(nativeApplicationModuleForRoute(route),moduleId);
 for(const route of ['#/overview','#/boards','#/boards/46bf4ee7-368a-4c35-842c-8593ea1f6ac3/attendance',
  '#/settings','#/fm1','#/time-tracker-extra','']){
  assert.equal(nativeApplicationModuleForRoute(route),null);
 }
});

test('board catalog fallback includes the direct FuelTrans frontend route without treating it as a DB native resolver',()=>{
 for(const route of ['', '#/','#/overview','#/time-tracker','#/fund-tracker',
  '#/fueltrack/dashboard','#/tradelink/documents','#/fueltrans']){
  assert.equal(workspaceRouteAllowsBoardCatalogFallback(route),true);
 }
 for(const route of ['#/boards','#/boards/46bf4ee7-368a-4c35-842c-8593ea1f6ac3/attendance',
  '#/settings','#/fm1','#/security','#/foundation']){
  assert.equal(workspaceRouteAllowsBoardCatalogFallback(route),false);
 }
});

test('route-to-module mapping is exact and cannot redirect arbitrary boards',()=>{
 assert.equal(nativeApplicationModuleForBoardRoute(
  NATIVE_APPLICATIONS['time-tracker'].boardId,'attendance'),'time-tracker');
 assert.equal(nativeApplicationModuleForBoardRoute(
  NATIVE_APPLICATIONS['fund-released-tracker'].boardId,'finance'),'fund-released-tracker');
 assert.equal(nativeApplicationModuleForBoardRoute(
  NATIVE_APPLICATIONS['fueltrack-plus'].boardId,'fueltrack'),'fueltrack-plus');
 assert.equal(nativeApplicationModuleForBoardRoute(
  NATIVE_APPLICATIONS.tradelink.boardId,'tradelink'),'tradelink');
 assert.equal(nativeApplicationModuleForBoardRoute(
  NATIVE_APPLICATIONS.tradelink.boardId,'items'),null);
 assert.equal(nativeApplicationModuleForBoardRoute(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','tradelink'),null);
});

test('DomainApi resolves a native context through fresh signed context and native RPC reads',async()=>{
 const calls=[];
 const payload=make('time-tracker');
 const auth={
  userId,accessToken:'signed-test-token',
  authorized:async(path,options)=>{
   const rpc=path.split('/').at(-1);
   calls.push({rpc,requestKind:options.requestKind});
   if(rpc==='wm_auth_access_context')
    return {user_id:userId,workspace_id:workspaceId,profile:{status:'active'}};
   if(rpc==='native_application_board_context')return payload;
   throw new Error('Unexpected RPC '+rpc);
  }
 };
 const api=new DomainApi(auth);
 const context=await api.nativeApplicationBoardContext('time-tracker');
 assert.equal(context.userId,userId);
 assert.equal(context.workspaceId,workspaceId);
 assert.equal(context.board.id,NATIVE_APPLICATIONS['time-tracker'].boardId);
 assert.deepEqual(calls.map(call=>call.rpc).sort(),
  ['native_application_board_context','wm_auth_access_context']);
 assert.ok(calls.every(call=>call.requestKind==='read'));
});


test('canonical native board identity is stable across transient route-tab transitions',()=>{
 for(const [moduleId,application] of Object.entries(NATIVE_APPLICATIONS))
  assert.equal(nativeApplicationModuleForBoardId(application.boardId),moduleId);
 assert.equal(nativeApplicationModuleForBoardId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),null);
});


test('native context retries one invalidated in-flight read for the same signed session',async()=>{
 const pending=[];
 const auth={userId,accessToken:'same-token',authorized:async(path)=>{
  const rpc=path.split('/').at(-1);
  if(rpc==='wm_auth_access_context')return {user_id:userId,workspace_id:workspaceId,profile:{status:'active'}};
  if(rpc==='native_application_board_context')return new Promise(resolve=>pending.push(resolve));
  throw new Error('Unexpected RPC '+rpc);
 }};
 const api=new DomainApi(auth);
 const result=api.nativeApplicationBoardContext('tradelink');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(pending.length,1);
 api.invalidateBoardCache();
 pending.shift()(make('tradelink'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(pending.length,1);
 pending.shift()(make('tradelink'));
 assert.equal((await result).board.id,NATIVE_APPLICATIONS.tradelink.boardId);
});

test('native context never retries an in-flight response after token rotation',async()=>{
 let complete;
 let attempts=0;
 const auth={userId,accessToken:'original-token',authorized:async(path)=>{
  if(path.endsWith('wm_auth_access_context'))return {user_id:userId,workspace_id:workspaceId,profile:{status:'active'}};
  attempts++;
  return new Promise(resolve=>{complete=resolve});
 }};
 const api=new DomainApi(auth);
 const result=api.nativeApplicationBoardContext('tradelink');
 await new Promise(resolve=>setImmediate(resolve));
 auth.accessToken='different-token';
 api.invalidateBoardCache();
 complete(make('tradelink'));
 await assert.rejects(result,/Signed native application context changed/);
 assert.equal(attempts,1);
});

test('native context bounds invalidation retries at one attempt',async()=>{
 const pending=[];
 const auth={userId,accessToken:'same-token',authorized:async(path)=>{
  if(path.endsWith('wm_auth_access_context'))return {user_id:userId,workspace_id:workspaceId,profile:{status:'active'}};
  return new Promise(resolve=>pending.push(resolve));
 }};
 const api=new DomainApi(auth);
 const result=api.nativeApplicationBoardContext('tradelink');
 await new Promise(resolve=>setImmediate(resolve));
 api.invalidateBoardCache();pending.shift()(make('tradelink'));
 await new Promise(resolve=>setImmediate(resolve));
 api.invalidateBoardCache();pending.shift()(make('tradelink'));
 await assert.rejects(result,/Signed native application context changed/);
});
