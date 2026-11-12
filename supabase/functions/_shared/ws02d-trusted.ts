/**
 * WS02D / WS11 / BS11 trusted Edge transport, STAGING CANDIDATE.
 * Never called without verified GoTrue user + live signed SQL session.
 * Uses private SECURITY DEFINER routines over an isolated DB transaction;
 * no browser EXECUTE grants, no service-role JWT impersonation.
 *
 * SAFETY: All UI flags and private invitation SQL flags remain disabled.
 * Do not deploy/activate without staging negative tests and delivery review.
 */
import postgres from 'npm:postgres@3.4.5';

type Route = 'invite' | 'accept' | 'manage' | 'board';
type ObjectMap = Record<string, unknown>;
type VerifiedActor = { id: string; claims: {sub: string; session_id: string; role: 'authenticated'} };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/;
const MAX_BYTES = 4096;
const DEFAULT_ORIGIN = 'https://wass-psti.github.io';
const userId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const dataObject = (v: unknown): v is ObjectMap =>
  !!v && typeof v === 'object' && !Array.isArray(v);
class RouteError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const fail = (status: number, msg: string): never => { throw new RouteError(status, msg); };

function cors(req: Request) {
  const origin = req.headers.get('origin');
  const allowed = Deno.env.get('APSYNTRA_ALLOWED_ORIGIN') || DEFAULT_ORIGIN;
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    'pragma': 'no-cache',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'vary': 'Origin',
    ...(origin === allowed ? {
      'access-control-allow-origin': allowed,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization,apikey,content-type',
    } : {}),
  };
}
function respond(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}
function key(): string {
  const old = Deno.env.get('SUPABASE_ANON_KEY');
  if (old) return old;
  const modern = Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (modern) return modern;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
    if (typeof keys.default === 'string') return keys.default;
  } catch { /* fail closed */ }
  return fail(503, 'Auth configuration unavailable');
}
function decodeClaims(token: string): ObjectMap {
  try {
    const chunk = token.split('.')[1];
    if (!chunk) return fail(401, 'Invalid user token');
    const pad = chunk.replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(atob(pad.padEnd(Math.ceil(pad.length / 4) * 4, '=')));
    if (!dataObject(parsed)) return fail(401, 'Invalid user token');
    return parsed;
  } catch { return fail(401, 'Invalid user token'); }
}
async function verifyUser(req: Request): Promise<VerifiedActor> {
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9._-]{50,8192}$/.test(auth))
    return fail(401, 'User session required');
  const token = auth.slice(7);
  const url = Deno.env.get('SUPABASE_URL');
  if (!url || !/^https?:\/\//.test(url)) return fail(503, 'Auth configuration unavailable');
  // A parsed JWT is never trusted until GoTrue validates it with getUser.
  const claims = decodeClaims(token);
  if (!userId(claims.sub) || !userId(claims.session_id) ||
      claims.role !== 'authenticated')
    return fail(401, 'Authenticated session required');
  let res: Response;
  try {
    res = await fetch(new URL('/auth/v1/user', url), {
      method: 'GET', headers: { authorization: auth, apikey: key() },
      signal: AbortSignal.timeout(10000),
    });
  } catch { return fail(503, 'Authentication temporarily unavailable'); }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return fail(401, 'Reauthenticate');
    return fail(503, 'Authentication temporarily unavailable');
  }
  let user: unknown;
  try { user = await res.json(); } catch { return fail(503, 'Auth response invalid'); }
  if (!dataObject(user) || user.id !== claims.sub ||
      typeof user.email !== 'string' || !user.email_confirmed_at ||
      user.is_anonymous === true)
    return fail(403, 'Verified user required');
  return { id: claims.sub, claims: {
    sub: claims.sub, session_id: claims.session_id, role: 'authenticated',
  }};
}
// The direct database password/URL is server-only; no service-role token is
// put into the request JWT. Each call sets the signed claims transaction-locally.
let database: ReturnType<typeof postgres> | null = null;
function db() {
  const url = Deno.env.get('SUPABASE_DB_URL');
  if (!url) return fail(503, 'Database connection unavailable');
  if (!database) database = postgres(url, {
    prepare: false, max: 2, idle_timeout: 3, connect_timeout: 5,
  });
  return database;
}
async function trustedSql(actor: VerifiedActor, route: Route, body: ObjectMap): Promise<ObjectMap> {
  const sql = db();
  return await sql.begin(async tx => {
    await tx`SELECT pg_catalog.set_config('request.jwt.claims', ${JSON.stringify(actor.claims)}, true)`;
    // Rechecks GoTrue session, verification, profile and workspace membership.
    await tx`SELECT private.ws01_signed_actor_session()`;
    let rows;
    if (route === 'invite') {
      rows = await tx`SELECT private.ws02d_issue(
        ${body.workspaceId}::uuid, ${body.email}::text,
        'member'::text, ${body.requestId}::uuid) AS receipt`;
      const issue = rows[0]?.receipt;
      if (!dataObject(issue) || !userId(issue.invitationId))
        return fail(503, 'Invalid issuance receipt');
      // Atomic issue + delivery-ledger preparation: rollback both on failure.
      const prepared = await tx`SELECT private.ws02d_delivery_prepare(
        ${body.workspaceId}::uuid, ${issue.invitationId}::uuid,
        ${body.requestId}::uuid) AS receipt`;
      const preparation = prepared[0]?.receipt;
      if (!dataObject(preparation)) return fail(503, 'Invalid delivery state');
      return { ...issue, deliveryState: preparation.deliveryState,
        providerEmailId: preparation.providerEmailId };
    } else if (route === 'accept') {
      rows = await tx`SELECT private.ws02d_accept(${body.token}::text) AS receipt`;
    } else if (route === 'manage' && body.operation === 'list') {
      rows = await tx`SELECT private.ws11_list_invitations(
        ${body.workspaceId}::uuid) AS receipt`;
      const listing = rows[0]?.receipt;
      if (!dataObject(listing)) return fail(503, 'Invalid listing receipt');
      const deliveries = await tx`SELECT private.ws02d_delivery_list(
        ${body.workspaceId}::uuid) AS receipt`;
      const delivery = deliveries[0]?.receipt;
      if (!dataObject(delivery) || !Array.isArray(delivery.delivery))
        return fail(503, 'Invalid delivery listing');
      return { ...listing, delivery: delivery.delivery };
    } else if (route === 'manage' && body.operation === 'revoke') {
      rows = await tx`SELECT private.ws11_revoke_invitation(
        ${body.workspaceId}::uuid, ${body.invitationId}::uuid) AS receipt`;
    } else if (route === 'board') {
      rows = await tx`SELECT private.bs11_change_board_access(
        ${body.workspaceId}::uuid, ${body.boardId}::uuid,
        ${body.subjectId}::uuid, ${body.action}::text,
        ${body.requestId}::uuid) AS receipt`;
    } else return fail(400, 'Unsupported operation');
    const receipt = rows[0]?.receipt;
    if (!dataObject(receipt)) return fail(503, 'Invalid database receipt');
    return receipt;
  });
}
function validate(route: Route, input: unknown): ObjectMap {
  if (!dataObject(input)) return fail(400, 'Invalid JSON object');
  const v = input;
  if (route === 'invite') {
    if (!userId(v.workspaceId) || !userId(v.requestId) || v.role !== 'member' ||
        typeof v.email !== 'string') return fail(400, 'Invalid invitation request');
    const email = v.email.trim().toLowerCase();
    if (email.length < 6 || email.length > 254 || !EMAIL.test(email) ||
        (v.message != null && (typeof v.message !== 'string' ||
        v.message.length > 500 || /[\u0000-\u001f\u007f]/.test(v.message))))
      return fail(400, 'Invalid invitation request');
    return { workspaceId: v.workspaceId, requestId: v.requestId,
      email, role: 'member', message: typeof v.message === 'string' ? v.message.trim() : '' };
  }
  if (route === 'accept') {
    if (typeof v.token !== 'string' || !TOKEN.test(v.token))
      return fail(400, 'Invalid invitation token');
    return { token: v.token };
  }
  if (route === 'manage') {
    if (!userId(v.workspaceId) || !['list', 'revoke'].includes(String(v.operation)))
      return fail(400, 'Invalid management request');
    if (v.operation === 'revoke' && (!userId(v.invitationId) || !userId(v.requestId)))
      return fail(400, 'Invalid revocation request');
    return v;
  }
  if (v.operation !== 'change-board-access' || !dataObject(v.request))
    return fail(400, 'Only exact-board member access is supported');
  const r = v.request;
  if (!userId(r.workspaceId) || !userId(r.boardId) || !userId(r.requestId) ||
      r.workspaceId !== v.workspaceId && v.workspaceId !== undefined ||
      r.subjectType !== 'member' || !userId(r.subjectId) ||
      !['grant', 'revoke'].includes(String(r.action)) || r.role !== 'viewer')
    return fail(400, 'Invalid board access request');
  return { workspaceId: r.workspaceId, boardId: r.boardId, subjectId: r.subjectId,
    requestId: r.requestId, action: r.action };
}
/**
 * Record only a provider API outcome, never the acceptance token.
 * Recording uses the same verified caller + live session as issuance.
 */
