-- PDL-APS-NATIVE-05: This file is executed inside the test runner's BEGIN/ROLLBACK
-- together with the matching migration. No permanent rates, writes or schema changes.
do $test$
declare
 d date := (now() at time zone 'Asia/Manila')::date+2;
 actor uuid;
 actor2 uuid;
 quote jsonb;
 saved jsonb;
 saved2 jsonb;
 input jsonb;
 first_page jsonb;
 second_page jsonb;
 cancel_result jsonb;
 stale jsonb;
 verify_result jsonb;
 replay jsonb;
 rid uuid;
 rid2 uuid;
begin
 select user_id into actor from pdl_booking.admin_users where active order by created_at limit 1;
 select user_id into actor2 from pdl_booking.admin_users where active and user_id<>actor limit 1;
 if actor is null or actor2 is null then raise exception 'Missing existing administrator memberships'; end if;
 update pdl_booking.courts set enabled=true where code='court-1';
 insert into pdl_booking.rates(court_code,duration_minutes,amount_minor,enabled)
 values('court-1',60,50000,true)
 on conflict(court_code,duration_minutes) do update set amount_minor=excluded.amount_minor,enabled=true;
 quote:=pdl_booking.quote(jsonb_build_object('courtId','court-1','date',d::text,
  'startMinute',480,'durationMinutes',60));
 if quote ? 'error' then raise exception 'Quote failed %',quote; end if;
 input:=jsonb_build_object('quoteToken',quote->>'quoteToken',
  'idempotencyKey',gen_random_uuid()::text,'fullName','PDL Lifecycle Synthetic One',
  'email','pdl-test-one@example.test','phone','09171234567','paymentMethod','gcash',
  'transactionReference','SYNTHETIC-ONLY','proofPath','acceptance/native05-one.pdf',
  'proofMime','application/pdf','proofSha256',repeat('a',64));
 saved:=pdl_booking.submit(input);
 if saved ? 'error' then raise exception 'Submit failed %',saved; end if;
 rid:=(saved->'receipt'->>'reservationId')::uuid;
 first_page:=public.pdl_admin_lifecycle_v1('page',jsonb_build_object('actorId',actor,'limit',1));
 if jsonb_array_length(first_page->'reservations')<>1 or first_page->'nextCursor' <> 'null'::jsonb then
  -- second record is not yet inserted, so there is no further page.
  raise exception 'Unexpected first page %',first_page;
 end if;
 cancel_result:=public.pdl_admin_lifecycle_v1('cancel',jsonb_build_object('actorId',actor,
  'reservationId',rid,'expectedVersion',1));
 if cancel_result->>'bookingStatus'<>'cancelled' or cancel_result->>'paymentStatus'<>'submitted'
  or cancel_result->>'refundStatus'<>'not_processed' then
  raise exception 'Cancellation did not retain financial state: %',cancel_result;
 end if;
 if not pdl_booking.is_available('court-1',d,480,60) then raise exception 'Cancelled slot remains blocked'; end if;
 replay:=pdl_booking.submit(input);
 if replay->>'replayed'<>'true' or replay->'receipt'->>'bookingStatus'<>'cancelled'
  then raise exception 'Cancelled idempotent replay failed %',replay; end if;
 stale:=public.pdl_admin_lifecycle_v1('cancel',jsonb_build_object('actorId',actor2,
  'reservationId',rid,'expectedVersion',1));
 if stale->>'error'<>'cancellation_conflict' then raise exception 'Stale cancel accepted %',stale; end if;
 if (select count(*) from pdl_booking.audit_events where reservation_id=rid and action='cancelled')<>1
  then raise exception 'Cancellation audit missing'; end if;
 quote:=pdl_booking.quote(jsonb_build_object('courtId','court-1','date',d::text,
  'startMinute',480,'durationMinutes',60));
 input:=input||jsonb_build_object('quoteToken',quote->>'quoteToken',
  'idempotencyKey',gen_random_uuid()::text,'fullName','PDL Lifecycle Synthetic Two',
  'proofPath','acceptance/native05-two.pdf','proofSha256',repeat('b',64));
 saved2:=pdl_booking.submit(input);
 if saved2 ? 'error' then raise exception 'Second submit failed %',saved2; end if;
 rid2:=(saved2->'receipt'->>'reservationId')::uuid;
 -- A transaction-stable now() would tie created_at; make test ordering explicit.
 update pdl_booking.reservations set created_at=created_at+interval '1 second' where id=rid2;
 first_page:=public.pdl_admin_lifecycle_v1('page',jsonb_build_object('actorId',actor,'limit',1));
 if jsonb_array_length(first_page->'reservations')<>1 or first_page->'nextCursor' = 'null'::jsonb
   or first_page->'reservations'->0->>'id'<>rid2::text
   then raise exception 'First page cursor mismatch %',first_page; end if;
 second_page:=public.pdl_admin_lifecycle_v1('page',jsonb_build_object('actorId',actor,
  'limit',1,'beforeCreatedAt',first_page->'nextCursor'->>'beforeCreatedAt',
  'beforeId',first_page->'nextCursor'->>'beforeId'));
 if jsonb_array_length(second_page->'reservations')<>1
   or second_page->'reservations'->0->>'id'<>rid::text or second_page->'nextCursor' <> 'null'::jsonb
   then raise exception 'Second page cursor mismatch %',second_page; end if;
 if public.pdl_admin_lifecycle_v1('page',jsonb_build_object('actorId',actor,'limit',51))->>'error'<>'invalid_page'
  then raise exception 'Unbounded page allowed'; end if;
 verify_result:=pdl_booking.verify(jsonb_build_object('actorId',actor2,'reservationId',rid2,
  'expectedVersion',1,'decision','verified'));
 if verify_result->>'updated'<>'true' then raise exception 'Verification failed'; end if;
 if public.pdl_admin_lifecycle_v1('cancel',jsonb_build_object('actorId',actor,
  'reservationId',rid2,'expectedVersion',2))->>'error'<>'cancellation_conflict'
  then raise exception 'Verified booking wrongly cancelled without reconciliation'; end if;
 if public.pdl_admin_lifecycle_v1('cancel',jsonb_build_object('actorId',actor,
  'reservationId',rid2,'expectedVersion',1))->>'error'<>'cancellation_conflict'
  then raise exception 'Stale version not denied'; end if;
end $test$;
select 'ROLLBACK_ONLY_PDL_NATIVE05_LIFECYCLE_PASS' as acceptance,
 (select count(*)::integer from pdl_booking.reservations) as transient_reservations;
