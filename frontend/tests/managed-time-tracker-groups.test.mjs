import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ApiError} from '../session.js';
import {
 MANAGED_TT_GROUP_DELETE_ENABLED,isManagedTimeTrackerBoard,
 TIMETRACKER_REDUNDANT_GROUP,isRedundantEmptyTimeTrackerGroup,
 canSafelyHideEmptyTimeTrackerGroup,readHiddenEmptyGroups,hideEmptyTimeTrackerGroup,
 restoreHiddenTimeTrackerGroups,deleteEmptyManagedTimeTrackerGroup
} from '../managed-time-tracker-groups.js';
const boardId='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const workspaceId='00000000-0000-4000-8000-000000000001';
const userId='11111111-1111-4111-8111-111111111111';
const mainId='8d43c020-e50f-4173-a98e-27b6de99bf2f';
const secondId='d0224e2b-20c0-41a3-90f0-046aad545191';
const board={id:boardId,workspace_id:workspaceId,name:'TimeTracker Attendance',
 description:'[APSYNTRA:MODULE:timetracker:v1] Attendance summaries',status:'active'};
const groups=[
 {id:mainId,board_id:boardId,title:'Main group',position:0,updated_at:'2026-10-30T05:40:09.88255Z'},
 {id:secondId,board_id:boardId,title:'Main Group II',position:1,updated_at:'2026-11-03T04:41:44.026405Z'}
];
const context={user_id:userId,workspace_id:workspaceId};
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,
 setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};

test('protected TimeTracker board and genuinely empty nonprimary group are eligible for reversible view hide',()=>{
 assert.equal(isManagedTimeTrackerBoard(board),true);
 assert.equal(canSafelyHideEmptyTimeTrackerGroup(board,groups[1],groups,[]),true);
 assert.equal(canSafelyHideEmptyTimeTrackerGroup(board,groups[0],groups,[]),false);
 assert.equal(canSafelyHideEmptyTimeTrackerGroup(board,groups[1],groups,
  [{group_id:secondId,archived_at:'2026-11-03T01:00:00Z'}]),false);
 assert.equal(canSafelyHideEmptyTimeTrackerGroup(board,groups[1],groups.slice(1),[]),false);
 assert.equal(isManagedTimeTrackerBoard({...board,name:'Contacts'}),false);
 assert.equal(isManagedTimeTrackerBoard({...board,description:'unexpected'}),false);
});

test('hide and restore are per-signed-user and per-workspace, persisted without mutating records',()=>{
 const store=storage();
 assert.equal(readHiddenEmptyGroups(context,boardId,store).size,0);
 hideEmptyTimeTrackerGroup(context,boardId,secondId,store);
 assert.equal(readHiddenEmptyGroups(context,boardId,store).has(secondId),true);
 assert.equal(readHiddenEmptyGroups({...context,user_id:'22222222-2222-4222-8222-222222222222'},boardId,store).size,0);
 restoreHiddenTimeTrackerGroups(context,boardId,store);
 assert.equal(readHiddenEmptyGroups(context,boardId,store).size,0);
});
test('malformed preferences are ignored; invalid signed scope cannot be persisted',()=>{
 const store=storage();
 assert.equal(readHiddenEmptyGroups({user_id:'bad',workspace_id:'bad'},boardId,store).size,0);
 assert.throws(()=>hideEmptyTimeTrackerGroup({user_id:'bad',workspace_id:workspaceId},boardId,secondId,store),
  e=>e instanceof ApiError&&e.status===403);
});
function fake({allowed=true,foreign=false,changed=false,items=[],audit=true}={}){
 const calls=[];
 const auth={userId,getVerifiedUser:async()=>({id:userId})};
 let removed=false;
 const api={
  context:async()=>({user_id:userId,workspace_id:foreign?
   '22222222-2222-4222-8222-222222222222':workspaceId,profile:{status:'active'}}),
  allowed:async()=>allowed,
  board:async()=>({board,groups:removed?groups.slice(0,1):
   changed?[groups[0],{...groups[1],updated_at:'2026-11-03T12:00:00Z'}]:groups,items}),
  rpc:async(name,args)=>{
   calls.push({name,args});removed=true;
   return {boardId,groupId:secondId,deleted:true,action:'delete_empty'};
  },
  boardEvents:async()=>audit?[{entity_id:secondId,actor_id:userId,event_type:'group.deleted_empty'}]:[]
 };
 return {auth,api,calls};
}
const options=f=>({...f,board,group:groups[1],allGroups:groups,items:[],
 confirmation:'DELETE Main Group II',enabled:true});
