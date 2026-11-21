import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminShell } from '../components/admin/AdminShell';
import { backendAdminEnabled, backendAdminFetch, sharedSupabaseAdminEnabled } from '../admin/staging/StagingAdminGate';

interface OverviewCourt { courtId: string; enabled: boolean; rates: { enabled: boolean }[] }
interface OverviewReservation { payment_status: string }
interface OverviewResult { courts: OverviewCourt[]; reservations: OverviewReservation[] }

export function AdminOverviewPage() {
  const [overview, setOverview] = useState<OverviewResult | null>(null);
  const [state, setState] = useState(backendAdminEnabled ? 'Loading persisted records…' : 'Reservation backend not configured.');
  useEffect(() => {
    if (!backendAdminEnabled) return;
    const controller = new AbortController();
    async function load() {
      try {
        const [reservations, courts] = await Promise.all([
          backendAdminFetch('/v1/admin/reservations?q=', { cache: 'no-store', signal: controller.signal }),
          sharedSupabaseAdminEnabled
            ? backendAdminFetch('/v1/admin/courts', { cache: 'no-store', signal: controller.signal })
            : Promise.resolve(null),
        ]);
        if (!reservations.ok || (courts && !courts.ok)) throw new Error('Operational records could not be loaded.');
        const reservationData = await reservations.json() as { reservations?: OverviewReservation[] };
        const courtData = courts ? await courts.json() as { courts?: OverviewCourt[] } : { courts: [] };
        if (!Array.isArray(reservationData.reservations) || !Array.isArray(courtData.courts)) throw new Error('Unexpected operational data format.');
        if (!controller.signal.aborted) {
          setOverview({ reservations: reservationData.reservations, courts: courtData.courts });
          setState('Current server response');
        }
      } catch (error) {
        if (!controller.signal.aborted) setState(error instanceof Error ? error.message : 'Operational records could not be loaded.');
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return <AdminShell title="Operations overview.">
    <p className="page-lede">Live operational totals are read directly from the reservation backend, not generated from example data.</p>
    <p role="status" className="booking-help">{state}</p>
    {overview && <div className="admin-metrics" aria-label="Persisted operational totals">
      <div><strong>{overview.reservations.length}</strong><span>Reservations returned</span></div>
      <div><strong>{overview.reservations.filter(item => item.payment_status === 'submitted').length}</strong><span>Payments awaiting review</span></div>
      <div><strong>{overview.reservations.filter(item => item.payment_status === 'verified').length}</strong><span>Payments verified</span></div>
      {sharedSupabaseAdminEnabled && <div><strong>{overview.courts.filter(item => item.enabled).length} / {overview.courts.length}</strong><span>Enabled courts</span></div>}
    </div>}
    <section className="booking-panel">
      <h2 className="review-heading">Operational workspace</h2>
      <p>Reservations and payment evidence are managed in the persisted queue. Court scheduling and approved rates are managed from the same server-backed workspace.</p>
      {backendAdminEnabled && <div className="booking-actions">
        <Link className="button button-primary" to="/admin/live-reservations">Open stored reservations</Link>
        {sharedSupabaseAdminEnabled && <Link className="button button-secondary" to="/admin/live-reservations#pdl-config-heading">Manage court settings and rates</Link>}
      </div>}
    </section>
  </AdminShell>;
}
