import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { configuredGuestApiBase } from '../../guest/guestReservation';

export const stagingAdminEnabled = import.meta.env.DEV &&
  import.meta.env.VITE_STAGING_ONLY === '1' && configuredGuestApiBase === '/api';
export const sharedSupabaseAdminEnabled = /^https:\/\//.test(configuredGuestApiBase);
export const backendAdminEnabled = stagingAdminEnabled || sharedSupabaseAdminEnabled;
const adminSessionKey = 'pdl-booking-admin-access-token';

export function adminToken(): string {
  try { return window.sessionStorage.getItem(adminSessionKey) ?? ''; }
  catch { return ''; }
}
export function storeAdminToken(token: string): void {
  try { window.sessionStorage.setItem(adminSessionKey, token); } catch { /* no persistent login */ }
}
export function clearAdminToken(): void {
  try { window.sessionStorage.removeItem(adminSessionKey); } catch { /* best effort */ }
}
export function backendAdminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (sharedSupabaseAdminEnabled) {
    const token = adminToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  return fetch(`${configuredGuestApiBase}${path}`, {
    ...options, credentials: stagingAdminEnabled ? 'same-origin' : 'omit',
    headers,
  }).then(response => {
    // A revoked or expired Supabase session must not remain eligible for later
    // administrator actions. Local staging retains its server-issued cookie flow.
    if (sharedSupabaseAdminEnabled && response.status === 401 && path.startsWith('/v1/admin/')) {
      clearAdminToken();
    }
    return response;
  });
}

/** Frontend convenience only; every sensitive backend route independently checks the session. */
export function StagingAdminGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking');
  useEffect(() => {
    if (!backendAdminEnabled) { setStatus('allowed'); return; }
    const controller = new AbortController();
    backendAdminFetch('/v1/admin/session', {
      signal: controller.signal, cache: 'no-store',
    }).then(response => {
      if (!controller.signal.aborted) setStatus(response.ok ? 'allowed' : 'denied');
    }).catch(() => {
      if (!controller.signal.aborted) setStatus('denied');
    });
    return () => controller.abort();
  }, []);
  if (status === 'checking') return <div className="container section" role="status">Checking administrator session…</div>;
  if (status === 'denied') return <Navigate to="/admin/sign-in" replace />;
  return <>{children}</>;
}
