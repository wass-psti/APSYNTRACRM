import { Link, useParams } from 'react-router-dom';
import { CourtIllustration } from '../components/courts/CourtIllustration';
import { ButtonLink } from '../components/ui/ButtonLink';
import { courts } from '../mocks/courts';
import { getCourtById } from '../utils/courtUtils';
import { durationChoices, formatBookingDuration } from '../utils/scheduleUtils';

export function CourtDetailsPage() {
  const { courtId } = useParams();
  const court = getCourtById(courts, courtId);
  if (!court) {
    return <section className="container section placeholder"><h1 className="page-title">Court not found</h1><p className="page-lede">The court link is not recognized.</p><Link className="text-link" to="/courts">Return to all courts</Link></section>;
  }

  const courtNumber = court.id.split('-').at(-1)?.padStart(2, '0') ?? '01';

  return (
    <section className="container section courts-page court-details-page">
      <Link className="court-back-link" to="/courts">
        <span aria-hidden="true">←</span> All courts
      </Link>

      <header className="courts-page-intro court-details-intro">
        <div className="courts-page-copy">
          <div className="eyebrow eyebrow-dark">COURT {courtNumber} / 03 · COURT DETAILS</div>
          <h1 className="page-title">{court.name}</h1>
          <p className="page-lede">{court.description} Explore the court features and continue to the booking schedule when you are ready.</p>
        </div>
        <div className="courts-page-summary" role="group" aria-label={`${court.name} overview`}>
          <div><strong>{courtNumber}</strong><span>Selected court</span></div>
          <span className="courts-summary-divider" aria-hidden="true" />
          <div><strong>03</strong><span>Courts in the venue</span></div>
        </div>
      </header>

      <div className="court-detail-layout">
        <div className="court-detail-art-panel">
          <div className="court-detail-art-heading">
            <span className="eyebrow eyebrow-dark">COURT PREVIEW</span>
            <span className="court-preview-index">{courtNumber} / 03</span>
          </div>
          <CourtIllustration courtId={court.id} large />
          <p className="court-art-caption">Illustrative court artwork · Not a live venue photograph</p>
        </div>

        <div className="court-detail-content">
          <div className="court-detail-section-heading">
            <span className="eyebrow eyebrow-dark">MADE FOR YOUR NEXT GAME</span>
            <h2 className="detail-subtitle">Court features</h2>
            <p>Review the listed court features before continuing to the schedule.</p>
          </div>
          <ul className="detail-features" aria-label={`${court.name} features`}>
            {court.features.map((feature) => <li key={feature}>{feature}</li>)}
          </ul>
          <div className="detail-information" aria-label="Court information">
            <div><span>RATE</span><strong>Server quote at booking</strong></div>
            <div><span>LIVE AVAILABILITY</span><strong>Check booking schedule</strong></div>
            <div><span>OPERATING HOURS</span><strong>Check live booking schedule</strong></div>
            <div><span>BOOKING DURATIONS</span><strong>{durationChoices.map(formatBookingDuration).join(' · ')}</strong></div>
          </div>
          <ButtonLink to={`/book?court=${encodeURIComponent(court.id)}`}>
            Select {court.name} <span aria-hidden="true">↗</span>
          </ButtonLink>
          <p className="mock-note">Your court choice will carry into the next step. No reservation has been made yet.</p>
        </div>
      </div>
    </section>
  );
}
