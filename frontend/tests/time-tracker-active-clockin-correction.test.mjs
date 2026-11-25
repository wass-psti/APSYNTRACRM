import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const migration = (file) => readFileSync(new URL('supabase/migrations/' + file, root), 'utf8').replace(/\r\n/g, '\n');
const file = '20261126090000_cp_tt_active_clockin_scheduler_correction.sql';
const sql = migration(file);
const isolated = migration('20261125100000_cp_tt_auto_clockout_isolation.sql');
const reactivated = migration('20261125130000_cp_tt_auto_clockout_reactivation.sql');
const admin = migration('20261120183000_cp_tt_optional_attendance_correction_note.sql');
const snapshot = migration('20261124050317_cp_tt_deferred_foreground_clockout_01.sql');

function definition(source, name, tag) {
  const start = source.indexOf('FUNCTION ' + name + '(');
  assert.notEqual(start, -1, name);
  const body = source.indexOf('AS ' + tag, start);
  const end = source.indexOf(tag + ';', body + tag.length + 3);
  assert.ok(body > start && end > body, name);
  return source.slice(start, end + tag.length + 1);
}

function applyPatches(source, definitions) {
  const block = source.split('FOR target,old,replacement IN VALUES')[1].split('\n LOOP\n')[0];
  const tuples = [...block.matchAll(/\(\s*'([^']+)'\s*,\s*(\$old\$[\s\S]*?\$old\$|'(?:''|[^'])*')\s*,\s*(\$new\$[\s\S]*?\$new\$|'(?:''|[^'])*')\s*\)/g)];
  const decode = (s) => s.startsWith('$') ? s.slice(5, -5) : s.slice(1, -1).replace(/''/g, "'");
  assert.equal(tuples.length, (block.match(/\(\s*'(?:private|public)\./g) || []).length);
  for (const [, target, old, replacement] of tuples) {
    const current = definitions.get(target);
    assert.ok(current, target);
    assert.equal(current.split(decode(old)).length, 2, target + ': ' + decode(old));
    definitions.set(target, current.replace(decode(old), () => decode(replacement)));
  }
  return definitions;
}

test('new migration source hash and exact guarded patch anchors match recovered source', () => {
  const manifest = JSON.parse(readFileSync(new URL('supabase/migration-source-manifest.json', root), 'utf8'));
  const entry = manifest.forward_migrations.find((item) => item.file === file);
  assert.equal(entry.bytes, Buffer.byteLength(sql));
  assert.equal(entry.sha256, createHash('sha256').update(sql).digest('hex'));
  const defs = new Map([
    ['private.tt_reconcile_auto_clockout_sessions()', definition(isolated, 'private.tt_reconcile_auto_clockout_sessions', '$f$')],
    ['private.tt_process_auto_clockouts()', definition(isolated, 'private.tt_process_auto_clockouts', '$function$')],
    ['private.tt_activate_isolated_auto_clockout(date,integer)', definition(reactivated, 'private.tt_activate_isolated_auto_clockout', '$activate$')],
    ['public.timetracker_attendance_admin_mutate(uuid,text,text[],jsonb,text,bigint)', definition(admin, 'public.timetracker_attendance_admin_mutate', '$function$')],
    ['public.timetracker_auto_clockout_snapshot(uuid)', definition(snapshot, 'public.timetracker_auto_clockout_snapshot', '$function$')],
  ]);
  applyPatches(reactivated, defs);
  applyPatches(sql, defs);
  const worker = defs.get('private.tt_process_auto_clockouts()');
  assert.match(worker, /a\.clock_in_at IS DISTINCT FROM s\.clock_in_at/);
  assert.match(worker, /s\.enrollment_epoch=v_epoch AND s\.enrollment_clock_in_at>=v_activated_at/);
  assert.match(worker, /FOR UPDATE SKIP LOCKED/);
  assert.match(worker, /FOR UPDATE NOWAIT/);
  assert.match(worker, /FOR SHARE OF r NOWAIT/);
  assert.match(worker, /v_threshold:=private\.tt_auto_clockout_threshold\(v_clock_in\)/);
  assert.match(worker, /v_ot\.decided_at<=/);
  assert.match(worker, /private\.tt_auto_clockout_project/);
  const reconciler = defs.get('private.tt_reconcile_auto_clockout_sessions()');
  assert.match(reconciler, /v_start<v_activated_at/);
  assert.match(reconciler, /q\.workspace_id=EXCLUDED\.workspace_id/);
  assert.match(reconciler, /q\.employee_id=EXCLUDED\.employee_id/);
  assert.doesNotMatch(reconciler, /UPDATE public\.module_state_entries|FOR UPDATE NOWAIT/);
  const activation = defs.get('private.tt_activate_isolated_auto_clockout(date,integer)');
  assert.match(activation, /v_start<v_cutoff/);
  assert.match(activation, /q\.enrollment_epoch=\(SELECT activation_epoch/);
  assert.match(defs.get('public.timetracker_attendance_admin_mutate(uuid,text,text[],jsonb,text,bigint)'), /tt_check_active_clockin_correction\(/);
  assert.match(defs.get('public.timetracker_auto_clockout_snapshot(uuid)'), /AND s\.clock_in_at=v_clock_in/);
});

test('migration does not alter the cutoff, cron jobs, canonical attendance, or retired trigger', () => {
  assert.doesNotMatch(sql, /cron\.alter_job|cron\.schedule\(|UPDATE public\.module_state_entries|ENABLE TRIGGER/);
  assert.match(sql, /WHEN \(OLD\.activated_at IS DISTINCT FROM NEW\.activated_at\)/);
  assert.match(sql, /NEW\.activation_epoch:=pg_catalog\.gen_random_uuid\(\)/);
  assert.match(sql, /q\.enrollment_epoch=v_epoch AND q\.enrollment_clock_in_at>=v_cutoff/);
  assert.match(sql, /Wait for automatic clock-out enrollment before correcting/);
});

test('client rejects a signed snapshot for the same record with a different start time', () => {
  const native = readFileSync(new URL('frontend/time-tracker-native.js', root), 'utf8');
  assert.match(native, /session\.clockInAt!=null&&\s*\(!safeTime\(session\.clockInAt\)\|\|Date\.parse\(session\.clockInAt\)!==Date\.parse\(active\.clockIn\)\)/);
});
