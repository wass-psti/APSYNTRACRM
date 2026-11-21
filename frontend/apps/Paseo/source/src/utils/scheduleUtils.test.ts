import { describe, expect, it } from 'vitest';
import { addDays, formatTime, getDemoDates, getStartStatus } from './scheduleUtils';

describe('FE-03 deterministic demonstration schedule', () => {
  it('generates 14 sequential dates across month boundaries', () => {
    const dates = getDemoDates('2026-11-28');
    expect(dates).toHaveLength(14);
    expect(dates[0]).toBe('2026-11-28');
    expect(dates[3]).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('uses independent occupied and maintenance patterns per court', () => {
    expect(getStartStatus('court-1', 0, 600, 60)).toBe('unavailable');
    expect(getStartStatus('court-2', 0, 600, 60)).toBe('available');
    expect(getStartStatus('court-2', 0, 1080, 60)).toBe('unavailable');
    expect(getStartStatus('court-3', 2, 720, 60)).toBe('blocked');
    expect(getStartStatus('court-1', 2, 720, 60)).toBe('available');
  });

  it('rejects any duration intersecting a blocked slot', () => {
    expect(getStartStatus('court-1', 0, 540, 60)).toBe('available');
    expect(getStartStatus('court-1', 0, 540, 90)).toBe('unavailable');
    expect(getStartStatus('court-3', 2, 660, 120)).toBe('blocked');
  });

  it('formats midnight as 12:00 AM after a late closing interval', () => {
    expect(formatTime(0)).toBe('12:00 AM');
    expect(formatTime(1380)).toBe('11:00 PM');
    expect(formatTime(1440)).toBe('12:00 AM');
  });

  it('rejects slots beyond closing, unknown courts, and invalid durations', () => {
    expect(getStartStatus('court-1', 0, 1290, 60)).toBe('unavailable');
    expect(getStartStatus('court-1', 0, 1260, 60)).toBe('available');
    expect(getStartStatus('unknown', 0, 480, 60)).toBe('unknown');
    expect(getStartStatus('court-1', -1, 480, 60)).toBe('unknown');
    expect(getStartStatus('court-1', 0, 480, 45)).toBe('unknown');
  });
});
