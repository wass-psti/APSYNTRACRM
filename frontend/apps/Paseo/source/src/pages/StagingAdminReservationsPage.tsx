import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminShell } from '../components/admin/AdminShell';
import { configuredGuestApiBase, formatPeso, resolveManagedQrImageUrl } from '../guest/guestReservation';
import {
  backendAdminFetch, clearAdminToken, sharedSupabaseAdminEnabled,
} from '../admin/staging/StagingAdminGate';
import {
  ManagedQrMethodCard, managedPaymentMethods, type ManagedMethod,
} from '../admin/staging/ManagedQrMethodCard';

interface ReservationCursor {beforeCreatedAt: string; beforeId: string}

interface StageReservation {
  id: string;
  court_id: string;
  day: string;
  start_minute: number;
  duration: number;
  amount_minor: number;
  full_name: string;
  email: string;
  phone: string;
  payment_method: string;
  booking_status: string;
  payment_status: string;
  version: number;
  created_at: string;
}

type WorkspaceView = 'all' | 'courts' | 'bookings' | 'pricing' | 'payments' | 'customers';
const workspaceTitles: Record<WorkspaceView, string> = {
  all: 'Stored reservations.', courts: 'Court settings.', bookings: 'Booking management.',
  pricing: 'Pricing and policies.', payments: 'Payment monitoring.', customers: 'Customer directory.',
};

