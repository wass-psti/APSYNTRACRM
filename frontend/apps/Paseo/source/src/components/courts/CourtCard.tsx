import type { Court } from '../../types/domain';
import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { motionPresets, motionSprings } from '../../motion/presets';
import { ButtonLink } from '../ui/ButtonLink';
import { CourtIllustration } from './CourtIllustration';
import { getCourtNumber } from '../../utils/courtUtils';
import { durationChoices, formatBookingDuration } from '../../utils/scheduleUtils';

interface CourtCardProps {
  court: Court;
}

export function CourtCard({ court }: CourtCardProps) {
  const reduced = useReducedMotion();
  return (
    <m.article
      className="court-card motion-court-card"
      data-court-id={court.id}
      aria-labelledby={`court-card-title-${court.id}`}
      {...(reduced ? {} : { whileHover: motionPresets.cardHover })}
      transition={motionSprings.interactive}
    >
      <CourtIllustration courtId={court.id} />
      <div className="card-body">
        <div>
          <div className="court-card-title-row">
            <h3 id={`court-card-title-${court.id}`}>{court.name}</h3>
            <span className="court-card-number" aria-hidden="true">{getCourtNumber(court.id)}</span>
          </div>
          <p>{court.description}</p>
          <ul className="court-features" aria-label={`${court.name} features`}>
            {court.features.map((feature) => <li key={feature}>{feature}</li>)}
          </ul>
        </div>
        <dl className="court-data" aria-label={`${court.name} booking information`}>
          <div><dt>Hourly rate</dt><dd>Server quote at booking</dd></div>
          <div><dt>Availability</dt><dd className="status-unknown">Check booking schedule</dd></div>
          <div className="court-duration-data"><dt>Booking durations</dt><dd>{durationChoices.map(formatBookingDuration).join(' · ')}</dd></div>
        </dl>
        <div className="court-card-actions">
          <ButtonLink to={`/courts/${court.id}`} secondary>View details</ButtonLink>
          <ButtonLink to={`/book?court=${encodeURIComponent(court.id)}`}>Select court <span aria-hidden="true">↗</span></ButtonLink>
        </div>
      </div>
    </m.article>
  );
}
