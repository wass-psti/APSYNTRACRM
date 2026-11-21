-- PDL-APS-NATIVE-04: actual PostgreSQL integration acceptance.
-- ALL synthetic rates, quotes, bookings, audit records and role-based reads
-- execute inside a single transaction that MUST ALWAYS ROLLBACK.
-- This is not a real customer payment or venue approval.
begin;
set local lock_timeout='2s';
set local statement_timeout='25s';

do $test$
declare
  booking_date date := (now() at time zone 'Asia/Manila')::date + 2;
  actor_a uuid;
  actor_b uuid;
  q jsonb;
  submitted jsonb;
  repeated jsonb;
  changed jsonb;
  receipt jsonb;
  admin_a jsonb;
  admin_b jsonb;
  verified jsonb;
  stale jsonb;
  post_a jsonb;
  post_b jsonb;
  id uuid;
  key uuid := gen_random_uuid();
  guest jsonb;
  record jsonb;
begin
  select user_id into actor_a from pdl_booking.admin_users where active order by created_at,user_id limit 1;
  select user_id into actor_b from pdl_booking.admin_users where active and user_id<>actor_a order by created_at,user_id limit 1;
  if actor_a is null or actor_b is null then
    raise exception 'Existing test actor memberships unavailable';
  end if;

  -- These amounts and recipient references exist only in the rollback transaction.
  update pdl_booking.courts set enabled=true where code='court-1';
  insert into pdl_booking.rates(court_code,duration_minutes,amount_minor,enabled)
    values('court-1',60,50000,true)
    on conflict(court_code,duration_minutes)
    do update set amount_minor=excluded.amount_minor,enabled=true;

  q:=pdl_booking.quote(jsonb_build_object('courtId','court-1','date',booking_date::text,
    'startMinute',480,'durationMinutes',60));
  if q ? 'error' or q->>'amountMinor'<>'50000' then raise exception 'Server quote failed: %',q; end if;

  guest:=jsonb_build_object('quoteToken',q->>'quoteToken','idempotencyKey',key::text,
    'fullName','Synthetic Backend Acceptance','email','pdl-test@example.test',
    'phone','09171234567','paymentMethod','gcash','transactionReference','TEST-ONLY',
    'proofPath','acceptance/rollback-only-no-real-media.pdf','proofMime','application/pdf',
    'proofSha256',repeat('a',64));
  submitted:=pdl_booking.submit(guest);
  if submitted ? 'error' or submitted->'receipt'->>'bookingStatus'<>'pending_verification'
    then raise exception 'Public booking creation failed: %',submitted; end if;
  id:=(submitted->'receipt'->>'reservationId')::uuid;
  repeated:=pdl_booking.submit(guest);
  if repeated->>'replayed'<>'true' or repeated->'receipt'->>'reservationId'<>id::text
    then raise exception 'Idempotent retry created a different reservation'; end if;
  changed:=pdl_booking.submit(guest||jsonb_build_object('fullName','Changed Synthetic Guest'));
  if changed->>'error'<>'idempotency_conflict' then raise exception 'Changed replay was not denied'; end if;

  receipt:=pdl_booking.receipt(jsonb_build_object('reservationId',id,
    'receiptAccessToken',submitted->'receipt'->>'receiptAccessToken'));
  if receipt->>'bookingStatus'<>'pending_verification' then raise exception 'Public receipt readback failed'; end if;
  if pdl_booking.receipt(jsonb_build_object('reservationId',id,
    'receiptAccessToken','incorrect-token')) ? 'paymentStatus'
    then raise exception 'Private receipt exposed to incorrect token'; end if;

  -- The same persisted row must be visible to both existing administrator identities.
  admin_a:=public.pdl_backend_v1('list',jsonb_build_object('actorId',actor_a));
  admin_b:=public.pdl_backend_v1('list',jsonb_build_object('actorId',actor_b));
  if not exists(select 1 from jsonb_array_elements(admin_a->'reservations') item where item->>'id'=id::text)
    or not exists(select 1 from jsonb_array_elements(admin_b->'reservations') item where item->>'id'=id::text)
    then raise exception 'Public booking absent from native CRM admin readback'; end if;

  verified:=pdl_booking.verify(jsonb_build_object('actorId',actor_a,'reservationId',id,
    'expectedVersion',1,'decision','verified'));
  if verified->>'updated'<>'true' then raise exception 'Admin verification failed: %',verified; end if;
  stale:=pdl_booking.verify(jsonb_build_object('actorId',actor_b,'reservationId',id,
    'expectedVersion',1,'decision','rejected'));
  if stale->>'error'<>'verification_conflict' then raise exception 'Stale second admin write was not denied'; end if;
  post_a:=public.pdl_backend_v1('list',jsonb_build_object('actorId',actor_a));
  post_b:=public.pdl_backend_v1('list',jsonb_build_object('actorId',actor_b));
  select value into record from jsonb_array_elements(post_a->'reservations') where value->>'id'=id::text;
  if record->>'booking_status'<>'confirmed' or record->>'payment_status'<>'verified'
    or (record->>'version')::integer<>2 then raise exception 'Native status not persisted after decision'; end if;
  select value into record from jsonb_array_elements(post_b->'reservations') where value->>'id'=id::text;
  if record->>'booking_status'<>'confirmed' or (record->>'version')::integer<>2
    then raise exception 'Second admin did not read newest persisted status'; end if;
  if (select count(*) from pdl_booking.audit_events where reservation_id=(submitted->'receipt'->>'reservationId')::uuid)<>1
    then raise exception 'Admin decision audit missing'; end if;
  if pdl_booking.is_available('court-1',booking_date,480,60)
    then raise exception 'Confirmed reservation did not block the original slot'; end if;
end $test$;

select 'ROLLBACK_ONLY_PDL_NATIVE04_SYNC_PASS' as acceptance,
 (select count(*)::int from pdl_booking.reservations) as transient_reservations;
rollback;
