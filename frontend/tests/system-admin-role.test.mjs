import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 SystemAdminClient,normalizeSystemAdminSnapshot
} from '../system-admin-access.js';
import {renderSystemAdminSection,renderUserRoleManagement,MODULE_ROLE_OPTIONS,APSYNTRA_CRM_PLATFORM_ROLES} from '../user-role-management.js';
const ws='00000000-0000-4000-8000-000000000001';
const actor='11111111-1111-4111-8111-111111111111';
const chief='22222222-2222-4222-8222-222222222222';
const tech='33333333-3333-4333-8333-333333333333';
const users=[
 {id:actor,name:'Actor',email:'actor@example.com',protected:true,activeWorkspaceCount:1},
 {id:chief,name:'CEO',email:'ceo@example.com',protected:true,activeWorkspaceCount:1},
 {id:tech,name:'New IT hire',email:'tech@example.com',protected:false,activeWorkspaceCount:1}
];
const signed=()=>({
 contract:'apsyntra-system-admin-v1',authorized:true,
 workspaceId:ws,actorId:actor,canManage:true,
 rows:[
  {userId:actor,active:true,designation:'trusted_it',revision:1},
  {userId:chief,active:true,designation:'general_manager',revision:1},
  {userId:tech,active:false,designation:null,revision:0}
 ]
});
const norm=data=>normalizeSystemAdminSnapshot(data,{workspaceId:ws,actorId:actor,users});
test('System Admin role is distinct from CRM admin, employee departments and TimeTracker roles',()=>{
 assert.deepEqual(APSYNTRA_CRM_PLATFORM_ROLES,['admin','supervisor','employee','viewer']);
 assert.ok(MODULE_ROLE_OPTIONS['time-tracker'].includes('System Admin'));
 const js=readFileSync('frontend/system-admin-access.js','utf8');
 assert.doesNotMatch(js,/\.department\b|if\s*\(.*Information Technology/);
 assert.match(js,/apsyntra_system_admin_change/);
 assert.doesNotMatch(js,/\.from\(['"]profiles|localStorage|sessionStorage/);
});
test('workspace roster signed data is verified, not fabricated',()=>{
 const d=norm(signed());
 assert.equal(d.status,'VERIFIED_SYSTEM_ADMIN');
 assert.equal(d.canManage,true);
 assert.deepEqual(d.roles.map(r=>r.active),[true,true,false]);
 assert.equal(d.roles[2].revision,0);
 for(const forged of [
  {...signed(),authorized:false},
  {...signed(),actorId:tech},
  {...signed(),workspaceId:tech},
  {...signed(),canManage:'true'},
  {...signed(),rows:signed().rows.slice(0,2)},
  {...signed(),rows:[...signed().rows.slice(0,2),{userId:tech,active:true,designation:'it',revision:1}]},
  {...signed(),rows:[signed().rows[0],signed().rows[0],signed().rows[2]]},
  {...signed(),rows:[...signed().rows.slice(0,2),{userId:'44444444-4444-4444-8444-444444444444',active:true,designation:'trusted_it',revision:1}]}
 ])assert.equal(norm(forged).status,'UNAVAILABLE');
});
test('System Admin client denies self-promotion and rejects malformed or unsigned receipts',async()=>{
 const calls=[];
 const client=new SystemAdminClient({rpc:async(name,payload)=>{
  calls.push({name,payload});
  return {state:'committed',workspaceId:ws,targetUserId:tech,
   action:'grant',active:true,revision:1};
 }});
 const req={workspaceId:ws,actorId:actor,userId:tech,action:'grant',
  designation:'trusted_it',reason:'Approved trusted IT administrator',expectedRevision:0};
 await assert.rejects(()=>client.change({...req,userId:actor}),/self-directed/);
 await assert.rejects(()=>client.change({...req,reason:'IT'}),/incomplete/);
 await assert.rejects(()=>client.change({...req,designation:'time_tracker'}),/Invalid/);
 const r=await client.change(req);
 assert.equal(r.state,'committed');
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'apsyntra_system_admin_change');
 assert.deepEqual(calls[0].payload,{
  p_workspace_id:ws,p_target_user_id:tech,p_action:'grant',
  p_designation:'trusted_it',p_reason:req.reason,p_expected_revision:0
 });
});
test('only genuine absent RPC enables unavailable read-only mode',async()=>{
 const missing=new SystemAdminClient({rpc:async()=>{throw Object.assign(Error('Missing'),{
  status:404,code:'PGRST202'
 });}});
 const r=await missing.snapshot({workspaceId:ws,actorId:actor,users});
 assert.equal(r.status,'UNAVAILABLE');
 for(const status of [401,403,500]){
  const client=new SystemAdminClient({rpc:async()=>{throw Object.assign(Error('Denied'),{status});}});
  await assert.rejects(()=>client.snapshot({workspaceId:ws,actorId:actor,users}),/Denied/);
 }
});
test('System Admin User Role Management panel fails closed before activation',()=>{
 const d=renderSystemAdminSection({selectedUser:users[2],actorId:actor,hidden:false});
 assert.match(d,/System Admin/);
 assert.match(d,/not activated/);
 assert.doesNotMatch(d,/data-action="user-role-grant-system-admin"/);
 const active=renderSystemAdminSection({data:norm(signed()),selectedUser:users[2],actorId:actor});
 assert.match(active,/data-action="user-role-grant-system-admin"/);
 assert.doesNotMatch(active,/data-action="user-role-revoke-system-admin"/);
 const self=renderSystemAdminSection({data:norm(signed()),selectedUser:users[0],actorId:actor});
 assert.match(self,/data-action="user-role-revoke-system-admin"[^>]* disabled/);
 const protectedCEO=renderSystemAdminSection({data:norm(signed()),selectedUser:users[1],actorId:actor});
 assert.match(protectedCEO,/data-action="user-role-revoke-system-admin"[^>]* disabled/);
});
test('User Role Management shows System Admin as a distinct third section',()=>{
 const data={users,modules:[],moduleAssignments:[],boardAssignments:[],boards:[],
  crmPlatformRoles:users.map(p=>({userId:p.id,effectiveRole:'employee',assignedRole:null}))};
 const html=renderUserRoleManagement({verified:true,data,selectedUserId:tech,actorUserId:actor,accessSection:'system-admins'});
 assert.match(html,/data-section="system-admins"/);
 assert.match(html,/data-role-access-section="system-admins" aria-label="System Admin management"/);
 assert.doesNotMatch(html,/data-role-access-section="system-admins" aria-label="System Admin management" hidden/);
});
test('SQL proposal is gated, audit-only and does not auto-appoint IT employees',()=>{
 const sql=readFileSync('sql/cp-system-admin-role-CANDIDATE-NOT-APPLIED.sql','utf8');
 assert.match(sql,/private\.ws01_signed_actor_session\(\)/);
 assert.match(sql,/p_target_user_id=v_actor/);
 assert.match(sql,/Last System Admin cannot be revoked/);
 assert.match(sql,/Bootstrap identity is protected/);
 assert.match(sql,/public\.apsyntra_system_admin_snapshot/);
 assert.match(sql,/REVOKE ALL ON private\.apsyntra_system_admin_assignments/);
 assert.match(sql,/CREATE TRIGGER system_admin_event_append_only/);
 assert.match(sql,/p_expected_revision/);
 assert.doesNotMatch(sql,/INSERT INTO private\.apsyntra_system_admin_assignments[^;]+SELECT/s);
 assert.doesNotMatch(sql,/department\s*=\s*['"]Information Technology/i);
 assert.doesNotMatch(readFileSync('frontend/app.js','utf8'),/client\.from\('apsyntra_system_admin_assignments'\)/);
});
test('Invite search has no native browser clear X; dialog close remains',()=>{
 const invite=readFileSync('frontend/board/collaboration/invite.js','utf8');
 assert.match(invite,/input type="text" inputmode="search" id="aps-invite-search"/);
 assert.doesNotMatch(invite,/input type="search" id="aps-invite-search"/);
 assert.match(invite,/data-aps-invite-close/);
 assert.doesNotMatch(invite,/data-aps-invite-clear/);
});
