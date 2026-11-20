import {formatTimeTrackerClock} from '../../time-tracker-time-format.js';
/** Nine-hour credited-work clock-out policy and approved-overtime extension logic.
 * All timestamps are absolute instants; calendar intervals are interpreted in Asia/Manila.
 */
import {
  creditedAttendanceMs,
  timeTrackerManilaDay,
} from "./time-tracker-policy.js";

export const TT_AUTO_CLOCKOUT_POLICY = Object.freeze({
  requiredWorkMs: 9 * 60 * 60 * 1000,
  gracePeriodMs: 30 * 60 * 1000,
  timezone: "Asia/Manila",
});

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const validInstant = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

function timeOnPhtDay(date, time) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date || "") ||
    !/^\d{2}:\d{2}$/.test(time || "")
  )
    return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const local = Date.UTC(year, month - 1, day, hour, minute);
  const normalized = new Date(Date.UTC(year, month - 1, day))
    .toISOString()
    .slice(0, 10);
  if (normalized !== date || hour > 23 || minute > 59) return null;
  return local - PHT_OFFSET_MS;
}

/** Earliest instant at which the existing credited-work calculation reaches nine hours. */
export function timeTrackerNineHourThreshold(
  clockIn,
  requiredWorkMs = TT_AUTO_CLOCKOUT_POLICY.requiredWorkMs,
) {
  const start = Date.parse(clockIn);
  if (
    !Number.isFinite(start) ||
    !Number.isSafeInteger(requiredWorkMs) ||
    requiredWorkMs <= 0
  )
    return null;
  let low = start;
  let high = start + 48 * 60 * 60 * 1000;
  if (
    creditedAttendanceMs(clockIn, new Date(high).toISOString()) < requiredWorkMs
  )
    return null;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const credited = creditedAttendanceMs(
      clockIn,
      new Date(middle).toISOString(),
    );
    if (credited >= requiredWorkMs) high = middle;
    else low = middle + 1;
  }
  return new Date(low).toISOString();
}

function approvedIntervals(requests, ownerId, thresholdAt) {
  const day = timeTrackerManilaDay(thresholdAt);
  return (Array.isArray(requests) ? requests : [])
    .filter(
      (row) =>
        row &&
        row.status === "Approved" &&
        row.ownerId === ownerId &&
        row.date === day,
    )
    .map((row) => {
      const start = timeOnPhtDay(row.date, row.start);
      const end = timeOnPhtDay(row.date, row.end);
      const approvedAt = Date.parse(row.decidedAt || row.approvedAt || "");
      return { start, end, approvedAt, id: row.id };
    })
    .filter(
      (row) =>
        Number.isFinite(row.start) &&
        Number.isFinite(row.end) &&
        row.end > row.start &&
        Number.isFinite(row.approvedAt),
    )
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Derive the durable state from the original Clock-In timestamp and signed OT snapshot.
 * Approval before the threshold bypasses grace. Approval during grace cancels it.
 * OT intervals only extend the cutoff when they continuously cover the current endpoint.
 */
export function evaluateTimeTrackerAutoClockout({
  clockIn,
  ownerId,
  overtimeRequests = [],
  now = new Date(),
  requiredWorkMs = TT_AUTO_CLOCKOUT_POLICY.requiredWorkMs,
  gracePeriodMs = TT_AUTO_CLOCKOUT_POLICY.gracePeriodMs,
} = {}) {
  const thresholdAt = timeTrackerNineHourThreshold(clockIn, requiredWorkMs);
  const nowMs = new Date(now).getTime();
  if (
    !thresholdAt ||
    !Number.isFinite(nowMs) ||
    !ownerId ||
    !Number.isSafeInteger(gracePeriodMs) ||
    gracePeriodMs < 0
  ) {
    return Object.freeze({
      status: "UNMONITORED",
      thresholdAt: null,
      graceDeadlineAt: null,
      overtimeCutoffAt: null,
      cutoffAt: null,
      nextAt: null,
      reason: null,
    });
  }

  const thresholdMs = Date.parse(thresholdAt);
  const graceDeadlineMs = thresholdMs + gracePeriodMs;
  const graceDeadlineAt = new Date(graceDeadlineMs).toISOString();
  let overtimeCutoffMs = thresholdMs;
  const accepted = approvedIntervals(overtimeRequests, ownerId, thresholdAt);
  const appliedOvertimeIds = [];

  for (const interval of accepted) {
    const initialExtension = overtimeCutoffMs === thresholdMs;
    const coversCutoff = initialExtension
      ? interval.start <= graceDeadlineMs && interval.end > graceDeadlineMs
      : interval.start <= overtimeCutoffMs && interval.end > overtimeCutoffMs;
    if (
      coversCutoff &&
      interval.approvedAt <=
        (initialExtension ? graceDeadlineMs : overtimeCutoffMs)
    ) {
      overtimeCutoffMs = interval.end;
      appliedOvertimeIds.push(interval.id);
    }
  }

  const overtimeCutoffAt =
    overtimeCutoffMs > thresholdMs
      ? new Date(overtimeCutoffMs).toISOString()
      : null;

  if (nowMs < thresholdMs) {
    return Object.freeze({
      status: overtimeCutoffAt ? "OVERTIME" : "MONITORING",
      thresholdAt,
      graceDeadlineAt,
      overtimeCutoffAt,
      cutoffAt: null,
      nextAt: overtimeCutoffAt || thresholdAt,
      reason: null,
      overtimeRequestIds: Object.freeze(appliedOvertimeIds),
    });
  }

  if (overtimeCutoffAt) {
    if (nowMs >= overtimeCutoffMs) {
      return Object.freeze({
        status: "DUE",
        thresholdAt,
        graceDeadlineAt,
        overtimeCutoffAt,
        cutoffAt: overtimeCutoffAt,
        nextAt: overtimeCutoffAt,
        reason: "approved_overtime_ended",
        overtimeRequestIds: Object.freeze(appliedOvertimeIds),
      });
    }
    return Object.freeze({
      status: "OVERTIME",
      thresholdAt,
      graceDeadlineAt,
      overtimeCutoffAt,
      cutoffAt: null,
      nextAt: overtimeCutoffAt,
      reason: null,
      overtimeRequestIds: Object.freeze(appliedOvertimeIds),
    });
  }

  if (nowMs >= graceDeadlineMs) {
    return Object.freeze({
      status: "DUE",
      thresholdAt,
      graceDeadlineAt,
      overtimeCutoffAt: null,
      cutoffAt: graceDeadlineAt,
      nextAt: graceDeadlineAt,
      reason: "nine_hour_threshold_grace_expired",
      overtimeRequestIds: Object.freeze([]),
    });
  }

  return Object.freeze({
    status: "GRACE",
    thresholdAt,
    graceDeadlineAt,
    overtimeCutoffAt: null,
    cutoffAt: null,
    nextAt: graceDeadlineAt,
    reason: null,
    overtimeRequestIds: Object.freeze([]),
  });
}

export function formatTimeTrackerAutoClockoutTime(value) {
  return formatTimeTrackerClock(value);
}
