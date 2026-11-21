import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPeso, guestSubmissionConfigured, requestReservationQuote } from '../guest/guestReservation';
import { useBookingDraft } from '../booking/BookingDraftContext';
import { BookingProgress } from '../components/booking/BookingProgress';
import { customerSchema, isValidScheduleChoice } from '../booking/bookingDraft';
import { BookingSummary } from '../components/booking/BookingSummary';
import { MissingDraft } from '../components/booking/MissingDraft';

export function BookingReviewPage() {
  const { schedule, customer } = useBookingDraft();
  const stagingReview = guestSubmissionConfigured;
  const localStaging = import.meta.env.DEV && import.meta.env.VITE_STAGING_ONLY === '1';
  const [serverAmount, setServerAmount] = useState<number | null>(null);
  const [quoteMessage, setQuoteMessage] = useState('Checking the booking amount…');
  useEffect(() => {
    if (!stagingReview || !schedule) return;
    const controller = new AbortController();
    void requestReservationQuote(schedule, controller.signal)
      .then(quote => {
        if (!controller.signal.aborted) {
          setServerAmount(quote.amountMinor);
          setQuoteMessage(localStaging ? 'Sample amount only — do not send real money.' : 'Booking amount received. Payment still needs review.');
        }
      }).catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setQuoteMessage(reason instanceof Error ? reason.message : 'Could not check the booking amount. Please try again.');
        }
      });
    return () => controller.abort();
  }, [stagingReview, schedule]);
  if (!isValidScheduleChoice(schedule) || !customerSchema.safeParse(customer).success) {
    return <MissingDraft message="Complete scheduling and valid customer details to review the booking." />;
  }

  return (
    <section className="container section booking-section">
      <div className="eyebrow eyebrow-dark">BOOKING / REVIEW</div>
      <h1 className="page-title">Review your selection.</h1>
      <p className="page-lede">Check your details before continuing to payment. Your court is not reserved yet.</p>
      <BookingProgress stage="review" />
      <div className="demo-banner" role="note"><strong>Unconfirmed booking draft</strong><p>This booking has not been submitted. Court availability, amount and payment must still be confirmed.</p></div>
      <BookingSummary schedule={schedule} />
      {stagingReview && (
        <div className="booking-panel" role="status">
          <strong>Booking amount:</strong> {serverAmount !== null ? formatPeso(serverAmount) : 'Not available'}
          <p className="booking-help">{quoteMessage}</p>
          <p className="guest-qr-warning">{localStaging ? 'This is a test amount. Do not transfer real money.' : 'Only pay after the booking amount and payment recipient have been confirmed.'}</p>
        </div>
      )}
      <div className="booking-panel">
        <h2 className="review-heading">Customer information</h2>
        <p><strong>Name:</strong> {customer!.fullName}</p>
        <p><strong>Email:</strong> {customer!.email}</p>
        <p><strong>Phone:</strong> {customer!.phone}</p>
        <div className="booking-actions">
          <Link className="button button-secondary" to="/book/details">Edit customer details</Link>
          <Link className="button button-secondary" to="/book">Edit schedule</Link>
        </div>
        <p className="booking-help">Continue to QR payment after reviewing the booking details. Confirm the amount and recipient before paying.</p>
        <Link className="button button-primary" to="/book/qr-payment">Continue to guest QR payment</Link>
      </div>
    </section>
  );
}
