import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  backendAdminEnabled, sharedSupabaseAdminEnabled,
  backendAdminFetch, storeAdminToken,
} from '../admin/staging/StagingAdminGate';

export function StagingAdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  if (!backendAdminEnabled) return <Navigate to="/admin" replace />;

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await backendAdminFetch('/v1/admin/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sharedSupabaseAdminEnabled
          ? { email: username, password } : { username, password }),
      });
      if (!response.ok) throw new Error(response.status === 403
        ? 'This Supabase account has not been assigned as a Paseo booking administrator.'
        : 'Administrator sign-in was not accepted.');
      if (sharedSupabaseAdminEnabled) {
        const session: { accessToken?: string } = await response.json();
        if (!session.accessToken) throw new Error('No administrator session was issued.');
        storeAdminToken(session.accessToken);
      }
      setPassword('');
      navigate('/admin/live-reservations', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Administrator sign-in failed.');
    } finally { setBusy(false); }
  }

  return (
    <section className="container section booking-section pdl-admin-entry pdl-admin-signin">
      <div className="pdl-admin-signin-grid">
        <div className="pdl-admin-signin-intro">
          <div className="eyebrow eyebrow-dark pdl-admin-signin-eyebrow">
            <span className="pdl-admin-signin-eyebrow-dot" aria-hidden="true" />
            {sharedSupabaseAdminEnabled ? 'PASEO ADMINISTRATOR / LIVE BACKEND' : 'ADMINISTRATOR / LOCAL STAGING'}
          </div>
          <h1 className="page-title">Administrator <span className="pdl-admin-signin-title-nowrap">sign-in.</span></h1>
          <p className="page-lede">{sharedSupabaseAdminEnabled
            ? 'Sign in with your existing Supabase Auth account. Guests do not need accounts.'
            : 'Local staging only. Guests do not need to sign in to request a reservation.'}</p>

          <div className="pdl-admin-signin-art" aria-hidden="true">
            <div className="pdl-admin-signin-art-top">
              <span>OPERATIONS / PASEO DE LOMBOY</span>
              <span className="pdl-admin-signin-art-dot" />
            </div>
            <svg viewBox="0 0 420 230" role="presentation" focusable="false">
              <rect x="51" y="29" width="318" height="172" rx="13" fill="#21685a" stroke="#d9eeae" strokeWidth="5" />
              <rect x="67" y="45" width="286" height="140" rx="2" fill="none" stroke="#f1f8dc" strokeWidth="3" />
              <path d="M210 47V183M67 115H353M67 83H135V147H67M285 83H353V147H285" fill="none" stroke="#f1f8dc" strokeWidth="3" />
              <circle cx="210" cy="115" r="9" fill="#d7ef69" stroke="#f3f9dc" strokeWidth="2" />
              <circle cx="339" cy="58" r="15" fill="#d7ef69" stroke="#ebf5db" strokeWidth="3" />
            </svg>
            <div className="pdl-admin-signin-art-bottom">
              <span>ONE VENUE. THREE COURTS.</span>
              <span>ADMINISTRATOR ACCESS</span>
            </div>
          </div>

          <div className="demo-banner pdl-admin-signin-notice" role="note">
            <span className="pdl-admin-signin-notice-icon" aria-hidden="true">i</span>
            <div>{sharedSupabaseAdminEnabled
              ? 'Only accounts explicitly assigned in the Paseo administrator table can manage reservations.'
              : 'This is a development-only administrator identity, not a production user account.'}</div>
          </div>
        </div>

        <div className="pdl-admin-signin-card">
          <header className="pdl-admin-signin-card-heading">
            <div className="pdl-admin-signin-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="4" y="10" width="16" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="12" cy="15.5" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <span className="pdl-admin-signin-card-kicker">ADMINISTRATOR PORTAL</span>
            <h2>Welcome back.</h2>
            <p>Enter your existing administrator credentials to continue.</p>
          </header>

          <form className="booking-panel guest-receipt-lookup pdl-admin-signin-form"
            aria-label="Administrator sign-in form"
            aria-busy={busy}
            onSubmit={(event) => { void login(event); }}>
            <div className="pdl-admin-signin-field">
              <label htmlFor="staging-admin-user">{sharedSupabaseAdminEnabled ? 'Administrator email' : 'Administrator username'}</label>
              <div className="pdl-admin-signin-input">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M5.5 20c.2-4.1 2.5-6.5 6.5-6.5s6.3 2.4 6.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <input id="staging-admin-user" type={sharedSupabaseAdminEnabled ? 'email' : 'text'}
                  autoComplete="username" value={username} required
                  onChange={(event) => setUsername(event.target.value)} />
              </div>
            </div>
            <div className="pdl-admin-signin-field">
              <label htmlFor="staging-admin-password">Administrator password</label>
              <div className="pdl-admin-signin-input pdl-admin-signin-password">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="8" cy="15" r="4" stroke="currentColor" strokeWidth="1.8" />
                  <path d="m11.1 12 7-7 2 2-2 2 1.6 1.6-2.1 2.1-1.6-1.6-2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <input id="staging-admin-password" type={passwordVisible ? 'text' : 'password'}
                  autoComplete="current-password" value={password} required
                  onChange={(event) => setPassword(event.target.value)} />
                <button className="pdl-admin-password-visibility" type="button"
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((current) => !current)}>
                  {passwordVisible ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            {error && <p role="alert" className="form-error pdl-admin-signin-error">{error}</p>}
            <button className="button button-primary pdl-admin-signin-submit"
              disabled={busy || !username || !password} type="submit">
              {busy && <span className="pdl-admin-signin-spinner" aria-hidden="true" />}
              <span>{busy ? 'Signing in…' : sharedSupabaseAdminEnabled ? 'Sign in to administrator dashboard' : 'Sign in to administrator staging'}</span>
              {!busy && <span aria-hidden="true">↗</span>}
            </button>
          </form>
          <div className="pdl-admin-signin-card-footer">
            <span>PUBLIC ACCESS</span>
            <Link className="text-link pdl-admin-signin-return" to="/book">
              <span aria-hidden="true">←</span> Return to public booking
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
