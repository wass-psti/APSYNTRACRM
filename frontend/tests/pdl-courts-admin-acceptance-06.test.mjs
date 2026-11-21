import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root='frontend/apps/Paseo/source/src/';
const admin=readFileSync(root+'pages/StagingAdminReservationsPage.tsx','utf8');
const calendar=readFileSync(root+'pages/AdminCalendarPage.tsx','utf8');
const settings=readFileSync(root+'pages/AdminSettingsPage.tsx','utf8');
const qr=readFileSync(root+'admin/staging/ManagedQrMethodCard.tsx','utf8');
const browser=readFileSync('scripts/pdl-aps-native-browser.mjs','utf8');

test('court and rate saves require acknowledged writes and exact persisted configuration',()=>{
 assert.match(admin,/Court update was not acknowledged/);
 assert.match(admin,/Court save returned, but the stored configuration did not match/);
 assert.match(admin,/persisted\.enabled !== courtEnabled/);
 assert.match(admin,/persisted\.openMinute !== opening/);
 assert.match(admin,/persisted\.closeMinute !== closing/);
 assert.match(admin,/Rate update was not acknowledged/);
 assert.match(admin,/persisted\.amountMinor !== amountMinor/);
 assert.match(admin,/persisted\.enabled !== rateEnabled/);
});

test('policy and calendar readbacks compare submitted data before claiming success',()=>{
 assert.match(settings,/Policy update was not acknowledged/);
 assert.match(settings,/persisted\.reservationLeadHours !== policy\.reservationLeadHours/);
 assert.match(settings,/persisted\.arrivalGraceMinutes !== policy\.arrivalGraceMinutes/);
 assert.match(settings,/persisted\.publicNotice !== policy\.publicNotice\.trim\(\)/);
 assert.match(calendar,/item\.enabled !== submitted\.enabled/);
 assert.match(calendar,/item\.startMinute !== submitted\.startMinute/);
 assert.match(calendar,/stored\.blocks\.some\(block => block\.id === id\)/);
 assert.match(calendar,/Maintenance removal was not confirmed by server readback/);
});

test('payment QR save requires persisted recipient and available image metadata',()=>{
 assert.match(qr,/const updated = await onSaved\(\)/);
 assert.match(qr,/saved\.recipient !== recipient\.trim\(\)/);
 assert.match(qr,/!saved\.imageUrl/);
 assert.match(qr,/not confirmed by server readback/);
 assert.match(admin,/fetch\(`\$\{configuredGuestApiBase\}\/v1\/payment-methods`, \{cache:'no-store'\}\)/);
});

test('verification after uncertain outcomes never recommends blind retries on failed readback',()=>{
 assert.match(admin,/Verification accepted, but status readback failed/);
 assert.match(admin,/Readback failed\. Do not retry verification until a successful refresh/);
 assert.match(browser,/six false-positive write acknowledgements rejected/);
 assert.match(browser,/persistWrites=false/);
});
