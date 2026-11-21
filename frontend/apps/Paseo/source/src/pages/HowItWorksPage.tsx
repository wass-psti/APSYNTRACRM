import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { ButtonLink } from '../components/ui/ButtonLink';
import { motionPresets, motionSprings } from '../motion/presets';

const bookingSteps = [
  { title: 'Explore courts', detail: 'Compare Courts 1, 2 and 3 and choose a preferred court.', milestone: 'AVAILABLE', phase: 'COURTS', state: 'available' },
  { title: 'Choose a schedule', detail: 'Select a date and duration. Bookable times depend on approved server rates and actual court availability.', milestone: 'SERVER VALIDATION', phase: 'SCHEDULE', state: 'available' },
  { title: 'Enter details and review', detail: 'Provide guest contact details and review the proposed booking before submission.', milestone: 'AVAILABLE', phase: 'DETAILS', state: 'available' },
  { title: 'Choose payment', detail: 'Select a configured QR-payment method and submit payment evidence only after receiving a valid backend quote.', milestone: 'SERVER REQUIRED', phase: 'PAYMENT', state: 'planned' },
  { title: 'Receive confirmation', detail: 'Retrieve the server-issued receipt with your private code. Payment verification and final confirmation are managed by the reservation service.', milestone: 'SERVER REQUIRED', phase: 'RECEIPT', state: 'planned' },
] as const;

