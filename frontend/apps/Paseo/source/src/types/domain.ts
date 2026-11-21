/** Provisional FE-01 contracts. Backend/API contracts and business policies remain unapproved. */
export type Id = string;
export type ISODate = string; // YYYY-MM-DD in venue local timezone (to be finalized)
export type ISODateTime = string; // ISO-8601 with timezone offset
export type PesoMinorUnits = number; // integer centavos; no floating-point money

export interface Court {
  id: Id;
  name: string;
  description: string;
  active: boolean;
  features: readonly string[];
  imageUrl?: string;
}
export type AvailabilityStatus = 'available' | 'unavailable' | 'blocked' | 'unknown';
export interface TimeSlot {
  id: Id;
  courtId: Id;
  startAt: ISODateTime;
  endAt: ISODateTime;
  status: AvailabilityStatus;
}
export interface CourtAvailability {
  courtId: Id;
  date: ISODate;
  slots: readonly TimeSlot[];
  source: 'mock' | 'server';
  checkedAt?: ISODateTime;
}
export interface Customer {
  id: Id;
  fullName: string;
  email: string;
  phone: string;
}
export type BookingStatus = 'draft' | 'pending_payment' | 'confirmed' | 'cancelled' | 'expired';
export interface Booking {
  id: Id;
  reference: string;
  courtId: Id;
  customerId: Id;
  startAt: ISODateTime;
  endAt: ISODateTime;
  totalMinor: PesoMinorUnits;
  status: BookingStatus;
}
export interface PricingRule {
  id: Id;
  courtId: Id;
  durationMinutes: number;
  amountMinor: PesoMinorUnits;
  effectiveFrom: ISODate;
  effectiveTo?: ISODate;
}
export type PaymentMethod = 'gcash' | 'maya' | 'bpi';
export type PaymentStatus = 'pending' | 'processing' | 'successful' | 'failed' | 'expired' | 'cancelled';
export interface PaymentTransaction {
  id: Id;
  bookingId: Id;
  method: PaymentMethod;
  status: PaymentStatus;
  amountMinor: PesoMinorUnits;
  providerReference?: string;
  updatedAt: ISODateTime;
}
export interface OperatingSchedule {
  id: Id;
  courtId: Id;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  openTime: string; // HH:mm; venue local time
  closeTime: string;
  enabled: boolean;
}
export interface CourtClosure {
  id: Id;
  courtId: Id;
  startAt: ISODateTime;
  endAt: ISODateTime;
  reason: string;
}
