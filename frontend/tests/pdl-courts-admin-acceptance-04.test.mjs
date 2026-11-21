import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src = readFileSync('frontend/apps/Paseo/source/src/pages/AdminAcceptancePage.tsx','utf8');
const router = readFileSync('frontend/apps/Paseo/source/src/app/router.tsx','utf8');
const overview = readFileSync('frontend/apps/Paseo/source/src/pages/AdminOverviewPage.tsx','utf8');
const browser = readFileSync('scripts/pdl-aps-native-browser.mjs','utf8');

test('readback reuses the same signed administrator shell and a same-tab route',()=>{
 assert.match(router,/path: '\/admin\/acceptance'/);
 assert.match(src,/<AdminShell title="Workspace status/);
 assert.match(overview,/to="\/admin\/acceptance"/);
 assert.match(src,/backendAdminFetch\(path, \{ cache: 'no-store', signal \}\)/);
});

test('all seven modules are represented, with no mutation requests',()=>{
 for (const name of ['Court Settings','Court Calendar','Bookings','Pricing','Payments','Customers','Settings']) {
  assert.ok(src.includes(`name: '${name}'`),name);
 }
 for(const path of ['/v1/admin/courts','/v1/admin/calendar','/v1/admin/reservations/page',
   '/v1/payment-methods','/v1/admin/policies']) assert.ok(src.includes(path),path);
 assert.doesNotMatch(src,/method: ['"](POST|PUT|PATCH|DELETE)['"]/);
 assert.match(src,/This checks section availability only/);
});

test('browser acceptance verifies repeat and zero write requests',()=>{
 assert.match(browser,/7 of 7 sections available/);
 assert.match(browser,/readback must not change persisted data/);
 assert.match(browser,/seven-module same-tab server readback, manual retry/);
});
