import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBookingDraft } from '../booking/BookingDraftContext';
import { customerSchema, isValidScheduleChoice } from '../booking/bookingDraft';
import { BookingSummary } from '../components/booking/BookingSummary';
import { BookingProgress } from '../components/booking/BookingProgress';
import { MissingDraft } from '../components/booking/MissingDraft';
import { paymentQr } from '../guest/paymentQr';
import {
  configuredGuestApiBase, formatPeso, guestSubmissionConfigured, requestReservationQuote,
  resolveManagedQrImageUrl,
  submitGuestReservation, validatePaymentProof, validatePaymentProofSignature, type ServerQuote,
} from '../guest/guestReservation';
import type { PaymentMethod } from '../types/domain';

const methods: PaymentMethod[] = ['gcash', 'maya', 'bpi'];
interface ManagedMethod { method: PaymentMethod; recipient: string; imageUrl: string | null; }

export function GuestQrPaymentPage() {
  const navigate = useNavigate();
  const { schedule, customer } = useBookingDraft();
  const [method, setMethod] = useState<PaymentMethod>('gcash');
  const [managedMethods, setManagedMethods] = useState<ManagedMethod[]>([]);
  const [managedQrLoading, setManagedQrLoading] = useState(false);
  const [managedQrError, setManagedQrError] = useState('');
  const [quote, setQuote] = useState<ServerQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [paymentDone, setPaymentDone] = useState(false);
  const [proof, setProof] = useState<File | null>(null);
  const [proofContentError, setProofContentError] = useState<string | null>(null);
  const [checkingProof, setCheckingProof] = useState(false);
  const proofSequence = useRef(0);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const attemptId = useRef(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);

  const scheduleValid = isValidScheduleChoice(schedule);
  const customerValid = customerSchema.safeParse(customer).success;
  useEffect(() => {
    if (!guestSubmissionConfigured) return;
    const controller = new AbortController();
    setManagedQrLoading(true);
    setManagedQrError('');
    void fetch(`${configuredGuestApiBase}/v1/payment-methods`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load payment methods.');
        return response.json() as Promise<{methods: ManagedMethod[]}>;
      })
      .then(value => {
        if (!controller.signal.aborted) {
          setManagedMethods(value.methods.map(item => ({
            ...item, imageUrl: resolveManagedQrImageUrl(item.method, item.imageUrl),
          })));
          setManagedQrLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setManagedQrError('Payment QR images could not be loaded. Please refresh.');
          setManagedQrLoading(false);
        }
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!schedule || !scheduleValid) return;
    if (!guestSubmissionConfigured) {
      setQuoteError('Payment is not available for this booking yet. Do not transfer funds.');
      return;
    }
    const controller = new AbortController();
    void requestReservationQuote(schedule, controller.signal)
      .then((result) => { if (!controller.signal.aborted) { setQuote(result); setQuoteError(''); } })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setQuoteError(reason instanceof Error ? reason.message : 'Quote lookup failed.');
      });
    return () => controller.abort();
  }, [schedule, scheduleValid]);

  if (!scheduleValid || !customerValid || !schedule || !customer) {
    return <MissingDraft message="Choose a court and time, then complete your guest contact details before selecting QR payment." />;
  }

  const isSharedSupabase = /^https:\/\//.test(configuredGuestApiBase);
  const serverMethod = managedMethods.find(item => item.method === method);
  const managedQrReady = Boolean(serverMethod?.imageUrl && serverMethod.recipient.trim());
  const qrReady = guestSubmissionConfigured && (!isSharedSupabase || (!managedQrLoading && !managedQrError && managedQrReady));
  const chosen = serverMethod
    ? { name: paymentQr[method].name,
        image: serverMethod.imageUrl || (!isSharedSupabase ? paymentQr[method].image : ''),
        recipient: serverMethod.recipient }
    : { ...paymentQr[method], image: isSharedSupabase ? '' : paymentQr[method].image };
  const proofError = paymentDone ? validatePaymentProof(proof) ?? proofContentError : null;
  const quoteReady = quote !== null && Date.parse(quote.expiresAt) > Date.now();
  const canSubmit = guestSubmissionConfigured && quoteReady && qrReady && paymentDone && proof !== null && proofError === null && !checkingProof && !isSubmitting;

  function changeMethod(value: PaymentMethod) {
    setMethod(value);
    setPaymentDone(false);
    setProof(null);
    proofSequence.current += 1;
    setProofContentError(null);
    setCheckingProof(false);
    setReference('');
    setError('');
    attemptId.current = crypto.randomUUID();
    if (fileInput.current) fileInput.current.value = '';
  }

  async function chooseProof(file: File | null) {
    const sequence = ++proofSequence.current;
    attemptId.current = crypto.randomUUID();
    setProof(file);
    setError('');
    setProofContentError(null);
    if (!file || validatePaymentProof(file)) return;
    setCheckingProof(true);
    try {
      const problem = await validatePaymentProofSignature(file);
      if (proofSequence.current === sequence) setProofContentError(problem);
    } catch {
      if (proofSequence.current === sequence) setProofContentError('The selected file cannot be read.');
    } finally {
      if (proofSequence.current === sequence) setCheckingProof(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || !canSubmit || !proof || !schedule || !customer) return;
    if (Date.parse(quote.expiresAt) <= Date.now()) {
      setError('This quote has expired. Return to the schedule and request a fresh quote.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const receipt = await submitGuestReservation({
        schedule, customer, paymentMethod: method, proof,
        ...(reference.trim() ? { transactionReference: reference.trim() } : {}),
        idempotencyKey: attemptId.current,
        quote,
      });
      navigate(`/reservation/receipt/${encodeURIComponent(receipt.reservationId)}#access=${encodeURIComponent(receipt.receiptAccessToken)}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to submit. No receipt was issued.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="container section booking-section guest-qr-page">
      <div className="eyebrow eyebrow-dark">GUEST BOOKING / QR PAYMENT</div>
      <h1 className="page-title">Pay by QR.</h1>
      <p className="page-lede">No guest account is required. Select a payment method, follow the instructions, then attach proof of payment.</p>
      <BookingProgress stage="payment" />
      <div className="demo-banner" role="note">
        <strong>{import.meta.env.VITE_STAGING_ONLY === '1' ? 'TEST PAYMENT — DO NOT TRANSFER FUNDS' : quoteReady ? 'BOOKING AMOUNT READY — PAYMENT PENDING REVIEW' : 'PAYMENT NOT READY — DO NOT SEND MONEY'}</strong>
        <p>{quoteError || 'The booking amount and available time must be confirmed. Uploading a receipt does not mean payment is approved.'}</p>
      </div>
      <BookingSummary schedule={schedule} />
      <div className="booking-panel guest-qr-panel">
        <h2>1. Select QR payment method</h2>
        <fieldset className="guest-method-selector">
          <legend>Payment QR choices</legend>
          <div className="guest-method-grid">
            {methods.map((value) => (
              <label key={value} className={method === value ? 'guest-method is-selected' : 'guest-method'}>
                <input type="radio" name="guest-qr-method" checked={method === value} onChange={() => changeMethod(value)} />
                {paymentQr[value].name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="guest-qr-layout">
          <div className="guest-qr-image-wrap">
            {qrReady && chosen.image
              ? <img src={chosen.image} alt={`${chosen.name} recipient payment QR supplied by the venue`} decoding="async" />
              : <p role="status" className="guest-backend-blocker">A payment QR is not available for this method. Do not send money.</p>}
          </div>
          <div className="guest-qr-instructions">
            <h3>{chosen.name}</h3>
            <p>QR display name: <strong>{chosen.recipient}</strong></p>
            <p>Reservation amount: <strong>{quoteReady ? formatPeso(quote.amountMinor) + (import.meta.env.VITE_STAGING_ONLY === '1' ? ' (test amount only)' : '') : 'Waiting for confirmed amount'}</strong></p>
            {isSharedSupabase && (managedQrLoading || managedQrError) && (
              <p role="status">{managedQrLoading ? 'Loading venue QR payment settings…' : managedQrError}</p>
            )}
            <p>{qrReady ? 'Scan this QR using a compatible payment application and verify the recipient matches before transferring funds.' : 'Do not send money. The payment recipient QR has not been configured.'}</p>
            <p className="guest-qr-warning">Do not pay for a sample time or an unconfirmed amount. Transfer fees may apply.</p>
          </div>
        </div>
        <h2>2. Confirm payment action</h2>
        <button type="button" className="button button-secondary" disabled={!qrReady || !quoteReady}
          onClick={() => { setPaymentDone(true); setError(''); }}>
          Payment Done — I have completed the transfer
        </button>
        {!quoteReady && <p className="booking-help">Payment cannot continue until the booking amount and recipient QR are available.</p>}
        {paymentDone && (
          <form className="guest-proof-form" onSubmit={(event) => { void submit(event); }}>
            <h2>3. Attach payment receipt</h2>
            <label htmlFor="payment-proof">Payment receipt (JPG, PNG or PDF, up to 5 MB)</label>
            <input ref={fileInput} id="payment-proof" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
              onChange={(event) => { void chooseProof(event.target.files?.[0] ?? null); }} />
            {checkingProof && <p role="status">Validating receipt format…</p>}
            {proofError && <p role="alert" className="form-error">{proofError}</p>}
            {proof && !proofError && <p className="booking-help">Selected: {proof.name} ({(proof.size / 1024).toFixed(1)} KB). This file has not been uploaded yet.</p>}
            <label htmlFor="transaction-reference">Transaction reference (optional)</label>
            <input id="transaction-reference" type="text" maxLength={100} value={reference}
              onChange={(event) => { setReference(event.target.value); attemptId.current = crypto.randomUUID(); }} placeholder="Reference displayed by your payment app" />
            <p className="booking-help">Submitting your booking will issue a reservation reference. Your payment receipt must still be reviewed before confirmation.</p>
            {error && <p role="alert" className="form-error">{error}</p>}
            <button type="submit" className="button button-primary" disabled={!canSubmit}>
              {isSubmitting ? 'Submitting…' : 'Submit reservation'}
            </button>
            {!guestSubmissionConfigured && <p role="status" className="guest-backend-blocker">Booking submission is currently unavailable. Please try again later or contact the venue.</p>}
          </form>
        )}
        <div className="booking-actions">
          <Link to="/book/review" className="button button-secondary">Back to booking review</Link>
          <Link to="/book" className="text-link">Change court or time</Link>
        </div>
      </div>
    </section>
  );
}
