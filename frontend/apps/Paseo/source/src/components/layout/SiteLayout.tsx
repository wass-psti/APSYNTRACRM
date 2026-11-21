import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { RouteAnnouncer } from './RouteAnnouncer';
import { NavigationProgress } from './NavigationProgress';
import { BrandLogo } from './BrandLogo';
import { AnimatedNavigation } from './AnimatedNavigation';
import { BookingDraftProvider } from '../../booking/BookingDraftContext';

export function SiteLayout() {
  const { pathname } = useLocation();
  return <BookingDraftProvider><div className="site-shell">
    <a href="#main" className="skip-link">Skip to main content</a>
    <header className="site-header"><div className="container header-inner">
      <NavLink className="brand" to="/" aria-label="Paseo de Lomboy home"><BrandLogo /></NavLink>
      <AnimatedNavigation />
      <NavLink className="button button-primary header-cta" to="/book">Book a court <span aria-hidden="true">↗</span></NavLink>
    </div></header>
    <NavigationProgress />
    <main id="main" tabIndex={-1}><Outlet /></main><RouteAnnouncer />
    <footer className="site-footer"><div className="container footer-inner"><div className="footer-brand"><BrandLogo variant="footer" /><span className="footer-brand-copy"><strong>PASEO DE LOMBOY</strong><small>Pickleball, your way.</small></span></div><div className="footer-admin-actions"><span className="footer-muted">Reservations and payments require server verification</span>{pathname === '/' && <NavLink className="footer-admin-link" to="/admin/sign-in" aria-label="Administrator sign-in">Administrator</NavLink>}</div></div></footer>
  </div></BookingDraftProvider>;
}
