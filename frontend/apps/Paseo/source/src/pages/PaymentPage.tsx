import { Link, Navigate } from 'react-router-dom';
import { useBookingDraft } from '../booking/BookingDraftContext';
import { BookingProgress } from '../components/booking/BookingProgress';
import { BookingSummary } from '../components/booking/BookingSummary';
import { MissingDraft } from '../components/booking/MissingDraft';
import { customerSchema, isValidScheduleChoice } from '../booking/bookingDraft';
import { guestSubmissionConfigured } from '../guest/guestReservation';

/** The old simulated-success selector is retired. QR submission owns real payment evidence. */
export function PaymentPage() {
  const { schedule, customer } = useBookingDraft();
  if (!isValidScheduleChoice(schedule) || !customerSchema.safeParse(customer).success) {
    return <MissingDraft message="Choose a court and time, then complete your guest details to continue." />;
  }
  if (guestSubmissionConfigured) return <Navigate to="/book/qr-payment" replace />;
  return <section className="container section booking-section">
    <div className="eyebrow eyebrow-dark">BOOKING / PAYMENT</div>
    <h1 className="page-title">Payment setup required.</h1>
    <p className="page-lede">Payment is not available on this page. No payment has been processed.</p>
    <BookingProgress stage="payment" />
    <BookingSummary schedule={schedule} />
    <section className="booking-panel" role="status">
      <h2 className="review-heading">No payment request has been issued</h2>
      <p>Payment is not available from this page. Do not transfer money until you receive confirmed booking details and payment instructions.</p>
      <div className="booking-actions">
        <Link className="button button-secondary" to="/book/review">Back to booking review</Link>
        <Link className="button button-primary" to="/book/qr-payment">Review QR payment requirements</Link>
      </div>
    </section>
  </section>;
}
