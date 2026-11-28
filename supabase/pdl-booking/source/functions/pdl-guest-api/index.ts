/**
 * Paseo de Lomboy isolated Supabase Edge API.
 * Public guest operations cannot directly access shared database tables.
 * Staff operations require a valid Supabase Auth session AND pdl_booking.admin_users membership.
 *
 * All courts/rates are disabled until explicitly approved, so public writes cannot
 * become payable reservations as a side effect of deployment.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getGuestApiBaseUrl } from './_shared/urls.mjs';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const guestApiBaseUrl = supabaseUrl ? getGuestApiBaseUrl(supabaseUrl) : '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const allowedOrigins = new Set(
  (Deno.env.get('PDL_ALLOWED_ORIGINS') ??
    'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174')
    .split(',').map((value) => value.trim()).filter(Boolean),
);
// APSYNTRA's existing GitHub Pages origin hosts the native public booking portal.
// Additive only: preserve every existing configured allowed origin and admin gate.
allowedOrigins.add('https://wass-psti.github.io');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const receiptTokenPattern = /^[0-9a-f-]{72}$/i;
const paymentMethods = new Set(['gcash', 'maya', 'bpi']);
const validMime = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const corsMethods = 'GET, POST, PUT, DELETE, OPTIONS';
const corsHeaders = 'authorization, content-type, idempotency-key, apikey';

function response(body: unknown, status = 200, origin = ''): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'vary': 'Origin',
  };
  if (origin && allowedOrigins.has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = corsMethods;
    headers['access-control-allow-headers'] = corsHeaders;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function invalid(reason: string, status = 400, origin = ''): Response {
  return response({ error: reason }, status, origin);
}

function isValidSchedule(query: URLSearchParams, requireStart = false): boolean {
  const date = query.get('date') ?? '';
  const court = query.get('courtId') ?? '';
  const duration = Number(query.get('durationMinutes'));
  // A date-shaped string like 2026-02-30 is invalid in PostgreSQL. Reject it
  // before the RPC so a caller input error never becomes a server HTTP 500.
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number(date.slice(0, 4)) >= 1 &&
    !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!/^court-[1-9][0-9]*$/.test(court) || !validDate ||
      ![60, 90, 120].includes(duration)) return false;
  const startText = query.get('startMinute');
  if (startText === null) return !requireStart;
  const start = Number(startText);
  return startText.trim() !== '' && Number.isInteger(start) &&
    start >= 0 && start % 30 === 0 && start + duration <= 1440;
}

function signatureValid(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/jpeg') return bytes.length > 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((part, index) => bytes[index] === part);
  if (mime === 'application/pdf') return bytes.length >= 5 &&
    [37, 80, 68, 70, 45].every((part, index) => bytes[index] === part);
  return false;
}

function serviceHeaders(type = 'application/json'): Record<string, string> {
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': type,
  };
}

async function rpc(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await fetch(`${supabaseUrl}/rest/v1/rpc/pdl_backend_v1`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({ p_action: action, p_payload: payload }),
  });
  if (!result.ok) {
    // Do not return Postgres SQL or internal errors to public clients.
    throw new Error(`database_rpc_${result.status}`);
  }
  const data: unknown = await result.json();
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('invalid_rpc_response');
  }
  return data as Record<string, unknown>;
}

async function adminLifecycle(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await fetch(`${supabaseUrl}/rest/v1/rpc/pdl_admin_lifecycle_v1`, {
    method: 'POST', headers: serviceHeaders(),
    body: JSON.stringify({p_action: action, p_payload: payload}),
  });
  if (!result.ok) throw new Error(`database_admin_rpc_${result.status}`);
  const data: unknown = await result.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid_admin_response');
  return data as Record<string, unknown>;
}

async function authenticate(req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
  if (!token || token === serviceKey || token.length > 4096) return null;
  const lookup = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization: `Bearer ${token}` },
  });
  if (!lookup.ok) return null;
  const user = await lookup.json() as { id?: string };
  if (!user.id || !uuidPattern.test(user.id)) return null;
  const permission = await rpc('admin_check', { actorId: user.id });
  return permission.allowed === true ? user.id : null;
}

async function putObject(bucket: string, path: string, bytes: Uint8Array, mime: string): Promise<boolean> {
  const result = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { ...serviceHeaders(mime), 'x-upsert': 'false' },
    body: bytes,
  });
  return result.ok;
}

async function removeObject(bucket: string, path: string): Promise<void> {
  await fetch(`${supabaseUrl}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: serviceHeaders(),
    body: JSON.stringify({ prefixes: [path] }),
  });
}

async function boundedForm(req: Request): Promise<FormData | null> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > 6 * 1024 * 1024) { await reader.cancel(); return null; }
    chunks.push(part.value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  const parsed = new Request('https://example.invalid/', {
    method: 'POST', headers: { 'content-type': req.headers.get('content-type') ?? '' }, body: combined,
  });
  return parsed.formData();
}

async function getObject(bucket: string, key: string): Promise<Response> {
  return fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`, {
    headers: serviceHeaders(),
  });
}

async function submitGuest(req: Request, origin: string): Promise<Response> {
  const key = req.headers.get('idempotency-key') ?? '';
  if (!uuidPattern.test(key)) return invalid('invalid_idempotency_key', 422, origin);
  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > 6 * 1024 * 1024) return invalid('request_too_large', 413, origin);
  const form = await boundedForm(req);
  if (!form) return invalid('request_too_large', 413, origin);
  const file = form.get('proof');
  const quoteToken = form.get('quoteToken');
  const paymentMethod = form.get('paymentMethod');
  const fullName = form.get('fullName');
  const email = form.get('email');
  const phone = form.get('phone');
  const reference = form.get('transactionReference');
  if (!(file instanceof File) || !validMime.has(file.type) || file.size < 5 ||
    file.size > 5 * 1024 * 1024 || typeof quoteToken !== 'string' ||
    !uuidPattern.test(quoteToken) || typeof paymentMethod !== 'string' ||
    !paymentMethods.has(paymentMethod) || typeof fullName !== 'string' ||
    fullName.trim().length < 2 || fullName.length > 100 ||
    typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof phone !== 'string' || phone.length < 7 || phone.length > 30 ||
    (reference !== null && (typeof reference !== 'string' || reference.length > 100))) {
    return invalid('invalid_submission', 422, origin);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!signatureValid(bytes, file.type)) return invalid('invalid_proof_format', 422, origin);
  // Payment cannot proceed if the configured method has no private, admin-uploaded
  // QR asset. Never take a payment against a bundled demonstration QR.
  const qrMetadata = await rpc('qr_meta', { method: paymentMethod });
  if (qrMetadata.error || typeof qrMetadata.path !== 'string' || !qrMetadata.path) {
    return invalid('payment_method_not_configured', 409, origin);
  }
  // A database QR reference is not enough: the underlying private object may
  // have been lost, replaced or never successfully uploaded. Require an actual
  // storage read before accepting any payment evidence.
  try {
    const qrObject = await getObject('pdl-payment-qr', qrMetadata.path);
    if (!qrObject.ok || !['image/jpeg', 'image/png'].includes(
      qrObject.headers.get('content-type')?.split(';')[0] ?? '',
    )) {
      await qrObject.body?.cancel();
      return invalid('payment_qr_unavailable', 409, origin);
    }
    await qrObject.body?.cancel();
  } catch {
    return invalid('payment_qr_unavailable', 409, origin);
  }

  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const proofSha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const suffix = file.type === 'image/jpeg' ? '.jpg' : file.type === 'image/png' ? '.png' : '.pdf';
  // A stable object path prevents repeated uploads from leaking a new private
  // object each time the client retries after a network or database timeout.
  // The content hash prevents an unrelated proof with the same key overwriting it.
  const proofPath = `${key}/${proofSha256}${suffix}`;
  let uploadedThisAttempt = false;
  try {
    if (await putObject('pdl-payment-proofs', proofPath, bytes, file.type)) {
      uploadedThisAttempt = true;
    } else {
      // A storage conflict may be a legitimate same-key retry. Inspect the
      // previously uploaded object before proceeding; never silently replace it.
      const prior = await getObject('pdl-payment-proofs', proofPath);
      if (!prior.ok) return invalid('proof_storage_unavailable', 503, origin);
      const stored = new Uint8Array(await prior.arrayBuffer());
      const storedDigest = await crypto.subtle.digest('SHA-256', stored);
      const storedSha = [...new Uint8Array(storedDigest)]
        .map((byte) => byte.toString(16).padStart(2, '0')).join('');
      if (storedSha !== proofSha256) return invalid('idempotency_proof_conflict', 409, origin);
    }
  } catch {
    return invalid('proof_storage_unavailable', 503, origin);
  }
  try {
    const database = await rpc('submit', {
      quoteToken, idempotencyKey: key,
      fullName: fullName.trim(), email: email.trim(), phone: phone.trim(),
      paymentMethod, transactionReference: reference ?? '',
      proofPath, proofMime: file.type, proofSha256,
    });
    if (database.error) {
      // Only the object created in this attempt is safe to discard. An earlier
      // successful or uncertain attempt may already reference the same path.
      if (uploadedThisAttempt) {
        try { await removeObject('pdl-payment-proofs', proofPath); } catch { /* best effort */ }
      }
      return invalid(String(database.error), database.error === 'slot_or_rate_changed' ||
        database.error === 'quote_expired' || database.error === 'idempotency_conflict' ||
        database.error === 'quote_consumed' ? 409 : 422, origin);
    }
    if (!database.receipt || typeof database.receipt !== 'object') {
      // Outcome uncertain: never delete proof while a committed booking may refer to it.
      return invalid('reservation_outcome_uncertain_retry_same_key', 503, origin);
    }
    return response({
      ...(database.receipt as Record<string, unknown>),
      replayed: database.replayed === true,
    }, database.replayed === true ? 200 : 201, origin);
  } catch {
    // Uncertain transaction outcome: never delete a proof that may have committed.
    // The client may retry with its stable Idempotency-Key; cleanup requires reconciliation.
    return invalid('reservation_outcome_uncertain_retry_same_key', 503, origin);
  }
}

