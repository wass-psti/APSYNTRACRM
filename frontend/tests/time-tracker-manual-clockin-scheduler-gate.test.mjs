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
const guardPattern = patch.match(/guard_pattern:=\$guard\$([\s\S]*?)\$guard\$/)?.[1];
const patchPattern = patch.match(/patch_pattern:=\$pattern\$([\s\S]*?)\$pattern\$/)?.[1];
const replacement = patch.match(/replacement:=\$new\$([\s\S]*?)\$new\$/)?.[1];

function postgresPatternToJs(pattern) {
  return pattern
    .replaceAll('[[:space:]]', '\\s')
    .replaceAll('[.]', '\\.')
    .replaceAll('[()]', '[()]')
    .replaceAll('[(]', '\\(')
    .replaceAll('[)]', '\\)');
}
function countMatches(source, pattern) {
  return [...source.matchAll(new RegExp(postgresPatternToJs(pattern), 'g'))].length;
}

test('forward migration is registered with exact source bytes and SHA-256', () => {
  const entry = manifest.forward_migrations.find((item) => item.file === file);
  assert.ok(entry);
  assert.equal(entry.version, '20261126100000');
  assert.equal(entry.bytes, Buffer.byteLength(sql));
  assert.equal(entry.sha256, createHash('sha256').update(sql).digest('hex'));
});

test('manual clock-in readiness and versioned capability require an active scheduler', () => {
  assert.match(sql, /contract','tt-admin-clockin-capability-2'/);
  assert.match(sql, /'schedulerMode',v_mode/);
  assert.match(sql, /'ready',v_mode IS NOT DISTINCT FROM 'active'/);
});

test('manual clock-in readiness requires the regular scheduler to be active', () => {
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION private\.tt_admin_manual_clockin_ready\(\)[\s\S]*?SELECT private\.tt_auto_clockout_mode\(\) IS NOT DISTINCT FROM 'active'/
  );
  assert.doesNotMatch(sql, /IN \('suspended','active'\)/);
});

test('production single-line readiness guard is matched exactly once', () => {
  const productionGuard = "IF NOT private.tt_admin_manual_clockin_ready() THEN RAISE EXCEPTION 'Manual clock-in unavailable until scheduler compatibility is verified' USING ERRCODE='55000'; END IF;";
  assert.ok(guardPattern);
  assert.ok(patchPattern);
  assert.equal(countMatches(productionGuard, guardPattern), 1);
  assert.equal(countMatches(productionGuard, patchPattern), 1);
});

test('readiness guard matcher tolerates multiline, tabs, CRLF and repeated whitespace', () => {
  const variants = [
    "IF NOT private.tt_admin_manual_clockin_ready() THEN RAISE EXCEPTION 'Manual clock-in unavailable until scheduler compatibility is verified' USING ERRCODE='55000'; END IF;",
    "IF NOT private.tt_admin_manual_clockin_ready()\n THEN\n  RAISE EXCEPTION 'Manual clock-in unavailable until scheduler compatibility is verified'\n USING ERRCODE = '55000';\nEND IF;",
    "IF\tNOT\tprivate.tt_admin_manual_clockin_ready()\tTHEN\tRAISE\tEXCEPTION\t'Manual clock-in unavailable until scheduler compatibility is verified'\tUSING\tERRCODE\t=\t'55000';\tEND\tIF;",
    "IF  NOT   private.tt_admin_manual_clockin_ready()   THEN   RAISE   EXCEPTION   'Manual clock-in unavailable until scheduler compatibility is verified'   USING   ERRCODE  =  '55000';   END   IF;",
    "IF NOT private.tt_admin_manual_clockin_ready()\r\n THEN\r\n RAISE EXCEPTION 'Manual clock-in unavailable until scheduler compatibility is verified' USING ERRCODE='55000';\r\n END IF;"
  ];
  for (const variant of variants) {
    assert.equal(countMatches(variant, guardPattern), 1);
    assert.equal(countMatches(variant, patchPattern), 1);
  }
});

test('missing, duplicate, or semantically changed readiness guards fail closed', () => {
  const productionGuard = "IF NOT private.tt_admin_manual_clockin_ready() THEN RAISE EXCEPTION 'Manual clock-in unavailable until scheduler compatibility is verified' USING ERRCODE='55000'; END IF;";
  assert.equal(countMatches('', guardPattern), 0);
  assert.equal(countMatches(productionGuard + '\n' + productionGuard, guardPattern), 2);
  assert.equal(countMatches(productionGuard + '\n' + productionGuard, patchPattern), 2);
  assert.equal(countMatches(productionGuard.replace('55000', '42501'), guardPattern), 1);
  assert.equal(countMatches(productionGuard.replace('55000', '42501'), patchPattern), 0);
  assert.equal(countMatches(productionGuard.replace('Manual clock-in unavailable', 'Different guard'), guardPattern), 1);
  assert.equal(countMatches(productionGuard.replace('Manual clock-in unavailable', 'Different guard'), patchPattern), 0);
  assert.equal(countMatches(productionGuard.replace('IF NOT private.', 'IF private.'), guardPattern), 0);
});

test('replacement changes only the matched guard and installs one shared scheduler lock', () => {
  assert.ok(replacement);
  const prefix = 'BEGIN\n  ';
  const suffix = '\n  PERFORM attendance_write();';
  const source = prefix
    + "IF NOT private.tt_admin_manual_clockin_ready() THEN RAISE EXCEPTION 'Manual clock-in unavailable until scheduler compatibility is verified' USING ERRCODE='55000'; END IF;"
    + suffix;
  const patched = source.replace(new RegExp(postgresPatternToJs(patchPattern), 'g'), replacement);
  assert.ok(patched.startsWith(prefix));
  assert.ok(patched.endsWith(suffix));
  assert.match(patched, /pg_try_advisory_xact_lock_shared/);
  assert.match(patched, /tt-auto-clockout-control/);
  assert.equal(countMatches(patched, guardPattern), 0);
  assert.equal([...patched.matchAll(/pg_catalog\.pg_try_advisory_xact_lock_shared\s*\(/g)].length, 1);
});

test('signed create rechecks active mode under the scheduler shared control lock', () => {
  assert.match(patch, /pg_try_advisory_xact_lock_shared/);
  assert.match(patch, /tt-auto-clockout-control/);
  assert.match(patch, /private\.tt_auto_clockout_mode\(\) IS DISTINCT FROM 'active'/);
  assert.match(patch, /ERRCODE='55P03'/);
  assert.match(patch, /ERRCODE='55000'/);
  assert.match(patch, /guard_matches<>1 OR patch_matches<>1/);
  assert.match(patch, /pg_catalog\.regexp_matches/);
  assert.match(patch, /pg_catalog\.regexp_replace/);
  assert.match(patch, /EXECUTE patched/);
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
