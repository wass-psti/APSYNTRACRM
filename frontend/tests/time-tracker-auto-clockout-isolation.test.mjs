import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/migrations/20261125100000_cp_tt_auto_clockout_isolation.sql',import.meta.url),'utf8');
const reconciler=sql.split('CREATE FUNCTION private.tt_reconcile_auto_clockout_sessions()')[1].split('REVOKE ALL ON FUNCTION private.tt_reconcile_auto_clockout_sessions()')[0];
const worker=sql.split('CREATE OR REPLACE FUNCTION private.tt_process_auto_clockouts()')[1].split('REVOKE ALL ON FUNCTION private.tt_process_auto_clockouts()')[0];

test('attendance trigger is retired and activation is explicit',()=>{
 assert.match(sql,/DISABLE TRIGGER tt_auto_clockout_sync/);
 assert.match(sql,/AS \$f\$ BEGIN RETURN NEW; END; \$f\$;/);
 assert.match(sql,/SET activated_at='infinity'::timestamptz/);
 assert.match(sql,/cron\.alter_job\(jobid,active:=false\)/);
 assert.match(sql,/tt-auto-clockout-reconcile/);
});
test('reconciler checks employee identities without writing attendance',()=>{
 assert.match(sql,/JOIN auth\.users u ON u\.id=p\.id/);
 assert.match(sql,/m\.active/);
 assert.match(sql,/p\.status='active'/);
 assert.match(reconciler,/tt_auto_clockout_employee_eligible/);
 assert.match(reconciler,/foreign_key_violation/);
 assert.doesNotMatch(reconciler,/UPDATE public\.module_state_entries|INSERT INTO public\.module_state_entries|FOR UPDATE|pg_advisory_xact_lock/);
});
test('worker uses bounded, nonblocking locking and one acquired candidate',()=>{
 assert.match(worker,/SET lock_timeout='1s'/);
 assert.match(worker,/pg_try_advisory_xact_lock/);
 assert.doesNotMatch(worker,/\.pg_advisory_xact_lock\(/);
 assert.match(worker,/FOR UPDATE NOWAIT/);
 assert.match(worker,/FOR SHARE OF r NOWAIT/);
 assert.match(worker,/WHEN lock_not_available OR deadlock_detected/);
 assert.match(worker,/At most one candidate with acquired employee lock per transaction\.\s+EXIT;/);
});
test('worker preserves canonical attendance, policy cutoff, audit and real evidence provenance',()=>{
 assert.match(worker,/clock_in_at>=v_activated_at/);
 assert.match(worker,/v_clock_out_at:=v_threshold/);
 assert.match(worker,/v_clock_out_at:=v_cutoff/);
 assert.match(worker,/v_ot\.decided_at<=/);
 assert.match(worker,/'status','not_captured'/);
 assert.match(worker,/'source','server-auto-clockout'/);
 assert.match(worker,/module_state_invariants_valid/);
 assert.match(worker,/timetracker\.attendance\.v1\.backup/);
 assert.match(worker,/timetracker_attendance_mutation_audit/);
 assert.match(worker,/tt_auto_clockout_project/);
 assert.doesNotMatch(worker,/'latitude'\s*,|'longitude'\s*,/);
});
