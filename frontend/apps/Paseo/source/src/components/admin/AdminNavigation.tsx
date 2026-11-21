import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { NavLink } from 'react-router-dom';
import { motionSprings } from '../../motion/presets';
import { backendAdminEnabled } from '../../admin/staging/StagingAdminGate';

const sections = [
  { label: 'Overview', to: '/admin', end: true },
  { label: 'Court settings', to: '/admin/courts' },
  { label: 'Court calendar', to: '/admin/calendar' },
  { label: 'Bookings', to: '/admin/bookings' },
  { label: 'Pricing', to: '/admin/pricing' },
  { label: 'Payments', to: '/admin/payments' },
  { label: 'Customers', to: '/admin/customers' },
  { label: 'Settings', to: '/admin/settings' },
] as const;

export function AdminNavigation() {
  const reduced = useReducedMotion();
  return (
    <nav className="admin-navigation immersive-admin-navigation" aria-label="Administrator navigation">
      {backendAdminEnabled && (
        <NavLink className="immersive-admin-nav-link" to="/admin/live-reservations">Stored reservations</NavLink>
      )}
      {sections.map((section) => (
        <NavLink to={section.to} key={section.to} end={'end' in section && section.end}
          className="immersive-admin-nav-link">
          {({ isActive }) => (
            <>
              <span className="immersive-admin-nav-label">{section.label}</span>
              {isActive && (
                <m.span
                  className="immersive-admin-nav-current"
                  aria-hidden="true"
                  {...(reduced ? {} : { layoutId: 'admin-navigation-active' })}
                  transition={motionSprings.interactive}
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
