import type { AvailabilityStatus } from '../types/domain';

// All dates in this demo are date-only strings (YYYY-MM-DD), not UTC booking timestamps.
export function getDemoStartDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(date: string, days: number) {
  const day = new Date(date + 'T00:00:00Z');
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

export function getDemoDates(startDate: string) {
  return Array.from({ length: 14 }, (_, index) => addDays(startDate, index));
}

export function formatDemoDate(date: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(date + 'T00:00:00Z'));
}

export function formatTime(minutes: number) {
  // 1440 denotes midnight at the end of the day, not 12:00 PM.
  const hours = Math.floor(minutes / 60) % 24;
  const clockHours = hours % 12 || 12;
  const suffix = hours < 12 ? 'AM' : 'PM';
  return `${clockHours}:${String(minutes % 60).padStart(2, '0')} ${suffix}`;
}

export function formatDurationHours(durationMinutes: number) {
  const hours = durationMinutes / 60;
  const value = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${value} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** Customer-facing duration with hours first and the unchanged minute value alongside. */
export function formatBookingDuration(durationMinutes: number) {
  return `${formatDurationHours(durationMinutes)} (${durationMinutes} minutes)`;
}

export const durationChoices = [60, 90, 120] as const;
export const firstStartMinute = 8 * 60;
export const closingMinute = 22 * 60;
export const slotIntervalMinutes = 30;

function isWithin(minutes: number, start: number, end: number) {
  return minutes >= start && minutes < end;
}

// Demonstration-only patterns. These are NOT real bookings or operating schedules.
export function getMockSlotStatus(courtId: string, dayIndex: number, minute: number): AvailabilityStatus {
  if (courtId === 'court-1' && dayIndex % 3 === 0 && isWithin(minute, 10 * 60, 11 * 60)) return 'unavailable';
  if (courtId === 'court-2' && dayIndex % 2 === 0 && isWithin(minute, 18 * 60, 19 * 60 + 30)) return 'unavailable';
  if (courtId === 'court-3' && dayIndex % 4 === 2 && isWithin(minute, 12 * 60, 14 * 60)) return 'blocked';
  if (courtId === 'court-3' && dayIndex % 3 === 1 && isWithin(minute, 9 * 60, 10 * 60)) return 'unavailable';
  return 'available';
}

export function getStartStatus(courtId: string, dayIndex: number, startMinute: number, durationMinutes: number): AvailabilityStatus {
  if (!['court-1', 'court-2', 'court-3'].includes(courtId)) return 'unknown';
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 13) return 'unknown';
  if (!durationChoices.some((duration) => duration === durationMinutes)) return 'unknown';
  if (startMinute < firstStartMinute || startMinute + durationMinutes > closingMinute) return 'unavailable';
  if (startMinute % slotIntervalMinutes !== 0) return 'unknown';

  for (let minute = startMinute; minute < startMinute + durationMinutes; minute += slotIntervalMinutes) {
    const status = getMockSlotStatus(courtId, dayIndex, minute);
    if (status !== 'available') return status;
  }
  return 'available';
}

export function getDemoStartMinutes() {
  const starts: number[] = [];
  for (let minute = firstStartMinute; minute < closingMinute; minute += slotIntervalMinutes) {
    starts.push(minute);
  }
  return starts;
}
