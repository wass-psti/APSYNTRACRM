import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root='frontend/apps/Paseo/source/src/';
const gate=readFileSync(root+'admin/staging/StagingAdminGate.tsx','utf8');
const skeleton=readFileSync(root+'components/admin/AdminSessionSkeleton.tsx','utf8');
const css=readFileSync(root+'styles/pdl-admin-session-skeleton.css','utf8');
const browser=readFileSync('scripts/pdl-aps-native-browser.mjs','utf8');

test('existing session decision stays asynchronous with exactly the same gate outcome behavior',()=>{
 assert.match(gate,/backendAdminFetch\('\/v1\/admin\/session'/);
 assert.match(gate,/signal: controller\.signal, cache: 'no-store'/);
 assert.match(gate,/return \(\) => controller\.abort\(\)/);
 assert.match(gate,/status === 'checking'\) return <AdminSessionSkeleton \/>/);
 assert.match(gate,/status === 'denied'\) return <Navigate to="\/admin\/sign-in" replace \/>/);
 assert.match(gate,/status === 'unavailable'/);
 assert.match(gate,/Retry session check/);
 assert.doesNotMatch(gate,/Checking administrator session…/);
});

test('the scaffold mirrors the actual hero and horizontal navigation rather than inventing an interactive sidebar',()=>{
 for(const name of ['Stored reservations','Overview','Court settings','Court calendar','Bookings','Pricing','Payments','Customers','Settings']) {
  assert.ok(skeleton.includes(`'${name}'`),name);
 }
 for(const route of ['/admin/live-reservations','/admin/courts','/admin/calendar','/admin/bookings',
  '/admin/pricing','/admin/payments','/admin/customers','/admin/settings'])assert.ok(skeleton.includes(route),route);
 assert.match(skeleton,/className="immersive-admin-heading pdl-session-hero"/);
 assert.match(skeleton,/className="admin-navigation immersive-admin-navigation pdl-session-navigation"/);
 assert.match(skeleton,/role="status" aria-label="Preparing administrator workspace" aria-busy="true"/);
 assert.match(skeleton,/aria-hidden="true"/);
 assert.match(skeleton,/pdl-session-payment-card/);
 assert.doesNotMatch(skeleton,/<button|<a href|<input/);
});

test('skeleton obeys reduced-motion and responsive layouts',()=>{
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
 assert.match(css,/@media \(max-width: 800px\)/);
 assert.match(css,/@media \(max-width: 500px\)/);
 assert.match(css,/grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
 assert.match(browser,/session skeleton preserves admin hero\/navigation\/forms and transitions after verification/);
 assert.match(browser,/payment skeleton shows three cards, denied session keeps existing sign-in behavior/);
});
