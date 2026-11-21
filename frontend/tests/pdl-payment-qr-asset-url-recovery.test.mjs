import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = 'frontend/apps/Paseo/source/src/';
const api = readFileSync(root + 'guest/guestReservation.ts', 'utf8');
const admin = readFileSync(root + 'pages/StagingAdminReservationsPage.tsx', 'utf8');
const guest = readFileSync(root + 'pages/GuestQrPaymentPage.tsx', 'utf8');
const browser = readFileSync('scripts/pdl-aps-native-browser.mjs', 'utf8');

test('build QR media URL from the canonical API base rather than internal metadata host', () => {
  assert.match(api, /export function resolveManagedQrImageUrl\(/);
  assert.match(api, /if \(!storedImageUrl \|\| !apiBaseUrl\) return null/);
  assert.match(api, /return `\$\{apiBaseUrl\}\/v1\/payment-methods\/\$\{method\}\/image`/);
});

test('administrator and guest image views use the same canonical URL mapping', () => {
  assert.match(admin, /imageUrl: resolveManagedQrImageUrl\(item\.method, item\.imageUrl\)/);
  assert.match(guest, /imageUrl: resolveManagedQrImageUrl\(item\.method, item\.imageUrl\)/);
});

test('browser acceptance checks broken image fallback and all three restored HTTPS images', () => {
  assert.match(browser, /malformed HTTP QR metadata resolves to three loaded canonical HTTPS image endpoints/);
  assert.match(browser, /QR image unavailable/);
  assert.match(browser, /image\.naturalWidth>0/);
  assert.match(browser, /getComputedStyle\(el\)\.gridTemplateColumns/);
});
