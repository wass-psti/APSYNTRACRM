import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const folder='frontend/apps/Paseo/source/src/';
const router=readFileSync(folder+'app/router.tsx','utf8');
const workspace=readFileSync(folder+'pages/StagingAdminReservationsPage.tsx','utf8');
const browser=readFileSync('scripts/pdl-aps-native-browser.mjs','utf8');
const pages={
 courts:'AdminCourtsPage', calendar:'AdminCalendarPage',bookings:'AdminBookingsPage',
 pricing:'AdminPricingPage',payments:'AdminPaymentsPage',customers:'AdminCustomersPage',
 settings:'AdminSettingsPage',
};

test('all seven administrator routes lazily load actual components rather than redirect',()=>{
 for(const [path,component] of Object.entries(pages)){
  assert.match(router,new RegExp(`path: '/admin/${path}', lazy: async`));
  assert.ok(router.includes(`../pages/${component}`));
  assert.doesNotMatch(router,new RegExp(`path: '/admin/${path}', Component:.*Navigate`));
 }
});

test('administration reuses persisted booking, court and payment operations',()=>{
 for(const section of ['courts','bookings','pricing','payments','customers']){
  const source=readFileSync(`${folder}pages/${pages[section]}.tsx`,'utf8');
  assert.ok(source.includes(`view="${section}"`));
 }
 for(const operation of ['/v1/admin/reservations/page','/v1/admin/courts','/v1/admin/rates/','/v1/admin/reservations/']){
  assert.ok(workspace.includes(operation),operation);
 }
 assert.match(workspace,/Customers from stored reservations/);
 assert.match(workspace,/new Map\(records\.map/);
});

test('calendar and policies retain persisted readback and explicit save',()=>{
 const calendar=readFileSync(`${folder}pages/AdminCalendarPage.tsx`,'utf8');
 const settings=readFileSync(`${folder}pages/AdminSettingsPage.tsx`,'utf8');
 assert.match(calendar,/\/v1\/admin\/calendar/);
 assert.match(settings,/\/v1\/admin\/policies/);
 assert.match(calendar,/await readback\(\)/);
 assert.match(settings,/await readback\(\)/);
});

test('browser acceptance checks every module on direct URL, refresh and history',()=>{
 assert.match(browser,/seven admin module routes: direct link, refresh, tab switching, back\/forward/);
 assert.match(browser,/modules\.goBack\(\)/);
 assert.match(browser,/modules\.goForward\(\)/);
});
