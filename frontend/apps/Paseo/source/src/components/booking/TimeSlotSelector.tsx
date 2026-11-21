import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { formatTime, getDemoStartMinutes, getStartStatus } from '../../utils/scheduleUtils';
import { motionSprings } from '../../motion/presets';

interface TimeSlotSelectorProps {
  courtId: string;
  dayIndex: number;
  durationMinutes: number;
  selectedMinute: number | null;
  onSelect: (minute: number) => void;
  serverStatuses?: Record<number, 'available' | 'unavailable'> | null;
}

/** Duration-aware mock time statuses remain entirely owned by the existing schedule utility. */
export function TimeSlotSelector({ courtId, dayIndex, durationMinutes, selectedMinute, onSelect, serverStatuses }: TimeSlotSelectorProps) {
  const reduced = useReducedMotion();

  return (
    <div className="slot-grid immersive-slot-grid" role="group" aria-label={serverStatuses !== undefined ? 'Available start times' : 'Unverified start times'}>
      {serverStatuses === null && (
        <p className="booking-empty" role="status">Checking available times for this court…</p>
      )}
      {serverStatuses !== undefined && serverStatuses !== null &&
        Object.keys(serverStatuses).length === 0 && (
          <p className="booking-empty" role="status">No start times fit this court's operating hours and selected duration.</p>
        )}
      {(serverStatuses !== undefined
        ? Object.keys(serverStatuses ?? {}).map(Number)
            .filter((minute) => Number.isInteger(minute) && minute >= 0 &&
              minute % 30 === 0 && minute + durationMinutes <= 1440)
            .sort((a, b) => a - b)
        : getDemoStartMinutes()).map((minute) => {
        const isServer = serverStatuses !== undefined;
        const status = isServer ? (serverStatuses?.[minute] ?? 'unavailable') : getStartStatus(courtId, dayIndex, minute, durationMinutes);
        const samplePrefix = isServer ? '' : 'sample ';
        const available = status === 'available';
        const selected = available && selectedMinute === minute;
        return (
          <m.button
            key={minute}
            type="button"
            className="choice-button slot-button immersive-slot-button"
            data-slot-state={status}
            disabled={!available}
            aria-pressed={selected}
            onClick={() => onSelect(minute)}
            aria-label={`${formatTime(minute)}, ${status === 'available' ? samplePrefix + 'available' : status === 'blocked' ? samplePrefix + 'maintenance' : samplePrefix + 'unavailable'}`}
            {...(reduced || !available ? {} : { whileTap: { scale: 0.96 } })}
            transition={motionSprings.interactive}
          >
            {selected && <m.span
              className="immersive-slot-selection"
              aria-hidden="true"
              {...(reduced ? {} : { layoutId: 'booking-time-selection' })}
              transition={motionSprings.interactive}
            />}
            <strong>{formatTime(minute)},</strong>
            <small>{status === 'available' ? (isServer ? 'Available' : 'Sample available') : status === 'blocked' ? 'Sample maintenance' : (isServer ? 'Unavailable' : 'Sample unavailable')}</small>
          </m.button>
        );
      })}
    </div>
  );
}
