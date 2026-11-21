import type { ScheduleChoice } from '../../booking/bookingDraft';
import { courts } from '../../mocks/courts';
import { formatDemoDate, formatTime } from '../../utils/scheduleUtils';

/** Existing draft semantics preserved; the premium treatment remains presentational. */
export function BookingSummary({ schedule }: { schedule: ScheduleChoice }) {
  const court = courts.find((item) => item.id === schedule.courtId);
  return (
    <div className="booking-summary immersive-draft-summary" aria-label="Draft booking summary">
      <div className="immersive-summary-heading">
        <h2>Draft selection</h2>
        <span className="immersive-draft-tag">NOT RESERVED</span>
      </div>
      <div className="immersive-summary-grid">
        <p><strong>Court:</strong> {court?.name ?? 'Unknown court'}</p>
        <p><strong>Date:</strong> {formatDemoDate(schedule.date)}</p>
        <p><strong>Time:</strong> {formatTime(schedule.startMinute)} – {formatTime(schedule.startMinute + schedule.durationMinutes)}</p>
        <p><strong>Duration:</strong> {schedule.durationMinutes} minutes</p>
        <p><strong>Price:</strong> Not configured</p>
        <p><strong>Status:</strong> Draft only — not yet reserved</p>
      </div>
    </div>
  );
}
