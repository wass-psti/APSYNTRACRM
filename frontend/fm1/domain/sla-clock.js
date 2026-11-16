import { FM1_CONTRACT, FM1_SLA_TARGETS } from "../constants.js";

const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * SECOND_MS;
const MANILA_OFFSET_HOURS = 8;
const weekdayNumber = Object.freeze({
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
});
const manilaFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: FM1_CONTRACT.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

function epoch(value) {
  const result =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(result))
    throw new TypeError("A valid timestamp is required.");
  return result;
}

function dateParts(value) {
  const parts = Object.fromEntries(
    manilaFormatter
      .formatToParts(new Date(value))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayNumber[parts.weekday],
  };
}

function dateKey({ year, month, day }) {
  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function nextDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return dateKey({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  });
}

function localManilaInstant(key, hour) {
  const [year, month, day] = key.split("-").map(Number);
  // Asia/Manila is UTC+08:00 and has no daylight-saving transition.
  return Date.UTC(year, month - 1, day, hour - MANILA_OFFSET_HOURS);
}

export function mergeIntervals(intervals = []) {
  const normalized = intervals
    .map((interval) => ({
      start: epoch(interval.start),
      end: epoch(interval.end),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const interval of normalized) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end)
      merged.push({ ...interval });
    else previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

export function buildSupportIntervals(start, end, { holidays = [] } = {}) {
  const from = epoch(start);
  const until = epoch(end);
  if (until <= from) return [];
  const holidaySet = new Set(holidays);
  const intervals = [];
  let key = dateKey(dateParts(from));
  const lastKey = dateKey(dateParts(until));
  for (let dayCount = 0; dayCount <= 370 && key <= lastKey; dayCount += 1) {
    const [year, month, day] = key.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (
      FM1_CONTRACT.routineCalendar.weekdays.includes(weekday) &&
      !holidaySet.has(key)
    ) {
      const opening = localManilaInstant(
        key,
        FM1_CONTRACT.routineCalendar.startHour,
      );
      const closing = localManilaInstant(
        key,
        FM1_CONTRACT.routineCalendar.endHour,
      );
      const segmentStart = Math.max(from, opening);
      const segmentEnd = Math.min(until, closing);
      if (segmentEnd > segmentStart)
        intervals.push({ start: segmentStart, end: segmentEnd });
    }
    key = nextDateKey(key);
  }
  return intervals;
}

export function supportSecondsBetween(start, end, options = {}) {
  return buildSupportIntervals(start, end, options).reduce(
    (total, interval) => total + (interval.end - interval.start) / SECOND_MS,
    0,
  );
}

function subtractIntervals(interval, exclusions) {
  const segments = [];
  let cursor = interval.start;
  for (const exclusion of exclusions) {
    if (exclusion.end <= cursor || exclusion.start >= interval.end) continue;
    if (exclusion.start > cursor)
      segments.push({
        start: cursor,
        end: Math.min(exclusion.start, interval.end),
      });
    cursor = Math.max(cursor, exclusion.end);
    if (cursor >= interval.end) break;
  }
  if (cursor < interval.end)
    segments.push({ start: cursor, end: interval.end });
  return segments.filter((segment) => segment.end > segment.start);
}

const holdEligibleMetrics = new Set(["engineeringStart", "restoration"]);
export function metricAllowsHold(metric) {
  return holdEligibleMetrics.has(metric);
}

function elapsedDeadline(start, targetSeconds, holds) {
  let cursor = start;
  let remaining = targetSeconds * SECOND_MS;
  for (const hold of holds) {
    if (hold.end <= cursor) continue;
    if (hold.start >= cursor + remaining) break;
    const available = Math.max(0, hold.start - cursor);
    if (available >= remaining) return cursor + remaining;
    remaining -= available;
    cursor = Math.max(cursor + available, hold.end);
  }
  return cursor + remaining;
}

function supportDeadline(start, targetSeconds, holds, holidays) {
  const intervals = buildSupportIntervals(start, start + 370 * DAY_MS, {
    holidays,
  });
  let remaining = targetSeconds * SECOND_MS;
  for (const interval of intervals) {
    for (const segment of subtractIntervals(interval, holds)) {
      const available = segment.end - segment.start;
      if (available >= remaining) return segment.start + remaining;
      remaining -= available;
    }
  }
  return null;
}

export function getSlaTarget(priority, metric) {
  return FM1_SLA_TARGETS[priority]?.[metric] ?? null;
}

export function calculateSlaDeadline({
  receivedAt,
  priority,
  metric,
  holds = [],
  holidays = [],
} = {}) {
  const target = getSlaTarget(priority, metric);
  if (!target)
    return {
      status: "UNAVAILABLE",
      reason: "NO_TARGET_FOR_METRIC",
      dueAt: null,
    };
  const start = epoch(receivedAt);
  const eligibleHolds = metricAllowsHold(metric) ? mergeIntervals(holds) : [];
  const dueAt =
    target.mode === "elapsed"
      ? elapsedDeadline(start, target.seconds, eligibleHolds)
      : supportDeadline(start, target.seconds, eligibleHolds, holidays);
  if (dueAt === null)
    return {
      status: "NEEDS_REVIEW",
      reason: "CALENDAR_HORIZON_EXCEEDED",
      dueAt: null,
    };
  return {
    status: "PREVIEW_ONLY",
    dueAt: new Date(dueAt).toISOString(),
    targetSeconds: target.seconds,
    clockMode: target.mode,
    proposed: target.proposed === true,
    authority: "CLIENT_PREVIEW_NOT_CONTRACTUAL",
  };
}

export function calculateSlaElapsed({
  receivedAt,
  asOf = new Date(),
  priority,
  metric,
  holds = [],
  holidays = [],
} = {}) {
  const target = getSlaTarget(priority, metric);
  if (!target)
    return { status: "UNAVAILABLE", elapsedSeconds: null, dueAt: null };
  const start = epoch(receivedAt);
  const end = Math.max(start, epoch(asOf));
  const eligibleHolds = metricAllowsHold(metric) ? mergeIntervals(holds) : [];
  let elapsedSeconds =
    target.mode === "elapsed"
      ? (end - start) / SECOND_MS
      : supportSecondsBetween(start, end, { holidays });
  if (eligibleHolds.length) {
    const supportIntervals =
      target.mode === "support"
        ? buildSupportIntervals(start, end, { holidays })
        : [{ start, end }];
    const excluded = supportIntervals.reduce(
      (total, interval) =>
        total +
        (interval.end - interval.start) / SECOND_MS -
        subtractIntervals(interval, eligibleHolds).reduce(
          (sum, segment) => sum + (segment.end - segment.start) / SECOND_MS,
          0,
        ),
      0,
    );
    elapsedSeconds = Math.max(0, elapsedSeconds - excluded);
  }
  const deadline = calculateSlaDeadline({
    receivedAt,
    priority,
    metric,
    holds,
    holidays,
  });
  return {
    status: "PREVIEW_ONLY",
    elapsedSeconds,
    dueAt: deadline.dueAt,
    objectiveExceeded: deadline.dueAt
      ? end > new Date(deadline.dueAt).getTime()
      : false,
    authority: "CLIENT_PREVIEW_NOT_CONTRACTUAL",
  };
}
