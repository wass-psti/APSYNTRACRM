import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { NavLink } from 'react-router-dom';

const pages = [
  { label: 'Our courts', to: '/courts' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'My bookings', to: '/reservations' },
];

export function AnimatedNavigation() {
  const reduced = useReducedMotion();
  return (
    <nav aria-label="Main navigation" className="header-nav immersive-header-nav">
      {pages.map((page) => (
        <NavLink key={page.to} to={page.to} className="immersive-nav-link">
          {({ isActive }) => (
            <>
              <span>{page.label}</span>
              {isActive && (
                <m.span
                  className="immersive-nav-active"
                  aria-hidden="true"
                  {...(reduced ? {} : { layoutId: 'immersive-navigation-active' })}
                  transition={{ type: 'spring', stiffness: 460, damping: 42 }}
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