async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS') {
    if (origin && !allowedOrigins.has(origin)) return invalid('origin_not_allowed', 403);
    const responseHeaders: Record<string, string> = {
      'access-control-allow-methods': corsMethods,
      'access-control-allow-headers': corsHeaders,
      'cache-control': 'no-store',
    };
    if (origin) responseHeaders['access-control-allow-origin'] = origin;
    return new Response(null, { status: 204, headers: responseHeaders });
  }
  if (origin && !allowedOrigins.has(origin)) return invalid('origin_not_allowed', 403);
  if (!supabaseUrl || !serviceKey || !anonKey) return invalid('service_not_configured', 503, origin);

  const url = new URL(req.url);
  const start = url.pathname.indexOf('/v1/');
  if (start < 0) return invalid('not_found', 404, origin);
  const route = url.pathname.slice(start);

  try {
    if (req.method === 'GET' && route === '/v1/health') {
      return response({ service: 'pdl-guest-api', projectShared: true, paymentsLive: false }, 200, origin);
    }
    if (req.method === 'GET' && route === '/v1/availability') {
      if (!isValidSchedule(url.searchParams)) return invalid('invalid_schedule', 422, origin);
      const data = await rpc('availability', {
        courtId: url.searchParams.get('courtId'), date: url.searchParams.get('date'),
        durationMinutes: Number(url.searchParams.get('durationMinutes')),
      });
      return data.error ? invalid(String(data.error), 422, origin) : response(data, 200, origin);
    }
    if (req.method === 'GET' && route === '/v1/guest-reservations/quote') {
      if (!isValidSchedule(url.searchParams, true)) return invalid('invalid_schedule', 422, origin);
      const data = await rpc('quote', {
        courtId: url.searchParams.get('courtId'), date: url.searchParams.get('date'),
        startMinute: Number(url.searchParams.get('startMinute')),
        durationMinutes: Number(url.searchParams.get('durationMinutes')),
      });
      return data.error ? invalid(String(data.error),
        data.error === 'rates_not_configured' ? 503 : data.error === 'slot_unavailable' ? 409 : 422, origin)
        : response(data, 200, origin);
    }
    if (req.method === 'POST' && route === '/v1/guest-reservations') {
      return await submitGuest(req, origin);
    }
    const receiptRoute = route.match(/^\/v1\/guest-reservations\/([0-9a-f-]{36})\/receipt$/i);
    if (req.method === 'GET' && receiptRoute) {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
      if (!receiptTokenPattern.test(token)) return invalid('receipt_not_found', 404, origin);
      const data = await rpc('receipt', { reservationId: receiptRoute[1], receiptAccessToken: token });
      return data.error ? invalid('receipt_not_found', 404, origin) : response(data, 200, origin);
    }
    if (req.method === 'GET' && route === '/v1/payment-methods') {
      const data = await rpc('payment_methods', {});
      const prefix = guestApiBaseUrl;
      const methods = Array.isArray(data.methods) ? data.methods.map((item) => {
        const value = item as { method: string; recipient: string; imageUrl: string | null };
        return { ...value, imageUrl: value.imageUrl ? prefix + value.imageUrl : null };
      }) : [];
      return response({ methods }, 200, origin);
    }
    const publicQr = route.match(/^\/v1\/payment-methods\/(gcash|maya|bpi)\/image$/);
    if (req.method === 'GET' && publicQr) {
      const record = await rpc('qr_meta', { method: publicQr[1] });
      if (record.error || typeof record.path !== 'string') return invalid('qr_not_configured', 404, origin);
      const image = await getObject('pdl-payment-qr', record.path);
      if (!image.ok) return invalid('qr_unavailable', 404, origin);
      return new Response(await image.arrayBuffer(), {
        status: 200,
        headers: { 'content-type': String(record.mime), 'cache-control': 'no-store',
          'x-content-type-options': 'nosniff', 'vary': 'Origin',
          ...(origin ? { 'access-control-allow-origin': origin } : {}) },
      });
    }
    if (req.method === 'POST' && route === '/v1/admin/login') {
      const body = await req.json() as { email?: string; password?: string };
      if (typeof body.email !== 'string' || typeof body.password !== 'string' ||
        body.email.length > 254 || body.password.length > 256) {
        return invalid('invalid_login', 401, origin);
      }
      const signed = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anonKey, 'content-type': 'application/json' },
        body: JSON.stringify({ email: body.email, password: body.password }),
      });
      if (!signed.ok) return invalid('invalid_login', 401, origin);
      const session = await signed.json() as {
        access_token?: string; expires_in?: number; user?: { id?: string };
      };
      if (!session.user?.id || !session.access_token) return invalid('invalid_login', 401, origin);
      const allowed = await rpc('admin_check', { actorId: session.user.id });
      if (allowed.allowed !== true) return invalid('administrator_not_configured', 403, origin);
      return response({ accessToken: session.access_token, expiresIn: session.expires_in ?? 3600,
        userId: session.user.id }, 200, origin);
    }
    if (route.startsWith('/v1/admin/')) {
      const actorId = await authenticate(req);
      if (!actorId) return invalid('administrator_auth_required', 401, origin);
      if (req.method === 'GET' && route === '/v1/admin/session') {
        return response({ authenticated: true, actorId }, 200, origin);
      }
      if (req.method === 'GET' && route === '/v1/admin/courts') {
        const data = await rpc('admin_courts', { actorId });
        return data.error ? invalid(String(data.error), 403, origin) : response(data, 200, origin);
      }
      // The admin session is already verified above; no new role or grant is introduced.
      if (req.method === 'GET' && route === '/v1/admin/calendar') {
        const result = await rpc('ops_calendar', { actorId });
        return result.error ? invalid(String(result.error), 403, origin) : response(result, 200, origin);
      }
      if (req.method === 'GET' && route === '/v1/admin/policies') {
        const result = await rpc('ops_policy_get', { actorId });
        return result.error ? invalid(String(result.error), 403, origin) : response(result, 200, origin);
      }
      if (req.method === 'PUT' && route === '/v1/admin/policies') {
        const data = await req.json() as { reservationLeadHours?: number; arrivalGraceMinutes?: number; publicNotice?: string };
        if (!Number.isInteger(data.reservationLeadHours) || data.reservationLeadHours! < 0 || data.reservationLeadHours! > 72 ||
          !Number.isInteger(data.arrivalGraceMinutes) || data.arrivalGraceMinutes! < 0 || data.arrivalGraceMinutes! > 60 ||
          typeof data.publicNotice !== 'string' || data.publicNotice.length > 240) {
          return invalid('invalid_operational_policy', 422, origin);
        }
        const result = await rpc('ops_policy_put', { actorId, ...data });
        return result.error ? invalid(String(result.error), 422, origin) : response(result, 200, origin);
      }
      const weekdayRoute = route.match(/^\/v1\/admin\/calendar\/(court-[1-9][0-9]*)\/weekdays\/([0-6])$/);
      if (weekdayRoute && req.method === 'PUT') {
        const data = await req.json() as { enabled?: boolean; openMinute?: number; closeMinute?: number };
        if (typeof data.enabled !== 'boolean' || !Number.isInteger(data.openMinute) ||
          !Number.isInteger(data.closeMinute) || data.openMinute! < 0 || data.closeMinute! > 1440 ||
          data.openMinute! >= data.closeMinute!) return invalid('invalid_weekday_schedule', 422, origin);
        const result = await rpc('ops_schedule_put', {
          actorId, courtId: weekdayRoute[1], weekday: Number(weekdayRoute[2]), ...data,
        });
        return result.error ? invalid(String(result.error), 422, origin) : response(result, 200, origin);
      }
      if (req.method === 'POST' && route === '/v1/admin/calendar/maintenance') {
        const data = await req.json() as { courtId?: string; date?: string; startMinute?: number; endMinute?: number };
        if (!/^court-[1-9][0-9]*$/.test(data.courtId ?? '') ||
          !/^\d{4}-\d{2}-\d{2}$/.test(data.date ?? '') ||
          !Number.isInteger(data.startMinute) || !Number.isInteger(data.endMinute) ||
          data.startMinute! < 0 || data.endMinute! > 1440 ||
          data.startMinute! >= data.endMinute! || data.startMinute! % 30 !== 0 || data.endMinute! % 30 !== 0) {
          return invalid('invalid_maintenance_block', 422, origin);
        }
        const result = await rpc('ops_block_add', { actorId, ...data });
        return result.error ? invalid(String(result.error), result.error === 'maintenance_conflict' ? 409 : 422, origin)
          : response(result, 201, origin);
      }
      const maintenanceRoute = route.match(/^\/v1\/admin\/calendar\/maintenance\/([0-9a-f-]{36})$/i);
      if (maintenanceRoute && req.method === 'DELETE') {
        if (!uuidPattern.test(maintenanceRoute[1])) return invalid('invalid_maintenance_id', 422, origin);
        const result = await rpc('ops_block_remove', { actorId, id: maintenanceRoute[1] });
        return result.error ? invalid(String(result.error), result.error === 'maintenance_not_found' ? 404 : 422, origin)
          : response(result, 200, origin);
      }
      const courtUpdate = route.match(/^\/v1\/admin\/courts\/(court-[1-9][0-9]*)$/);
      if (courtUpdate && req.method === 'PUT') {
        const data = await req.json() as { enabled?: boolean; openMinute?: number; closeMinute?: number };
        if (typeof data.enabled !== 'boolean' || !Number.isInteger(data.openMinute) ||
          !Number.isInteger(data.closeMinute)) return invalid('invalid_court_config', 422, origin);
        const result = await rpc('configure_court', {
          actorId, courtId: courtUpdate[1], enabled: data.enabled,
          openMinute: data.openMinute, closeMinute: data.closeMinute,
        });
        return result.error ? invalid(String(result.error), 422, origin) : response(result, 200, origin);
      }
      const rateUpdate = route.match(/^\/v1\/admin\/rates\/(court-[1-9][0-9]*)\/(60|90|120)$/);
      if (rateUpdate && req.method === 'PUT') {
        const data = await req.json() as { enabled?: boolean; amountMinor?: number };
        if (typeof data.enabled !== 'boolean' || !Number.isInteger(data.amountMinor)) {
          return invalid('invalid_rate_config', 422, origin);
        }
        const result = await rpc('configure_rate', {
          actorId, courtId: rateUpdate[1], durationMinutes: Number(rateUpdate[2]),
          enabled: data.enabled, amountMinor: data.amountMinor,
        });
        return result.error ? invalid(String(result.error), 422, origin) : response(result, 200, origin);
      }
      const qrUpdate = route.match(/^\/v1\/admin\/payment-methods\/(gcash|maya|bpi)$/);
      if (qrUpdate && req.method === 'PUT') {
        const form = await boundedForm(req);
        if (!form) return invalid('request_too_large', 413, origin);
        const recipient = form.get('recipient');
        const image = form.get('image');
        if (typeof recipient !== 'string' || recipient.trim().length < 2 ||
          recipient.length > 100 || !(image instanceof File) ||
          !['image/jpeg', 'image/png'].includes(image.type) ||
          image.size < 8 || image.size > 2 * 1024 * 1024) {
          return invalid('invalid_qr_update', 422, origin);
        }
        const bytes = new Uint8Array(await image.arrayBuffer());
        if (!signatureValid(bytes, image.type)) return invalid('invalid_qr_format', 422, origin);
        const key = `${qrUpdate[1]}/${crypto.randomUUID()}${image.type === 'image/png' ? '.png' : '.jpg'}`;
        if (!await putObject('pdl-payment-qr', key, bytes, image.type)) {
          return invalid('qr_storage_unavailable', 503, origin);
        }
        try {
          const result = await rpc('update_qr', {
            actorId, method: qrUpdate[1], recipient: recipient.trim(), imagePath: key,
          });
          if (result.error) {
            await removeObject('pdl-payment-qr', key);
            return invalid(String(result.error), 422, origin);
          }
          return response(result, 200, origin);
        } catch {
          return invalid('qr_update_outcome_uncertain', 503, origin);
        }
      }
      const proofRoute = route.match(/^\/v1\/admin\/reservations\/([0-9a-f-]{36})\/proof$/i);
      if (proofRoute && req.method === 'GET') {
        const meta = await rpc('proof_meta', { actorId, reservationId: proofRoute[1] });
        if (meta.error || typeof meta.proofPath !== 'string') return invalid('proof_not_found', 404, origin);
        const proofResponse = await getObject('pdl-payment-proofs', meta.proofPath);
        if (!proofResponse.ok) return invalid('proof_not_found', 404, origin);
        return new Response(await proofResponse.arrayBuffer(), {
          status: 200,
          headers: {
            'content-type': String(meta.proofMime),
            'content-disposition': String(meta.proofMime) === 'application/pdf' ? 'attachment; filename="payment-proof.pdf"' : 'inline',
            'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
            'vary': 'Origin', ...(origin ? { 'access-control-allow-origin': origin } : {}),
          },
        });
      }
      if (req.method === 'GET' && route === '/v1/admin/reservations/page') {
        const limit = url.searchParams.get('limit') ?? '25';
        const beforeCreatedAt = url.searchParams.get('beforeCreatedAt');
        const beforeId = url.searchParams.get('beforeId');
        if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit) ||
          ((beforeCreatedAt===null)!==(beforeId===null)) ||
          (beforeId!==null && !uuidPattern.test(beforeId)) ||
          (beforeCreatedAt!==null && (!Number.isFinite(Date.parse(beforeCreatedAt)) || beforeCreatedAt.length>45))) {
          return invalid('invalid_page', 422, origin);
        }
        const data = await adminLifecycle('page',{actorId,q:url.searchParams.get('q')??'',
          limit:Number(limit),...(beforeCreatedAt?{beforeCreatedAt,beforeId}:{})});
        return data.error ? invalid(String(data.error),422,origin) : response(data,200,origin);
      }
      const cancelRoute = route.match(/^\/v1\/admin\/reservations\/([0-9a-f-]{36})\/cancel$/i);
      if (req.method==='POST' && cancelRoute) {
        const body = await req.json() as {expectedVersion?:number};
        if (!uuidPattern.test(cancelRoute[1]) || !Number.isSafeInteger(body.expectedVersion) ||
          body.expectedVersion!<1) return invalid('invalid_cancellation',422,origin);
        const data = await adminLifecycle('cancel',{actorId,reservationId:cancelRoute[1],
          expectedVersion:body.expectedVersion});
        return data.error ? invalid(String(data.error),
          data.error==='reservation_not_found'?404:data.error==='cancellation_conflict'?409:422,origin)
          : response(data,200,origin);
      }
      if (req.method === 'GET' && route === '/v1/admin/reservations') {
        const data = await rpc('list', { actorId, q: url.searchParams.get('q') ?? '' });
        return data.error ? invalid(String(data.error), 403, origin) : response(data, 200, origin);
      }
      const verification = route.match(/^\/v1\/admin\/reservations\/([0-9a-f-]{36})\/verification$/i);
      if (req.method === 'POST' && verification) {
        const body = await req.json() as { decision?: string; expectedVersion?: number };
        if (!['verified', 'rejected'].includes(body.decision ?? '') ||
          !Number.isInteger(body.expectedVersion)) return invalid('invalid_verification', 422, origin);
        const data = await rpc('verify', { actorId, reservationId: verification[1],
          decision: body.decision, expectedVersion: body.expectedVersion });
        return data.error ? invalid(String(data.error), 409, origin) : response(data, 200, origin);
      }
      if (req.method === 'POST' && route === '/v1/admin/logout') {
        const accessToken = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
        await fetch(`${supabaseUrl}/auth/v1/logout`, {
          method: 'POST', headers: { apikey: anonKey, authorization: `Bearer ${accessToken}` },
        });
        return response({ authenticated: false }, 200, origin);
      }
    }
    return invalid('not_found', 404, origin);
  } catch {
    return invalid('service_operation_failed', 500, origin);
  }
}
Deno.serve(handle);
