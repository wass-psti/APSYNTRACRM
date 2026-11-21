import type { ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { AdminNavigation } from './AdminNavigation';
import { StagingAdminGate, backendAdminEnabled, stagingAdminEnabled } from '../../admin/staging/StagingAdminGate';

/** Shared frontend-only administrative console. No role or permission changes. */
export function AdminShell({ title, children, liveReservations = false }: {
  title: string; children: ReactNode; liveReservations?: boolean;
}) {
  return backendAdminEnabled
    ? <StagingAdminGate><AdminShellContent title={title} liveReservations={liveReservations}>{children}</AdminShellContent></StagingAdminGate>
    : <AdminShellContent title={title} liveReservations={liveReservations}>{children}</AdminShellContent>;
}

function AdminShellContent({ title, children, liveReservations }: { title: string; children: ReactNode; liveReservations: boolean }) {
  const reduced = useReducedMotion();

  return (
    <section className={`container section admin-section immersive-admin-section${liveReservations ? ' pdl-live-shell' : ''}`}>
      <m.div
        className="immersive-admin-heading"
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
      >
        <div className="eyebrow eyebrow-dark">{liveReservations ? 'PASEO DE LOMBOY / LIVE OPERATIONS' : 'PASEO DE LOMBOY / OPERATIONS'}</div>
        <h1 className="page-title">{title}</h1>
        <span className="immersive-admin-label" aria-label={liveReservations ? 'Stored reservation administration' : 'Administrative workspace'}>
          {liveReservations ? 'RESERVATION MANAGEMENT' : 'OPERATIONS'}
        </span>
      </m.div>
      <div className="demo-banner immersive-admin-banner" role="note">
        <strong>{backendAdminEnabled ? (stagingAdminEnabled ? 'Local authenticated staging — not production' : 'Shared Supabase backend — authorized administrators only') : 'Reservation backend not configured'}</strong>
        <p>{backendAdminEnabled
          ? (stagingAdminEnabled
            ? 'The stored-reservations page reads and updates the local SQLite staging database. This is not production data.'
            : 'Reservation records and supported court/rate settings are read from the dedicated Paseo schema. Unsupported features are displayed as unavailable.')
          : 'No live reservation backend is connected. Operational editing and payment actions are unavailable.'}</p>
      </div>
      <AdminNavigation />
      <div className="immersive-admin-content">
        {children}
      </div>
    </section>
  );
}
