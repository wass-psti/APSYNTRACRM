import { useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "../components/admin/AdminShell";
import {
  backendAdminFetch,
  sharedSupabaseAdminEnabled,
} from "../admin/staging/StagingAdminGate";
import { addDays, formatTime, getDemoStartDate } from "../utils/scheduleUtils";

interface WeekdayHours {
  courtId: string;
  weekday: number;
  enabled: boolean;
  openMinute: number;
  closeMinute: number;
}
interface MaintenanceBlock {
  id: string;
  courtId: string;
  date: string;
  startMinute: number;
  endMinute: number;
}
interface Court {
  courtId: string;
  name: string;
  enabled: boolean;
  openMinute: number;
  closeMinute: number;
}

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const times = Array.from({ length: 49 }, (_, index) => index * 30);

function formatCalendarDate(date: string) {
  const value = new Date(date + "T00:00:00Z");
  if (Number.isNaN(value.getTime())) return date;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

/** Reads and writes only persisted Paseo maintenance and weekday hours. */
export function AdminCalendarPage() {
  const today = getDemoStartDate();
  const [courts, setCourts] = useState<Court[]>([]);
  const [weekdaysData, setWeekdaysData] = useState<WeekdayHours[]>([]);
  const [blocks, setBlocks] = useState<MaintenanceBlock[]>([]);
  const [courtId, setCourtId] = useState("court-1");
  const [weekday, setWeekday] = useState(1);
  const [editingScheduleKey, setEditingScheduleKey] = useState<string | null>(
    null,
  );
  const [date, setDate] = useState(today);
  const [enabled, setEnabled] = useState(true);
  const [opening, setOpening] = useState(480);
  const [closing, setClosing] = useState(1320);
  const [startMinute, setStartMinute] = useState(720);
  const [endMinute, setEndMinute] = useState(780);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const court = courts.find((item) => item.courtId === courtId);
  const savedWeekdays = [...weekdaysData].sort(
    (a, b) => a.courtId.localeCompare(b.courtId) || a.weekday - b.weekday,
  );
  const savedBlocks = [...blocks].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.courtId.localeCompare(b.courtId) ||
      a.startMinute - b.startMinute,
  );

  async function readback(): Promise<{
    weekdays: WeekdayHours[];
    blocks: MaintenanceBlock[];
  }> {
    const [calendarResponse, courtResponse] = await Promise.all([
      backendAdminFetch("/v1/admin/calendar", { cache: "no-store" }),
      backendAdminFetch("/v1/admin/courts", { cache: "no-store" }),
    ]);
    if (!calendarResponse.ok || !courtResponse.ok) {
      throw new Error("Calendar could not be loaded. Please refresh.");
    }

    const calendar = (await calendarResponse.json()) as {
      weekdays: WeekdayHours[];
      blocks: MaintenanceBlock[];
    };
    const courtData = (await courtResponse.json()) as { courts: Court[] };
    if (
      !Array.isArray(calendar.weekdays) ||
      !Array.isArray(calendar.blocks) ||
      !Array.isArray(courtData.courts)
    ) {
      throw new Error("Calendar could not be displayed. Please refresh.");
    }

    setWeekdaysData(calendar.weekdays);
    setBlocks(calendar.blocks);
    setCourts(courtData.courts);
    setLoaded(true);
    return calendar;
  }

  useEffect(() => {
    if (!sharedSupabaseAdminEnabled) return;
    void readback().catch((error) =>
      setMessage(
        error instanceof Error ? error.message : "Calendar loading failed.",
      ),
    );
  }, []);

  useEffect(() => {
    const override = weekdaysData.find(
      (item) => item.courtId === courtId && item.weekday === weekday,
    );
    setEnabled(override?.enabled ?? true);
    setOpening(override?.openMinute ?? court?.openMinute ?? 480);
    setClosing(override?.closeMinute ?? court?.closeMinute ?? 1320);
  }, [courtId, weekday, court?.openMinute, court?.closeMinute, weekdaysData]);

  async function refreshCalendar() {
    setRefreshing(true);
    setMessage("Refreshing saved schedules…");
    try {
      await readback();
      setMessage("Calendar refreshed.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Calendar refresh failed.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function save(
    path: string,
    method: "POST" | "PUT" | "DELETE",
    body?: object,
  ) {
    setBusy(true);
    setMessage("Saving changes…");
    try {
      const options: RequestInit = { method };
      if (body) {
        options.headers = { "content-type": "application/json" };
        options.body = JSON.stringify(body);
      }
      const response = await backendAdminFetch(path, options);
      let result: {
        error?: string;
        updated?: boolean;
        created?: boolean;
        removed?: boolean;
        id?: string;
      } = {};
      try {
        result = (await response.json()) as typeof result;
      } catch {
        // A failed or empty response is handled below without hiding the save error.
      }
      if (!response.ok) {
        if (result.error === "invalid_weekday_schedule") {
          throw new Error(
            "Choose an opening time earlier than the closing time.",
          );
        }
        if (result.error === "weekday_booking_conflict") {
          throw new Error(
            "This change conflicts with an existing pending or confirmed booking. Choose hours that keep the booking within the schedule.",
          );
        }
        throw new Error(
          response.status === 409
            ? "The calendar changed in another session. Refresh before retrying."
            : "Calendar changes could not be saved. Please try again.",
        );
      }

      const stored = await readback();
      if (method === "PUT") {
        const match = path.match(
          /\/calendar\/(court-[1-9][0-9]*)\/weekdays\/([0-6])$/,
        );
        const submitted = body as {
          enabled: boolean;
          openMinute: number;
          closeMinute: number;
        };
        const item = stored.weekdays.find(
          (day) =>
            day.courtId === match?.[1] && day.weekday === Number(match?.[2]),
        );
        if (
          !result.updated ||
          !item ||
          item.enabled !== submitted.enabled ||
          item.openMinute !== submitted.openMinute ||
          item.closeMinute !== submitted.closeMinute
        ) {
          throw new Error(
            "The schedule change could not be confirmed. Refresh before trying again.",
          );
        }
      } else if (method === "POST") {
        const submitted = body as {
          courtId: string;
          date: string;
          startMinute: number;
          endMinute: number;
        };
        const item = stored.blocks.find((block) => block.id === result.id);
        if (
          !result.created ||
          !result.id ||
          !item ||
          item.courtId !== submitted.courtId ||
          item.date !== submitted.date ||
          item.startMinute !== submitted.startMinute ||
          item.endMinute !== submitted.endMinute
        ) {
          throw new Error(
            "The maintenance period could not be confirmed. Refresh before trying again.",
          );
        }
      } else {
        const id = path.split("/").at(-1);
        if (!result.removed || stored.blocks.some((block) => block.id === id)) {
          throw new Error(
            "Maintenance removal could not be confirmed. Refresh before trying again.",
          );
        }
      }
      setMessage("Changes saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Calendar update failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function editSchedule(item: WeekdayHours) {
    setCourtId(item.courtId);
    setWeekday(item.weekday);
    setEnabled(item.enabled);
    setOpening(item.openMinute);
    setClosing(item.closeMinute);
    setEditingScheduleKey(`${item.courtId}:${item.weekday}`);
  }

  function submitWeekday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (opening >= closing) {
      setMessage("Closing time must be later than opening time.");
      return;
    }
    void save(`/v1/admin/calendar/${courtId}/weekdays/${weekday}`, "PUT", {
      enabled,
      openMinute: opening,
      closeMinute: closing,
    });
  }

  function submitMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save("/v1/admin/calendar/maintenance", "POST", {
      courtId,
      date,
      startMinute,
      endMinute,
    });
  }

  return (
    <AdminShell title="Court calendar.">
      {!sharedSupabaseAdminEnabled ? (
        <section className="booking-panel" role="status">
          <h2 className="review-heading">Court calendar unavailable</h2>
          <p>
            Court schedules cannot be changed right now. Please try again later.
          </p>
        </section>
      ) : (
        <>
          <p className="page-lede">
            Set opening hours and schedule maintenance for each court.
          </p>
          <div className="admin-calendar-toolbar">
            <p role="status" className="admin-message" aria-live="polite">
              {message ||
                (loaded ? "Calendar is up to date." : "Loading calendar…")}
            </p>
            <button
              className="button button-secondary"
              type="button"
              disabled={busy || refreshing}
              onClick={() => void refreshCalendar()}
            >
              {refreshing ? "Refreshing…" : "Refresh saved schedules"}
            </button>
          </div>

          <div className="booking-panel">
            <label className="form-field">
              Court
              <select
                aria-label="Calendar court"
                value={courtId}
                onChange={(event) => {
                  setEditingScheduleKey(null);
                  setCourtId(event.target.value);
                }}
              >
                {courts.map((item) => (
                  <option key={item.courtId} value={item.courtId}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <h2 className="review-heading">Weekly operating hours</h2>
            <form className="admin-maintenance-form" onSubmit={submitWeekday}>
              <label>
                Weekday
                <select
                  aria-label="Operating weekday"
                  value={weekday}
                  onChange={(event) => {
                    setEditingScheduleKey(null);
                    setWeekday(Number(event.target.value));
                  }}
                >
                  {weekdays.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Opens
                <select
                  aria-label="Opening time"
                  value={opening}
                  onChange={(event) => setOpening(Number(event.target.value))}
                >
                  {times
                    .filter((time) => time < 1440)
                    .map((time) => (
                      <option key={time} value={time}>
                        {formatTime(time)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Closes
                <select
                  aria-label="Closing time"
                  value={closing}
                  onChange={(event) => setClosing(Number(event.target.value))}
                >
                  {times
                    .filter((time) => time > 0)
                    .map((time) => (
                      <option key={time} value={time}>
                        {formatTime(time)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                />
                Open on this weekday
              </label>
              {opening >= closing ? (
                <p className="booking-help" role="alert">
                  Closing time must be later than opening time.
                </p>
              ) : null}
              <button
                className="button button-primary"
                disabled={busy || refreshing || !loaded || opening >= closing}
                type="submit"
              >
                {editingScheduleKey === `${courtId}:${weekday}`
                  ? "Update weekday schedule"
                  : "Save weekday schedule"}
              </button>
            </form>

            <section
              className="admin-calendar-record-section"
              aria-labelledby="saved-weekly-heading"
            >
              <div className="admin-calendar-record-header">
                <div>
                  <h2 className="review-heading" id="saved-weekly-heading">
                    Saved weekly schedules
                  </h2>
                  <p className="booking-help">
                    Every configured court and weekday schedule is listed here.
                  </p>
                </div>
                <span className="admin-calendar-record-count">
                  {weekdaysData.length} saved
                </span>
              </div>
              {!loaded ? (
                <p className="admin-calendar-empty" role="status">
                  {message
                    ? "Saved schedules could not be loaded. Refresh to try again."
                    : "Loading saved weekly schedules…"}
                </p>
              ) : savedWeekdays.length === 0 ? (
                <p className="admin-calendar-empty">
                  No weekly operating schedules have been saved.
                </p>
              ) : (
                <ul
                  className="admin-calendar-record-list"
                  aria-label="Saved weekly schedules"
                >
                  {savedWeekdays.map((item) => {
                    const itemCourt = courts.find(
                      (value) => value.courtId === item.courtId,
                    );
                    const day = weekdays[item.weekday] ?? "Unknown weekday";
                    return (
                      <li key={item.courtId + "-" + item.weekday}>
                        <div className="admin-calendar-record-copy">
                          <strong>{itemCourt?.name ?? item.courtId}</strong>
                          <span>{day}</span>
                          <small>
                            {item.enabled
                              ? `${formatTime(item.openMinute)} – ${formatTime(item.closeMinute)}`
                              : "Closed"}
                          </small>
                        </div>
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={busy || refreshing}
                          aria-label={`Edit ${itemCourt?.name ?? item.courtId} ${day} schedule`}
                          onClick={() => editSchedule(item)}
                        >
                          Edit schedule
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <h2 className="review-heading">Maintenance blocks</h2>
            <form
              className="admin-maintenance-form"
              onSubmit={submitMaintenance}
            >
              <label>
                Date
                <input
                  aria-label="Maintenance date"
                  type="date"
                  value={date}
                  min={today}
                  max={addDays(today, 13)}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </label>
              <label>
                From
                <select
                  aria-label="Maintenance start"
                  value={startMinute}
                  onChange={(event) =>
                    setStartMinute(Number(event.target.value))
                  }
                >
                  {times.slice(0, -1).map((time) => (
                    <option key={time} value={time}>
                      {formatTime(time)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                To
                <select
                  aria-label="Maintenance end"
                  value={endMinute}
                  onChange={(event) => setEndMinute(Number(event.target.value))}
                >
                  {times.slice(1).map((time) => (
                    <option key={time} value={time}>
                      {formatTime(time)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button button-primary"
                disabled={
                  busy ||
                  refreshing ||
                  !loaded ||
                  !date ||
                  startMinute >= endMinute
                }
                type="submit"
              >
                Add maintenance block
              </button>
            </form>

            <section
              className="admin-calendar-record-section"
              aria-labelledby="saved-maintenance-heading"
            >
              <div className="admin-calendar-record-header">
                <div>
                  <h2 className="review-heading" id="saved-maintenance-heading">
                    Saved maintenance blocks
                  </h2>
                  <p className="booking-help">
                    All saved maintenance periods across every court are shown
                    here.
                  </p>
                </div>
                <span className="admin-calendar-record-count">
                  {blocks.length} saved
                </span>
              </div>
              {!loaded ? (
                <p className="admin-calendar-empty" role="status">
                  {message
                    ? "Maintenance blocks could not be loaded. Refresh to try again."
                    : "Loading saved maintenance blocks…"}
                </p>
              ) : savedBlocks.length === 0 ? (
                <p className="admin-calendar-empty">
                  No maintenance blocks have been saved.
                </p>
              ) : (
                <ul
                  className="admin-calendar-record-list"
                  aria-label="Saved maintenance blocks"
                >
                  {savedBlocks.map((block) => {
                    const itemCourt = courts.find(
                      (value) => value.courtId === block.courtId,
                    );
                    return (
                      <li key={block.id}>
                        <div className="admin-calendar-record-copy">
                          <strong>{itemCourt?.name ?? block.courtId}</strong>
                          <span>{formatCalendarDate(block.date)}</span>
                          <small>
                            {formatTime(block.startMinute)} –{" "}
                            {formatTime(block.endMinute)}
                          </small>
                        </div>
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={busy || refreshing}
                          aria-label={`Remove ${itemCourt?.name ?? block.courtId} maintenance on ${block.date}`}
                          onClick={() =>
                            void save(
                              `/v1/admin/calendar/maintenance/${block.id}`,
                              "DELETE",
                            )
                          }
                        >
                          Remove block
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </AdminShell>
  );
}
