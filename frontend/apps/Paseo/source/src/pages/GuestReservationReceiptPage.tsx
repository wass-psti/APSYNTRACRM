import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchGuestReceipt, formatPeso, guestSubmissionConfigured, type ServerReceipt,
} from '../guest/guestReservation';
import { formatBookingDuration, formatDurationHours, formatTime } from '../utils/scheduleUtils';

function downloadTextReceipt(receipt: ServerReceipt) {
  const content = [
    'PASEO DE LOMBOY — RESERVATION SUBMISSION RECEIPT',
    'Payment submitted is not payment verified.',
    `Reservation: ${receipt.reservationId}`,
    `Client: ${receipt.fullName}`,
    `Email: ${receipt.email}`,
    `Contact: ${receipt.phone}`,
    `Court: ${receipt.courtId}`,
    `Schedule: ${receipt.date}, ${formatTime(receipt.startMinute)} – ${formatTime(receipt.startMinute + receipt.durationMinutes)}`,
    `Duration: ${formatBookingDuration(receipt.durationMinutes)}`,
    `Amount: ${formatPeso(receipt.amountMinor)}`,
    `Method: ${receipt.paymentMethod.toUpperCase()}`,
    `Submitted: ${receipt.createdAt}`,
    `Booking status: ${receipt.bookingStatus.replace(/_/g, ' ')}`,
    `Payment status: ${receipt.paymentStatus.replace(/_/g, ' ')}`,
    'This document is not a tax invoice and does not prove payment verification.',
  ].join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `reservation-${receipt.reservationId}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

/** Receipt is retrieved only from a trusted server using its private access token. */
export function GuestReservationReceiptPage() {
  const { reservationId } = useParams();
  const [receipt, setReceipt] = useState<ServerReceipt | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!reservationId || !guestSubmissionConfigured) return;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get('access');
    if (!token || token.length < 16) {
      setError('The receipt access link is incomplete. Contact the booking administrator.');
      return;
    }
    let active = true;
    void fetchGuestReceipt(reservationId, token)
      .then((result) => { if (active) { setReceipt(result); setError(''); } })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Receipt retrieval failed.');
      });
    return () => { active = false; };
  }, [reservationId]);

  return (
    <section className="container section booking-section guest-receipt-page">
      <div className="eyebrow eyebrow-dark">GUEST BOOKING / RECEIPT</div>
      <h1 className="page-title">Reservation receipt.</h1>
      {!guestSubmissionConfigured ? (
        <div className="demo-banner" role="note">
          <strong>Receipts are unavailable</strong>
          <p>No booking receipt is available. A payment action alone does not create a reservation.</p>
        </div>
      ) : error ? <p role="alert" className="form-error">{error}</p> :
      !receipt ? <p role="status">Retrieving your reservation receipt securely…</p> : (
        <div className="booking-panel guest-receipt-content">
          <p className="guest-qr-warning"><strong>{receipt.paymentStatus === 'verified' ? 'Payment verified' : 'Payment receipt submitted — awaiting review'}</strong>
            <span> A payment submission is not an approval or a verified reservation.</span></p>
          <h2>Reservation #{receipt.reservationId}</h2>
          <dl>
            <div><dt>Client</dt><dd>{receipt.fullName}</dd></div>
            <div><dt>Contact</dt><dd>{receipt.phone} · {receipt.email}</dd></div>
            <div><dt>Court</dt><dd>{receipt.courtId}</dd></div>
            <div><dt>Schedule</dt><dd>{receipt.date}, {formatTime(receipt.startMinute)} – {formatTime(receipt.startMinute + receipt.durationMinutes)}</dd></div>
            <div><dt>Duration</dt><dd><strong>{formatDurationHours(receipt.durationMinutes)}</strong> ({receipt.durationMinutes} minutes)</dd></div>
            <div><dt>Total amount</dt><dd>{formatPeso(receipt.amountMinor)}</dd></div>
            <div><dt>Payment method</dt><dd>{receipt.paymentMethod.toUpperCase()}</dd></div>
            <div><dt>Submission time</dt><dd>{new Date(receipt.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} (Philippine time)</dd></div>
            <div><dt>Booking status</dt><dd>{receipt.bookingStatus.replace(/_/g, ' ')}</dd></div>
            <div><dt>Payment status</dt><dd>{receipt.paymentStatus.replace(/_/g, ' ')}</dd></div>
          </dl>
          <p className="booking-help">This is a reservation submission receipt, not proof that funds arrived. Administrator verification must be checked separately.</p>
          <div className="booking-actions">
            <button type="button" className="button button-primary" onClick={() => window.print()}>Print receipt</button>
            <button type="button" className="button button-secondary" onClick={() => downloadTextReceipt(receipt)}>Download receipt (.txt)</button>
          </div>
        </div>
      )}
      <p><Link to="/book" className="text-link">Return to booking</Link></p>
    </section>
  );
}
