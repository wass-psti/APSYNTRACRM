-- CP-PDL-BOOKING-AVAILABILITY-04 disposable PostgreSQL acceptance.
-- This file must run only in the dedicated local disposable database harness.
-- All configuration, quotes, reservations and synthetic proof metadata roll back.
begin;

update pdl_booking.courts
set enabled=true,open_minute=480,close_minute=1440;

insert into pdl_booking.weekday_hours(court_code,weekday,enabled,open_minute,close_minute)
select c.code,d.weekday,true,480,1440
from pdl_booking.courts c
cross join generate_series(0,6) as d(weekday)
on conflict(court_code,weekday) do update
set enabled=excluded.enabled,open_minute=excluded.open_minute,close_minute=excluded.close_minute;

insert into pdl_booking.rates(court_code,duration_minutes,amount_minor,enabled)
select c.code,d.duration,case d.duration when 60 then 15000 when 90 then 22500 else 30000 end,true
from pdl_booking.courts c
cross join (values (60),(90),(120)) as d(duration)
on conflict(court_code,duration_minutes) do update
set amount_minor=excluded.amount_minor,enabled=excluded.enabled;

set local role service_role;
set local request.jwt.claim.role='service_role';
set local statement_timeout='30s';
set local lock_timeout='2s';

do $$
declare
  v_day date := (now() at time zone 'Asia/Manila')::date + 1;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_court text;
  v_duration integer;
  v_expected_amount integer;
  v_availability jsonb;
  v_quote jsonb;
  v_submit jsonb;
  v_replay jsonb;
  v_receipt jsonb;
  v_payload jsonb;
  v_changed_payload jsonb;
  v_reservation_id uuid;
  v_access_token text;
  v_idempotency uuid := 'a4000000-0000-4000-8000-000000000001';
  v_current_minute integer := extract(hour from (now() at time zone 'Asia/Manila'))::integer*60
    + extract(minute from (now() at time zone 'Asia/Manila'))::integer;
  v_count integer;