test('the new protected-group delete RPC is default-OFF before production security approval',async()=>{
 assert.equal(MANAGED_TT_GROUP_DELETE_ENABLED,false);
 const f=fake();
 await assert.rejects(()=>deleteEmptyManagedTimeTrackerGroup({...options(f),enabled:false}),/awaiting a separate production activation/);
 assert.equal(f.calls.length,0);
});
test('once explicitly activated, signed manager uses CAS and exact-name confirmation',async()=>{
 const f=fake();
 const result=await deleteEmptyManagedTimeTrackerGroup(options(f));
 assert.equal(result.status,'DELETED');assert.equal(result.audit,'VERIFIED');
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].name,'wm_managed_board_delete_empty_group');
 assert.deepEqual(f.calls[0].args,{
  p_board_id:boardId,p_group_id:secondId,
  p_expected_updated_at:groups[1].updated_at,
  p_confirmation_title:groups[1].title
 });
});
test('foreign, viewer, stale revision, archived records and bad confirmation fail before server deletion',async()=>{
 for(const scenario of [
  {foreign:true},{allowed:false},{changed:true},
  {items:[{group_id:secondId,archived_at:'2026-11-02T00:00:00Z'}]}
 ]){
  const f=fake(scenario);
  await assert.rejects(()=>deleteEmptyManagedTimeTrackerGroup(options(f)),ApiError);
  assert.equal(f.calls.length,0);
 }
 const f=fake();
 await assert.rejects(()=>deleteEmptyManagedTimeTrackerGroup({...options(f),confirmation:'DELETE OTHER'}),/Exact group-name/);
 assert.equal(f.calls.length,0);
});
test('failure to read audit does not fabricate a verified audit',async()=>{
 const f=fake({audit:false});
 const result=await deleteEmptyManagedTimeTrackerGroup(options(f));
 assert.equal(result.status,'DELETED');assert.equal(result.audit,'UNVERIFIED');
});
test('staged SQL preserves signed manager, protected-board scope, empty-only, CAS and no legacy grant',()=>{
 const src=readFileSync('sql/cp-tt-group01-managed-delete-staged.sql','utf8');
 const rollback=readFileSync('sql/cp-tt-group01-fail-closed-rollback.sql','utf8');
 for(const word of [
  'private.wm_board_config_session_active()',
  'public.is_platform_admin(actor)',
  "public.work_board_access(p_board_id,'manage')",
  "b.name<>'TimeTracker Attendance'",
  'grp.position<=0',
  'grp.updated_at IS DISTINCT FROM p_expected_updated_at',
  'i.board_id=b.id AND i.group_id=grp.id',
  "group.deleted_empty",
  'pg_catalog.pg_advisory_xact_lock',
  'REVOKE ALL ON FUNCTION public.wm_delete_board_group(uuid)'
 ])assert.ok(src.includes(word),'Missing safety assertion: '+word);
 assert.match(rollback,/REVOKE ALL ON FUNCTION public.wm_managed_board_delete_empty_group/);
 assert.doesNotMatch(rollback,/GRANT EXECUTE/);
});
test('TimeTracker view-hiding and staged explicit delete are wired without generic bulk activation',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'group-hide-empty'/);
 assert.match(app,/case 'group-show-hidden'/);
 assert.match(app,/case 'managed-group-delete-empty'/);
 assert.match(app,/MANAGED_TT_GROUP_DELETE_ENABLED/);
 assert.match(app,/canSafelyHideEmptyTimeTrackerGroup/);
 assert.match(app,/deleteEmptyManagedTimeTrackerGroup\(/);
 assert.match(app,/Remove empty group from view \(reversible\)/);
 assert.match(app,/Permanent deletion — approval required/);
});

test('only the exact verified redundant empty TimeTracker secondary group is auto-suppressed',()=>{
 assert.deepEqual(TIMETRACKER_REDUNDANT_GROUP,{
  boardId,groupId:secondId,title:'Main Group II'
 });
 assert.equal(isRedundantEmptyTimeTrackerGroup(board,groups[1],groups,[]),true);
 assert.equal(isRedundantEmptyTimeTrackerGroup(board,groups[0],groups,[]),false);
 assert.equal(isRedundantEmptyTimeTrackerGroup({...board,name:'Contacts'},groups[1],groups,[]),false);
 assert.equal(isRedundantEmptyTimeTrackerGroup({...board,status:'archived'},groups[1],groups,[]),false);
 assert.equal(isRedundantEmptyTimeTrackerGroup({...board,id:'22222222-2222-4222-8222-222222222222'},groups[1],groups,[]),false);
 assert.equal(isRedundantEmptyTimeTrackerGroup(board,{...groups[1],id:'22222222-2222-4222-8222-222222222222'},groups,[]),false);
 assert.equal(isRedundantEmptyTimeTrackerGroup(board,{...groups[1],title:'Operations'},groups,[]),false);
 assert.equal(isRedundantEmptyTimeTrackerGroup(board,{...groups[1],position:0},groups,[]),false);
 assert.equal(isRedundantEmptyTimeTrackerGroup(board,groups[1],[groups[1]],[]),false);
 assert.equal(isRedundantEmptyTimeTrackerGroup(board,groups[1],groups,
  [{group_id:secondId,archived_at:null}]),false);
 assert.equal(isRedundantEmptyTimeTrackerGroup(board,groups[1],groups,
  [{group_id:secondId,archived_at:'2026-11-01T00:00:00Z'}]),false);
 assert.equal(isRedundantEmptyTimeTrackerGroup(board,groups[1],groups,
  [{group_id:mainId,archived_at:null}]),true);
});
test('default suppression is scoped to board view, separate from manual browser preferences',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/isRedundantEmptyTimeTrackerGroup\(b,g,groups,items\)/);
 assert.match(app,/const redundantGroups=groups\.filter/);
 assert.match(app,/const hiddenGroups=groups\.filter\(g=>!redundantGroups\.includes\(g\)/);
 assert.match(app,/const shownGroups=groups\.filter\(g=>\s*!hiddenGroups\.includes\(g\)&&!redundantGroups\.includes\(g\)\)/);
 assert.match(app,/shownGroups\.map\(g=>/);
 assert.match(app,/renderTimeTrackerMainGroup\(/);
 assert.match(app,/const groupedItems=new Map\(groups\.map/);
 assert.match(app,/const ungroupedItems=\[\]/);
 assert.equal(MANAGED_TT_GROUP_DELETE_ENABLED,false);
 assert.match(readFileSync('scripts/pages-smoke.mjs','utf8'),
  /'frontend\/managed-time-tracker-groups\.js'/);
 const begin=app.indexOf('const redundantGroups=groups.filter');
 const end=app.indexOf('const moduleKey=',begin);
 assert.ok(begin>=0&&end>begin);
 assert.doesNotMatch(app.slice(begin,end),/\.delete\(/);
});
