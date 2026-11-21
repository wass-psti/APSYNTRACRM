/**
 * PDL-APS-NATIVE-02: safe read-only public and two-account administrator acceptance.
 * No approvals, payments, role changes, tokens or customer details are printed.
 */
import { pathToFileURL } from 'node:url';

const defaultApi = 'https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/pdl-guest-api';
const pagesOrigin = 'https://wass-psti.github.io';

async function safeRead(request, url, token = '', method = 'GET') {
  try {
    const response = await request(url, {
      method, cache: 'no-store', credentials: 'omit', redirect: 'error',
      signal: AbortSignal.timeout(12000),
      headers: {
        origin: pagesOrigin,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    let body = null;
    if (method !== 'OPTIONS') {
      try { body = await response.json(); } catch { /* invalid body is a failed contract */ }
    }
    return { status: response.status, body, allowedOrigin: response.headers.get('access-control-allow-origin') };
  } catch { return { status: 0, body: null, allowedOrigin: null }; }
}

function statusOf(record) {
  return {
    id: record?.id ?? record?.reservationId,
    booking: record?.booking_status ?? record?.bookingStatus,
    payment: record?.payment_status ?? record?.paymentStatus,
    version: record?.version,
  };
}

export async function inspectNativeReadiness({ request = fetch, api = defaultApi,
  tokenA = '', tokenB = '', reservationId = '' } = {}) {
  const base = api.replace(/\/$/, '');
  const health = await safeRead(request, `${base}/v1/health`);
  const preflight = await safeRead(request, `${base}/v1/health`, '', 'OPTIONS');
  const adminDenied = await safeRead(request, `${base}/v1/admin/reservations?q=`);
  const publicPass = health.status === 200 &&
    health.allowedOrigin === pagesOrigin &&
    health.body && typeof health.body === 'object' &&
    preflight.status === 204 && preflight.allowedOrigin === pagesOrigin;
  const denialPass = adminDenied.status === 401;
  const report = {
    checkpoint: 'PDL-APS-NATIVE-02',
    publicOrigin: publicPass ? 'VERIFIED' : 'FAILED',
    unsignedAdminDenial: denialPass ? 'VERIFIED' : 'FAILED',
    signedPair: 'PENDING',
    reservationReadback: 'PENDING',
    productionFinancialActivation: 'NOT_AUTHORIZED',
    actions: 'READ_ONLY',
  };
  if (!publicPass || !denialPass) return { ...report, decision: 'BLOCKED' };
  if (!tokenA || !tokenB) return { ...report, decision: 'PENDING_SIGNED_SESSIONS' };
  if (tokenA === tokenB) return { ...report, signedPair: 'FAILED', decision: 'BLOCKED' };
  const [a, b] = await Promise.all([
    safeRead(request, `${base}/v1/admin/session`, tokenA),
    safeRead(request, `${base}/v1/admin/session`, tokenB),
  ]);
  if (a.status !== 200 || b.status !== 200 ||
    a.body?.authenticated !== true || b.body?.authenticated !== true ||
    typeof a.body.actorId !== 'string' || !a.body.actorId ||
    typeof b.body.actorId !== 'string' || a.body.actorId === b.body.actorId) {
    return { ...report, signedPair: 'FAILED', decision: 'BLOCKED' };
  }
  report.signedPair = 'VERIFIED';
  const [aRecords, bRecords, courts] = await Promise.all([
    safeRead(request, `${base}/v1/admin/reservations?q=`, tokenA),
    safeRead(request, `${base}/v1/admin/reservations?q=`, tokenB),
    safeRead(request, `${base}/v1/admin/courts`, tokenA),
  ]);
  if (aRecords.status !== 200 || bRecords.status !== 200 || courts.status !== 200 ||
    !Array.isArray(aRecords.body?.reservations) || !Array.isArray(bRecords.body?.reservations) ||
    !Array.isArray(courts.body?.courts)) {
    return { ...report, reservationReadback: 'FAILED', decision: 'BLOCKED' };
  }
  report.courtsConfigured = courts.body.courts.length;
  report.enabledCourts = courts.body.courts.filter(court => court.enabled === true).length;
  report.reservationCountA = aRecords.body.reservations.length;
  report.reservationCountB = bRecords.body.reservations.length;
  if (!reservationId) return { ...report, decision: 'PENDING_PERSISTED_RESERVATION' };
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(reservationId)) {
    return { ...report, reservationReadback: 'FAILED', decision: 'BLOCKED' };
  }
  const stateA = statusOf(aRecords.body.reservations.find(item => statusOf(item).id === reservationId));
  const stateB = statusOf(bRecords.body.reservations.find(item => statusOf(item).id === reservationId));
  const same = stateA.id === reservationId && stateB.id === reservationId &&
    ['pending_verification', 'confirmed', 'rejected', 'cancelled'].includes(stateA.booking) &&
    ['submitted', 'verified', 'rejected'].includes(stateA.payment) &&
    Number.isSafeInteger(stateA.version) &&
    JSON.stringify(stateA) === JSON.stringify(stateB);
  report.reservationReadback = same ? 'VERIFIED' : 'FAILED';
  return { ...report, decision: same ? 'PENDING_FINANCIAL_EVIDENCE' : 'BLOCKED' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await inspectNativeReadiness({
    tokenA: process.env.PDL_ACCEPT_ADMIN_A_JWT ?? '',
    tokenB: process.env.PDL_ACCEPT_ADMIN_B_JWT ?? '',
    reservationId: process.env.PDL_ACCEPT_RESERVATION_ID ?? '',
  });
  console.log(JSON.stringify(report, null, 2));
  // A read-only report never certifies actual money movement or venue approval.
  process.exitCode = 2;
}