function StepIcon({ index }: { index: number }) {
  const common = {
    'aria-hidden': true as const,
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (index === 0) {
    return <svg {...common}><rect x="4" y="5" width="24" height="22" rx="2" /><path d="M16 5v22M4 16h24M10 5v5M22 22v5" /><circle cx="16" cy="16" r="2.2" /></svg>;
  }
  if (index === 1) {
    return <svg {...common}><rect x="4.5" y="6.5" width="23" height="21" rx="3" /><path d="M10 4v5M22 4v5M5 12h22M10 17h.01M16 17h.01M22 17h.01M10 22h.01M16 22h.01" /></svg>;
  }
  if (index === 2) {
    return <svg {...common}><rect x="5" y="5" width="22" height="22" rx="3" /><circle cx="13" cy="13" r="3" /><path d="M8.5 22c.8-3 2.3-4.5 4.5-4.5s3.7 1.5 4.5 4.5M21 12h2M21 17h2M21 22h2" /></svg>;
  }
  if (index === 3) {
    return <svg {...common}><rect x="3.5" y="7" width="25" height="18" rx="3" /><path d="M4 13h24M9 19h5M21 19h2" /><path d="M8 7V5h16v2" /></svg>;
  }
  return <svg {...common}><circle cx="16" cy="16" r="11.5" /><path d="m10.5 16.2 3.6 3.5 7.5-8" /></svg>;
}

function CourtJourneyIllustration() {
  return (
    <svg className="how-overview-court" viewBox="0 0 440 240" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="how-court-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#318476" />
          <stop offset="1" stopColor="#1b6258" />
        </linearGradient>
      </defs>
      <rect x="47" y="27" width="346" height="186" rx="8" fill="url(#how-court-fill)" stroke="#f1f4d9" strokeWidth="8" />
      <rect x="65" y="44" width="310" height="152" rx="2" fill="none" stroke="#eaf1d8" strokeWidth="2.5" />
      <path d="M220 31v178M51 120h338M65 78h91v84H65M284 78h91v84h-91" fill="none" stroke="#eaf1d8" strokeWidth="2.5" />
      <circle cx="220" cy="120" r="7" fill="#d7ef69" stroke="#f5f8dc" strokeWidth="2" />
      <circle cx="350" cy="48" r="15" fill="#d7ef69" stroke="#f4f8d9" strokeWidth="3" />
      <path d="M344 39c-3 7-3 13 1 18M353 34c-3 8-2 15 3 21" fill="none" stroke="#6d9145" strokeWidth="1.8" />
    </svg>
  );
}

export function HowItWorksPage() {
  const reduced = useReducedMotion();

  return (
    <section className="container section how-it-works-page">
      <header className="how-hero">
        <div className="how-hero-copy">
          <div className="eyebrow eyebrow-dark how-eyebrow">THE RESERVATION JOURNEY</div>
          <h1 className="page-title">How booking works.</h1>
          <p className="page-lede">Explore the five-step booking journey. Final availability, charges and confirmation depend on server verification and approved venue settings.</p>
          <div className="how-hero-actions">
            <ButtonLink to="/courts">Explore the three courts <span aria-hidden="true">↗</span></ButtonLink>
            <a className="how-inline-link" href="#how-booking-steps">See all five steps <span aria-hidden="true">↓</span></a>
          </div>
        </div>

        <aside className="how-overview-card" aria-label="Booking journey overview">
          <div className="how-overview-topline">
            <span>YOUR BOOKING PATH</span>
            <span className="how-preview-pill"><i aria-hidden="true" /> BOOKING JOURNEY</span>
          </div>
          <div className="how-overview-art">
            <CourtJourneyIllustration />
            <span className="how-art-label">THREE COURTS · ONE JOURNEY</span>
          </div>
          <div className="how-overview-stats">
            <div><strong>05</strong><span>Journey stages</span></div>
            <span className="how-overview-divider" aria-hidden="true" />
            <div><strong>05</strong><span>Interface stages</span></div>
          </div>
          <div className="how-progress-caption"><span>Frontend journey coverage</span><strong>5 of 5 interfaces</strong></div>
          <div className="how-progress-track" role="progressbar" aria-label="Frontend journey coverage" aria-valuemin={0} aria-valuemax={5} aria-valuenow={5} aria-valuetext="Five interface stages are present; final confirmation requires backend verification">
            <span />
          </div>
        </aside>
      </header>

      <section className="how-journey-section" aria-labelledby="how-booking-steps-title">
        <div className="how-section-heading">
          <div>
            <div className="eyebrow eyebrow-dark">YOUR FIVE-STEP JOURNEY</div>
            <h2 id="how-booking-steps-title">A clear path from court to confirmation.</h2>
          </div>
          <p>Each stage has a defined place in the reservation flow. See the customer steps and where the backend must verify availability, price and payment.</p>
        </div>

        <ol className="how-steps-grid" id="how-booking-steps">
          {bookingSteps.map((step, index) => (
            <m.li
              className={`how-step-card ${step.state === 'available' ? 'is-available' : 'is-planned'}`}
              key={step.title}
              data-step-index={index + 1}
              {...(reduced ? {} : {
                initial: { opacity: 0, y: 14 },
                animate: { opacity: 1, y: 0 },
                transition: { ...motionSprings.gentle, delay: index * 0.055 },
                whileHover: motionPresets.cardHover,
              })}
            >
              <div className="how-step-card-top">
                <span className="how-step-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="how-step-icon"><StepIcon index={index} /></span>
              </div>
              <div className="how-step-copy">
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </div>
              <div className="how-step-meta">
                <span className="how-step-status"><i aria-hidden="true" />{step.milestone}</span>
                <span className="how-step-phase">{step.phase}</span>
              </div>
            </m.li>
          ))}
        </ol>
      </section>

      <aside className="how-preview-note" aria-label="Reservation readiness">
        <span className="how-note-mark" aria-hidden="true">i</span>
        <div>
          <strong>What is available right now?</strong>
          <p>The interfaces exist, but courts and rates may be disabled until the venue approves them. No selection alone creates a reservation or verifies payment.</p>
        </div>
        <span className="how-note-status">SERVER VERIFICATION</span>
      </aside>

      <section className="how-next-step" aria-labelledby="how-next-step-title">
        <div className="how-next-copy">
          <div className="eyebrow">READY WHEN YOU ARE</div>
          <h2 id="how-next-step-title">Start by finding your court.</h2>
          <p>Explore the three court options and review their details before continuing to the booking journey.</p>
        </div>
        <ButtonLink to="/courts">Explore the three courts <span aria-hidden="true">↗</span></ButtonLink>
        <span className="how-next-decoration" aria-hidden="true">01</span>
      </section>
    </section>
  );
}
