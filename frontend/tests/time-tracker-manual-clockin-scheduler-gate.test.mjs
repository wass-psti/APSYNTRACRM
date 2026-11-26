import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const file = '20261126100000_cp_tt_admin_manual_clockin_scheduler_gate.sql';
const bytes = readFileSync(new URL('supabase/migrations/' + file, root));
const sql = bytes.toString('utf8').replace(/\r\n/g, '\n');
const manifest = JSON.parse(readFileSync(new URL('supabase/migration-source-manifest.json', root), 'utf8'));
const patch = sql.split('DO $patch$')[1].split('$patch$;')[0];
const activeCreate = readFileSync(
  new URL('supabase/migrations/20261125090000_cp_tt_admin_manual_clockin.sql', root),
  'utf8'
);
const createFunction = activeCreate.slice(
  activeCreate.indexOf('CREATE FUNCTION public.timetracker_attendance_admin_create(')
);

test('forward migration is registered with exact source bytes and SHA-256', () => {
  const entry = manifest.forward_migrations.find((item) => item.file === file);
  assert.ok(entry);
  assert.equal(entry.version, '20261126100000');
  assert.equal(entry.bytes, Buffer.byteLength(sql));
  assert.equal(entry.sha256, createHash('sha256').update(sql).digest('hex'));
});

test('manual clock-in readiness requires the regular scheduler to be active', () => {
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION private\.tt_admin_manual_clockin_ready\(\)[\s\S]*?SELECT private\.tt_auto_clockout_mode\(\) IS NOT DISTINCT FROM 'active'/
  );
  assert.doesNotMatch(sql, /IN \('suspended','active'\)/);
});

test('signed create rechecks active mode under the scheduler shared control lock', () => {
  assert.match(patch, /pg_try_advisory_xact_lock_shared/);
  assert.match(patch, /tt-auto-clockout-control/);
  assert.match(patch, /private\.tt_auto_clockout_mode\(\) IS DISTINCT FROM 'active'/);
  assert.match(patch, /ERRCODE='55P03'/);
  assert.match(patch, /ERRCODE='55000'/);
  assert.match(sql, /cardinality\(pg_catalog\.string_to_array\(d,old\)\)<>2/);
});

test('scheduler enrollment stays asynchronous and migration does not activate or modify cron', () => {
  assert.doesNotMatch(patch, /INSERT INTO private\.tt_auto_clockout_sessions/);
  assert.doesNotMatch(patch, /tt_reconcile_auto_clockout_sessions/);
  assert.doesNotMatch(sql, /cron\.alter_job|cron\.schedule|UPDATE private\.tt_auto_clockout_config/);
  assert.doesNotMatch(sql, /timetracker_attendance_admin_create_completed/);
});

test('existing signed create contract remains employee-owned, active, and without fabricated GPS', () => {
  assert.match(createFunction, /'ownerId','cloud:'\|\|p_employee_id::text/);
  assert.match(createFunction, /'clockOut',NULL/);
  assert.match(createFunction, /'status','not_captured'/);
  assert.match(createFunction, /'source','admin-manual-clockin'/);
  assert.doesNotMatch(createFunction, /'latitude'\s*,|'longitude'\s*,|'accuracy'\s*,/);
});
