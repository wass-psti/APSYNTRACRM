import { z } from 'zod';
import type { CustomerDetails, ScheduleChoice } from '../booking/bookingDraft';
import type { PaymentMethod } from '../types/domain';

export const permittedReceiptTypes = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const maxReceiptBytes = 5 * 1024 * 1024;

export function validatePaymentProof(file: File | null): string | null {
  if (!file) return 'Upload a payment receipt to continue.';
  if (!permittedReceiptTypes.some((type) => type === file.type)) {
    return 'Use a JPG, PNG or PDF receipt.';
  }
  if (file.size === 0) return 'The selected receipt is empty.';
  if (file.size > maxReceiptBytes) return 'The receipt must be 5 MB or smaller.';
  return null;
}

/**
 * Lightweight magic-byte check before offering a receipt upload. The backend must
 * still parse, scan and validate all files; client checks are not a trust boundary.
 */
export async function validatePaymentProofSignature(file: File): Promise<string | null> {
  const validationError = validatePaymentProof(file);
  if (validationError) return validationError;
  const header = file.slice(0, 8);
  const buffer: ArrayBuffer = typeof header.arrayBuffer === 'function'
    ? await header.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Unable to inspect receipt.'));
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(new Error('Invalid receipt buffer.'));
      };
      reader.readAsArrayBuffer(header);
    });
  const bytes = new Uint8Array(buffer);
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((part, i) => bytes[i] === part);
  const isPdf = bytes.length >= 5 &&
    [0x25, 0x50, 0x44, 0x46, 0x2d].every((part, i) => bytes[i] === part);
  if ((file.type === 'image/jpeg' && isJpeg) ||
      (file.type === 'image/png' && isPng) ||
      (file.type === 'application/pdf' && isPdf)) return null;
  return 'This file does not contain a valid JPG, PNG, or PDF signature.';
}

