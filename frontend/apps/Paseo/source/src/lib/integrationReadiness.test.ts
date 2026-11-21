import { describe, expect, it } from 'vitest';
import { bookingApi, UnconfiguredBackendError } from './api';
import { integrationReadiness, isServiceConnected } from './integrationReadiness';

describe('FE-09 unconfigured service boundaries', () => {
  it('exposes every backend capability as disconnected until integration', () => {
    expect(integrationReadiness).toHaveLength(5);
    expect(integrationReadiness.every((item) => !item.connected && item.reason)).toBe(true);
    expect(isServiceConnected('availability')).toBe(false);
    expect(isServiceConnected('payments')).toBe(false);
    expect(isServiceConnected('adminOperations')).toBe(false);
  });

  it('never invents a booking, availability or payment when backend is missing', async () => {
    await expect(bookingApi.listCourts()).rejects.toBeInstanceOf(UnconfiguredBackendError);
    await expect(bookingApi.getAvailability('court-1', '2026-11-20')).rejects.toBeInstanceOf(UnconfiguredBackendError);
    await expect(bookingApi.createBooking({
      courtId: 'court-1', slotId: 'example-slot', customer: {
        fullName: 'Example Customer', email: 'example@example.com', phone: '09171234567',
      },
    })).rejects.toBeInstanceOf(UnconfiguredBackendError);
    await expect(bookingApi.getBooking('DEMO-REF')).rejects.toBeInstanceOf(UnconfiguredBackendError);
    await expect(bookingApi.getPayment('DEMO-BOOK')).rejects.toBeInstanceOf(UnconfiguredBackendError);
  });
});
