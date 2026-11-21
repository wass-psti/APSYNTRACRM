-- Disposable PostgreSQL only. All synthetic booking and financial statuses roll back.
-- This does NOT charge, refund, reconcile, or settle real customer funds.
-- Refuse test writes outside the disposable fixture initialized by this suite.
DO $guard$ BEGIN
  IF to_regclass('pdl07_acceptance_guard.disposable_fixture') IS NULL OR
     NOT EXISTS (SELECT 1 FROM pdl07_acceptance_guard.disposable_fixture WHERE id=1) THEN
    RAISE EXCEPTION 'PDL07_REQUIRES_DISPOSABLE_FIXTURE';
  END IF;
END $guard$;
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='25s';
DO $test$
DECLARE
  first_admin uuid;
  second_admin uuid;
  day date := (now() at time zone 'Asia/Manila')::date + 2;
  before_methods jsonb;
  q jsonb;
  receipt jsonb;
  replay jsonb;
  decision jsonb;
  page jsonb;
  booking_id uuid;
  verified_id uuid;
  input jsonb;
BEGIN
  SELECT user_id INTO first_admin FROM pdl_booking.admin_users WHERE active ORDER BY user_id LIMIT 1;
  SELECT user_id INTO second_admin FROM pdl_booking.admin_users
    WHERE active AND user_id <> first_admin ORDER BY user_id LIMIT 1;
  IF first_admin IS NULL OR second_admin IS NULL THEN
    RAISE EXCEPTION 'Two disposable administrators required';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(pm) ORDER BY method),'[]'::jsonb)
    INTO before_methods FROM pdl_booking.payment_methods pm;
  UPDATE pdl_booking.courts SET enabled=true WHERE code='court-1';
  INSERT INTO pdl_booking.rates(court_code,duration_minutes,amount_minor,enabled)
    VALUES('court-1',60,50000,true);
  q := pdl_booking.quote(jsonb_build_object('courtId','court-1',
    'date',day::text,'startMinute',480,'durationMinutes',60));
  IF NOT(q ? 'quoteToken') THEN RAISE EXCEPTION 'No synthetic quote: %',q; END IF;
  input := jsonb_build_object('quoteToken',q->>'quoteToken',
    'idempotencyKey',gen_random_uuid(),'fullName','PDL07 Disposable Cancellation',
    'email','synthetic-cancel@example.test','phone','09171234567',
    'paymentMethod','gcash','transactionReference','TEST-NO-FUNDS',
    'proofPath','acceptance/pdl07-cancel-synthetic.pdf',
    'proofMime','application/pdf','proofSha256',repeat('a',64));
  receipt := pdl_booking.submit(input);
  IF NOT(receipt ? 'receipt') THEN RAISE EXCEPTION 'No first reservation: %',receipt; END IF;
  booking_id := (receipt->'receipt'->>'reservationId')::uuid;
  decision := public.pdl_admin_lifecycle_v1('cancel',jsonb_build_object(
    'actorId',first_admin,'reservationId',booking_id,'expectedVersion',1));
  IF decision->>'bookingStatus'<>'cancelled' OR decision->>'paymentStatus'<>'submitted'
    OR decision->>'refundStatus'<>'not_processed' THEN
    RAISE EXCEPTION 'Cancellation incorrectly changed financial state: %',decision;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pdl_booking.reservations
    WHERE id=booking_id AND booking_status='cancelled' AND payment_status='submitted' AND version=2)
    THEN RAISE EXCEPTION 'Cancelled payment state not persisted'; END IF;
  IF (SELECT count(*) FROM pdl_booking.audit_events
    WHERE reservation_id=booking_id AND action='cancelled'
      AND old_payment_status='submitted' AND new_payment_status='submitted')<>1
    THEN RAISE EXCEPTION 'Cancellation financial audit invalid'; END IF;
  replay := pdl_booking.submit(input);
  IF replay->>'replayed'<>'true' OR replay->'receipt'->>'bookingStatus'<>'cancelled'
    THEN RAISE EXCEPTION 'Cancellation replay lost original status'; END IF;
  IF NOT pdl_booking.is_available('court-1',day,480,60)
    THEN RAISE EXCEPTION 'Cancelled booking still blocks the court'; END IF;

  q := pdl_booking.quote(jsonb_build_object('courtId','court-1',
    'date',day::text,'startMinute',480,'durationMinutes',60));
  receipt := pdl_booking.submit(jsonb_build_object('quoteToken',q->>'quoteToken',
    'idempotencyKey',gen_random_uuid(),'fullName','PDL07 Disposable Verification',
    'email','synthetic-verify@example.test','phone','09171234567',
    'paymentMethod','gcash','transactionReference','TEST-NO-FUNDS',
    'proofPath','acceptance/pdl07-verified-synthetic.pdf',
    'proofMime','application/pdf','proofSha256',repeat('b',64)));
  IF NOT(receipt ? 'receipt') THEN RAISE EXCEPTION 'No second reservation: %',receipt; END IF;
  verified_id := (receipt->'receipt'->>'reservationId')::uuid;
  decision := pdl_booking.verify(jsonb_build_object('actorId',second_admin,
    'reservationId',verified_id,'expectedVersion',1,'decision','verified'));
  IF decision->>'updated'<>'true' THEN RAISE EXCEPTION 'Verification denied: %',decision; END IF;
  decision := public.pdl_admin_lifecycle_v1('cancel',jsonb_build_object(
    'actorId',first_admin,'reservationId',verified_id,'expectedVersion',2));
  IF decision->>'error'<>'cancellation_conflict' THEN
    RAISE EXCEPTION 'Verified booking unexpectedly cancelled: %',decision; END IF;
  page := public.pdl_admin_lifecycle_v1('page',jsonb_build_object('actorId',first_admin,'limit',25));
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(page->'reservations') r
    WHERE r->>'id'=verified_id::text AND r->>'booking_status'='confirmed'
      AND r->>'payment_status'='verified' AND (r->>'version')::integer=2)
    THEN RAISE EXCEPTION 'Verification payment readback wrong'; END IF;
  IF (SELECT count(*) FROM pdl_booking.audit_events
    WHERE reservation_id=verified_id AND action='cancelled')<>0
    THEN RAISE EXCEPTION 'Invalid cancellation audit after verification'; END IF;
  IF (SELECT coalesce(jsonb_agg(to_jsonb(pm) ORDER BY method),'[]'::jsonb)
      FROM pdl_booking.payment_methods pm)<>before_methods
    THEN RAISE EXCEPTION 'Recipient/payment method metadata changed'; END IF;
  RAISE NOTICE 'PDL07_FINANCIAL_STATE_RECONCILIATION_PASS';
END $test$;
ROLLBACK;
DO $check$
BEGIN
 IF (SELECT count(*) FROM pdl_booking.reservations)<>0 OR
   (SELECT count(*) FROM pdl_booking.quotes)<>0 OR
   (SELECT count(*) FROM pdl_booking.audit_events)<>0 OR
   (SELECT count(*) FROM pdl_booking.rates)<>0 THEN
   RAISE EXCEPTION 'Financial reconciliation fixture leaked after rollback';
 END IF;
 RAISE NOTICE 'PDL07_FINANCIAL_RECONCILIATION_ROLLBACK_PASS';
END $check$;
