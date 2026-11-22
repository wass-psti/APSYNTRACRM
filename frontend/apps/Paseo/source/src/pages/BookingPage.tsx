import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { motionSprings } from '../motion/presets';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useBookingDraft } from '../booking/BookingDraftContext';
import { BookingProgress } from '../components/booking/BookingProgress';
import { isValidScheduleChoice } from '../booking/bookingDraft';
import { DateSelector } from '../components/booking/DateSelector';
import { TimeSlotSelector } from '../components/booking/TimeSlotSelector';
import { courts } from '../mocks/courts';
import { configuredGuestApiBase, guestSubmissionConfigured } from '../guest/guestReservation';
import {
  durationChoices, formatDemoDate, formatTime, getDemoDates,
  getDemoStartDate,
} from '../utils/scheduleUtils';

export function BookingPage() {
  const reduced = useReducedMotion();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { schedule, saveSchedule, clearDraft } = useBookingDraft();
  const [startDate] = useState(getDemoStartDate);
  const [selectedDate, setSelectedDate] = useState(schedule?.date ?? startDate);
  const [durationMinutes, setDurationMinutes] = useState<number>(schedule?.durationMinutes ?? 60);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(schedule?.startMinute ?? null);
  const selectedCourt = courts.find((court) => court.id === (params.get('court') ?? schedule?.courtId));
  const dates = getDemoDates(startDate);
  const dayIndex = dates.indexOf(selectedDate);
  const stagingAvailability = guestSubmissionConfigured;
  const localStaging = import.meta.env.DEV && import.meta.env.VITE_STAGING_ONLY === '1';
  const availabilityKey = selectedCourt ? `${selectedCourt.id}:${selectedDate}:${durationMinutes}` : '';
  const [availability, setAvailability] = useState<{
    key: string;
    slots: Record<number, 'available'|'unavailable'>;
    bookingEnabled: boolean;
    reason: 'court_not_enabled'|'weekday_closed'|'rates_not_configured'|null;
  } | null>(null);
  const [availabilityError, setAvailabilityError] = useState('');
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const serverAvailability = availability?.key === availabilityKey ? availability : null;
  const serverStatuses = stagingAvailability ? (serverAvailability?.slots ?? null) : undefined;
  useEffect(() => {
    if (!stagingAvailability || !selectedCourt) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      courtId:selectedCourt.id,date:selectedDate,durationMinutes:String(durationMinutes),
    });
    setAvailabilityError('');
    void fetch(`${configuredGuestApiBase}/v1/availability?${params}`, { signal:controller.signal })
      .then(async response => {
        const data: {
          source?: string;
          slots?: {startMinute: number; status: 'available'|'unavailable'}[];
          bookingEnabled?: boolean;
          availabilityReason?: 'court_not_enabled'|'weekday_closed'|'rates_not_configured'|null;
          error?: string;
        } = await response.json();
        if (!response.ok) {
          throw new Error(data.error === 'invalid_schedule'
            ? 'No operating schedule is available for this court and date.'
            : 'Could not check available times. Please retry.');
        }
        if (data.source !== 'server' || !Array.isArray(data.slots)) {
          throw new Error('Available times could not be confirmed. Please retry.');
        }
        const slots = Object.fromEntries(data.slots
          .filter(slot => Number.isInteger(slot.startMinute) &&
            slot.startMinute >= 0 && slot.startMinute + durationMinutes <= 1440 &&
            ['available','unavailable'].includes(slot.status))
          .map(slot => [slot.startMinute, slot.status])) as Record<number,'available'|'unavailable'>;
        return {
          slots,
          // Older successful API responses imply the court and its rate were enabled.
          bookingEnabled: data.bookingEnabled ?? true,
          reason: data.availabilityReason ?? null,
        };
      })
      .then(result => {
        if (!controller.signal.aborted) {
          setAvailability({key: availabilityKey, ...result});
          setAvailabilityError('');
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setAvailability({key: availabilityKey, slots: {}, bookingEnabled: false, reason: null});
          setAvailabilityError(reason instanceof Error ? reason.message : 'Availability lookup failed.');
        }
      });
    return () => controller.abort();
  }, [stagingAvailability, selectedCourt?.id, selectedDate, durationMinutes, availabilityKey, availabilityRetry]);
  const availabilityNotice = serverAvailability?.reason === 'court_not_enabled'
    ? 'This court is not enabled for booking. Its saved operating hours are shown, but booking remains unavailable.'
    : serverAvailability?.reason === 'rates_not_configured'
      ? 'Saved operating hours are shown. Booking remains unavailable until rates are configured.'
      : serverAvailability?.reason === 'weekday_closed'
        ? 'This court is closed on the selected weekday.'
        : serverAvailability?.bookingEnabled
          ? 'Available times updated.'
          : '';

  const proposedChoice = selectedCourt && selectedMinute !== null
    ? { courtId: selectedCourt.id, date: selectedDate, startMinute: selectedMinute, durationMinutes }
    : null;
  const validSelection = isValidScheduleChoice(proposedChoice) &&
    (!stagingAvailability || (selectedMinute !== null && serverStatuses?.[selectedMinute] === 'available'));
  const bookingStatus = validSelection
    ? (stagingAvailability ? 'Available selection — not yet reserved' : 'Sample selection — not reserved')
    : stagingAvailability
      ? !selectedCourt
        ? 'Select a court'
        : availabilityError
          ? 'Availability could not be confirmed'
          : !serverAvailability
            ? 'Checking available times'
            : serverAvailability.reason === 'court_not_enabled'
              ? 'Court not enabled for booking'
              : serverAvailability.reason === 'rates_not_configured'
                ? 'Rates not configured'
                : serverAvailability.reason === 'weekday_closed'
                  ? 'Closed on the selected weekday'
                  : 'Choose an available time'
      : 'Time not selected';

  function proceedToDetails() {
    if (!validSelection || !proposedChoice) return;
    saveSchedule(proposedChoice);
    navigate('/book/details');
  }

  function changeCourt(courtId: string) {
    setParams(courtId ? { court: courtId } : {});
    setSelectedMinute(null);
    clearDraft();
  }

  function changeDate(date: string) {
    setSelectedDate(date);
    setSelectedMinute(null);
    clearDraft();
  }

  function changeDuration(duration: number) {
    setDurationMinutes(duration);
    setSelectedMinute(null);
    clearDraft();
  }

  return (
    <section className="container section booking-section courts-page booking-page">
      <Link className="court-back-link" to="/courts">
        <span aria-hidden="true">←</span> All courts
      </Link>
      <header className="courts-page-intro booking-page-intro">
        <div className="courts-page-copy">
          <div className="eyebrow eyebrow-dark">{stagingAvailability ? 'BOOKING / CHOOSE YOUR TIME' : 'BOOKING / SCHEDULE YOUR GAME'}</div>
          <h1 className="page-title">Plan your next game.</h1>
          <p className="page-lede">{stagingAvailability ? (localStaging
            ? 'These are sample times and prices for testing only. They are not real venue offers.'
            : 'Choose a date and time. Courts awaiting venue approval are not available for booking.') : 'Choose a court to explore sample times. Online reservations are not yet available.'}</p>
        </div>
        <div className="courts-page-summary booking-page-summary" role="group" aria-label="Booking selection overview">
          <div><strong>{selectedCourt ? selectedCourt.id.split('-').at(-1)?.padStart(2, '0') : '03'}</strong><span>{selectedCourt ? 'Selected court' : 'Courts to choose from'}</span></div>
          <span className="courts-summary-divider" aria-hidden="true" />
          <div><strong>{durationMinutes}</strong><span>Starting minutes</span></div>
        </div>
      </header>
      <BookingProgress stage="schedule" />
      <div className="demo-banner" role="note">
        <strong>{stagingAvailability ? (localStaging ? 'TEST BOOKING — DO NOT SEND MONEY' : 'COURT AVAILABILITY SUBJECT TO APPROVAL') : 'Demonstration schedule only'}</strong>
        <p>{stagingAvailability ? (localStaging
          ? 'Times and prices shown here are for testing only. Do not transfer money for a test booking.'
          : 'Only approved courts and times can be booked. Do not send payment until you receive a confirmed amount and recipient details.') : 'These are example times, not actual court availability. Choosing a time does not reserve a court. All times use Philippine time.'}</p>
      </div>

      <div className="booking-panel booking-scheduler">
        <div className="booking-scheduler-heading"><span>01 / BUILD YOUR SCHEDULE</span><span>PHILIPPINE TIME · ASIA/MANILA</span></div>
        <label className="field-label" htmlFor="court-picker">Select court</label>
        <select className="field" id="court-picker" value={selectedCourt?.id ?? ''} onChange={(event) => changeCourt(event.target.value)}>
          <option value="">Choose a court</option>
          {courts.map((court) => <option value={court.id} key={court.id}>{court.name}</option>)}
        </select>
        <p className="selection-feedback" role="status"><strong>{selectedCourt ? `${selectedCourt.name} selected` : 'No court selected'}</strong></p>

        <h2 className="booking-heading">Choose a date</h2>
        <p className="booking-help">{stagingAvailability ? 'Select a date from the next 14 days (Philippine time).' : '14 sample dates starting today (Philippine time).'}</p>
        <DateSelector dates={dates} selectedDate={selectedDate} onSelect={changeDate} serverBacked={stagingAvailability} />

        <h2 className="booking-heading">Choose your duration</h2>
        <div className="duration-grid" role="group" aria-label="Booking duration">
          {durationChoices.map((duration) => (
            <m.button key={duration} type="button" className="choice-button immersive-duration-button"
              aria-pressed={durationMinutes === duration}
              onClick={() => changeDuration(duration)}
              {...(reduced ? {} : { whileTap: { scale: 0.97 } })}
              transition={motionSprings.interactive}>
              {durationMinutes === duration && <m.span className="immersive-duration-selection" aria-hidden="true"
                {...(reduced ? {} : { layoutId: 'booking-duration-selection' })} transition={motionSprings.interactive} />}
              <span className="immersive-duration-text">{duration} minutes</span>
            </m.button>
          ))}
        </div>

        <h2 className="booking-heading">Choose a start time</h2>
        <div className="booking-time-legend" aria-label="Time slot status guide">
          <span className="is-available"><i aria-hidden="true" /> Available</span>
          <span className="is-unavailable"><i aria-hidden="true" /> Unavailable</span>
          {!stagingAvailability && <span className="is-maintenance"><i aria-hidden="true" /> Maintenance</span>}
        </div>
        <p className="booking-help">{stagingAvailability ? 'Unavailable or unapproved time slots cannot be selected.' : 'Example operating hours are 8:00 AM–10:00 PM. Unavailable periods cannot be selected.'}</p>
        {stagingAvailability && selectedCourt && (
          <>
            <p className="booking-help" role="status">
              {availabilityError || availabilityNotice || (serverAvailability ? 'Operating hours loaded.' : 'Checking available times…')}
            </p>
            {availabilityError && (
              <button className="button button-secondary" type="button"
                onClick={() => setAvailabilityRetry(value => value + 1)}>
                Retry availability
              </button>
            )}
          </>
        )}
        {selectedCourt ? (
          <TimeSlotSelector courtId={selectedCourt.id} dayIndex={dayIndex}
            durationMinutes={durationMinutes} selectedMinute={selectedMinute}
            {...(stagingAvailability ? {
              serverStatuses: serverStatuses ?? null,
              ...(availabilityError ? {
                emptyMessage: 'Start times could not be loaded. Retry the availability check.',
              } : serverAvailability?.reason === 'weekday_closed' ? {
                emptyMessage: 'This court is closed on the selected weekday.',
              } : {}),
            } : {})}
            onSelect={(minute) => { setSelectedMinute(minute); clearDraft(); }} />
        ) : <p className="booking-empty" role="status">Select a court to view its available times.</p>}

        <div className="booking-summary immersive-booking-summary" role="status">
          <div className="booking-summary-eyebrow">02 / YOUR CURRENT SELECTION <span>NOT RESERVED</span></div>
          <h2>Selection summary</h2>
          <p><strong>Court:</strong> {selectedCourt?.name ?? 'Not selected'}</p>
          <p><strong>Date:</strong> {formatDemoDate(selectedDate)}</p>
          <p><strong>Duration:</strong> {durationMinutes} minutes</p>
          <p><strong>Time:</strong> {validSelection && selectedMinute !== null
            ? `${formatTime(selectedMinute)} – ${formatTime(selectedMinute + durationMinutes)}`
            : (stagingAvailability ? 'Choose an available time' : 'Time not selected')}</p>
          <p><strong>Price:</strong> Not configured</p>
          <p><strong>Status:</strong> {bookingStatus}</p>
        </div>
        <div className="booking-continue-section"><p className="booking-help">Add your contact details to review the booking. Your time is not reserved until the booking is accepted.</p>
        <button className="button button-primary" type="button"
          disabled={!validSelection} onClick={proceedToDetails}>
          Continue to customer details <span aria-hidden="true">↗</span>
        </button></div>
      </div>
    </section>
  );
}