async function recordDelivery(
  actor: VerifiedActor, workspaceId: unknown, invitationId: unknown,
  outcome: 'submitted' | 'uncertain' | 'rejected', providerId: string | null,
): Promise<ObjectMap> {
  const sql = db();
  const rows = await sql.begin(async tx => {
    await tx`SELECT pg_catalog.set_config('request.jwt.claims', ${JSON.stringify(actor.claims)}, true)`;
    await tx`SELECT private.ws01_signed_actor_session()`;
    return await tx`SELECT private.ws02d_delivery_record(
      ${workspaceId}::uuid, ${invitationId}::uuid,
      ${outcome}::text, ${providerId}::text) AS receipt`;
  });
  const receipt = rows[0]?.receipt;
  if (!dataObject(receipt)) return fail(503, 'Invalid delivery record');
  return receipt;
}

/**
 * One provider submission per issued token. No resend on uncertain timeout,
 * even when the original caller repeats the same request ID. Provider
 * idempotency protects its own limited time window, not the full lifetime.
 */
async function deliver(
  actor: VerifiedActor, request: ObjectMap, receipt: ObjectMap,
): Promise<ObjectMap> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('APSYNTRA_INVITE_FROM');
  const appUrl = Deno.env.get('APSYNTRA_INVITE_APP_URL') ||
    'https://wass-psti.github.io/APSYNTRACRM/';
  if (!apiKey || !from || !appUrl.startsWith('https://'))
    return fail(503, 'Mail delivery not configured');
  if (!userId(receipt.invitationId)) return fail(503, 'Invalid invitation reference');

  // Replay is read-only. Tokens are never returned twice by the SQL issuer.
  // A subsequent manager listing exposes the recorded delivery state.
  if (receipt.idempotent === true) {
    return { invitationId: receipt.invitationId, state: 'already-issued' };
  }
  if (receipt.state !== 'pending' || receipt.deliveryState !== 'prepared' ||
      typeof receipt.token !== 'string' || !TOKEN.test(receipt.token))
    return fail(503, 'Invalid invitation issuance receipt');

  const href = appUrl.replace(/#.*$/, '') +
    '#/invitations/accept/' + receipt.token;
  const msg = typeof request.message === 'string' && request.message ?
    '\nMessage from inviter: ' + request.message + '\n' : '';
  let response: Response | null = null;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'apsyntra-ws02d-' + receipt.invitationId,
      },
      body: JSON.stringify({
        from, to: [request.email], subject: 'APSYNTRA CRM workspace invitation',
        text: 'You have been invited to join a workspace in APSYNTRA CRM.\n' +
          'Sign in with this exact email address, then accept within 24 hours.\n' +
          msg + '\nInvitation: ' + href +
          '\n\nIf unexpected, ignore this message.',
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch { /* timeout/network = uncertain; never retry automatically */ }

  if (response?.ok) {
    let provider: unknown;
    try { provider = await response.json(); } catch { /* uncertainty */ }
    if (dataObject(provider) && typeof provider.id === 'string' &&
        /^[A-Za-z0-9_-]{1,128}$/.test(provider.id)) {
      await recordDelivery(actor, request.workspaceId, receipt.invitationId,
        'submitted', provider.id);
      // HTTP provider acceptance, not verified recipient inbox delivery.
      return { invitationId: receipt.invitationId, state: 'delivery-submitted' };
    }
  }

  // Only a definitive provider rejection can be marked rejected. Transient
  // provider failures and absent receipts remain uncertain, never resent.
  const outcome = response && response.status >= 400 &&
    response.status < 500 && response.status !== 408 && response.status !== 429
    ? 'rejected' : 'uncertain';
  await recordDelivery(actor, request.workspaceId, receipt.invitationId,
    outcome, null);
  return fail(409, 'Invitation delivery requires reconciliation; do not retry');
}
function status(error: unknown): RouteError {
  if (error instanceof RouteError) return error;
  const code = dataObject(error) ? error.code : null;
  if (code === '42501') return new RouteError(403, 'Operation denied');
  if (code === '22023' || code === '22P02') return new RouteError(400, 'Invalid request');
  if (code === '23505' || code === '40001') return new RouteError(409, 'Conflicting request');
  return new RouteError(503, 'Trusted invitation service unavailable');
}
export function serveInvitationRoute(route: Route) {
  Deno.serve(async (req: Request) => {
    const origin = req.headers.get('origin');
    const allowed = Deno.env.get('APSYNTRA_ALLOWED_ORIGIN') || DEFAULT_ORIGIN;
    if (origin !== null && origin !== allowed)
      return respond(req, 403, { state: 'denied' });
    if (req.method === 'OPTIONS') return new Response(null, {
      status: 204, headers: cors(req),
    });
    if (req.method !== 'POST') return respond(req, 405, { state: 'denied' });
    if (!/^application\/json(?:;|$)/i.test(req.headers.get('content-type') || ''))
      return respond(req, 415, { state: 'denied' });
    try {
      // Keep deployment fail-closed even if SQL flags are accidentally enabled.
      if (Deno.env.get('APSYNTRA_INVITES_EDGE_ENABLED') !== 'true')
        return respond(req, 503, { state: 'unavailable' });
      const declared = Number(req.headers.get('content-length') || 0);
      if (declared > MAX_BYTES) return fail(413, 'Payload too large');
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > MAX_BYTES)
        return fail(413, 'Payload too large');
      let input: unknown;
      try { input = JSON.parse(raw); } catch { return fail(400, 'Invalid JSON'); }
      const body = validate(route, input);
      if (route === 'invite' && (!Deno.env.get('RESEND_API_KEY') ||
          !Deno.env.get('APSYNTRA_INVITE_FROM')))
        return fail(503, 'Mail delivery not configured');
      const actor = await verifyUser(req);
      const receipt = await trustedSql(actor, route, body);
      if (route === 'invite') return respond(req, 200, await deliver(actor, body, receipt));
      // Never return bearer secrets or raw SQL error details.
      return respond(req, 200, receipt);
    } catch (error) {
      const e = status(error);
      return respond(req, e.status, { error: e.message });
    }
  });
}
