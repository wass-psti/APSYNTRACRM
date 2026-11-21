import { Navigate } from 'react-router-dom';
import { backendAdminEnabled } from '../admin/staging/StagingAdminGate';
import { AdminShell } from '../components/admin/AdminShell';

/** Keep the legacy route, but use one persisted backend workspace rather than divergent in-memory data. */
export function AdminBookingsPage() {
  if (backendAdminEnabled) return <Navigate to="/admin/live-reservations#pdl-reservations-heading" replace />;
  return <AdminShell title="Booking management.">
    <section className="booking-panel" role="status">
      <h2 className="review-heading">Reservation backend not configured</h2>
      <p>Connect the existing Paseo reservation service to view and manage persisted records. No synthetic records or temporary settings are displayed.</p>
    </section>
  </AdminShell>;
}
