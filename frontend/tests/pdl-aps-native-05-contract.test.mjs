import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration=readFileSync('supabase/pdl-booking/source/migrations/20261121153857_pdl_admin_paginated_lifecycle.sql','utf8');
const acceptance=readFileSync('supabase/pdl-booking/acceptance/pdl_native05_rollback.sql','utf8');
const edge=readFileSync('supabase/pdl-booking/source/functions/pdl-guest-api/index.ts','utf8');
const admin=readFileSync('frontend/apps/Paseo/source/src/pages/StagingAdminReservationsPage.tsx','utf8');

test('backward compatible standalone private admin RPC with bounded deterministic keyset pagination',()=>{
  assert.match(migration,/create or replace function public\.pdl_admin_lifecycle_v1/);
  assert.match(migration,/v_limit not between 1 and 50/);
  assert.match(migration,/order by r\.created_at desc,r\.id desc/);
  assert.match(migration,/\(r\.created_at,r\.id\)<\(v_before,v_before_id\)/);
  assert.match(migration,/nextCursor/);
  assert.match(migration,/grant execute on function public\.pdl_admin_lifecycle_v1\(text,jsonb\) to service_role/);
  assert.doesNotMatch(migration,/alter table|drop table|create policy|grant .* to anon|grant .* to authenticated/i);
});

test('pending-only cancellation is optimistic, audited, and never asserts automatic refund',()=>{
  assert.match(migration,/for update/);
  assert.match(migration,/v_record\.version<>v_expected/);
  assert.match(migration,/v_record\.booking_status<>'pending_verification'/);
  assert.match(migration,/v_record\.payment_status<>'submitted'/);
  assert.match(migration,/new_payment_status/);
  assert.match(migration,/'refundStatus','not_processed'/);
  assert.match(migration,/action,\s*old_booking_status/);
});

test('Edge endpoints remain behind existing signed admin routing and validate inputs',()=>{
  assert.match(edge,/route === '\/v1\/admin\/reservations\/page'/);
  assert.match(edge,/adminLifecycle\('page'/);
  assert.match(edge,/adminLifecycle\('cancel'/);
  assert.match(edge,/invalid_page', 422/);
  assert.match(edge,/cancellation_conflict'\?409/);
  const pageAt=edge.indexOf("route === '/v1/admin/reservations/page'");
  const adminGate=edge.lastIndexOf('const actorId = await authenticate(req)',pageAt);
  assert.ok(adminGate>0&&adminGate<pageAt);
});

test('public record administration offers load-more and explicit no-refund cancellation',()=>{
  assert.match(admin,/Load more reservations/);
  assert.match(admin,/\/v1\/admin\/reservations\/page/);
  assert.match(admin,/Cancel booking \(no automatic refund\)/);
  assert.match(admin,/No refund will be issued automatically/);
  assert.match(admin,/loadRequest\.current/);
});

test('rollback acceptance covers pages, replay, cancellation, stale decision and accepted payment',()=>{
  for(const term of ['ROLLBACK_ONLY_PDL_NATIVE05_LIFECYCLE_PASS','pdl_booking.submit','pdl_booking.quote',
    'pdl_booking.is_available','cancellation_conflict','expectedVersion','not_processed',
    'nextCursor','transient_reservations'])assert.ok(acceptance.includes(term),term);
  assert.doesNotMatch(acceptance,/\bcommit\s*;/i);
});
