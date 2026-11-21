import type { Booking, Court, CourtAvailability, Customer, ISODate, PaymentTransaction } from '../types/domain';

/** Future server adapter interface. No mock action is described as a real reservation. */
export interface BookingApi {
  listCourts(): Promise<readonly Court[]>;
  getAvailability(courtId: string, date: ISODate): Promise<CourtAvailability>;
  createBooking(input: { courtId: string; slotId: string; customer: Omit<Customer, 'id'> }): Promise<Booking>;
  getBooking(reference: string): Promise<Booking>;
  getPayment(bookingId: string): Promise<PaymentTransaction | null>;
}
export class UnconfiguredBackendError extends Error {
  constructor() { super('Live booking and payment services are not configured.'); }
}
export const bookingApi: BookingApi = {
  listCourts: async () => { throw new UnconfiguredBackendError(); },
  getAvailability: async () => { throw new UnconfiguredBackendError(); },
  createBooking: async () => { throw new UnconfiguredBackendError(); },
  getBooking: async () => { throw new UnconfiguredBackendError(); },
  getPayment: async () => { throw new UnconfiguredBackendError(); },
};
