/**
 * CP-HULY-SB03: same-origin Connect/Express middleware adapter for WatchdogWorkspace.
 * Uses the existing host and never starts a listener or adds a privileged Supabase client.
 * Mount ahead of the SPA fallback, after any existing host request guards.
 */
import { Readable } from 'node:stream';
import { createHulyRequestHandler } from '../dist/src/http-handler.js';
import { createLiveHulyGateway, createLiveHulyTransactions, createLiveNativeHulyIssues } from '../dist/src/supabase-live.js';

const PREFIX = /^\/api\/v1\/huly(?:\/|$)/;
const NO_CACHE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
};

function fail(res, status, message) {
  if (res.headersSent) { res.destroy?.(); return; }
  res.writeHead(status, NO_CACHE_HEADERS);
  res.end(JSON.stringify({ error: message }));
}

/** Converts one Connect IncomingMessage into a Fetch Request. No body buffering. */
export function createHulyConnectMiddleware(handler, { origin = 'http://127.0.0.1:5173' } = {}) {
  if (typeof handler !== 'function') throw new TypeError('A Huly Request handler is required');
  const host = new URL(origin);
  if (host.hostname !== '127.0.0.1' || host.protocol !== 'http:' || host.port !== '5173') {
    throw new Error('Host must be the approved 127.0.0.1:5173 origin');
  }
  return async (req, res, next) => {
    let path;
    try { path = new URL(req.url ?? '/', host).pathname; }
    catch { fail(res, 400, 'Invalid request path'); return; }
    if (!PREFIX.test(path)) { next(); return; }
    try {
      const method = req.method ?? 'GET';
      const url = new URL(req.url, host);
      if (url.origin !== host.origin) { fail(res, 400, 'Invalid request target'); return; }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers ?? {})) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
      }
      const withBody = method !== 'GET' && method !== 'HEAD';
      const request = new Request(url, {
        method, headers,
        ...(withBody ? { body: Readable.toWeb(req), duplex: 'half' } : {})
      });
      const response = await handler(request);
      if (res.destroyed) return;
      const outgoing = Object.fromEntries(response.headers);
      outgoing['cache-control'] = 'no-store';
      outgoing['x-content-type-options'] = 'nosniff';
      res.writeHead(response.status, outgoing);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      fail(res, 500, 'Huly API failure');
    }
  };
}

/** Set up a middleware without introducing a separate server or database. */
export function createHulyHostMiddleware({ supabaseUrl, publishableKey, fetchImpl } = {}) {
  if (!supabaseUrl || !publishableKey) throw new Error('Supabase URL and publishable key are required');
  const gateway = createLiveHulyGateway(supabaseUrl, publishableKey, fetchImpl);
  const transactions = createLiveHulyTransactions(supabaseUrl, publishableKey, fetchImpl);
  const native = createLiveNativeHulyIssues(supabaseUrl, publishableKey, fetchImpl);
  return createHulyConnectMiddleware(createHulyRequestHandler(gateway, transactions, native));
}

const mounted = new WeakSet();
/** Call after the authoritative Vite/Connect middlewares object exists, before SPA fallback. */
export function mountHulyHost(host, config) {
  const middlewares = host?.middlewares ?? host;
  if (typeof middlewares?.use !== 'function') throw new TypeError('Existing host must provide middlewares.use()');
  if (mounted.has(middlewares)) throw new Error('Huly middleware already mounted');
  const middleware = createHulyHostMiddleware(config);
  middlewares.use(middleware);
  mounted.add(middlewares);
  return middleware;
}

export function createHulyVitePlugin(config) {
  return {
    name: 'apsyntra-huly-supabase-host',
    enforce: 'pre',
    configureServer(server) { mountHulyHost(server, config); }
  };
}
