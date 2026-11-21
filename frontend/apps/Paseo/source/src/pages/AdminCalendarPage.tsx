import { useEffect, useState, type FormEvent } from 'react';
import { AdminShell } from '../components/admin/AdminShell';
import { backendAdminFetch, sharedSupabaseAdminEnabled } from '../admin/staging/StagingAdminGate';
import { addDays, formatTime, getDemoStartDate } from '../utils/scheduleUtils';

interface WeekdayHours { courtId: string; weekday: number; enabled: boolean; openMinute: number; closeMinute: number }
interface MaintenanceBlock { id: string; courtId: string; date: string; startMinute: number; endMinute: number }
interface Court { courtId: string; name: string; enabled: boolean; openMinute: number; closeMinute: number }
const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const times = Array.from({ length: 49 }, (_, index) => index * 30);

/** Reads and writes only persisted Paseo maintenance and weekday hours. */
export function AdminCalendarPage() {
  const today = getDemoStartDate();
  const [courts, setCourts] = useState<Court[]>([]);
  const [weekdaysData, setWeekdaysData] = useState<WeekdayHours[]>([]);
  const [blocks, setBlocks] = useState<MaintenanceBlock[]>([]);
  const [courtId, setCourtId] = useState('court-1');
  const [weekday, setWeekday] = useState(1);
  const [date, setDate] = useState(today);
  const [enabled, setEnabled] = useState(true);
  const [opening, setOpening] = useState(480);
  const [closing, setClosing] = useState(1320);
  const [startMinute, setStartMinute] = useState(720);
  const [endMinute, setEndMinute] = useState(780);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const court = courts.find(item => item.courtId === courtId);
  const matching = blocks.filter(block => block.courtId === courtId && block.date === date);

  async function readback() {
    const [calendarResponse, courtResponse] = await Promise.all([
      backendAdminFetch('/v1/admin/calendar', { cache: 'no-store' }),
      backendAdminFetch('/v1/admin/courts', { cache: 'no-store' }),
    ]);
    if (!calendarResponse.ok || !courtResponse.ok) throw new Error('Could not retrieve persisted calendar.');
    const calendar = await calendarResponse.json() as { weekdays: WeekdayHours[]; blocks: MaintenanceBlock[] };
    const courtData = await courtResponse.json() as { courts: Court[] };
    if (!Array.isArray(calendar.weekdays) || !Array.isArray(calendar.blocks) || !Array.isArray(courtData.courts)) {
      throw new Error('Unexpected calendar response.');
    }
    setWeekdaysData(calendar.weekdays);
    setBlocks(calendar.blocks);
    setCourts(courtData.courts);
    setLoaded(true);
  }

  useEffect(() => {
    if (!sharedSupabaseAdminEnabled) return;
    void readback().catch(error => setMessage(error instanceof Error ? error.message : 'Calendar loading failed.'));
  }, []);
  useEffect(() => {
    const override = weekdaysData.find(item => item.courtId === courtId && item.weekday === weekday);
    setEnabled(override?.enabled ?? true);
    setOpening(override?.openMinute ?? court?.openMinute ?? 480);
    setClosing(override?.closeMinute ?? court?.closeMinute ?? 1320);
  }, [courtId, weekday, court?.openMinute, court?.closeMinute, weekdaysData]);

  async function save(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: object) {
    setBusy(true); setMessage('Saving to the reservation backend…');
    try {
      const options: RequestInit = { method };
      if (body) { options.headers = { 'content-type': 'application/json' }; options.body = JSON.stringify(body); }
      const response = await backendAdminFetch(path, options);
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Calendar update failed.');
      await readback();
      setMessage('Saved and confirmed by a fresh server read.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Calendar update failed.');
    } finally { setBusy(false); }
  }
  function submitWeekday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(`/v1/admin/calendar/${courtId}/weekdays/${weekday}`, 'PUT', { enabled, openMinute: opening, closeMinute: closing });
  }
  function submitMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save('/v1/admin/calendar/maintenance', 'POST', { courtId, date, startMinute, endMinute });
  }
  return <AdminShell title="Court calendar.">
    {!sharedSupabaseAdminEnabled ? <section className="booking-panel" role="status">
      <h2 className="review-heading">Persisted calendar backend unavailable</h2>
      <p>Connect the existing Paseo Supabase service to manage court schedules. This page does not store temporary maintenance.</p>
    </section> : <>
      <p className="page-lede">Set a weekday schedule or block a time for maintenance. Updates are saved to the reservation backend and verified by readback.</p>
      <p role="status" className="admin-message" aria-live="polite">{message || (loaded ? 'Calendar loaded from server.' : 'Loading persisted calendar…')}</p>
      <div className="booking-panel">
        <label className="form-field">Court
          <select aria-label="Calendar court" value={courtId} onChange={event => setCourtId(event.target.value)}>
            {courts.map(item => <option key={item.courtId} value={item.courtId}>{item.name}</option>)}
          </select>
        </label>
        <h2 className="review-heading">Weekly operating hours</h2>
        <form className="admin-maintenance-form" onSubmit={submitWeekday}>
          <label>Weekday
            <select aria-label="Operating weekday" value={weekday} onChange={event => setWeekday(Number(event.target.value))}>
              {weekdays.map((day,index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label>
          <label>Opens
            <select aria-label="Opening time" value={opening} onChange={event => setOpening(Number(event.target.value))}>
              {times.filter(time => time < 1440).map(time => <option key={time} value={time}>{formatTime(time)}</option>)}
            </select>
          </label>
          <label>Closes
            <select aria-label="Closing time" value={closing} onChange={event => setClosing(Number(event.target.value))}>
              {times.filter(time => time > 0).map(time => <option key={time} value={time}>{formatTime(time)}</option>)}
            </select>
          </label>
          <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)}/> Open on this weekday</label>
          <button className="button button-primary" disabled={busy || !loaded || opening >= closing} type="submit">Save weekday schedule</button>
        </form>
        <h2 className="review-heading">Maintenance blocks</h2>
        <form className="admin-maintenance-form" onSubmit={submitMaintenance}>
          <label>Date
            <input aria-label="Maintenance date" type="date" value={date} min={today} max={addDays(today,13)} onChange={event => setDate(event.target.value)} required/>
          </label>
          <label>From
            <select aria-label="Maintenance start" value={startMinute} onChange={event => setStartMinute(Number(event.target.value))}>
              {times.slice(0,-1).map(time => <option key={time} value={time}>{formatTime(time)}</option>)}
            </select>
          </label>
          <label>To
            <select aria-label="Maintenance end" value={endMinute} onChange={event => setEndMinute(Number(event.target.value))}>
              {times.slice(1).map(time => <option key={time} value={time}>{formatTime(time)}</option>)}
            </select>
          </label>
          <button className="button button-primary" disabled={busy || !loaded || !date || startMinute >= endMinute} type="submit">Add maintenance block</button>
        </form>
        <h3 className="review-heading">{court?.name ?? 'Court'} — {date}</h3>
        {!matching.length ? <p>No maintenance blocks stored for this court and date.</p> :
          <ul className="admin-block-list">{matching.map(block => <li key={block.id}>
            <span>{formatTime(block.startMinute)} – {formatTime(block.endMinute)}</span>
            <button className="button button-secondary" type="button" disabled={busy} onClick={() => void save(`/v1/admin/calendar/maintenance/${block.id}`, 'DELETE')}>Remove block</button>
          </li>)}</ul>}
      </div>
    </>}
  </AdminShell>;
}
