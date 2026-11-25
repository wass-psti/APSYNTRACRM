import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/migrations/20261125120000_cp_tt_company_provisioning_workspace_scope.sql','utf8');
const app=readFileSync('frontend/app.js','utf8');
const native=readFileSync('frontend/time-tracker-native.js','utf8');

test('TimeTracker directory resolves target roles in the signed caller workspace',()=>{
 const directory=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.list_module_directory'),sql.indexOf('DO $patch$'));
 assert.match(directory,/auth.uid\(\)/);
 assert.match(directory,/has_module_access\(p_module_id,caller\)/);
 assert.match(directory,/ws:=public.current_workspace_id\(caller\)/);
 assert.match(directory,/wm.workspace_id=ws AND wm.active=true/);
 assert.match(directory,/\(broad OR p.id=caller\)/);
 assert.match(directory,/private.tt_role_in_workspace\(p.id,ws\) IS NOT NULL/);
 assert.match(directory,/ELSE public.has_module_access\(p_module_id,p.id\)/);
 const resolver=sql.slice(0,sql.indexOf('CREATE OR REPLACE FUNCTION public.list_module_directory'));
 assert.match(resolver,/m.workspace_id=p_workspace AND m.active/);
 assert.match(resolver,/p.status='active'/);
 assert.match(resolver,/apsyntra_scoped_module_role\('time-tracker',p_user,p_workspace\)/);
 assert.match(resolver,/apsyntra_crm_effective_role\(p_user,p_workspace\)/);
 assert.doesNotMatch(resolver,/current_workspace_id\(p_user\)/);
 assert.match(resolver,/FROM PUBLIC,anon,authenticated,service_role/);
});

test('target checks are patched independently of signed caller authorization',()=>{
 for(const token of [
  'public.timetracker_employee_department_set(uuid,uuid,text)',
  'public.timetracker_attendance_admin_create(uuid,uuid,timestamptz,text,text,text,bigint)',
  'private.tt_auto_clockout_employee_eligible(uuid,uuid,uuid)',
  'private.tt_role_in_workspace(p_target_user_id,v_ws)',
  'private.tt_role_in_workspace(p.id,v_ws)',
  'private.tt_role_in_workspace(p.id,p_workspace)',
  'IF t=s THEN RAISE EXCEPTION'
 ])assert.ok(sql.includes(token),token);
 assert.doesNotMatch(sql,/ALTER TABLE public.module_state_entries|cron\.alter_job|UPDATE public.module_state_entries/);
});

test('company provisioning defaults off and does not backfill or overwrite roles',()=>{
 assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
 assert.match(sql,/a.created_at>=cfg.activated_at/);
 assert.match(sql,/u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS FALSE/);
 assert.match(sql,/Existing membership or assignment requires manual review/);
 assert.match(sql,/p.platform_role='employee'/);
 assert.match(sql,/public.is_platform_admin\(cfg.assigned_by\)/);
 assert.match(sql,/VALUES\(cfg.workspace_id,p_user_id,'employee',cfg.assigned_by\)/);
 assert.match(sql,/VALUES\(cfg.workspace_id,p_user_id,'time-tracker','Employee',true,cfg.assigned_by\)/);
 assert.match(sql,/VALUES\(cfg.workspace_id,p_user_id,'member'\)/);
 assert.match(sql,/IF FOUND THEN[\s\S]*'idempotent',true/);
 assert.match(sql,/IF NOT FOUND OR NOT cfg.enabled THEN RETURN NULL/);
 assert.match(sql,/private.ws02_try_company_provision\(p_user_id\)/);
 assert.doesNotMatch(sql,/UPDATE public\.workspace_members|UPDATE public\.profiles|UPDATE public\.apsyntra_workspace_module_roles|SET enabled=true/);
});

test('visible directory refresh is signed, scoped, read-only and does not overwrite active edits',()=>{
 const read=native.slice(native.indexOf('async employeeDirectory('),native.indexOf('async teamDirectory('));
 assert.match(read,/await this.access\(boardId\)/);
 assert.match(read,/canViewTimeTrackerEmployees\(access\)/);
 assert.match(read,/timetracker_employee_department_directory_snapshot/);
 assert.match(read,/timetracker_department_catalog_snapshot/);
 assert.match(read,/await checkIdentity\(this.auth,this.api,access,boardId\)/);
 assert.doesNotMatch(read,/list_module_state|\.commit\(|mutateAttendanceRecords\(/);
 const poll=app.slice(app.indexOf('function timeTrackerEmployeeDirectoryRefreshReady('),app.indexOf('function maintainTimeTrackerClock('));
 assert.match(poll,/!document.hidden/);
 assert.match(poll,/state.ttView==='employees'/);
 assert.match(poll,/state.ttEmployeesTab==='directory'/);
 assert.match(poll,/!platformSyncEditInProgress\(\)/);
 assert.match(poll,/state.ttAttendance!==before/);
 assert.match(poll,/fresh.workspaceId!==workspace/);
 assert.match(poll,/fresh.moduleRole!==before.access.moduleRole/);
 assert.match(poll,/state.ttAttendance=\{\.\.\.before,access:/);
 assert.doesNotMatch(poll,/loadTimeTracker\(|\.commit\(|\.mutate/);
 assert.match(app,/TT_EMPLOYEE_DIRECTORY_POLL_MS=30000/);
});
