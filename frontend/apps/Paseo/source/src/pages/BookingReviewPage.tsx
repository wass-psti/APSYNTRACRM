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
  const [quoteMessage, setQuoteMessage] = useState('Verifying server-authoritative rate…');
  useEffect(() => {
    if (!stagingReview || !schedule) return;
    const controller = new AbortController();
    void requestReservationQuote(schedule, controller.signal)
      .then(quote => {
        if (!controller.signal.aborted) {
          setServerAmount(quote.amountMinor);
          setQuoteMessage(localStaging ? 'Local test quote available; not an approved venue rate.' : 'Supabase quote received; payment remains unverified.');
        }
      }).catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setQuoteMessage(reason instanceof Error ? reason.message : 'Server price unavailable.');
        }
      });
    return () => controller.abort();
  }, [stagingReview, schedule]);
  if (!isValidScheduleChoice(schedule) || !customerSchema.safeParse(customer).success) {
    return <MissingDraft message="Complete scheduling and valid customer details to review the booking." />;
  }

  return (
    <section className="container section booking-section">
      <div className="eyebrow eyebrow-dark">BOOKING / FE-04 REVIEW</div>
      <h1 className="page-title">Review your selection.</h1>
      <p className="page-lede">Review the details before requesting a server-issued payment quote. No court is reserved until the backend accepts a submission.</p>
      <BookingProgress stage="review" />
      <div className="demo-banner" role="note"><strong>Unconfirmed booking draft</strong><p>No booking reference has been issued. Pricing, availability and payment status require server confirmation.</p></div>
      <BookingSummary schedule={schedule} />
      {stagingReview && (
        <div className="booking-panel" role="status">
          <strong>Server-authoritative staging total:</strong> {serverAmount !== null ? formatPeso(serverAmount) : 'Not available'}
          <p className="booking-help">{quoteMessage}</p>
          <p className="guest-qr-warning">{localStaging ? 'Local staging price is for software testing. Do not send real money for this quote.' : 'Only send payment after the venue approves court rates, confirms the recipient and issues a valid server quote.'}</p>
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
        <p className="booking-help">Continue to the new guest QR-payment interface. The images are supplied, but actual amounts and availability must be confirmed by the reservation backend before paying.</p>
        <Link className="button button-primary" to="/book/qr-payment">Continue to guest QR payment</Link>
      </div>
    </section>
  );
}
