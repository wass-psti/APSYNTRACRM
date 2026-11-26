import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const file = '20261125130000_cp_tt_auto_clockout_reactivation.sql';
const bytes = readFileSync(new URL('supabase/migrations/' + file, root));
const sql = bytes.toString('utf8').replace(/\r\n/g, '\n');
const manifest = JSON.parse(readFileSync(new URL('supabase/migration-source-manifest.json', root), 'utf8'));
const activate = sql.split('AS $activate$')[1].split('$activate$;')[0];
const suspend = sql.split('AS $suspend$')[1].split('$suspend$;')[0];

test('forward migration has a matching source manifest and deploys suspended', () => {
  const entry = manifest.forward_migrations.find((x) => x.file === file);
  assert.ok(entry);
  assert.equal(entry.bytes, Buffer.byteLength(sql));
  assert.equal(entry.sha256, createHash('sha256').update(sql).digest('hex'));
  assert.match(sql, /DO \$final\$[\s\S]*tt_auto_clockout_mode\(\) IS DISTINCT FROM 'suspended'/);
  assert.doesNotMatch(sql, /ENABLE TRIGGER|cron\.schedule\(/);
});

test('reactivation migration classifies only coherent suspended or active scheduler states', () => {
  assert.match(sql, /tt_auto_clockout_mode\(\) IN \('suspended','active'\)/);
  assert.match(sql, /t\.tgenabled='D'/);
  assert.match(sql, /BEGINRETURNNEW;END;/);
  assert.match(sql, /jobs\.n<>2 OR NOT jobs\.expected_jobs OR jobs\.owners<>1/);
  assert.match(sql, /pg_catalog\.isfinite\(c\.activated_at\)/);
  assert.match(sql, /jobs\.all_inactive/);
  assert.match(sql, /jobs\.all_active/);
});

test('activation is bounded to reviewed current-day eligible sessions and fails on conflicts', () => {
  assert.match(activate, /p_day IS DISTINCT FROM \(v_now AT TIME ZONE 'Asia\/Manila'\)::date/);
  assert.match(activate, /tt_auto_clockout_employee_eligible/);
  assert.match(activate, /v_start<v_cutoff/);
  assert.match(activate, /v_count<>p_expected_open/);
  assert.match(activate, /v_id=ANY\(v_ids\) OR r\.employee_id=ANY\(v_employees\)/);
  assert.match(activate, /Reviewed open sessions not all enrolled/);
  assert.match(sql, /q\.status='CANCELLED'[\s\S]*q\.last_error='Suspended for controlled incident recovery'[\s\S]*q\.workspace_id=EXCLUDED\.workspace_id[\s\S]*q\.employee_id=EXCLUDED\.employee_id/);
  assert.doesNotMatch(activate, /UPDATE public\.module_state_entries|INSERT INTO public\.module_state_entries/);
});

test('worker and reconciler use shared control and distinct nonblocking locks', () => {
  assert.match(sql, /pg_try_advisory_xact_lock_shared/);
  assert.match(sql, /tt-auto-clockout-control/);
  assert.match(sql, /tt-auto-clockout-reconciler/);
  assert.match(activate, /pg_try_advisory_xact_lock\(pg_catalog\.hashtextextended\('tt-auto-clockout-control',0\)\)/);
  assert.match(suspend, /pg_try_advisory_xact_lock\(pg_catalog\.hashtextextended\('tt-auto-clockout-control',0\)\)/);
  assert.match(sql, /cardinality\(pg_catalog\.string_to_array\(d,old\)\)<>2/);
  assert.doesNotMatch(sql, /pg_catalog\.pg_advisory_xact_lock\(/);
});

test('activation and suspension are private and never touch OJT jobs or attendance', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION private\.tt_activate_isolated_auto_clockout\(date,integer\) FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(sql, /REVOKE ALL ON FUNCTION private\.tt_suspend_isolated_auto_clockout\(\) FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(suspend, /activated_at='infinity'/);
  assert.match(suspend, /cron\.alter_job\(v_job\.jobid,active:=false\)/);
  assert.doesNotMatch(suspend, /tt-ojt|UPDATE public\.module_state_entries|ENABLE TRIGGER/);
});
