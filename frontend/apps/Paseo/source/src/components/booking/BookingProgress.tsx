import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { motionSprings } from '../../motion/presets';

const stages = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'details', label: 'Details' },
  { key: 'review', label: 'Review' },
  { key: 'payment', label: 'Payment' },
] as const;
export type BookingStage = typeof stages[number]['key'];

/** Navigation cue only: never represents a confirmed booking or a payment. */
export function BookingProgress({ stage }: { stage: BookingStage }) {
  const reduced = useReducedMotion();
  const currentIndex = stages.findIndex((item) => item.key === stage);
  return (
    <nav className="immersive-booking-progress" aria-label="Booking steps">
      <ol>
        {stages.map((item, index) => {
          const current = index === currentIndex;
          return (
            <li key={item.key} className={index < currentIndex ? 'step-visited' : ''}
              {...(current ? { 'aria-current': 'step' as const } : {})}>
              <span className="immersive-step-number">
                {current && <m.span className="immersive-step-active" aria-hidden="true"
                  {...(reduced ? {} : { layoutId: 'booking-progress-active' })}
                  transition={motionSprings.interactive} />}
                <span>{String(index + 1).padStart(2, '0')}</span>
              </span>
              <span className="immersive-step-label">{item.label}</span>
            </li>
          );
        })}
      </ol>
      <p>A selection is not a confirmed reservation. Court availability and payment must be confirmed.</p>
    </nav>
  );
}
