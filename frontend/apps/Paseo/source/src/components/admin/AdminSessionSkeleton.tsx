import { useLocation } from 'react-router-dom';

const navigation = [
  'Stored reservations', 'Overview', 'Court settings', 'Court calendar',
  'Bookings', 'Pricing', 'Payments', 'Customers', 'Settings',
];

const headings: Record<string, string> = {
  '/admin': 'Operations overview.',
  '/admin/acceptance': 'Administration readback.',
  '/admin/live-reservations': 'Stored reservations.',
  '/admin/courts': 'Court settings.',
  '/admin/calendar': 'Court calendar.',
  '/admin/bookings': 'Booking management.',
  '/admin/pricing': 'Pricing and policies.',
  '/admin/payments': 'Payment monitoring.',
  '/admin/customers': 'Customer directory.',
  '/admin/settings': 'Operational settings.',
};

function Placeholder({ width = '100%', height = 15 }: { width?: string; height?: number }) {
  return <span className="pdl-session-placeholder" style={{ width, height }} aria-hidden="true" />;
}

function SummaryCards({ count = 3 }: { count?: number }) {
  return <div className="pdl-session-summary" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <div className="pdl-session-card" key={index}>
      <Placeholder width="62%" height={13} />
      <Placeholder width="32%" height={32} />
      <Placeholder width="75%" height={11} />
    </div>)}
  </div>;
}

function FormFields() {
  return <div className="pdl-session-fields" aria-hidden="true">
    {Array.from({ length: 3 }, (_, index) => <div className="pdl-session-field" key={index}>
      <Placeholder width="48%" height={12} />
      <Placeholder height={43} />
    </div>)}
  </div>;
}

/** A visual replica of the existing Paseo administration shell, not a second admin UI. */
export function AdminSessionSkeleton() {
  const { pathname } = useLocation();
  const isLive = pathname === '/admin/live-reservations';
  const isSettings = pathname === '/admin/settings';
  const isCalendar = pathname === '/admin/calendar';
  const isConfig = ['/admin/courts', '/admin/pricing'].includes(pathname);
  const isPayments = pathname === '/admin/payments';
  const isOverview = pathname === '/admin';
  const isAcceptance = pathname === '/admin/acceptance';
  const isCustomers = pathname === '/admin/customers';
  const title = headings[pathname] ?? 'Administration.';

  return <section className={`container section admin-section immersive-admin-section pdl-session-skeleton${isLive ? ' pdl-live-shell' : ''}`}
    role="status" aria-label="Preparing administrator workspace" aria-busy="true">
    <div className="immersive-admin-heading pdl-session-hero" aria-hidden="true">
      <div className="eyebrow eyebrow-dark">PASEO DE LOMBOY / {isLive ? 'LIVE OPERATIONS' : 'OPERATIONS'}</div>
      <h1 className="page-title">{title}</h1>
      <span className="immersive-admin-label">{isLive ? 'RESERVATION MANAGEMENT' : 'OPERATIONS'}</span>
    </div>
    <div className="demo-banner immersive-admin-banner pdl-session-banner" aria-hidden="true">
      <Placeholder width="46%" height={13}/>
      <Placeholder width="82%" height={12}/>
    </div>
    <div className="admin-navigation immersive-admin-navigation pdl-session-navigation" aria-hidden="true">
      {navigation.map(item => <div className="immersive-admin-nav-link pdl-session-nav-item" key={item}>
        <Placeholder width={`${Math.max(44, item.length * 6)}px`} height={12}/>
      </div>)}
    </div>
    <div className="immersive-admin-content pdl-session-content" aria-hidden="true">
      <div className="pdl-session-intro">
        <Placeholder width="20%" height={12}/>
        <Placeholder width="48%" height={27}/>
        <Placeholder width="68%" height={13}/>
      </div>
      {(isLive || isOverview || isCustomers || isPayments || isAcceptance) && <SummaryCards count={isOverview ? 4 : 3}/>}
      {isPayments && <div className="pdl-session-payment-grid">
        {Array.from({ length: 3 }, (_, index) => <div className="booking-panel pdl-session-payment-card" key={index}>
          <Placeholder width="35%" height={12}/>
          <Placeholder width="55%" height={24}/>
          <Placeholder width="84%" height={43}/>
          <Placeholder width="100%" height={43}/>
          <div className="pdl-session-preview"><Placeholder width="73%" height={180}/></div>
          <Placeholder height={43}/>
        </div>)}
      </div>}
      {!isPayments && <div className="pdl-session-section-grid">
        <div className="booking-panel pdl-session-panel">
          <Placeholder width="39%" height={23}/>
          <Placeholder width="78%" height={12}/>
          {(isSettings || isCalendar || isConfig) ? <FormFields/> : <>
            <div className="pdl-session-toolbar"><Placeholder width="72%" height={43}/><Placeholder width="21%" height={43}/></div>
            <div className="pdl-session-record"><Placeholder width="38%" height={16}/><Placeholder width="92%" height={12}/><Placeholder width="64%" height={12}/></div>
          </>}
        </div>
        {(isLive || isCalendar || isConfig || isPayments || isAcceptance) && <div className="booking-panel pdl-session-panel">
          <Placeholder width="52%" height={23}/>
          <Placeholder width="74%" height={12}/>
          {isPayments ? <div className="pdl-session-preview"><Placeholder width="70%" height={170}/></div> : <FormFields/>}
        </div>}
      </div>}
    </div>
    <span className="sr-only">Administrator session verification is in progress.</span>
  </section>;
}
