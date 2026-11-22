import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchGuestReceipt, requestReservationQuote, submitGuestReservation,
  type GuestReservationInput,
} from './guestReservation';

const base = 'https://reservations.test.example';
const reservationId = '12345678-1234-4234-8234-123456789abc';
const accessToken = 'a'.repeat(32);
const schedule = { courtId: 'court-1', date: '2026-12-01', startMinute: 480, durationMinutes: 60 };
const quote = {
  ...schedule,
  quoteToken: 'q'.repeat(32),
  amountMinor: 125050,
  currency: 'PHP',
  expiresAt: '2099-01-01T00:00:00+08:00',
};
const serverReceipt = {
  reservationId, receiptAccessToken: accessToken,
  createdAt: '2026-12-01T08:15:00+08:00',
  ...schedule, fullName: 'Sample Guest', email: 'guest@example.com',
  phone: '09171234567', amountMinor: 125050, currency: 'PHP',
  paymentMethod: 'gcash', bookingStatus: 'pending_verification', paymentStatus: 'submitted',
};

afterEach(() => vi.unstubAllGlobals());

describe('guest API request contract — fake server only', () => {
  it('requests a server quote for the exact selected court, date and interval', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => quote });
    vi.stubGlobal('fetch', fakeFetch);
    expect(await requestReservationQuote(schedule, undefined, base)).toMatchObject({
      courtId: 'court-1', amountMinor: 125050, quoteToken: quote.quoteToken,
    });
    const url = new URL(fakeFetch.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/v1/guest-reservations/quote');
    expect(url.searchParams.get('courtId')).toBe('court-1');
    expect(url.searchParams.get('startMinute')).toBe('480');
    expect(url.searchParams.get('durationMinutes')).toBe('60');
  });

  it.each([
    [60, '1 hour'],
    [90, '1.5 hours'],
    [120, '2 hours'],
  ])('preserves the exact %i-minute value in quote and reservation API contracts (%s)', async (durationMinutes) => {
    const selectedSchedule = { ...schedule, durationMinutes };
    const selectedQuote = { ...quote, ...selectedSchedule };
    const selectedReceipt = { ...serverReceipt, ...selectedSchedule };
    const fakeFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => selectedQuote })
      .mockResolvedValueOnce({ ok: true, json: async () => selectedReceipt });
    vi.stubGlobal('fetch', fakeFetch);
    const confirmedQuote = await requestReservationQuote(selectedSchedule, undefined, base);
    expect(confirmedQuote.durationMinutes).toBe(durationMinutes);
    expect(new URL(fakeFetch.mock.calls[0]![0] as string).searchParams.get('durationMinutes')).toBe(String(durationMinutes));
    await submitGuestReservation({
      schedule: selectedSchedule,
      customer: { fullName: 'Sample Guest', email: 'guest@example.com', phone: '09171234567' },
      paymentMethod: 'gcash',
      proof: new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' }),
      idempotencyKey: 'aabbccdd-1234-4444-8888-123456789abc',
      quote: confirmedQuote,
    }, base);
    const form = fakeFetch.mock.calls[1]![1].body as FormData;
    expect(form.get('durationMinutes')).toBe(String(durationMinutes));
    expect(selectedReceipt.durationMinutes).toBe(durationMinutes);
  });

  it('sends idempotent multipart proof without claiming payment verification', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => serverReceipt });
    vi.stubGlobal('fetch', fakeFetch);
    const input: GuestReservationInput = {
      schedule,
      customer: { fullName: 'Sample Guest', email: 'guest@example.com', phone: '09171234567' },
      paymentMethod: 'gcash',
      proof: new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' }),
      transactionReference: 'TEST-ONLY',
      quote: quote as GuestReservationInput['quote'],
      idempotencyKey: 'aabbccdd-1234-4444-8888-123456789abc',
    };
    const response = await submitGuestReservation(input, base);
    expect(response.bookingStatus).toBe('pending_verification');
    expect(response.paymentStatus).toBe('submitted');
    expect(response.reservationId).toBe(reservationId);
    const [url, init] = fakeFetch.mock.calls[0]!;
    expect(url).toBe(base + '/v1/guest-reservations');
    expect(init.method).toBe('POST');
    expect(init.headers['Idempotency-Key']).toBe(input.idempotencyKey);
    const form: FormData = init.body;
    expect(form.get('quoteToken')).toBe(quote.quoteToken);
    expect(form.get('courtId')).toBe('court-1');
    expect(form.get('transactionReference')).toBe('TEST-ONLY');
    expect(form.get('proof')).toBeInstanceOf(File);
  });

  it('treats a conflicting slot as a failure, not a receipt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409 }));
    const input: GuestReservationInput = {
      schedule,
      customer: { fullName: 'Sample Guest', email: 'guest@example.com', phone: '09171234567' },
      paymentMethod: 'bpi',
      proof: new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' }),
      quote: quote as GuestReservationInput['quote'],
      idempotencyKey: 'aabbccdd-1234-4444-8888-123456789abc',
    };
    await expect(submitGuestReservation(input, base)).rejects.toThrow(/no longer available/);
  });

  it('retrieves only a token-scoped server receipt by ID', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => serverReceipt });
    vi.stubGlobal('fetch', fakeFetch);
    const actual = await fetchGuestReceipt(reservationId, accessToken, base);
    expect(actual.reservationId).toBe(reservationId);
    const [url, options] = fakeFetch.mock.calls[0]!;
    expect(url).toBe(base + '/v1/guest-reservations/' + reservationId + '/receipt');
    expect(options.headers.Authorization).toBe('Bearer ' + accessToken);
    expect(options.cache).toBe('no-store');
  });

  it('rejects server receipts for the wrong reservation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => serverReceipt }));
    await expect(fetchGuestReceipt('abcdef12-1234-1234-1234-123456789abc', accessToken, base))
      .rejects.toThrow(/Your booking receipt could not be confirmed/);
  });
});