begin
  -- Live-equivalent availability and quote checks for all nine saved rate combinations.
  for v_court in select code from pdl_booking.courts order by code loop
    for v_duration in select unnest(array[60,90,120]) loop
      v_availability := pdl_booking.availability(jsonb_build_object(
        'courtId',v_court,'date',v_day,'durationMinutes',v_duration));
      if v_availability->>'bookingEnabled' <> 'true' then
        raise exception 'Court/duration not enabled: %/% => %',v_court,v_duration,v_availability;
      end if;
      if not exists (
        select 1 from jsonb_array_elements(v_availability->'slots') as slot
        where slot->>'status'='available'
      ) then raise exception 'No future slots for %/%',v_court,v_duration; end if;

      v_expected_amount := case v_duration when 60 then 15000 when 90 then 22500 else 30000 end;
      v_quote := pdl_booking.quote(jsonb_build_object(
        'courtId',v_court,'date',v_day,'startMinute',480,'durationMinutes',v_duration));
      if v_quote ? 'error' or (v_quote->>'amountMinor')::integer <> v_expected_amount
        or v_quote->>'currency' <> 'PHP'
        or (v_quote->>'durationMinutes')::integer <> v_duration then
        raise exception 'Court/duration quote mismatch for %/%: %',v_court,v_duration,v_quote;
      end if;
    end loop;
  end loop;

  -- Same-day past starts must be rejected by interval validation and availability.
  if v_current_minute > 480 then
    if pdl_booking.is_valid_interval('court-1',v_today,480,60) then
      raise exception 'Past same-day interval was accepted';
    end if;
    v_availability := pdl_booking.availability(jsonb_build_object(
      'courtId','court-1','date',v_today,'durationMinutes',60));
    if exists (
      select 1 from jsonb_array_elements(v_availability->'slots') as slot
      where (slot->>'startMinute')::integer <= v_current_minute
    ) then raise exception 'Past same-day slot was advertised'; end if;
  end if;

  -- Quote -> first submission -> independently token-scoped receipt readback.
  v_quote := pdl_booking.quote(jsonb_build_object(
    'courtId','court-1','date',v_day,'startMinute',480,'durationMinutes',90));
  if v_quote->>'amountMinor' <> '22500' or v_quote->>'currency' <> 'PHP'
    or v_quote->>'durationMinutes' <> '90' then
    raise exception 'Unexpected live-equivalent 90-minute quote: %',v_quote;
  end if;
  v_payload := jsonb_build_object(
    'quoteToken',v_quote->>'quoteToken',
    'idempotencyKey',v_idempotency,
    'fullName','CP-PDL-04 Disposable QA Guest',
    'email','cp-pdl-04-qa@example.test',
    'phone','09170000004',
    'paymentMethod','gcash',
    'transactionReference','CP-PDL-04-TEST-ONLY-NO-PAYMENT',
    'proofPath',v_idempotency::text||'/synthetic-proof.pdf',
    'proofMime','application/pdf',
    'proofSha256',repeat('a',64)
  );
  v_submit := pdl_booking.submit(v_payload);
  if v_submit->'receipt' is null or v_submit->>'replayed' <> 'false' then
    raise exception 'First reservation submission failed: %',v_submit;
  end if;
  v_reservation_id := (v_submit->'receipt'->>'reservationId')::uuid;
  v_access_token := v_submit->'receipt'->>'receiptAccessToken';

  v_receipt := pdl_booking.receipt(jsonb_build_object(
    'reservationId',v_reservation_id,'receiptAccessToken',v_access_token));
  if v_receipt->>'reservationId' <> v_reservation_id::text
    or v_receipt->>'bookingStatus' <> 'pending_verification'
    or v_receipt->>'paymentStatus' <> 'submitted'
    or v_receipt->>'amountMinor' <> '22500'
    or v_receipt->>'durationMinutes' <> '90' then
    raise exception 'Persisted receipt readback mismatch: %',v_receipt;
  end if;
  if pdl_booking.receipt(jsonb_build_object(
    'reservationId',v_reservation_id,'receiptAccessToken','incorrect-receipt-token')) ? 'paymentStatus' then
    raise exception 'Receipt data was returned for an incorrect access token';
  end if;

  -- Same-key retry returns the same row; changed payload under that key conflicts.
  v_replay := pdl_booking.submit(v_payload);
  if v_replay->>'replayed' <> 'true'
    or v_replay->'receipt'->>'reservationId' <> v_reservation_id::text then
    raise exception 'Idempotent replay failed: %',v_replay;
  end if;
  v_changed_payload := v_payload || jsonb_build_object('fullName','Changed Disposable Guest');
  v_replay := pdl_booking.submit(v_changed_payload);
  if v_replay->>'error' <> 'idempotency_conflict' then
    raise exception 'Changed same-key submission was not rejected: %',v_replay;
  end if;
  select count(*) into v_count from pdl_booking.reservations where idempotency_key=v_idempotency;
  if v_count <> 1 then raise exception 'Idempotency produced % rows',v_count; end if;

  -- The persisted reservation blocks an overlapping quote.
  v_quote := pdl_booking.quote(jsonb_build_object(
    'courtId','court-1','date',v_day,'startMinute',540,'durationMinutes',60));
  if v_quote->>'error' <> 'slot_unavailable' then
    raise exception 'Overlapping reservation was not blocked: %',v_quote;
  end if;

  -- Maintenance blocks reject both availability and quote requests.
  insert into pdl_booking.maintenance_blocks(court_code,day,start_minute,end_minute)
  values ('court-2',v_day,600,660);
  v_availability := pdl_booking.availability(jsonb_build_object(
    'courtId','court-2','date',v_day,'durationMinutes',60));
  if not exists (
    select 1 from jsonb_array_elements(v_availability->'slots') as slot
    where (slot->>'startMinute')::integer=600 and slot->>'status'='unavailable'
  ) then raise exception 'Maintenance block did not disable the overlapping slot'; end if;
  v_quote := pdl_booking.quote(jsonb_build_object(
    'courtId','court-2','date',v_day,'startMinute',600,'durationMinutes',60));
  if v_quote->>'error' <> 'slot_unavailable' then
    raise exception 'Maintenance block did not reject quote: %',v_quote;
  end if;

  -- A rate changed after quote issuance invalidates the old quote at submission.
  v_quote := pdl_booking.quote(jsonb_build_object(
    'courtId','court-3','date',v_day,'startMinute',480,'durationMinutes',60));
  update pdl_booking.rates set amount_minor=16000
  where court_code='court-3' and duration_minutes=60;
  v_payload := jsonb_build_object(
    'quoteToken',v_quote->>'quoteToken',
    'idempotencyKey','a4000000-0000-4000-8000-000000000002',
    'fullName','CP-PDL-04 Disposable QA Guest',
    'email','cp-pdl-04-qa@example.test','phone','09170000004',
    'paymentMethod','gcash','transactionReference','CP-PDL-04-TEST-ONLY-NO-PAYMENT',
    'proofPath','a4000000-0000-4000-8000-000000000002/synthetic-proof.pdf',
    'proofMime','application/pdf','proofSha256',repeat('b',64));
  v_submit := pdl_booking.submit(v_payload);
  if v_submit->>'error' <> 'slot_or_rate_changed' then
    raise exception 'Stale quote was not rejected after rate change: %',v_submit;
  end if;

  -- Expired quotes cannot be submitted even if their original schedule is otherwise free.
  v_quote := pdl_booking.quote(jsonb_build_object(
    'courtId','court-3','date',v_day,'startMinute',720,'durationMinutes',90));
  update pdl_booking.quotes set expires_at=now()-interval '1 second'
  where id=(v_quote->>'quoteToken')::uuid;
  v_payload := jsonb_build_object(
    'quoteToken',v_quote->>'quoteToken',
    'idempotencyKey','a4000000-0000-4000-8000-000000000003',
    'fullName','CP-PDL-04 Disposable QA Guest',
    'email','cp-pdl-04-qa@example.test','phone','09170000004',
    'paymentMethod','gcash','transactionReference','CP-PDL-04-TEST-ONLY-NO-PAYMENT',
    'proofPath','a4000000-0000-4000-8000-000000000003/synthetic-proof.pdf',
    'proofMime','application/pdf','proofSha256',repeat('c',64));
  v_submit := pdl_booking.submit(v_payload);
  if v_submit->>'error' <> 'quote_expired' then
    raise exception 'Expired quote was not rejected: %',v_submit;
  end if;

  raise notice 'PASS: all 9 court/duration availability and exact PHP quote combinations';
  raise notice 'PASS: same-day past starts excluded';
  raise notice 'PASS: quote -> persisted reservation -> independent receipt readback';
  raise notice 'PASS: incorrect receipt token returns no reservation data';
  raise notice 'PASS: same-key retry returns one reservation; changed payload conflicts';
  raise notice 'PASS: overlapping and maintenance-conflicting intervals rejected';
  raise notice 'PASS: changed-rate and expired quotes rejected';
  raise notice 'PASS: synthetic booking and every fixture are inside rollback transaction';
end
$$;

rollback;
