import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TT_TEAM_DEPARTMENTS,validTimeTrackerDepartmentName} from '../time-tracker-team.js';

const migration=readFileSync('supabase/migrations/20261120140000_cp_tt_department_catalog_management.sql','utf8');
const app=readFileSync('frontend/app.js','utf8');
const employees=readFileSync('frontend/apps/TimeTracker/time-tracker-application.js','utf8');
const native=readFileSync('frontend/time-tracker-native.js','utf8');

test('OJT is a department as well as an independent TimeTracker module role',()=>{
 assert.ok(TT_TEAM_DEPARTMENTS.includes('OJT'));
 assert.ok(validTimeTrackerDepartmentName('OJT'));
 assert.ok(validTimeTrackerDepartmentName('Quality Assurance'));
 for(const value of ['', 'X','  ',' Engineering ', 'a'.repeat(61),'New\nDepartment'])
  assert.equal(validTimeTrackerDepartmentName(value),false);
 assert.match(migration,/\('OJT'\)/);
 assert.match(migration,/tt_department_catalog_unique_name/);
});

test('department management is workspace scoped, private, and strictly System/IT authorized',()=>{
 for(const word of [
  'CREATE TABLE private.tt_department_catalog_state',
  'CREATE TABLE private.tt_department_catalog',
  'CREATE TABLE private.tt_department_catalog_audit',
  'ENABLE ROW LEVEL SECURITY',
  'tt_department_catalog_audit_immutable',
  "public.timetracker_ot_require_scope(p_board_id)",
  "'System Admin','IT Administrator'",
  'GRANT EXECUTE ON FUNCTION public.timetracker_department_catalog_snapshot',
  'GRANT EXECUTE ON FUNCTION public.timetracker_department_catalog_mutate'
 ])assert.ok(migration.includes(word),word);
 assert.doesNotMatch(migration,/GRANT (?:SELECT|INSERT|UPDATE|DELETE) ON private\./i);
});

test('renaming maps current assignments atomically without rewriting historical attendance',()=>{
 assert.match(migration,/IF p_action='rename' THEN/);
 assert.match(migration,/UPDATE private\.tt_employee_departments/);
 assert.match(migration,/INSERT INTO private\.tt_employee_department_audit/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.timetracker_attendance_commit_v2/);
 assert.match(migration,/p_department IS DISTINCT FROM v_authoritative_department/);
 assert.doesNotMatch(migration,/UPDATE public\.module_state_entries SET value/);
 assert.doesNotMatch(migration,/DELETE FROM public\.timetracker_attendance_mutation_audit/);
});

test('deletion displays count warning and requires acknowledgment, and SQL rechecks count',()=>{
 for(const phrase of [
  'tt-departments-delete','assigned to this ','dept.assignedCount',
  "fd.get('acknowledge')",'destructive:true',
  "expectedCount:dept.assignedCount"
 ])assert.ok(app.includes(phrase),phrase);
 assert.match(migration,/p_expected_count<>v_count/);
 assert.match(migration,/TT_DEPARTMENT_ASSIGNMENT_COUNT_CHANGED/);
 assert.match(migration,/IF v_revision IS DISTINCT FROM p_expected_revision/);
 assert.match(migration,/UPDATE private\.tt_department_catalog_state SET revision=revision\+1/);
 assert.match(migration,/SELECT v_ws,d\.user_id,v_actor,v_old,NULL/);
 assert.match(migration,/DELETE FROM private\.tt_employee_departments/);
 assert.doesNotMatch(migration,/DELETE FROM public\.module_state_entries/);
});

test('admin assignment dropdown uses signed catalog not hardcoded names, clockout keeps historic value',()=>{
 assert.match(app,/available=state\.ttAttendance\.access\.departmentCatalog\.departments\.map/);
 assert.match(employees,/projectTimeTrackerDepartmentCatalog/);
 assert.match(native,/validTimeTrackerDepartmentName\(committedDepartment\)/);
 assert.match(migration,/IF p_action='clock-in' THEN/);
 assert.match(migration,/WHERE c\.workspace_id=v_ws AND c\.name=v_authoritative_department/);
 assert.match(migration,/Clock-outs retain the department on their existing signed record/);
});