describe('settled reservation retry status', () => {
  it('accepts a server-authoritative verified receipt only when explicitly marked as a replay', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...serverReceipt, bookingStatus: 'confirmed', paymentStatus: 'verified', replayed: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const input: GuestReservationInput = {
      schedule,
      customer: { fullName: 'Sample Guest', email: 'guest@example.com', phone: '09171234567' },
      paymentMethod: 'maya',
      proof: new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' }),
      quote: quote as GuestReservationInput['quote'],
      idempotencyKey: 'aabbccdd-1234-4444-8888-123456789abc',
    };
    const receipt = await submitGuestReservation(input, base);
    expect(receipt.bookingStatus).toBe('confirmed');
    expect(receipt.paymentStatus).toBe('verified');
    expect(receipt.replayed).toBe(true);
  });
  it('rejects inconsistent statuses even if the response claims replay', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({
        ...serverReceipt, bookingStatus: 'pending_verification', paymentStatus: 'verified', replayed: true,
      }),
    }));
    const input: GuestReservationInput = {
      schedule,
      customer: { fullName: 'Sample Guest', email: 'guest@example.com', phone: '09171234567' },
      paymentMethod: 'maya',
      proof: new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' }),
      quote: quote as GuestReservationInput['quote'],
      idempotencyKey: 'aabbccdd-1234-4444-8888-123456789abc',
    };
    await expect(submitGuestReservation(input, base)).rejects.toThrow(/could not confirm whether the booking was accepted/);
  });
});

describe('guest payment cannot auto-verify on proof upload', () => {
  it('rejects a server response that marks upload as payment verified', async () => {
    const fake = { ...serverReceipt, bookingStatus: 'confirmed', paymentStatus: 'verified' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fake }));
    const input: GuestReservationInput = {
      schedule,
      customer: { fullName: 'Sample Guest', email: 'guest@example.com', phone: '09171234567' },
      paymentMethod: 'maya',
      proof: new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' }),
      quote: quote as GuestReservationInput['quote'],
      idempotencyKey: 'aabbccdd-1234-4444-8888-123456789abc',
    };
    await expect(submitGuestReservation(input, base)).rejects.toThrow(/could not confirm whether the booking was accepted/);
  });
});