export function StagingAdminReservationsPage({ view = 'all' }: { view?: WorkspaceView }) {
  const showRecords = ['all','bookings','payments','customers'].includes(view);
  const showConfig = ['all','courts','pricing'].includes(view);
  const showQr = view === 'all' || view === 'payments';
  const navigate = useNavigate();
  const [records, setRecords] = useState<StageReservation[]>([]);
  const customers = [...new Map(records.map(record => [record.email.toLowerCase(), record])).values()];
  const [search, setSearch] = useState('');
  const [reservationLoaded, setReservationLoaded] = useState(false);
  const [reservationLoading, setReservationLoading] = useState(false);
  const [status, setStatus] = useState('Loading reservations…');
  const [nextCursor, setNextCursor] = useState<ReservationCursor | null>(null);
  const loadRequest = useRef(0);
  const activeSearch = useRef('');
  const [busyId, setBusyId] = useState('');
  const [proof, setProof] = useState<{url: string; type: string; id: string} | null>(null);
  const proofRequest = useRef(0);
  const proofDialog = useRef<HTMLDialogElement>(null);
  const previewReturnFocus = useRef<HTMLButtonElement | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<ManagedMethod[]>([]);
  const [qrMessage, setQrMessage] = useState('');
  const [courtConfig, setCourtConfig] = useState<{
    courtId: string; name: string; enabled: boolean;
    openMinute: number; closeMinute: number;
    rates: { durationMinutes:number; amountMinor:number; enabled:boolean }[];
  }[]>([]);
  const [selectedCourt, setSelectedCourt] = useState('court-1');
  const [courtEnabled, setCourtEnabled] = useState(false);
  const [opening, setOpening] = useState(480);
  const [closing, setClosing] = useState(1320);
  const [rateDuration, setRateDuration] = useState(60);
  const [rateAmount, setRateAmount] = useState('');
  const [rateEnabled, setRateEnabled] = useState(false);
  const [configMessage, setConfigMessage] = useState('');
  // Selecting an existing court or rate must display the persisted server
  // values, not stale defaults from the previous selection.
  useEffect(() => {
    const court = courtConfig.find(item => item.courtId === selectedCourt);
    if (!court) return;
    setCourtEnabled(court.enabled);
    setOpening(court.openMinute);
    setClosing(court.closeMinute);
    const rate = court.rates.find(item => item.durationMinutes === rateDuration);
    setRateAmount(rate ? (rate.amountMinor / 100).toFixed(2) : '');
    setRateEnabled(rate?.enabled ?? false);
  }, [courtConfig, selectedCourt, rateDuration]);

  async function load(query = search, cursor: ReservationCursor | null = null): Promise<boolean> {
    if (!cursor) activeSearch.current = query;
    const requestId = ++loadRequest.current;
    setReservationLoading(true);
    try {
      const params = new URLSearchParams({q:activeSearch.current});
      if (sharedSupabaseAdminEnabled) {
        params.set('limit','25');
        if (cursor) {
          params.set('beforeCreatedAt',cursor.beforeCreatedAt);
          params.set('beforeId',cursor.beforeId);
        }
      }
      const path = sharedSupabaseAdminEnabled ? '/v1/admin/reservations/page' : '/v1/admin/reservations';
      const response = await backendAdminFetch(`${path}?${params}`, {cache:'no-store',signal:AbortSignal.timeout(12000)});
      if (requestId !== loadRequest.current) return false;
      if (response.status === 401) { navigate('/admin/sign-in',{replace:true}); return false; }
      if (!response.ok) throw new Error('Reservation retrieval failed. Please refresh.');
      const data: {reservations: (StageReservation & {
        court_code?:string; reservation_date?:string; duration_minutes?:number;
      })[]; nextCursor?:ReservationCursor|null} = await response.json();
      if (!Array.isArray(data.reservations)) throw new Error('Reservation list is temporarily unavailable. Please refresh.');
      const normalized = data.reservations.map(item=>({
        ...item,court_id:item.court_id??item.court_code??'',
        day:item.day??item.reservation_date??'',
        duration:item.duration??item.duration_minutes??0,
      }));
      if (requestId !== loadRequest.current) return false;
      setRecords(previous => {
        if (!cursor) return normalized;
        const seen = new Set(previous.map(record => record.id));
        return [...previous, ...normalized.filter(record => !seen.has(record.id))];
      });
      setNextCursor(data.nextCursor??null);
      setReservationLoaded(true);
      setStatus(cursor ? 'More bookings loaded.' : `${normalized.length} reservations found.`);
      return true;
    } catch(reason) {
      if (requestId===loadRequest.current) setStatus(reason instanceof Error ? reason.message:'Reservation retrieval failed.');
      return false;
    } finally {
      if (requestId===loadRequest.current) setReservationLoading(false);
    }
  }
  useEffect(() => {
    if (showRecords) void load('');
    if (showQr) void loadMethods().catch(() => setQrMessage('Payment methods could not be retrieved.'));
    if (showConfig && sharedSupabaseAdminEnabled) void loadCourtConfig().catch(reason =>
      setConfigMessage(reason instanceof Error ? reason.message : 'Court configuration unavailable.'));
    return () => { loadRequest.current += 1; };
  }, []);
  async function loadCourtConfig(): Promise<typeof courtConfig> {
    const response = await backendAdminFetch('/v1/admin/courts', { cache:'no-store' });
    if (!response.ok) throw new Error('Court configuration could not be loaded.');
    const result: {courts: typeof courtConfig} = await response.json();
    if (!Array.isArray(result.courts)) throw new Error('Court settings are temporarily unavailable. Please refresh.');
    setCourtConfig(result.courts);
    return result.courts;
  }
  async function updateCourt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfigMessage('Saving court settings…');
    try {
      const response = await backendAdminFetch(`/v1/admin/courts/${selectedCourt}`, {
        method:'PUT', headers:{'content-type':'application/json'},
        body:JSON.stringify({enabled:courtEnabled,openMinute:opening,closeMinute:closing}),
      });
      if (!response.ok) throw new Error('Court update was not accepted.');
      const acknowledged = await response.json() as { updated?: boolean };
      if (!acknowledged.updated) throw new Error('Court settings could not be confirmed. Refresh before trying again.');
      const readback = await loadCourtConfig();
      const persisted = readback.find(item => item.courtId === selectedCourt);
      if (!persisted || persisted.enabled !== courtEnabled || persisted.openMinute !== opening ||
        persisted.closeMinute !== closing) {
        throw new Error('Court settings could not be confirmed after saving. Refresh before trying again.');
      }
      setConfigMessage('Court settings saved.');
    } catch (reason) { setConfigMessage(reason instanceof Error ? reason.message : 'Court settings failed.'); }
  }
  async function updateRate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = Math.round(Number(rateAmount) * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) return;
    setConfigMessage('Saving court rate…');
    try {
      const response = await backendAdminFetch(`/v1/admin/rates/${selectedCourt}/${rateDuration}`, {
        method:'PUT', headers:{'content-type':'application/json'},
        body:JSON.stringify({amountMinor,enabled:rateEnabled}),
      });
      if (!response.ok) throw new Error('Rate configuration was not accepted.');
      const acknowledged = await response.json() as { updated?: boolean };
      if (!acknowledged.updated) throw new Error('Rate update could not be confirmed. Refresh before trying again.');
      const readback = await loadCourtConfig();
      const persisted = readback.find(item => item.courtId === selectedCourt)?.rates.find(
        rate => rate.durationMinutes === rateDuration);
      if (!persisted || persisted.amountMinor !== amountMinor || persisted.enabled !== rateEnabled) {
        throw new Error('Rate changes could not be confirmed after saving. Refresh before trying again.');
      }
      setConfigMessage('Rate saved and confirmed.');
    } catch (reason) { setConfigMessage(reason instanceof Error ? reason.message : 'Rate settings failed.'); }
  }
  async function loadMethods(): Promise<ManagedMethod[]> {
    const response = await fetch(`${configuredGuestApiBase}/v1/payment-methods`, {cache:'no-store'});
    if (!response.ok) throw new Error('Payment methods not available.');
    const value: {methods: ManagedMethod[]} = await response.json();
    if (!Array.isArray(value.methods)) throw new Error('Payment methods are temporarily unavailable. Please refresh.');
    const methods = value.methods.map(item => ({
      ...item, imageUrl: resolveManagedQrImageUrl(item.method, item.imageUrl),
    }));
    setPaymentMethods(methods);
    return methods;
  }
  useEffect(() => () => { if (proof) URL.revokeObjectURL(proof.url); }, [proof]);
  useEffect(() => () => { proofRequest.current += 1; }, []);
  useEffect(() => {
    const dialog = proofDialog.current;
    if (!dialog) return;
    if (proof && !dialog.open) dialog.showModal();
    if (!proof && dialog.open) dialog.close();
  }, [proof]);

  async function preview(item: StageReservation, trigger?: HTMLButtonElement) {
    if (trigger) previewReturnFocus.current = trigger;
    const requestId = ++proofRequest.current;
    // Never display the previous customer's receipt while fetching a new one.
    setProof(null);
    setBusyId(item.id);
    try {
      const response = await backendAdminFetch(`/v1/admin/reservations/${item.id}/proof`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Payment proof is unavailable.');
      const content = await response.blob();
      if (requestId !== proofRequest.current) return;
      const url = URL.createObjectURL(content);
      setProof({ url, type: content.type, id: item.id });
    } catch (reason) {
      if (requestId === proofRequest.current) {
        setStatus(reason instanceof Error ? reason.message : 'Proof retrieval failed.');
      }
    } finally {
      if (requestId === proofRequest.current) setBusyId('');
    }
  }

  function closeProof() {
    proofRequest.current += 1;
    if (proofDialog.current?.open) proofDialog.current.close();
    setProof(null);
    setBusyId('');
    requestAnimationFrame(() => previewReturnFocus.current?.focus());
  }

  async function decide(item: StageReservation, decision: 'verified' | 'rejected') {
    setBusyId(item.id);
    try {
      const response = await backendAdminFetch(`/v1/admin/reservations/${item.id}/verification`, {
        method: 'POST',signal:AbortSignal.timeout(12000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, expectedVersion: item.version }),
      });
      if (!response.ok) throw new Error(response.status === 409 ? 'Reservation changed in another session. Refresh and retry.' : 'Verification could not be saved.');
      const refreshed = await load();
      if (!refreshed) {
        setStatus('The payment decision may have been saved, but its status could not be confirmed. Refresh before taking another action.');
      }
    } catch (reason) {
      const message=reason instanceof Error ? reason.message : 'Verification outcome uncertain.';
      const refreshed = await load();
      setStatus(refreshed ? `${message} Review the refreshed booking status before another decision.` :
        `${message} The booking status could not be checked. Refresh before trying again.`);
    } finally { setBusyId(''); }
  }

  async function cancelReservation(item: StageReservation) {
    if (!window.confirm('Cancel this pending booking? The court slot will be released, but any submitted payment must still be reconciled separately. No refund will be issued automatically.')) return;
    setBusyId(item.id);
    try {
      const response = await backendAdminFetch(`/v1/admin/reservations/${item.id}/cancel`, {
        method:'POST',signal:AbortSignal.timeout(12000),headers:{'content-type':'application/json'},
        body:JSON.stringify({expectedVersion:item.version}),
      });
      if (!response.ok) throw new Error(response.status===409 ?
        'Booking changed in another session. Refresh and review.' : 'Cancellation could not be saved.');
      const refreshed = await load();
      setStatus(refreshed ? 'Booking cancelled. Payment status is unchanged; reconcile any submitted funds separately.' :
        'The cancellation may have succeeded, but the updated booking could not be checked. Refresh before taking another action.');
    } catch(reason) {
      const message=reason instanceof Error ? reason.message : 'Cancellation outcome uncertain.';
      const refreshed = await load();
      setStatus(refreshed ? `${message} Review the refreshed booking status before retrying.` :
        `${message} The booking status could not be checked. Refresh before trying again.`);
    } finally { setBusyId(''); }
  }

  async function logout() {
    try { await backendAdminFetch('/v1/admin/logout', { method:'POST' }); }
    finally { clearAdminToken(); navigate('/admin/sign-in', { replace: true }); }
  }

  return (
    <AdminShell title={workspaceTitles[view]} liveReservations>
      <div className="pdl-live-admin">
        <div className="pdl-live-intro">
          <div>
            <p className="pdl-live-kicker">OPERATIONS / BOOKING CONTROL</p>
            <h2>{workspaceTitles[view]}</h2>
            <p>Review bookings, validate payment evidence and manage court hours and rates in one place.</p>
          </div>
          <span className="pdl-live-source">{sharedSupabaseAdminEnabled ? 'Booking records' : 'Test bookings'}</span>
        </div>
        {showRecords && <div className="pdl-live-metrics" aria-label="Current reservation results">
          <div><span>Reservations in results</span><strong>{reservationLoaded ? records.length : '—'}</strong><small>Current results</small></div>
          <div><span>Awaiting review</span><strong>{reservationLoaded ? records.filter(item => item.payment_status === 'submitted').length : '—'}</strong><small>Payment proof submitted</small></div>
          <div><span>Payments verified</span><strong>{reservationLoaded ? records.filter(item => item.payment_status === 'verified').length : '—'}</strong><small>In current results</small></div>
        </div>}
        {showRecords && <section className="pdl-live-section pdl-live-reservations" aria-labelledby="pdl-reservations-heading">
          <div className="pdl-live-section-heading">
            <div><p className="pdl-live-kicker">01 / RESERVATIONS</p><h2 id="pdl-reservations-heading">{view === 'customers' ? 'Customers from stored reservations' : view === 'payments' ? 'Booking payments' : 'Booking queue'}</h2></div>
            <span className="pdl-live-section-description">Search, review and verify</span>
          </div>
      <div className="demo-banner" role="note"><strong>{sharedSupabaseAdminEnabled ? 'BOOKINGS AND PAYMENTS' : 'TEST BOOKINGS ONLY'}</strong>
        <p>{sharedSupabaseAdminEnabled ? 'Check that funds reached the correct recipient before approving a payment receipt.' : 'These are test bookings, not real payments. Do not approve actual transfers here.'}</p>
      </div>
      <div className="booking-panel staging-admin-toolbar" aria-busy={reservationLoading}>
        <div className="pdl-live-search">
        <label htmlFor="staging-admin-search">Find reservation by name or ID</label>
        <input id="staging-admin-search" value={search} onChange={event => setSearch(event.target.value)}
          placeholder="Search booking name or ID" />
        </div>
        <div className="pdl-live-toolbar-actions">
        <button className="button button-primary" type="button" disabled={reservationLoading}
          onClick={() => { void load(); }}>{reservationLoading ? 'Searching…' : 'Search'}</button>
        <button className="button button-secondary" type="button" disabled={reservationLoading}
          onClick={() => { void load(); }}>{reservationLoading ? 'Refreshing…' : 'Refresh'}</button>
        <button className="button button-secondary" type="button" title="End administrator session"
          onClick={() => { void logout(); }}>Sign out</button>
        </div>
      </div>
      <p role="status" className="booking-help pdl-live-status" aria-live="polite">{status}</p>
      <div className="staging-reservations-list">
        {reservationLoaded && records.length === 0 && <div className="pdl-live-empty">
          <span aria-hidden="true">◎</span>
          <h3>No matching reservations</h3>
          <p>New submissions will appear here. Adjust your search or refresh to check for updates.</p>
        </div>}
        {view === 'customers' ? customers.map(item => (
          <article key={item.email.toLowerCase()} className="booking-panel staging-reservation-card">
            <h3>{item.full_name}</h3>
            <dl className="pdl-reservation-details">
              <div><dt>Email</dt><dd>{item.email}</dd></div>
              <div><dt>Phone</dt><dd>{item.phone}</dd></div>
              <div><dt>Latest loaded booking</dt><dd>{item.id}</dd></div>
            </dl>
          </article>
        )) : records.map((item) => (
          <article key={item.id} className="booking-panel staging-reservation-card">
            <div className="pdl-reservation-top">
              <div>
                <p className="pdl-live-kicker">BOOKING RECORD</p>
                <h2>{item.full_name} — {item.id}</h2>
              </div>
              <div className="pdl-reservation-badges">
                <span className={`pdl-status-chip pdl-status-${item.booking_status.replace(/[^a-z_-]/g, '')}`}>Booking: {item.booking_status.replace(/_/g, ' ')}</span>
                <span className={`pdl-status-chip pdl-status-${item.payment_status.replace(/[^a-z_-]/g, '')}`}>Payment: {item.payment_status.replace(/_/g, ' ')}</span>
              </div>
            </div>
            <dl className="pdl-reservation-details">
              <div><dt>Contact</dt><dd>{item.email}<span>{item.phone}</span></dd></div>
              <div><dt>Court & schedule</dt><dd>{item.court_id}, {item.day} at {Math.floor(item.start_minute / 60).toString().padStart(2,'0')}:{String(item.start_minute % 60).padStart(2,'0')}<span>{item.duration} minutes</span></dd></div>
              <div><dt>Amount & method</dt><dd>{formatPeso(item.amount_minor)}<span>{item.payment_method.toUpperCase()}</span></dd></div>
            </dl>
            <div className="booking-actions">
              <button className="button button-secondary" type="button" disabled={busyId === item.id}
                onClick={event => { void preview(item, event.currentTarget); }}>Preview payment proof</button>
              <button className="button button-primary" type="button" disabled={busyId === item.id || item.payment_status !== 'submitted'}
                onClick={() => { void decide(item,'verified'); }}>Mark payment verified</button>
              <button className="button button-secondary" type="button" disabled={busyId === item.id || item.payment_status !== 'submitted'}
                onClick={() => { void decide(item,'rejected'); }}>Reject payment proof</button>
              {sharedSupabaseAdminEnabled && <button className="button button-secondary" type="button"
                disabled={busyId === item.id || item.booking_status !== 'pending_verification' || item.payment_status !== 'submitted'}
                onClick={() => { void cancelReservation(item); }}>Cancel booking (no automatic refund)</button>}
            </div>
          </article>
        ))}
      </div>
      {sharedSupabaseAdminEnabled && nextCursor && (
        <button className="button button-secondary" type="button" disabled={reservationLoading}
          onClick={() => { void load(search,nextCursor); }}>
          {reservationLoading ? 'Loading more…' : 'Load more reservations'}
        </button>
      )}
        </section>}
      {showConfig && sharedSupabaseAdminEnabled && (
        <section className="booking-panel pdl-live-section pdl-live-config" aria-labelledby="pdl-config-heading">
          <div className="pdl-live-section-heading">
            <div><p className="pdl-live-kicker">02 / VENUE SETTINGS</p><h2 id="pdl-config-heading">Court availability and venue rate configuration</h2></div>
          </div>
          <p className="guest-qr-warning">Current court activation and saved PHP rates are read from the shared booking database.</p>
          <label htmlFor="pdl-config-court">Court</label>
          <select id="pdl-config-court" value={selectedCourt}
            onChange={event => setSelectedCourt(event.target.value)}>
            {['court-1','court-2','court-3'].map(code => <option key={code} value={code}>{code}</option>)}
          </select>
          <div className="pdl-rate-matrix" aria-labelledby="pdl-rate-matrix-heading">
            <div className="pdl-rate-matrix-heading">
              <div>
                <h3 id="pdl-rate-matrix-heading">Three-court rate readiness</h3>
                <p>Live saved values for every booking duration</p>
              </div>
              <button className="button button-secondary" type="button" onClick={() => { void loadCourtConfig(); }}>
                Refresh configuration
              </button>
            </div>
            <div className="pdl-rate-matrix-scroll">
              <table>
                <thead><tr><th scope="col">Court</th><th scope="col">60 minutes</th><th scope="col">90 minutes</th><th scope="col">120 minutes</th></tr></thead>
                <tbody>
                  {courtConfig.map(court => (
                    <tr key={court.courtId}>
                      <th scope="row">
                        <span>{court.name}</span>
                        <small className={court.enabled ? 'pdl-rate-court-enabled' : 'pdl-rate-court-disabled'}>
                          {court.enabled ? 'Court enabled' : 'Court disabled'}
                        </small>
                      </th>
                      {[60, 90, 120].map(duration => {
                        const rate = court.rates.find(item => item.durationMinutes === duration);
                        return (
                          <td key={duration}>
                            {rate ? (
                              <span className={rate.enabled ? 'pdl-rate-configured' : 'pdl-rate-disabled'}>
                                <strong>{formatPeso(rate.amountMinor)}</strong>
                                <small>{rate.enabled ? 'Rate enabled' : 'Rate disabled'}</small>
                              </span>
                            ) : (
                              <span className="pdl-rate-missing">Not configured</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="pdl-live-config-grid">
          {(view === 'all' || view === 'courts') && <form className="guest-proof-form" onSubmit={(event) => { void updateCourt(event); }}>
            <h3>Court schedule</h3>
            <label htmlFor="pdl-open-minute">Opening minute after midnight</label>
            <input id="pdl-open-minute" type="number" min={0} max={1380} step={30} value={opening}
              onChange={event => setOpening(Number(event.target.value))} />
            <label htmlFor="pdl-close-minute">Closing minute after midnight</label>
            <input id="pdl-close-minute" type="number" min={60} max={1440} step={30} value={closing}
              onChange={event => setClosing(Number(event.target.value))} />
            <label>
              <input type="checkbox" checked={courtEnabled}
                onChange={event => setCourtEnabled(event.target.checked)} />
              Enable this court
            </label>
            <button type="submit" className="button button-secondary">Save court configuration</button>
          </form>}
          {(view === 'all' || view === 'pricing') && <form className="guest-proof-form" onSubmit={(event) => { void updateRate(event); }}>
            <h3>Booking rate</h3>
            <label htmlFor="pdl-rate-duration">Duration</label>
            <select id="pdl-rate-duration" value={rateDuration}
              onChange={event => setRateDuration(Number(event.target.value))}>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
              <option value={120}>120 minutes</option>
            </select>
            <label htmlFor="pdl-rate-amount">Total in PHP</label>
            <input id="pdl-rate-amount" type="number" min="0.01" max="100000" step="0.01"
              value={rateAmount} onChange={event => setRateAmount(event.target.value)} required />
            <label>
              <input type="checkbox" checked={rateEnabled}
                onChange={event => setRateEnabled(event.target.checked)} />
              Enable this rate
            </label>
            <button className="button button-secondary" type="submit" disabled={!rateAmount}>
              Save rate
            </button>
          </form>}
          </div>
          <p role="status" className="pdl-live-status">{configMessage}</p>
        </section>
      )}
      {showQr && <section className="booking-panel managed-qr-settings pdl-live-section" aria-label="Admin-managed QR payment settings">
        <div className="pdl-live-section-heading">
          <div><p className="pdl-live-kicker">03 / PAYMENT CHANNELS</p><h2>Admin-managed QR payment settings</h2></div>
          <span className="pdl-live-section-description">Three independent methods</span>
        </div>
        <p className="booking-help">{sharedSupabaseAdminEnabled
          ? 'Each payment method has its own recipient and QR image. Confirm recipient details before accepting transfers.'
          : 'These payment details are for testing only. Do not transfer real funds.'}</p>
        <p role="status">{qrMessage}</p>
        <div className="managed-qr-grid">
          {managedPaymentMethods.map(({method, label}) => (
            <ManagedQrMethodCard key={method} method={method} label={label}
              configured={paymentMethods.find(item => item.method === method)}
              onSaved={loadMethods} />
          ))}
        </div>
      </section>}
      {proof && (
        <dialog ref={proofDialog} className="booking-panel staging-proof-panel pdl-proof-dialog"
          aria-labelledby="pdl-proof-title" onClose={closeProof} onCancel={event => {
            event.preventDefault();
            closeProof();
          }}>
          <div className="pdl-proof-heading">
            <div><p className="pdl-live-kicker">PAYMENT EVIDENCE</p>
              <h2 id="pdl-proof-title">Payment proof — {proof.id}</h2></div>
            <button className="pdl-proof-dismiss" type="button" aria-label="Close payment proof"
              onClick={closeProof}>×</button>
          </div>
          {proof.type.startsWith('image/') ?
            <img src={proof.url} alt="Submitted payment proof for administrator review" /> :
            <iframe src={proof.url} title="Payment proof PDF preview" sandbox="" />}
          <button className="button button-secondary" type="button" onClick={closeProof}>Close preview</button>
        </dialog>
      )}
      </div>
    </AdminShell>
  );
}