export const serverQuoteSchema = z.object({
  courtId: z.string().min(1),
  date: z.iso.date(),
  startMinute: z.number().int().nonnegative(),
  durationMinutes: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  currency: z.literal('PHP'),
  quoteToken: z.string().min(16),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type ServerQuote = z.infer<typeof serverQuoteSchema>;

export async function requestReservationQuote(schedule: ScheduleChoice, signal?: AbortSignal, apiBaseUrl = configuredGuestApiBase): Promise<ServerQuote> {
  if (!validApiBase(apiBaseUrl)) throw new Error('Live pricing and availability are not connected.');
  const params = new URLSearchParams({
    courtId: schedule.courtId,
    date: schedule.date,
    startMinute: String(schedule.startMinute),
    durationMinutes: String(schedule.durationMinutes),
  });
  const response = await fetch(`${apiBaseUrl}/v1/guest-reservations/quote?${params}`, { ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error('Unable to verify availability and the amount. Please try again.');
  const parsed = serverQuoteSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.courtId !== schedule.courtId ||
      parsed.data.date !== schedule.date || parsed.data.startMinute !== schedule.startMinute ||
      parsed.data.durationMinutes !== schedule.durationMinutes ||
      Date.parse(parsed.data.expiresAt) <= Date.now()) {
    throw new Error('The reservation server returned an invalid or expired quote.');
  }
  return parsed.data;
}

const serverReceiptSchema = z.object({
  reservationId: z.string().min(1),
  receiptAccessToken: z.string().min(16),
  createdAt: z.iso.datetime({ offset: true }),
  courtId: z.string().min(1),
  date: z.iso.date(),
  startMinute: z.number().int().min(0).max(1440),
  durationMinutes: z.number().int().positive(),
  fullName: z.string().min(1),
  email: z.email(),
  phone: z.string().min(1),
  amountMinor: z.number().int().nonnegative(),
  currency: z.literal('PHP'),
  paymentMethod: z.enum(['gcash', 'maya', 'bpi']),
  bookingStatus: z.enum(['pending_verification', 'confirmed', 'rejected', 'cancelled']),
  paymentStatus: z.enum(['submitted', 'verified', 'rejected']),
  replayed: z.boolean().optional(),
});
export type ServerReceipt = z.infer<typeof serverReceiptSchema>;

export const configuredGuestApiBase = (import.meta.env.VITE_RESERVATION_API_BASE_URL ?? '').trim().replace(/\/$/, '');
/** Build the canonical QR asset endpoint from the configured API base.
 * The existing Edge metadata may expose an internal HTTP host/path, which is
 * not a valid browser image URL on the HTTPS GitHub Pages application.
 * A null image reference still means the method is not configured.
 */
export function resolveManagedQrImageUrl(
  method: PaymentMethod, storedImageUrl: string | null,
  apiBaseUrl = configuredGuestApiBase,
): string | null {
  if (!storedImageUrl || !apiBaseUrl) return null;
  return `${apiBaseUrl}/v1/payment-methods/${method}/image`;
}

export const guestSubmissionConfigured =
  /^https:\/\//.test(configuredGuestApiBase) ||
  (import.meta.env.DEV && import.meta.env.VITE_STAGING_ONLY === '1' && configuredGuestApiBase === '/api');

function validApiBase(apiBaseUrl: string): boolean {
  return /^https:\/\//.test(apiBaseUrl) ||
    (apiBaseUrl === '/api' && import.meta.env.DEV && import.meta.env.VITE_STAGING_ONLY === '1');
}

export interface GuestReservationInput {
  schedule: ScheduleChoice;
  customer: CustomerDetails;
  paymentMethod: PaymentMethod;
  proof: File;
  transactionReference?: string;
  idempotencyKey: string;
  quote: ServerQuote;
}

export async function submitGuestReservation(input: GuestReservationInput, apiBaseUrl = configuredGuestApiBase): Promise<ServerReceipt> {
  if (!validApiBase(apiBaseUrl)) throw new Error('The reservation server is not configured.');
  const error = validatePaymentProof(input.proof);
  if (error) throw new Error(error);

  const form = new FormData();
  form.set('courtId', input.schedule.courtId);
  form.set('date', input.schedule.date);
  form.set('startMinute', String(input.schedule.startMinute));
  form.set('durationMinutes', String(input.schedule.durationMinutes));
  form.set('fullName', input.customer.fullName);
  form.set('email', input.customer.email);
  form.set('phone', input.customer.phone);
  form.set('paymentMethod', input.paymentMethod);
  form.set('transactionReference', input.transactionReference ?? '');
  form.set('proof', input.proof, input.proof.name);
  form.set('quoteToken', input.quote.quoteToken);

  const response = await fetch(`${apiBaseUrl}/v1/guest-reservations`, {
    method: 'POST',
    headers: { 'Idempotency-Key': input.idempotencyKey },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(response.status === 409
    ? 'That court and time are no longer available. Choose another slot.'
    : `Reservation submission failed (HTTP ${response.status}). No receipt was issued.`);
  const parsed = serverReceiptSchema.safeParse(await response.json());
  const validFirstSubmission = parsed.success &&
    parsed.data.bookingStatus === 'pending_verification' &&
    parsed.data.paymentStatus === 'submitted';
  const validSettledReplay = parsed.success && parsed.data.replayed === true &&
    (['confirmed:verified', 'rejected:rejected']
      .includes(`${parsed.data.bookingStatus}:${parsed.data.paymentStatus}`));
  if (!validFirstSubmission && !validSettledReplay) {
    throw new Error('The reservation server returned an invalid submission status. Contact the administrator before retrying.');
  }
  return parsed.data;
}

export async function fetchGuestReceipt(reservationId: string, accessToken: string, apiBaseUrl = configuredGuestApiBase): Promise<ServerReceipt> {
  if (!validApiBase(apiBaseUrl)) throw new Error('Receipt retrieval is not connected.');
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(reservationId) || accessToken.length < 16) {
    throw new Error('Invalid receipt access details.');
  }
  const response = await fetch(`${apiBaseUrl}/v1/guest-reservations/${encodeURIComponent(reservationId)}/receipt`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('The reservation receipt could not be retrieved.');
  const parsed = serverReceiptSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.reservationId !== reservationId) {
    throw new Error('Invalid server receipt.');
  }
  return parsed.data;
}

export function formatPeso(amountMinor: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amountMinor / 100);
}
