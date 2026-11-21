import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminShell } from '../components/admin/AdminShell';
import { backendAdminFetch, sharedSupabaseAdminEnabled } from '../admin/staging/StagingAdminGate';

type ModuleName = 'Court Settings' | 'Court Calendar' | 'Bookings' | 'Pricing' |
  'Payments' | 'Customers' | 'Settings';
type CheckResult = { name: ModuleName; passed: boolean; details: string };

/** Read-only, same-tab checks; no session export, mutations or new permission rules. */
async function checkAdministration(signal: AbortSignal): Promise<CheckResult[]> {
  const resources = [
    '/v1/admin/courts',
    '/v1/admin/calendar',
    '/v1/admin/reservations/page?limit=25&q=',
    '/v1/payment-methods',
    '/v1/admin/policies',
  ];
  const responses = await Promise.all(resources.map(async path => {
    try {
      const response = await backendAdminFetch(path, { cache: 'no-store', signal });
      if (!response.ok) return { ok: false, data: null };
      return { ok: true, data: await response.json() as Record<string, unknown> };
    } catch {
      return { ok: false, data: null };
    }
  }));
  const [court, calendar, booking, payment, settings] = responses;
  const courts = court?.data?.courts;
  const hasCourts = Boolean(court?.ok) && Array.isArray(courts);
  const hasRates = hasCourts && courts?.every((item: { rates?: unknown }) => Array.isArray(item?.rates));
  const hasCalendar = Boolean(calendar?.ok) && Array.isArray(calendar?.data?.weekdays) &&
    Array.isArray(calendar?.data?.blocks);
  const records = booking?.data?.reservations;
  const hasBookings = Boolean(booking?.ok) && Array.isArray(records);
  const hasPayments = Boolean(payment?.ok) && Array.isArray(payment?.data?.methods);
  const policy = settings?.data;
  const hasPolicy = Boolean(settings?.ok) && Number.isInteger(policy?.reservationLeadHours) &&
    Number.isInteger(policy?.arrivalGraceMinutes) && typeof policy?.publicNotice === 'string';
  const customers = hasBookings ? new Set(records.map(item =>
    typeof item?.email === 'string' ? item.email.toLowerCase() : '')).size : 0;

  return [
    { name: 'Court Settings', passed: hasCourts, details: hasCourts ? `${courts?.length ?? 0} court records loaded` : 'Court data unavailable' },
    { name: 'Court Calendar', passed: hasCalendar, details: hasCalendar ? 'Weekdays and maintenance records loaded' : 'Calendar data unavailable' },
    { name: 'Bookings', passed: hasBookings, details: hasBookings ? `${records?.length ?? 0} reservations in first page` : 'Booking data unavailable' },
    { name: 'Pricing', passed: hasRates, details: hasRates ? 'Court rate collections loaded' : 'Rate data unavailable' },
    { name: 'Payments', passed: hasPayments && hasBookings, details: hasPayments && hasBookings ? 'Payment methods and booking payment states loaded' : 'Payment readback unavailable' },
    { name: 'Customers', passed: hasBookings, details: hasBookings ? `${customers} distinct contacts in first reservation page` : 'Customer readback unavailable' },
    { name: 'Settings', passed: hasPolicy, details: hasPolicy ? 'Operational policies loaded' : 'Policy data unavailable' },
  ];
}

export function AdminAcceptancePage() {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!sharedSupabaseAdminEnabled) { setRunning(false); return; }
    const controller = new AbortController();
    setRunning(true);
    void checkAdministration(controller.signal).then(value => {
      if (!controller.signal.aborted) setResults(value);
    }).finally(() => {
      if (!controller.signal.aborted) setRunning(false);
    });
    return () => controller.abort();
  }, [revision]);

  const passed = results.filter(result => result.passed).length;
  return <AdminShell title="Administration readback.">
    <p className="page-lede">Read-only verification of the seven administration modules using this browser tab's existing session. No settings or records are changed.</p>
    <section className="booking-panel" aria-label="Seven-module readback">
      <h2 className="review-heading">Existing server data checks</h2>
      <p role="status" aria-live="polite">{running ? 'Checking server data…' :
        !sharedSupabaseAdminEnabled ? 'The shared server is not configured.' :
        `${passed} of 7 read-only checks passed.`}</p>
      {!running && <ul className="admin-block-list">
        {results.map(result => <li key={result.name}>
          <span><strong>{result.name}</strong> — {result.passed ? 'PASS' : 'UNAVAILABLE'}: {result.details}</span>
        </li>)}
      </ul>}
      <p className="booking-help">A successful read is not certification of production writes, full customer history, payment settlement, or independent administrator acceptance.</p>
      <div className="booking-actions">
        <button type="button" className="button button-primary" disabled={running}
          onClick={() => setRevision(value => value + 1)}>Run readback again</button>
        <Link to="/admin" className="button button-secondary">Back to overview</Link>
      </div>
    </section>
  </AdminShell>;
}
