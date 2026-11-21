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
  const [availability, setAvailability] = useState<{key: string; slots: Record<number, 'available'|'unavailable'>} | null>(null);
  const [availabilityError, setAvailabilityError] = useState('');
  useEffect(() => {
    if (!stagingAvailability || !selectedCourt) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      courtId:selectedCourt.id,date:selectedDate,durationMinutes:String(durationMinutes),
    });
    void fetch(`${configuredGuestApiBase}/v1/availability?${params}`, { signal:controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Server availability is unavailable. Refresh before selecting a time.');
        const data: {source: string; slots: {startMinute: number; status: 'available'|'unavailable'}[]} = await response.json();
        if (data.source !== 'server') throw new Error('Server availability was not confirmed.');
        return Object.fromEntries(data.slots.map(slot => [slot.startMinute, slot.status])) as Record<number,'available'|'unavailable'>;
      })
      .then(slots => {
        if (!controller.signal.aborted) { setAvailability({key: availabilityKey,slots}); setAvailabilityError(''); }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setAvailabilityError(reason instanceof Error ? reason.message : 'Availability lookup failed.');
      });
    return () => controller.abort();
  }, [stagingAvailability, selectedCourt?.id, selectedDate, durationMinutes, availabilityKey]);
  const serverStatuses = stagingAvailability ? (availability?.key === availabilityKey ? availability.slots : null) : undefined;

  const proposedChoice = selectedCourt && selectedMinute !== null
    ? { courtId: selectedCourt.id, date: selectedDate, startMinute: selectedMinute, durationMinutes }
    : null;
  const validSelection = isValidScheduleChoice(proposedChoice) &&
    (!stagingAvailability || (selectedMinute !== null && serverStatuses?.[selectedMinute] === 'available'));

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
          <div className="eyebrow eyebrow-dark">{stagingAvailability ? 'BOOKING / SERVER AVAILABILITY' : 'BOOKING / SCHEDULE YOUR GAME'}</div>
          <h1 className="page-title">Plan your next game.</h1>
          <p className="page-lede">{stagingAvailability ? (localStaging
            ? 'Court slots are checked against a local staging database. Prices are test fixtures, not venue-approved rates.'
            : 'Court slots are checked against the Paseo booking schema in Supabase. Unapproved courts remain unavailable.') : 'Choose a court to start. Live availability, checkout, and booking confirmation are not connected.'}</p>
        </div>
        <div className="courts-page-summary booking-page-summary" role="group" aria-label="Booking selection overview">
          <div><strong>{selectedCourt ? selectedCourt.id.split('-').at(-1)?.padStart(2, '0') : '03'}</strong><span>{selectedCourt ? 'Selected court' : 'Courts to choose from'}</span></div>
          <span className="courts-summary-divider" aria-hidden="true" />
          <div><strong>{durationMinutes}</strong><span>Starting minutes</span></div>
        </div>
      </header>
      <BookingProgress stage="schedule" />
      <div className="demo-banner" role="note">
        <strong>{stagingAvailability ? (localStaging ? 'LOCAL STAGING — not real venue inventory or rates' : 'SUPABASE BOOKING — COURT APPROVAL REQUIRED') : 'Demonstration schedule only'}</strong>
        <p>{stagingAvailability ? (localStaging
          ? 'Local SQLite overlap checks determine the visible time slots. Existing venue inventory, venue rates and bank confirmation are not connected. Do not transfer funds for a test booking.'
          : 'Supabase controls availability and rejects overlapping reservations. Courts and rates remain disabled until approved by the venue. Do not pay without a server-issued amount.') : 'All times, occupied periods, and maintenance blocks are illustrative mock data. No slot is checked against a real booking system, held, or reserved. Times shown are Philippine time (Asia/Manila).'}</p>
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
        <p className="booking-help">{stagingAvailability ? '14 dates in Philippine time, checked against server reservations.' : '14 demonstration dates starting today in the venue\'s timezone.'}</p>
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
        <p className="booking-help">{stagingAvailability ? 'Server-owned slots: occupied and unapproved periods are disabled. Venue operating hours require administrator approval.' : '8:00 AM–10:00 PM mock operating hours. Each choice checks the entire selected duration. Disabled periods cannot be selected.'}</p>
        {stagingAvailability && selectedCourt && (
          <p className="booking-help" role="status">{availabilityError || (serverStatuses ? 'Server availability loaded.' : 'Checking server availability…')}</p>
        )}
        {selectedCourt ? (
          <TimeSlotSelector courtId={selectedCourt.id} dayIndex={dayIndex}
            durationMinutes={durationMinutes} selectedMinute={selectedMinute}
            {...(stagingAvailability ? { serverStatuses: serverStatuses ?? null } : {})}
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
            : (stagingAvailability ? 'Select a server-available slot' : 'Select a mock available slot')}</p>
          <p><strong>Price:</strong> Not configured</p>
          <p><strong>Status:</strong> {validSelection ? (stagingAvailability ? 'Server-available selection — not reserved' : 'Valid mock selection — not reserved') : (stagingAvailability ? 'Awaiting server availability' : 'Incomplete mock selection')}</p>
        </div>
        <div className="booking-continue-section"><p className="booking-help">Enter customer details to review this draft. Only a server-issued receipt can confirm a submitted reservation.</p>
        <button className="button button-primary" type="button"
          disabled={!validSelection} onClick={proceedToDetails}>
          Continue to customer details <span aria-hidden="true">↗</span>
        </button></div>
      </div>
    </section>
  );
}
