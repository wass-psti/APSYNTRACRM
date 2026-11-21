import { useEffect, useState, type FormEvent } from 'react';
import { AdminShell } from '../components/admin/AdminShell';
import { backendAdminFetch, sharedSupabaseAdminEnabled } from '../admin/staging/StagingAdminGate';

interface Policy { reservationLeadHours: number; arrivalGraceMinutes: number; publicNotice: string }

export function AdminSettingsPage() {
  const [policy, setPolicy] = useState<Policy>({ reservationLeadHours: 0, arrivalGraceMinutes: 15, publicNotice: '' });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function readback(): Promise<Policy> {
    const response = await backendAdminFetch('/v1/admin/policies', { cache: 'no-store' });
    if (!response.ok) throw new Error('Operational policies could not be retrieved.');
    const value = await response.json() as Policy;
    if (!Number.isInteger(value.reservationLeadHours) || !Number.isInteger(value.arrivalGraceMinutes) ||
      typeof value.publicNotice !== 'string') throw new Error('Booking policies could not be displayed. Please refresh.');
    setPolicy(value);
    setLoaded(true);
    return value;
  }
  useEffect(() => {
    if (!sharedSupabaseAdminEnabled) return;
    void readback().catch(error => setMessage(error instanceof Error ? error.message : 'Policies unavailable.'));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('Saving policy…');
    try {
      const response = await backendAdminFetch('/v1/admin/policies', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(policy),
      });
      if (!response.ok) {
        throw new Error(response.status === 409 ? 'Booking settings changed in another session. Refresh before retrying.' : 'Booking settings could not be saved. Please try again.');
      }
      const acknowledged = await response.json() as { updated?: boolean };
      if (!acknowledged.updated) throw new Error('Policy changes could not be confirmed. Refresh before trying again.');
      const persisted = await readback();
      if (persisted.reservationLeadHours !== policy.reservationLeadHours ||
        persisted.arrivalGraceMinutes !== policy.arrivalGraceMinutes ||
        persisted.publicNotice !== policy.publicNotice.trim()) {
        throw new Error('Policy changes could not be confirmed after saving. Refresh before trying again.');
      }
      setMessage('Booking policies saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Policy update failed.'); }
    finally { setBusy(false); }
  }
  return <AdminShell title="Operational settings.">
    {!sharedSupabaseAdminEnabled ? <section className="booking-panel" role="status">
      <h2 className="review-heading">Booking settings unavailable</h2>
      <p>Booking settings cannot be changed right now. Please try again later.</p>
    </section> : <>
      <p className="page-lede">Manage booking lead time, arrival grace period and the venue notice. These values are for staff reference and are not automatically enforced during guest booking.</p>
      <form className="booking-panel fe08-settings-form" onSubmit={submit}>
        <label>Minimum lead time (hours)
          <input type="number" min="0" max="72" step="1" value={policy.reservationLeadHours}
            onChange={event => setPolicy({ ...policy, reservationLeadHours: Number(event.target.value) })} required />
        </label>
        <label>Arrival grace period (minutes)
          <input type="number" min="0" max="60" step="1" value={policy.arrivalGraceMinutes}
            onChange={event => setPolicy({ ...policy, arrivalGraceMinutes: Number(event.target.value) })} required />
        </label>
        <label>Venue notice
          <textarea maxLength={240} rows={3} value={policy.publicNotice}
            onChange={event => setPolicy({ ...policy, publicNotice: event.target.value })} />
        </label>
        <button className="button button-primary" type="submit" disabled={!loaded || busy ||
          !Number.isInteger(policy.reservationLeadHours) || policy.reservationLeadHours < 0 || policy.reservationLeadHours > 72 ||
          !Number.isInteger(policy.arrivalGraceMinutes) || policy.arrivalGraceMinutes < 0 || policy.arrivalGraceMinutes > 60}>
          Save operational policies
        </button>
        <p role="status" className="admin-message" aria-live="polite">{message || (loaded ? 'Booking policies loaded.' : 'Loading booking policies…')}</p>
      </form>
    </>}
  </AdminShell>;
}
