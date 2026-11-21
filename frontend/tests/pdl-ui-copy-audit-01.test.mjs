import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = 'frontend/apps/Paseo/source/src/';
const load = name => readFileSync(src + name, 'utf8');

const auditedViews = [
  'pages/BookingPage.tsx', 'pages/BookingReviewPage.tsx',
  'pages/GuestQrPaymentPage.tsx', 'pages/GuestReservationReceiptPage.tsx',
  'pages/PaymentPage.tsx', 'pages/BookingStatusPage.tsx',
  'pages/ReservationsPage.tsx', 'pages/HowItWorksPage.tsx',
  'pages/CustomerDetailsPage.tsx', 'pages/CourtDetailsPage.tsx',
  'pages/StagingAdminLoginPage.tsx', 'pages/StagingAdminReservationsPage.tsx',
  'pages/AdminOverviewPage.tsx', 'pages/AdminCalendarPage.tsx',
  'pages/AdminSettingsPage.tsx', 'pages/AdminAcceptancePage.tsx',
  'pages/PlaceholderPage.tsx',
  'components/admin/AdminShell.tsx', 'components/layout/SiteLayout.tsx',
  'components/home/BookingSteps.tsx', 'components/booking/BookingProgress.tsx',
  'components/booking/BookingSummary.tsx', 'components/courts/CourtCatalog.tsx',
];

test('public-facing screens omit implementation and diagnostics copy', () => {
  for (const path of auditedViews) {
    const source = load(path);
    for (const phrase of [
      'Shared Supabase backend', 'Supabase booking schema',
      'SQLite staging database', 'Frontend foundation only',
      'Server-authoritative booking rate', 'Backend quote',
      'Seven-module readback', 'Current frontend status',
      'Checking server data', 'from the dedicated Paseo schema',
      'Loading persisted records',
    ]) assert.ok(!source.includes(phrase), `${path} still contains: ${phrase}`);
  }
});

test('guest booking, receipt and payment warnings remain explicit', () => {
  assert.match(load('pages/BookingPage.tsx'), /not yet reserved/);
  assert.match(load('pages/GuestQrPaymentPage.tsx'), /DO NOT SEND MONEY/);
  assert.match(load('pages/GuestQrPaymentPage.tsx'), /does not mean payment is approved/);
  assert.match(load('pages/GuestReservationReceiptPage.tsx'), /not proof that funds arrived/);
  assert.match(load('pages/StagingAdminReservationsPage.tsx'), /No refund will be issued automatically/);
});

test('administrative errors still provide safe next actions', () => {
  assert.match(load('pages/StagingAdminReservationsPage.tsx'), /Refresh before trying again/);
  assert.match(load('pages/AdminCalendarPage.tsx'), /Refresh before trying again/);
  assert.match(load('pages/AdminSettingsPage.tsx'), /Refresh before trying again/);
  assert.match(load('pages/AdminAcceptancePage.tsx'), /sections available/);
});

test('UI copy adjustments preserve the existing application requests and workflows', () => {
  assert.match(load('pages/StagingAdminReservationsPage.tsx'), /backendAdminFetch\(/);
  assert.match(load('pages/AdminCalendarPage.tsx'), /backendAdminFetch\(/);
  assert.match(load('pages/BookingReviewPage.tsx'), /requestReservationQuote\(/);
  assert.match(load('pages/GuestQrPaymentPage.tsx'), /submitGuestReservation\(/);
  assert.match(load('pages/GuestReservationReceiptPage.tsx'), /fetchGuestReceipt\(/);
  assert.match(load('admin/staging/StagingAdminGate.tsx'), /backendAdminFetch\('\/v1\/admin\/session'/);
  assert.match(load('pages/StagingAdminReservationsPage.tsx'), /resolveManagedQrImageUrl/);
});
