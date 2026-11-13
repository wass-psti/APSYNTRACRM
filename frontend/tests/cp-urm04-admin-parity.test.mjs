import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RoleConfigurationClient} from '../role-configuration-client.js';
const app=readFileSync('frontend/app.js','utf8');
const candidate=readFileSync('sql/cp-urm04-crm-admin-parity-CANDIDATE.sql','utf8');
const migration=readFileSync('supabase/migrations/20261112121235_cp_urm04b_crm_admin_capability_parity_20261112.sql','utf8');

test('CRM Admin and designated bootstrap identity are independent verified checks',async()=>{
 const calls=[];
 const c=new RoleConfigurationClient({rpc:async name=>{calls.push(name);
  return name==='apsyntra_role_is_admin';}});
 assert.equal(await c.adminVerified(),true);
 assert.equal(await c.bootstrapVerified(),false);
 assert.deepEqual(calls,['apsyntra_role_is_admin','apsyntra_role_is_bootstrap']);
});
test('CRM role management uses Admin tier; bootstrap-only diagnostics retain identity check',()=>{
 assert.match(app,/state\.adminVerified===true\?'<div class="side-section sidebar-nav-section">Administration/);
 assert.match(app,/roleConfig\.adminVerified\(\)/);
 assert.match(app,/renderUserRoleManagement\(\{verified:state\.adminVerified/);
 assert.match(app,/renderRoleConfiguration\(\{verified:state\.adminVerified/);
 assert.match(app,/state\.roleVerified=bootstrapVerified/);
 assert.match(app,/showEngineeringDiagnostics\(location\.search,state\.roleVerified===true\)/);
 assert.match(app,/if\(state\.adminVerified!==true\|\|!\(await roleConfig\.adminVerified\(\)\)\)/);
});
test('CP-URM-04B keeps CRM Admin and bootstrap-only scope checks separate',()=>{
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.apsyntra_role_is_admin\(\)/);
 assert.match(migration,/public\.apsyntra_crm_effective_role\(p\.id,wm\.workspace_id\)='admin'/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.apsyntra_role_require_scope/);
 assert.match(migration,/NOT public\.apsyntra_role_is_admin\(\)/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.apsyntra_role_require_bootstrap_scope/);
 assert.match(migration,/NOT public\.apsyntra_role_is_bootstrap\(\)/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.timetracker_team_directory_snapshot/);
 assert.match(migration,/apsyntra_role_require_bootstrap_scope\(p_workspace_id\)/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.timetracker_team_directory_snapshot\(uuid\) TO authenticated/);
 assert.match(migration,/'adminVerified',true,'bootstrapVerified',public\.apsyntra_role_is_bootstrap\(\)/);
 assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION public\.(apsyntra_role_is_bootstrap|is_platform_admin)/);
 assert.match(migration,/private\.frt_has_role remains unchanged/);
});
test('legacy central assignment paths use CRM Admin and protect only fixed bootstrap identities',()=>{
 assert.match(migration,/public\.wm_admin_set_application_role/);
 assert.match(migration,/public\.apsyntra_role_require_scope\(v_workspace\)/);
 assert.match(migration,/public\.frt_admin_set_role/);
 assert.match(migration,/public\.tool_traceability_admin_set_role/);
 assert.match(migration,/apsyntra_role_bootstrap_identities/);
 assert.match(migration,/OR public\.is_platform_admin\(p_user_id\)/);
 assert.match(migration,/OR public\.is_platform_admin\(p_target_user_id\)/);
 assert.doesNotMatch(migration,/UPDATE public\.profiles|DELETE FROM auth\.users|TRUNCATE/i);
});
test('scope policy obtains effective Admin only from active authenticated membership',()=>{
 assert.match(candidate,/auth\.uid\(\)/);
 assert.match(candidate,/wm\.active IS TRUE/);
 assert.match(candidate,/wm\.workspace_id=public\.current_workspace_id\(p\.id\)/);
 assert.match(candidate,/public\.apsyntra_crm_effective_role\(p\.id,wm\.workspace_id\)='admin'/);
 assert.match(candidate,/IS DISTINCT FROM public\.current_workspace_id\(v_actor\)/);
 assert.match(candidate,/REVOKE ALL ON FUNCTION public\.apsyntra_role_is_admin\(\) FROM PUBLIC,anon,authenticated/);
 assert.match(candidate,/GRANT EXECUTE ON FUNCTION public\.apsyntra_role_is_admin\(\) TO authenticated/);
 assert.doesNotMatch(candidate,/UPDATE public\.profiles|UPDATE public\.apsyntra_crm_platform_roles|GRANT (ALL|SELECT) ON TABLE|CREATE POLICY/);
 assert.doesNotMatch(candidate,/CREATE OR REPLACE FUNCTION public\.(apsyntra_role_is_bootstrap|is_platform_admin)/);
});

test('ordinary CRM Admin can operate all CRM role-management controls without bootstrap designation',()=>{
 const actions=[
  ["user-role-refresh","case 'user-role-edit-crm-platform':","if(!state.adminVerified||state.userRoleBusy)return;"],
  ["user-role-edit-crm-platform","case 'user-role-edit-module':","if(!state.adminVerified||state.userRoleBusy||!state.userRoleData)return;"],
  ["user-role-edit-module","case 'role-tab':","if(!state.adminVerified||state.userRoleBusy||!state.userRoleData)return;"],
  ["role-tab","case 'role-refresh':","if(!state.adminVerified)return;"],
  ["role-refresh","case 'role-propose-create':","if(!state.adminVerified||state.roleBusy)return;"],
  ["role-propose-create","case 'role-propose-edit':","if(!state.adminVerified)return;"],
  ["role-propose-edit","case 'role-propose-activation':","if(!state.adminVerified)return;"],
  ["role-propose-activation","case 'role-propose-assign':","if(!state.adminVerified)return;"],
  ["role-propose-assign","case 'role-propose-permission':","if(!state.adminVerified)return;"],
  ["role-propose-permission","case 'role-propose-workspace':","if(!state.adminVerified)return;"],
  ["role-propose-workspace","case 'security-effective-access':","if(!state.adminVerified)return;"]
 ];
 for(const [action,endMarker,guard] of actions){
  const start=app.indexOf("case '"+action+"'");
  const end=app.indexOf(endMarker,start+1);
  assert.notEqual(start,-1,'missing handler '+action);
  assert.notEqual(end,-1,'missing end marker '+action);
  const block=app.slice(start,end);
  assert.ok(block.includes(guard),action+' must use CRM Admin verification');
  assert.doesNotMatch(block,/state\.roleVerified/,action+' must not require bootstrap identity');
 }
 assert.match(app,/event\.target\.id==='managed-user'&&state\.adminVerified&&state\.userRoleData/);
 assert.doesNotMatch(app,/!u\.protected&&u\.platformRole!=='admin_general_manager'/);
 assert.doesNotMatch(app,/u\.id===userId&&!u\.protected&&u\.platformRole!=='admin_general_manager'/);
});
test('bootstrap-only diagnostics and TimeTracker Team Directory remain separately gated',()=>{
 assert.match(app,/showEngineeringDiagnostics\(location\.search,state\.roleVerified===true\)/);
 assert.match(app,/if\(next==='team'&&state\.roleVerified!==true\)return/);
 assert.match(app,/if\(next==='gps'&&state\.roleVerified!==true/);
});
