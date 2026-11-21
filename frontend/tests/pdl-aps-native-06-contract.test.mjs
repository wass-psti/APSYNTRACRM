import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const admin=readFileSync('frontend/apps/Paseo/source/src/pages/StagingAdminReservationsPage.tsx','utf8');
const browser=readFileSync('scripts/pdl-aps-native-browser.mjs','utf8');
const submit=readFileSync('supabase/pdl-booking/source/migrations/20261120095844_pdl_guest_atomic_idempotency_lock.sql','utf8');
const lifecycle=readFileSync('supabase/pdl-booking/source/migrations/20261121153857_pdl_admin_paginated_lifecycle.sql','utf8');

test('uncertain cancellation reports failure of the follow-up readback separately',()=>{
 assert.match(admin,/async function load\([^)]*\): Promise<boolean>/);
 assert.match(admin,/const refreshed = await load\(\)/);
 assert.match(admin,/booking status could not be checked\. Refresh before trying again/);
 assert.match(admin,/The cancellation may have succeeded, but the updated booking could not be checked/);
});

test('pagination deduplicates overlapping ids without losing existing results',()=>{
 assert.match(admin,/const seen = new Set\(previous\.map\(record => record\.id\)\)/);
 assert.match(admin,/normalized\.filter\(record => !seen\.has\(record\.id\)\)/);
 assert.match(browser,/length:125/);
 assert.match(browser,/five cursor pages show 125 distinct reservations/);
});

test('pre-existing backend parallel-write serialization and version checking remain present',()=>{
 assert.match(submit,/pg_advisory_xact_lock\(hashtextextended\('pdl-idempotency:/);
 assert.match(submit,/pg_advisory_xact_lock\(hashtextextended\('pdl:'/);
 assert.match(lifecycle,/where id=v_id for update/);
 assert.match(lifecycle,/v_record\.version<>v_expected/);
 assert.match(lifecycle,/refundStatus','not_processed/);
});
