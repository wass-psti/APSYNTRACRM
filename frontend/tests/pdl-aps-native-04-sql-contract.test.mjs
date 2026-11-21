import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/pdl-booking/acceptance/pdl_native04_booking_sync_rollback.sql', 'utf8');

test('booking and admin synchronization acceptance is an uncommitted transaction', () => {
  assert.match(sql, /^begin;/m);
  assert.match(sql, /rollback;\s*$/i);
  assert.doesNotMatch(sql, /^\s*commit\s*;/im);
  assert.match(sql, /set local statement_timeout=/i);
  assert.match(sql, /set local lock_timeout=/i);
});

test('public create, idempotency, receipt and native admin readback use existing RPCs', () => {
  for (const operation of [
    'pdl_booking.quote', 'pdl_booking.submit', 'pdl_booking.receipt',
    "public.pdl_backend_v1('list'", 'pdl_booking.verify', 'pdl_booking.is_available',
  ]) assert.ok(sql.includes(operation), operation);
  assert.match(sql, /idempotency_conflict/);
  assert.match(sql, /verification_conflict/);
  assert.match(sql, /audit_events/);
  assert.match(sql, /booking_status/);
});

test('fixture never alters genuine accounts or creates approved prices', () => {
  assert.doesNotMatch(sql, /\b(create|drop|alter)\s+(table|role|policy)\b/i);
  assert.doesNotMatch(sql, /\b(insert|update|delete)\s+(?:into\s+|from\s+)?pdl_booking\.admin_users\b/i);
  assert.match(sql, /Synthetic Backend Acceptance/);
  assert.match(sql, /TEST-ONLY/);
});
