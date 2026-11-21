/** Public production read-only acceptance. Never copies sessions or changes records. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const application = 'https://wass-psti.github.io/APSYNTRACRM/paseo/';
const routes = ['courts', 'calendar', 'bookings', 'pricing', 'payments', 'customers', 'settings', 'acceptance'];
const browser = await chromium.launch({headless: true});
const page = await browser.newPage();
const pageErrors = [];
const writes = [];

page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
    writes.push(request.method() + ' ' + new URL(request.url()).pathname);
  }
});

try {
  for (const route of routes) {
    await page.goto(`${application}admin/${route}`, {waitUntil: 'domcontentloaded'});
    await page.getByRole('heading', {name: /Administrator sign-in/i}).waitFor({timeout: 20000});
    assert.equal(new URL(page.url()).pathname, '/APSYNTRACRM/paseo/admin/sign-in');
    console.log(`PASS anonymous production direct route: ${route} uses existing sign-in`);
  }
  assert.deepEqual(writes, [], 'Read-only acceptance must not send any write requests');
  assert.deepEqual(pageErrors, [], 'Published routes must not produce uncaught browser exceptions');
  console.log('PDL_COURTS_ADMIN_03_ANONYMOUS_PRODUCTION_READONLY_PASS');
} finally {
  await browser.close();
}
