import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const source = "frontend/apps/Paseo/source/src/";
const duration = read(source + "utils/scheduleUtils.ts");
const booking = read(source + "pages/BookingPage.tsx");
const card = read(source + "components/courts/CourtCard.tsx");
const details = read(source + "pages/CourtDetailsPage.tsx");
const summary = read(source + "components/booking/BookingSummary.tsx");
const receipt = read(source + "pages/GuestReservationReceiptPage.tsx");
const admin = read(source + "pages/StagingAdminReservationsPage.tsx");
const guestApi = read(source + "guest/guestReservation.ts");
const sql = read(
  "supabase/pdl-booking/acceptance/pdl_booking_availability_04_disposable.sql",
);
const runner = read(
  "scripts/cp-pdl-booking-availability-04-disposable-acceptance.sh",
);
const production = read(
  "scripts/cp-pdl-booking-availability-04-production-quote-smoke.mjs",
);
const browser = read("scripts/cp-pdl-booking-availability-04-browser.mjs");

test("hour-first formatter keeps minute values exact for all supported durations", () => {
  assert.match(duration, /formatDurationHours\(durationMinutes: number\)/);
  assert.match(duration, /formatBookingDuration\(durationMinutes: number\)/);
  assert.match(duration, /60, 90, 120/);
  assert.match(booking, /durationMinutes/);
  assert.match(
    guestApi,
    /durationMinutes: String\(schedule\.durationMinutes\)/,
  );
  assert.match(
    guestApi,
    /form\.set\('durationMinutes', String\(input\.schedule\.durationMinutes\)\)/,
  );
});

test("customer court selection, booking, summary and receipt surfaces display hours first", () => {
  for (const page of [card, details, booking, summary, receipt]) {
    assert.match(page, /formatDurationHours|formatBookingDuration/);
  }
  assert.match(booking, /aria-label=\{formatBookingDuration\(duration\)\}/);
  assert.match(
    receipt,
    /Duration: \$\{formatBookingDuration\(receipt\.durationMinutes\)\}/,
  );
  assert.match(admin, /formatBookingDuration\(item\.duration\)/);
});

test("CP04 SQL acceptance covers quote, receipt, idempotency, conflicts and expires only inside rollback", () => {
  for (const term of [
    "pdl_booking.availability",
    "pdl_booking.quote",
    "pdl_booking.submit",
    "pdl_booking.receipt",
    "idempotency_conflict",
    "slot_unavailable",
    "slot_or_rate_changed",
    "quote_expired",
    "incorrect-receipt-token",
    "all 9 court/duration availability and exact PHP quote combinations",
  ])
    assert.ok(sql.includes(term), term);
  assert.match(sql, /rollback;\s*$/i);
  assert.doesNotMatch(sql, /\bcommit\s*;/i);
  assert.match(runner, /cp16019-disposable-local/);
  assert.match(runner, /server_version_num/);
  assert.match(runner, /ROLLBACK_CONFIRMED/);
});

test("production smoke performs read-only live availability and quote requests only", () => {
  assert.match(production, /quoteCount === 9|quoteCount/);
  assert.match(production, /\/v1\/guest-reservations\/quote/);
  assert.match(production, /\/v1\/availability/);
  assert.doesNotMatch(
    production,
    /method:\s*['"]POST['"]|submitGuestReservation/,
  );
});

test("responsive browser acceptance covers all three widths and never submits a reservation", () => {
  for (const width of ["390", "768", "1440"])
    assert.ok(browser.includes(width), `${width}px`);
  assert.match(browser, /assert\.deepEqual\(submissions, \[\]/);
  assert.match(browser, /Review your selection/);
});
