import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base = 'supabase/pdl-booking/acceptance/';
const bootstrap = readFileSync(base + 'pdl07_disposable_bootstrap.sql', 'utf8');
const actors = readFileSync(base + 'pdl07_disposable_actor_seed.sql', 'utf8');
const lifecycle = readFileSync(base + 'pdl07_disposable_lifecycle.sql', 'utf8');
const financial = readFileSync(base + 'pdl07_financial_reconciliation.sql', 'utf8');

test('test-only database fixture is required before writing synthetic records', () => {
  assert.match(bootstrap, /create schema pdl07_acceptance_guard/);
  assert.match(bootstrap, /disposable_fixture/);
  for (const script of [actors, lifecycle, financial]) {
    assert.match(script, /PDL07_REQUIRES_DISPOSABLE_FIXTURE/);
    assert.match(script, /to_regclass\('pdl07_acceptance_guard\.disposable_fixture'\)/);
  }
});

test('lifecycle reuses the real database acceptance scripts and verifies rollback', () => {
  for (const name of [
    'pdl_native04_booking_sync_rollback.sql',
    'pdl_native05_rollback.sql',
    'pdl_courts_admin_02_rollback.sql',
  ]) assert.ok(lifecycle.includes(name), name);
  assert.match(lifecycle, /PDL04_ROLLBACK_LEAK/);
  assert.match(lifecycle, /PDL05_ROLLBACK_LEAK/);
  assert.match(lifecycle, /PDL02_ROLLBACK_LEAK/);
  assert.match(lifecycle, /PDL07_DISPOSABLE_LIFECYCLE_ROLLBACK_PASS/);
  assert.match(lifecycle, /ROLLBACK;/);
  assert.doesNotMatch(lifecycle, /COMMIT;/);
});

test('financial-state reconciliation is rollback-only and never records a refund', () => {
  assert.match(financial, /PDL07_FINANCIAL_STATE_RECONCILIATION_PASS/);
  assert.match(financial, /PDL07_FINANCIAL_RECONCILIATION_ROLLBACK_PASS/);
  assert.match(financial, /refundStatus'<>'not_processed'/);
  assert.match(financial, /old_payment_status='submitted'/);
  assert.match(financial, /new_payment_status='submitted'/);
  assert.match(financial, /cancellation_conflict/);
  assert.match(financial, /before_methods/);
  assert.match(financial, /ROLLBACK;/);
  assert.doesNotMatch(financial, /COMMIT;/);
});

test('synthetic actor seed is repeatable on disposable database', () => {
  assert.match(actors, /greatest\(0, 2 - \(select count\(\*\)::int from pdl_booking\.admin_users\)\)/);
  assert.match(actors, /on conflict\(user_id\) do nothing/);
});
