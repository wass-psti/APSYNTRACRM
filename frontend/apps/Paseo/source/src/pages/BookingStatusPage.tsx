import { Link } from 'react-router-dom';
import { useBookingDraft } from '../booking/BookingDraftContext';
import { customerSchema, isValidScheduleChoice } from '../booking/bookingDraft';
import { BookingSummary } from '../components/booking/BookingSummary';
import { getMethodName } from '../payments/paymentPreview';

export function BookingStatusPage() {
  const { schedule, customer, paymentMethod } = useBookingDraft();
  const hasValidDraft = isValidScheduleChoice(schedule) && customerSchema.safeParse(customer).success;

  return (
    <section className="container section booking-section">
      <div className="eyebrow eyebrow-dark">BOOKING / FE-06 STATUS</div>
      <h1 className="page-title">Booking status.</h1>
      <div className="demo-banner" role="note">
        <strong>No confirmed reservation</strong>
        <p>No reservation has been submitted yet. Confirmation requires a booking receipt and payment review.</p>
      </div>
      {hasValidDraft && schedule ? (
        <>
          <p className="page-lede">You have an unsaved booking selection in this browser tab. It does not have a genuine booking reference, receipt, or confirmed payment.</p>
          <BookingSummary schedule={schedule} />
          <div className="booking-panel">
            <h2 className="review-heading">Booking not submitted</h2>
            <p><strong>Selected payment method:</strong> {getMethodName(paymentMethod)}</p>
            <p><strong>Payment verification:</strong> Not available</p>
            <p><strong>Booking reference:</strong> Not issued</p>
            <p><strong>Reservation persistence:</strong> Not connected</p>
            <div className="booking-actions">
              <Link className="button button-secondary" to="/book/qr-payment">Open guest QR payment</Link>
              <Link className="button button-secondary" to="/reservations">View reservation page</Link>
            </div>
          </div>
        </>
      ) : (
        <div className="booking-panel">
          <h2 className="review-heading">No active booking draft</h2>
          <p>No reservation could be located. A page refresh clears temporary booking selections.</p>
          <div className="booking-actions">
            <Link className="button button-primary" to="/book">Start a booking</Link>
            <Link className="button button-secondary" to="/reservations">View reservation page</Link>
          </div>
        </div>
      )}
    </section>
  );
}
