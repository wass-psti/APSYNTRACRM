import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const sql=readFileSync(new URL('../../supabase/migrations/20261124100000_cp_tt_ojt_auto_clockout_9h.sql',import.meta.url),'utf8');

test('signed OJT auto clock-out is server scheduled and independent of browser',()=>{
 assert.match(sql,/CREATE FUNCTION private\.tt_process_ojt_auto_clockouts\(\)/);
 assert.match(sql,/cron\.schedule\(\s*'tt-ojt-auto-clockout-9h',\s*'30 seconds'/);
 assert.match(sql,/v_cutoff:=v_before\.clock_in_at\+INTERVAL '9 hours'/);
 assert.match(sql,/clock_out_at=v_cutoff/);
 assert.match(sql,/WHERE a\.clock_out_at IS NULL/);
 assert.match(sql,/AND a\.clock_in_at <= pg_catalog\.clock_timestamp\(\)-INTERVAL '9 hours'/);
});
test('automatic closure is auditable and does not fabricate GPS or user actions',()=>{
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/IF NOT FOUND OR v_before\.clock_out_at IS NOT NULL/);
 assert.match(sql,/clock_out_geo=pg_catalog\.jsonb_build_object\(/);
 assert.match(sql,/'status','not_captured'/);
 assert.match(sql,/'source','server-auto-clockout'/);
 assert.match(sql,/clock_out_actor=NULL/);
 assert.match(sql,/'server-auto-clock-out'/);
 assert.match(sql,/pg_catalog\.to_jsonb\(v_before\),pg_catalog\.to_jsonb\(v_after\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.tt_process_ojt_auto_clockouts\(\)/);
});
test('existing standard TimeTracker auto clock-out is not replaced',()=>{
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION private\.tt_process_auto_clockouts/);
 assert.doesNotMatch(sql,/DROP (TABLE|FUNCTION|TRIGGER)/);
 assert.doesNotMatch(sql,/DELETE FROM private\.tt_ojt_attendance/);
 assert.match(sql,/tt_ojt_auto_clockout_due_idx/);
});
