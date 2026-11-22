import assert from 'node:assert/strict';

const apiBase = 'https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/pdl-guest-api';
const venueTimeZone = 'Asia/Manila';
const durations = [60, 90, 120];
const courts = ['court-1', 'court-2', 'court-3'];
const expectedAmounts = new Map([[60, 15000], [90, 22500], [120, 30000]]);

function venueDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: venueTimeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const date = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const value = new Date(Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day) + offsetDays));
  return value.toISOString().slice(0, 10);
}

async function getJson(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${path}: ${JSON.stringify(data)}`);
  }
  return data;
}

const health = await getJson('/v1/health');
assert.equal(health.service, 'pdl-guest-api');
assert.equal(health.projectShared, true);

const bookingDate = venueDate(1);
let quoteCount = 0;
for (const courtId of courts) {
  for (const durationMinutes of durations) {
    const params = new URLSearchParams({
      courtId,
      date: bookingDate,
      durationMinutes: String(durationMinutes),
    });
    const availability = await getJson(`/v1/availability?${params}`);
    assert.equal(availability.source, 'server', `${courtId}/${durationMinutes}: server source`);
    assert.equal(availability.bookingEnabled, true, `${courtId}/${durationMinutes}: booking enabled`);
    assert.ok(Array.isArray(availability.slots), `${courtId}/${durationMinutes}: slots array`);
    const slot = availability.slots.find((item) =>
      item.status === 'available' && Number.isInteger(item.startMinute) &&
      item.startMinute >= 0 && item.startMinute + durationMinutes <= 1440,
    );
    assert.ok(slot, `${courtId}/${durationMinutes}: at least one available slot`);

    const quoteParams = new URLSearchParams({
      courtId,
      date: bookingDate,
      startMinute: String(slot.startMinute),
      durationMinutes: String(durationMinutes),
    });
    const quote = await getJson(`/v1/guest-reservations/quote?${quoteParams}`);
    assert.equal(quote.courtId, courtId);
    assert.equal(quote.date, bookingDate);
    assert.equal(quote.startMinute, slot.startMinute);
    assert.equal(quote.durationMinutes, durationMinutes);
    assert.equal(quote.amountMinor, expectedAmounts.get(durationMinutes));
    assert.equal(quote.currency, 'PHP');
    assert.ok(typeof quote.quoteToken === 'string' && quote.quoteToken.length >= 16);
    assert.ok(Date.parse(quote.expiresAt) > Date.now());
    quoteCount += 1;
    console.log(`PASS production quote ${courtId} / ${durationMinutes} minutes: PHP ${(quote.amountMinor / 100).toFixed(2)} at ${slot.startMinute}`);
  }
}

// The live same-day guard must not advertise a start time that has already passed.
const todayParams = new URLSearchParams({ courtId: 'court-1', date: venueDate(), durationMinutes: '60' });
const todayAvailability = await getJson(`/v1/availability?${todayParams}`);
const currentParts = new Intl.DateTimeFormat('en-US', {
  timeZone: venueTimeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(new Date());
const current = Object.fromEntries(currentParts.map((part) => [part.type, part.value]));
const currentMinute = Number(current.hour) * 60 + Number(current.minute);
for (const slot of todayAvailability.slots ?? []) {
  assert.ok(slot.startMinute > currentMinute, `past same-day start ${slot.startMinute} was advertised`);
}

console.log(`PASS production availability and quote acceptance: ${quoteCount}/9 court-duration combinations; same-day past starts excluded.`);
console.log('No reservation was submitted and no payment or payment-proof object was created. Quotes expire automatically.');
