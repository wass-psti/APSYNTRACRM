import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { guestSubmissionConfigured } from '../guest/guestReservation';

export function ReservationsPage() {
  const navigate = useNavigate();
  const [receiptId, setReceiptId] = useState('');
  const [receiptToken, setReceiptToken] = useState('');
  const receiptDetailsValid = /^[a-zA-Z0-9_-]{8,128}$/.test(receiptId) && receiptToken.length >= 16;

  return (
    <section className="container section booking-section reservations-page">
      <div className="reservations-hero">
        <div className="reservations-hero-copy">
          <div className="eyebrow eyebrow-dark">
            <span className="eyebrow-dot" aria-hidden="true" />
            RESERVATIONS / GUEST RECEIPTS
          </div>
          <h1 className="page-title">My bookings.</h1>
          <p className="page-lede">
            Access your reservation receipt using its reference and private access code. A customer-wide booking history is not available on this page.
          </p>
          <div className="reservations-hero-meta" aria-label="Dashboard preview details">
            <span><i aria-hidden="true" /> Guest receipt retrieval</span>
          </div>
        </div>

        <aside className="reservations-status-card" role="note">
          <div className="reservations-status-topline">
            <span>RESERVATION SERVICE</span>
            <span className="reservations-preview-pill">RECEIPT ACCESS</span>
          </div>
          <div className="reservations-status-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <path d="M14 20v-4a10 10 0 0 1 20 0v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              <rect x="9" y="19" width="30" height="23" rx="6" stroke="currentColor" strokeWidth="2.4" />
              <path d="M24 28v6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="24" cy="27" r="1.8" fill="currentColor" />
            </svg>
          </div>
          <strong>Reservation history unavailable here</strong>
          <p>Individual receipts can be retrieved with server-issued access details when the reservation service is configured. This page does not list bookings belonging to a customer account.</p>
          <div className="reservations-status-footer">
            <span>RECEIPT SERVICE</span>
            <strong><i aria-hidden="true" /> {guestSubmissionConfigured ? 'Configured' : 'Not configured'}</strong>
          </div>
        </aside>
      </div>

      <section className="booking-panel reservations-panel" aria-labelledby="reservations-overview-heading">
        <div className="reservations-panel-heading">
          <div>
            <p className="reservations-section-kicker">01 / BOOKING OVERVIEW</p>
            <h2 className="review-heading" id="reservations-overview-heading">Your reservations</h2>
          </div>
          <span className="reservations-status-tag"><i aria-hidden="true" /> No account history</span>
        </div>

        <div className="booking-empty reservations-empty" role="status">
          <span className="reservations-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <rect x="7" y="11" width="34" height="30" rx="6" stroke="currentColor" strokeWidth="2" />
              <path d="M15 7v8M33 7v8M7 20h34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M17 29h14M17 34h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <strong>No reservation list available.</strong>
            <p>Use your reservation ID and private receipt code below to retrieve an existing booking receipt.</p>
          </div>
        </div>

        <div className="booking-actions reservations-actions">
          <Link className="button button-primary" to="/book">
            Explore courts and times <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <form className="booking-panel guest-receipt-lookup reservations-receipt-panel" aria-labelledby="guest-receipt-heading"
        onSubmit={(event) => {
          event.preventDefault();
          if (!/^[a-zA-Z0-9_-]{8,128}$/.test(receiptId) || receiptToken.length < 16) return;
          navigate(`/reservation/receipt/${encodeURIComponent(receiptId)}#access=${encodeURIComponent(receiptToken)}`);
        }}>
        <div className="reservations-receipt-intro">
          <p className="reservations-section-kicker">02 / GUEST ACCESS</p>
          <h2 className="review-heading" id="guest-receipt-heading">Retrieve a guest reservation receipt</h2>
          <p>No account is required. Use the reservation ID and private receipt access code issued by the reservation service.</p>
          <div className="reservations-receipt-assurance">
            <span className="reservations-receipt-assurance-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <span>Private receipt access · No customer account required</span>
          </div>
        </div>

        <div className="reservations-receipt-fields">
          <div className="reservations-field">
            <label htmlFor="guest-receipt-number">Reservation ID</label>
            <div className="reservations-input-wrap">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 4.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V6A1.5 1.5 0 0 1 7.5 4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M14 4.8V9h4M9 13h6M9 16.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <input id="guest-receipt-number" type="text" required minLength={8} maxLength={128}
                value={receiptId} autoComplete="off" spellCheck={false}
                aria-describedby="guest-receipt-help"
                onChange={(event) => setReceiptId(event.target.value.trim())} />
            </div>
          </div>

          <div className="reservations-field">
            <label htmlFor="guest-receipt-access">Private receipt access code</label>
            <div className="reservations-input-wrap">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="8.5" cy="14.5" r="4" stroke="currentColor" strokeWidth="1.7" />
                <path d="m11.5 11.5 7-7 2 2-2 2 1.5 1.5-2 2-1.5-1.5-2 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <input id="guest-receipt-access" type="password" required minLength={16}
                value={receiptToken} autoComplete="off"
                aria-describedby="guest-receipt-help"
                onChange={(event) => setReceiptToken(event.target.value)} />
            </div>
          </div>

          <p className="booking-help reservations-receipt-help" id="guest-receipt-help">
            {guestSubmissionConfigured
              ? 'Only a matching server-issued reservation and access code can retrieve a receipt.'
              : 'Live reservation receipts are not yet connected. No server-issued records are available.'}
          </p>
          <button type="submit" className="button button-primary reservations-receipt-submit" disabled={!receiptDetailsValid}>
            Retrieve receipt <span aria-hidden="true">↗</span>
          </button>
        </div>
      </form>

    </section>
  );
}
