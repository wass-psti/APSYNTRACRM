import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync('supabase/migrations/20261116084228_cp_tt_attendance_admin_record_management_01.sql','utf8');
const app=readFileSync('frontend/app.js','utf8');
const native=readFileSync('frontend/apps/TimeTracker/time-tracker-native.js','utf8');
const log=readFileSync('frontend/apps/TimeTracker/time-tracker-log.js','utf8');

test('admin record RPCs require the existing signed TimeTracker scope and exact System Admin role',()=>{
 assert.match(migration,/public\.timetracker_ot_require_scope\(p_board_id\)/);
 assert.match(migration,/public\.module_role_for\('time-tracker',v_actor\)/);
 assert.equal((migration.match(/v_role IS DISTINCT FROM 'System Admin'/g)||[]).length,2);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.timetracker_attendance_admin_snapshot/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.timetracker_attendance_admin_mutate/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.timetracker_attendance_admin_mutate[^;]+FROM PUBLIC, anon/);
});

test('admin mutation uses locked authoritative attendance state and optimistic revision conflict detection',()=>{
 assert.match(migration,/FOR UPDATE;/);
 assert.match(migration,/v_current_revision<>p_expected_revision/);
 assert.match(migration,/module_state_invariants_valid\('time-tracker','timetracker\.attendance\.v1'/);
 assert.match(migration,/timetracker\.attendance\.v1\.backup/);
 assert.match(migration,/revision=revision\+1/);
});

test('administrative before/after evidence is private, RLS-enabled and immutable',()=>{
 assert.match(migration,/CREATE TABLE private\.tt_attendance_admin_audit/);
 assert.match(migration,/ALTER TABLE private\.tt_attendance_admin_audit ENABLE ROW LEVEL SECURITY/);
 assert.match(migration,/REVOKE ALL ON TABLE private\.tt_attendance_admin_audit FROM PUBLIC, anon, authenticated/);
 assert.match(migration,/BEFORE UPDATE OR DELETE ON private\.tt_attendance_admin_audit/);
 assert.match(migration,/before_records,after_records,reason,committed_at/);
 assert.doesNotMatch(migration,/CREATE TABLE public\./);
});

test('edits reconcile attendance board projection, typed values and credited duration atomically',()=>{
 assert.match(migration,/private\.tt_attendance_admin_sync_projection/);
 assert.match(migration,/UPDATE private\.tt_attendance_board_projection SET/);
 assert.match(migration,/UPDATE public\.work_board_items SET status/);
 assert.match(migration,/INSERT INTO public\.work_board_item_values/);
 assert.match(migration,/creditedMsOverride/);
 assert.match(migration,/administrative-correction/);
});

test('individual and bulk deletion remove selected source records and linked projection items',()=>{
 assert.match(migration,/p_action IN \('delete','bulk-delete'\)/);
 assert.match(migration,/WHERE NOT \(r\.value->>'id'=ANY\(p_record_ids\)\)/);
 assert.match(migration,/DELETE FROM private\.tt_attendance_board_projection/);
 assert.match(migration,/DELETE FROM public\.work_board_items/);
 assert.match(migration,/INSERT INTO private\.tt_attendance_admin_audit/);
});

test('Log management UI is gated to System Admin and keeps mutations on signed RPCs',()=>{
 assert.match(app,/state\.ttAttendance\?\.access\?\.moduleRole==='System Admin'/);
 assert.match(app,/adminDirectory:state\.ttLogAdminEditor\?\.directory\|\|state\.ttAttendance\?\.access\?\.overviewDirectory/);
 const dedicatedRender=app.slice(app.indexOf('function renderTimeTrackerApplication()'),app.indexOf('function renderTimeTrackerRouteUnavailable()'));
 assert.match(dedicatedRender,/adminEligible:state\.ttAttendance\?\.access\?\.moduleRole==='System Admin'/);
 assert.match(dedicatedRender,/adminEditor:state\.ttLogAdminEditor/);
 assert.match(dedicatedRender,/adminSelectedIds:state\.ttLogSelectedIds/);
 assert.match(app,/timeTrackerAdminLogReady\(\)/);
 assert.match(app,/deleteTimeTrackerAdminRecords/);
 assert.match(app,/confirmTimeTrackerAdminDeletion/);
 assert.match(app,/tt-log-admin-delete-confirm/);
 assert.doesNotMatch(app,/window\.confirm\(message\)/);
 assert.match(native,/timetracker_attendance_admin_snapshot/);
 assert.match(native,/timetracker_attendance_admin_mutate/);
 assert.match(native,/retryUnauthorized:false/);
 assert.match(log,/System Admin record management/);
 assert.match(log,/data-action=\"tt-log-admin-edit\"/);
 assert.match(log,/renderTimeTrackerAdminDeleteDialog/);
});
