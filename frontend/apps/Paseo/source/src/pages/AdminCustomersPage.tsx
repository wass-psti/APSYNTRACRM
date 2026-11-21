import { Link } from 'react-router-dom';
import { AdminShell } from '../components/admin/AdminShell';
import { backendAdminEnabled } from '../admin/staging/StagingAdminGate';

export function AdminCustomersPage() {
  return <AdminShell title="Customer directory.">
    <section className="booking-panel" role="status">
      <h2 className="review-heading">Customer directory unavailable</h2>
      <p>There is no separate verified customer directory endpoint. Contact details for actual reservations are visible to administrators in the stored reservation queue.</p>
      {backendAdminEnabled && <Link className="button button-primary" to="/admin/live-reservations#pdl-reservations-heading">Open stored reservations</Link>}
    </section>
  </AdminShell>;
}
