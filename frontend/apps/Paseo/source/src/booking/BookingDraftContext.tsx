import { createContext, useContext, useState, type ReactNode } from 'react';
import type { CustomerDetails, ScheduleChoice } from './bookingDraft';
import type { PaymentMethod } from '../types/domain';

interface BookingDraftValue {
  schedule: ScheduleChoice | null;
  customer: CustomerDetails | null;
  paymentMethod: PaymentMethod | null;
  selectPaymentMethod: (method: PaymentMethod) => void;
  saveSchedule: (choice: ScheduleChoice) => void;
  saveCustomer: (details: CustomerDetails) => void;
  clearDraft: () => void;
}

const BookingDraftContext = createContext<BookingDraftValue | null>(null);

export function BookingDraftProvider({ children }: { children: ReactNode }) {
  const [schedule, setSchedule] = useState<ScheduleChoice | null>(null);
  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);

  function saveSchedule(choice: ScheduleChoice) {
    setSchedule(choice);
    setCustomer(null); // Changing the schedule requires a fresh review.
    setPaymentMethod(null);
  }

  function clearDraft() {
    setSchedule(null);
    setCustomer(null);
    setPaymentMethod(null);
  }

  function saveCustomer(details: CustomerDetails) {
    setCustomer(details);
    setPaymentMethod(null); // Re-review payment after customer details change.
  }

  return (
    <BookingDraftContext.Provider value={{
      schedule, customer, paymentMethod, saveSchedule, saveCustomer, selectPaymentMethod: setPaymentMethod, clearDraft,
    }}>
      {children}
    </BookingDraftContext.Provider>
  );
}

export function useBookingDraft() {
  const draft = useContext(BookingDraftContext);
  if (!draft) throw new Error('BookingDraftProvider is missing.');
  return draft;
}
