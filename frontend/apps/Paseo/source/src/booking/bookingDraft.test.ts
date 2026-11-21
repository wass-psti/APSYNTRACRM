import { describe, expect, it } from 'vitest';
import { customerSchema, isValidScheduleChoice } from './bookingDraft';
import { getDemoStartDate } from '../utils/scheduleUtils';

describe('FE-04 draft validation', () => {
  it('accepts ordinary customer information', () => {
    expect(customerSchema.safeParse({
      fullName: 'Alex Player', email: 'alex@example.com', phone: '+63 917 123 4567',
    }).success).toBe(true);
  });

  it('rejects missing or malformed customer information', () => {
    expect(customerSchema.safeParse({ fullName: 'A', email: 'bad-email', phone: 'abc' }).success).toBe(false);
    expect(customerSchema.safeParse({ fullName: '', email: '', phone: '' }).success).toBe(false);
  });

  it('keeps mock hours separate from server-owned extended operating hours', () => {
    const date = getDemoStartDate();
    const isConnected = (import.meta.env.VITE_RESERVATION_API_BASE_URL ?? '').startsWith('https://') ||
      (import.meta.env.DEV && import.meta.env.VITE_STAGING_ONLY === '1');
    const early = isValidScheduleChoice({ courtId:'court-1', date, startMinute:360, durationMinutes:60 });
    const late = isValidScheduleChoice({ courtId:'court-1', date, startMinute:1380, durationMinutes:60 });
    expect(early).toBe(isConnected);
    expect(late).toBe(isConnected);
    expect(isValidScheduleChoice({ courtId:'court-1', date, startMinute:1410, durationMinutes:60 })).toBe(false);
  });

  it('rejects incomplete or blocked schedules and accepts valid mock choices', () => {
    expect(isValidScheduleChoice(null)).toBe(false);
    const date = getDemoStartDate();
    expect(isValidScheduleChoice({ courtId: 'court-1', date, startMinute: 480, durationMinutes: 60 })).toBe(true);
    expect(isValidScheduleChoice({ courtId: 'unknown', date, startMinute: 480, durationMinutes: 60 })).toBe(false);
    expect(isValidScheduleChoice({ courtId: 'court-1', date: '2001-01-01', startMinute: 480, durationMinutes: 60 })).toBe(false);
    expect(isValidScheduleChoice({ courtId: 'court-1', date, startMinute: 480, durationMinutes: 75 })).toBe(false);
  });
});
