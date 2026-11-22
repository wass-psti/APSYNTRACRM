import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../node_modules/playwright/index.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(repositoryRoot, 'paseo');
const basePath = '/APSYNTRACRM/paseo';
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    if (!pathname.startsWith(basePath)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const relativePath = pathname.slice(basePath.length).replace(/^\/+/, '');
    let filePath = resolve(publicRoot, relativePath || 'index.html');
    if (filePath !== publicRoot && !filePath.startsWith(publicRoot + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    try {
      if (!(await stat(filePath)).isFile()) throw new Error('Not a file');
    } catch {
      if (extname(filePath)) {
        response.writeHead(404).end('Not found');
        return;
      }
      filePath = resolve(publicRoot, 'index.html');
    }
    response.writeHead(200, { 'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream' });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(400).end('Invalid request');
  }
});
await new Promise((resolveListen, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveListen);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Could not start local Pages preview server');
const baseUrl = (process.env.PDL_BROWSER_BASE_URL ?? `http://127.0.0.1:${address.port}${basePath}`).replace(/\/$/, '');
const durations = [
  { minutes: 60, button: '1 hour (60 minutes)', label: '1 hour (60 minutes)' },
  { minutes: 90, button: '1.5 hours (90 minutes)', label: '1.5 hours (90 minutes)' },
  { minutes: 120, button: '2 hours (120 minutes)', label: '2 hours (120 minutes)' },
];

function tomorrowLabel() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const date = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const value = new Date(Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day) + 1));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  }).format(value);
}

const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    const page = await context.newPage();
    const errors = [];
    const failed = [];
    const submissions = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => failed.push(request.url()));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() === 'POST' && url.pathname.endsWith('/v1/guest-reservations')) {
        submissions.push(request.url());
      }
    });
    // Deterministic local browser fixture; the separate production quote smoke
    // exercises the actual Supabase availability and quote endpoints.
    await page.route(/\/v1\/availability\?/, async (route) => {
      const url = new URL(route.request().url());
      const durationMinutes = Number(url.searchParams.get('durationMinutes'));
      const slots = Array.from({ length: 28 }, (_, index) => ({
        startMinute: 480 + index * 30,
        status: 'available',
      })).filter((slot) => slot.startMinute + durationMinutes <= 1440);
      await route.fulfill({ json: {
        source: 'server', bookingEnabled: true, availabilityReason: null,
        courtId: url.searchParams.get('courtId'), date: url.searchParams.get('date'),
        durationMinutes, slots,
      } });
    });
    await page.route(/\/v1\/guest-reservations\/quote\?/, async (route) => {
      const url = new URL(route.request().url());
      const durationMinutes = Number(url.searchParams.get('durationMinutes'));
      const amountMinor = durationMinutes === 60 ? 15000 : durationMinutes === 90 ? 22500 : 30000;
      await route.fulfill({ json: {
        courtId: url.searchParams.get('courtId'), date: url.searchParams.get('date'),
        startMinute: Number(url.searchParams.get('startMinute')), durationMinutes,
        amountMinor, currency: 'PHP', quoteToken: 'a4000000-0000-4000-8000-000000000001',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      } });
    });

    await page.goto(`${baseUrl}/courts`, { waitUntil: 'networkidle', timeout: 30000 });
    const courtCards = page.locator('.court-card');
    await courtCards.first().waitFor();
    assert.equal(await courtCards.count(), 3);
    for (const card of await courtCards.all()) {
      await card.getByText(/1 hour \(60 minutes\).*1\.5 hours \(90 minutes\).*2 hours \(120 minutes\)/).waitFor();
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);

    await page.goto(`${baseUrl}/book?court=court-1`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.getByText('LIVE SERVER AVAILABILITY').waitFor();
    await page.getByText('Available times updated.').waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: tomorrowLabel() }).click();

    for (const duration of durations) {
      await page.getByRole('button', { name: duration.button }).click();
      await page.getByRole('button', { name: '8:00 AM, available' }).waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: '8:00 AM, available' }).click();
      const summary = page.locator('.immersive-booking-summary');
      await summary.getByText(duration.label).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }

    await page.getByRole('button', { name: /continue to customer details/i }).click();
    await page.getByRole('heading', { name: 'Your details.' }).waitFor();
    await page.locator('.immersive-draft-summary').getByText('2 hours').waitFor();
    await page.locator('#customer-name').fill('Duration Display QA');
    await page.locator('#customer-email').fill('duration-display-qa@example.test');
    await page.locator('#customer-phone').fill('09170000004');
    await page.getByRole('button', { name: 'Review details' }).click();
    await page.getByRole('heading', { name: 'Review your selection.' }).waitFor();
    await page.locator('.immersive-draft-summary').getByText('2 hours').waitFor();
    await page.getByText('Booking amount received. Payment still needs review.').waitFor({ timeout: 20000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.deepEqual(submissions, [], 'browser acceptance must not submit a reservation');
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    console.log(`PASS ${width}px: court selection, three hour-first durations, live availability, customer form, review quote and no reservation submission`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
