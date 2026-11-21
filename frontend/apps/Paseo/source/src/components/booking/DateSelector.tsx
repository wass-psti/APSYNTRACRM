import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { formatDemoDate } from '../../utils/scheduleUtils';
import { motionSprings } from '../../motion/presets';

interface DateSelectorProps {
  dates: string[];
  selectedDate: string;
  onSelect: (date: string) => void;
  serverBacked?: boolean;
}

/** Accessible 14-day date picker; visual animation never changes schedule rules. */
export function DateSelector({ dates, selectedDate, onSelect, serverBacked = false }: DateSelectorProps) {
  const reduced = useReducedMotion();
  return (
    <div className="date-grid immersive-date-grid" role="group" aria-label={serverBacked ? 'Booking dates' : 'Sample booking dates'}>
      {dates.map((date) => {
        const selected = selectedDate === date;
        return (
          <m.button
            key={date}
            type="button"
            className="choice-button immersive-date-button"
            aria-pressed={selected}
            data-selected={selected}
            onClick={() => onSelect(date)}
            {...(reduced ? {} : { whileTap: { scale: 0.97 } })}
            transition={motionSprings.interactive}
          >
            {selected && <m.span
              className="immersive-date-selection"
              aria-hidden="true"
              {...(reduced ? {} : { layoutId: 'booking-date-selection' })}
              transition={motionSprings.interactive}
            />}
            <span className="immersive-date-text">{formatDemoDate(date)}</span>
          </m.button>
        );
      })}
    </div>
  );
}
