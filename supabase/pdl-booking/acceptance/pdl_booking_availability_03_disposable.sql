-- Disposable PostgreSQL acceptance for CP-PDL-BOOKING-AVAILABILITY-03.
-- Run only against a newly-created local test database after all Paseo migrations.
-- Every seed, quote and reservation is rolled back at the end.
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

do $$
declare
  v_day date := (now() at time zone 'Asia/Manila')::date + 1;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_court text;
  v_duration integer;
  v_availability jsonb;
  v_quote jsonb;
  v_second_quote jsonb;
  v_submit jsonb;
  v_replay jsonb;
  v_receipt jsonb;
  v_payload jsonb;
  v_reservation_id uuid;
  v_access_token text;
  v_idempotency uuid := 'a1000000-0000-4000-8000-000000000001';
  v_current_minute integer := extract(hour from (now() at time zone 'Asia/Manila'))::integer*60
    + extract(minute from (now() at time zone 'Asia/Manila'))::integer;
  v_count integer;
begin
  -- All nine court/duration combinations must be server-bookable in the fixture.
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
    end loop;
  end loop;

  -- Past same-day starts must be rejected by both interval validation and slot generation.
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

  -- Obtain a genuine SQL quote, then create and read back a persisted test reservation.
  v_quote := pdl_booking.quote(jsonb_build_object(
    'courtId','court-1','date',v_day,'startMinute',480,'durationMinutes',60));
  if v_quote->>'amountMinor' <> '15000' or v_quote->>'currency' <> 'PHP' then
    raise exception 'Unexpected quote amount: %',v_quote;
  end if;
  v_payload := jsonb_build_object(
    'quoteToken',v_quote->>'quoteToken',
    'idempotencyKey',v_idempotency,
    'fullName','CP-PDL-03 Disposable QA Guest',
    'email','cp-pdl-03-qa@example.test',
    'phone','09170000003',
    'paymentMethod','gcash',
    'transactionReference','CP-PDL-03-TEST-ONLY',
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
    or v_receipt->>'amountMinor' <> '15000' then
    raise exception 'Persisted receipt readback mismatch: %',v_receipt;
  end if;

  -- Same idempotency key must return the original record, not create another.
  v_replay := pdl_booking.submit(v_payload);
  if v_replay->>'replayed' <> 'true'
    or v_replay->'receipt'->>'reservationId' <> v_reservation_id::text then
    raise exception 'Idempotent replay failed: %',v_replay;
  end if;
  select count(*) into v_count from pdl_booking.reservations where idempotency_key=v_idempotency;
  if v_count <> 1 then raise exception 'Idempotency produced % rows',v_count; end if;

  -- The same slot is now unavailable for a second quote.
  v_second_quote := pdl_booking.quote(jsonb_build_object(
    'courtId','court-1','date',v_day,'startMinute',480,'durationMinutes',60));
  if v_second_quote->>'error' <> 'slot_unavailable' then
    raise exception 'Overlapping reservation was not blocked: %',v_second_quote;
  end if;

  -- Maintenance blocks must participate in both availability and quote checks.
  insert into pdl_booking.maintenance_blocks(court_code,day,start_minute,end_minute)
  values ('court-2',v_day,600,660);
  v_availability := pdl_booking.availability(jsonb_build_object(
    'courtId','court-2','date',v_day,'durationMinutes',60));
  if not exists (
    select 1 from jsonb_array_elements(v_availability->'slots') as slot
    where (slot->>'startMinute')::integer=600 and slot->>'status'='unavailable'
  ) then raise exception 'Maintenance block did not disable the overlapping slot'; end if;
  v_second_quote := pdl_booking.quote(jsonb_build_object(
    'courtId','court-2','date',v_day,'startMinute',600,'durationMinutes',60));
  if v_second_quote->>'error' <> 'slot_unavailable' then
    raise exception 'Maintenance block did not reject quote: %',v_second_quote;
  end if;

  -- A rate changed after quote issuance must invalidate the old quote at submit.
  v_quote := pdl_booking.quote(jsonb_build_object(
    'courtId','court-3','date',v_day,'startMinute',480,'durationMinutes',60));
  update pdl_booking.rates set amount_minor=16000
  where court_code='court-3' and duration_minutes=60;
  v_payload := jsonb_build_object(
    'quoteToken',v_quote->>'quoteToken',
    'idempotencyKey','a1000000-0000-4000-8000-000000000002',
    'fullName','CP-PDL-03 Disposable QA Guest',
    'email','cp-pdl-03-qa@example.test','phone','09170000003',
    'paymentMethod','gcash','transactionReference','CP-PDL-03-TEST-ONLY',
    'proofPath','a1000000-0000-4000-8000-000000000002/synthetic-proof.pdf',
    'proofMime','application/pdf','proofSha256',repeat('b',64));
  v_submit := pdl_booking.submit(v_payload);
  if v_submit->>'error' <> 'slot_or_rate_changed' then
    raise exception 'Stale quote was not rejected after rate change: %',v_submit;
  end if;

  raise notice 'PASS: 9 court-duration availability combinations';
  raise notice 'PASS: same-day past starts excluded from availability and quote validation';
  raise notice 'PASS: SQL quote -> persisted reservation -> token receipt readback';
  raise notice 'PASS: same-key retry returns one persisted reservation';
  raise notice 'PASS: occupied and maintenance-conflicting slots rejected';
  raise notice 'PASS: changed rate invalidates stale quote';
end
$$;

rollback;
