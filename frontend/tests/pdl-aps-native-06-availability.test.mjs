import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read(
  "supabase/pdl-booking/source/migrations/20261122150000_pdl_exclude_past_same_day_slots.sql",
);
const bookingPage = read(
  "frontend/apps/Paseo/source/src/pages/BookingPage.tsx",
);
const courtMap = read(
  "frontend/apps/Paseo/source/src/components/courts/InteractiveCourtMap.tsx",
);
const browser = read("scripts/pdl-aps-native-browser.mjs");
const workflow = read(".github/workflows/pdl-aps-native-01.yml");
const acceptance = read(
  "supabase/pdl-booking/acceptance/pdl_booking_availability_03_disposable.sql",
);

test("same-day interval validation uses the venue timezone and rejects past start times", () => {
  assert.match(
    migration,
    /p_date > \(now\(\) at time zone 'Asia\/Manila'\)::date/,
  );
  assert.match(
    migration,
    /p_start > extract\(hour from \(now\(\) at time zone 'Asia\/Manila'\)\)::integer\*60/,
  );
  assert.match(migration, /pdl_booking\.is_valid_interval/);
});

test("dynamic availability removes past same-day starts and preserves the existing response contract", () => {
  assert.match(migration, /current_minute/);
  assert.match(
    migration,
    /r\.booking_date > r\.today or starts\.start_minute > r\.current_minute/,
  );
  assert.match(migration, /'bookingEnabled'/);
  assert.match(migration, /'availabilityReason'/);
  assert.match(migration, /'source','server'/);
  assert.match(migration, /pdl_booking\.is_available/);
});

test("public booking copy reflects live availability and server-priced review", () => {
  assert.match(bookingPage, /LIVE SERVER AVAILABILITY/);
  assert.match(
    bookingPage,
    /Live availability and PHP pricing are checked against the reservation service/,
  );
  assert.match(bookingPage, /Server quote at review/);
  assert.match(
    read(
      "frontend/apps/Paseo/source/src/components/booking/BookingSummary.tsx",
    ),
    /Server quote at review/,
  );
  assert.doesNotMatch(
    bookingPage,
    /Courts awaiting venue approval are not available for booking/,
  );
  assert.doesNotMatch(bookingPage, /COURT AVAILABILITY SUBJECT TO APPROVAL/);
  assert.match(
    courtMap,
    /Price: Confirm at booking · Availability: Check schedule/,
  );
});

test("native Pages browser acceptance chooses tomorrow before testing the full slot grid", () => {
  assert.match(browser, /const tomorrow=new Date\(Date\.UTC/);
  assert.match(browser, /getByRole\('button',\{name:'8:00 AM, available'\}\)/);
  assert.doesNotMatch(browser, /6:00 AM, available/);
});

test("canonical workflow includes the migration and disposable SQL acceptance rolls back all fixture writes", () => {
  assert.match(workflow, /pdl_exclude_past_same_day_slots/);
  assert.match(acceptance, /\bbegin;/i);
  assert.match(acceptance, /rollback;\s*$/i);
  assert.match(acceptance, /pdl_booking\.quote/);
  assert.match(acceptance, /pdl_booking\.submit/);
  assert.match(acceptance, /pdl_booking\.receipt/);
});
