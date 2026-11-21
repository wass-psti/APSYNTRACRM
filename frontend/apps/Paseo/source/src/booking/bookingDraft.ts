import { z } from 'zod';
import { courts } from '../mocks/courts';
import { getDemoDates, getDemoStartDate, getStartStatus } from '../utils/scheduleUtils';

// This is an in-memory UI draft. It is NOT a saved or confirmed booking.
export interface ScheduleChoice {
  courtId: string;
  date: string;
  startMinute: number;
  durationMinutes: number;
}

export const customerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(100, 'Name is too long.'),
  email: z.email('Enter a valid email address.'),
  phone: z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,19}$/, 'Enter a valid phone number.'),
});

export type CustomerDetails = z.infer<typeof customerSchema>;

export function isValidScheduleChoice(choice: ScheduleChoice | null): choice is ScheduleChoice {
  if (!choice) return false;
  if (!courts.some((court) => court.id === choice.courtId)) return false;
  const dayIndex = getDemoDates(getDemoStartDate()).indexOf(choice.date);
  if ((import.meta.env.VITE_RESERVATION_API_BASE_URL ?? '').startsWith('https://') ||
      (import.meta.env.DEV && import.meta.env.VITE_STAGING_ONLY === '1')) {
    // In connected mode the server defines court/weekday operating hours.
    // Validate only the time shape and day bounds; do not repeat mock 08:00–22:00 limits.
    return dayIndex >= 0 && [60, 90, 120].includes(choice.durationMinutes) &&
      Number.isInteger(choice.startMinute) && choice.startMinute >= 0 &&
      choice.startMinute % 30 === 0 && choice.startMinute + choice.durationMinutes <= 1440;
  }
  return getStartStatus(choice.courtId, dayIndex, choice.startMinute, choice.durationMinutes) === 'available';
}
