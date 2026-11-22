-- Disposable PostgreSQL acceptance only. All fixture rows are rolled back.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

do $$
declare
  v_actor uuid := gen_random_uuid();
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_weekday integer;
  v_result jsonb;
  v_saved jsonb;
begin
  insert into auth.users(id) values (v_actor);
  insert into pdl_booking.admin_users(user_id) values (v_actor);

  -- Choose a weekday without an existing pending or confirmed Court 3 booking
  -- in the schedule function's 14-day conflict window.
  select day_number into v_weekday
  from generate_series(0, 6) as days(day_number)
  where not exists (
    select 1
    from pdl_booking.reservations reservation
    where reservation.court_code = 'court-3'
      and reservation.booking_status in ('pending_verification', 'confirmed')
      and reservation.reservation_date between v_today and v_today + 13
      and extract(dow from reservation.reservation_date)::integer = day_number
  )
  order by day_number
  limit 1;

  if v_weekday is null then
    raise exception 'No conflict-free Court 3 weekday is available for rollback acceptance.';
  end if;

  -- First write creates or establishes the existing schedule row.
  v_result := pdl_booking.operations('ops_schedule_put', jsonb_build_object(
    'actorId', v_actor,
    'courtId', 'court-3',
    'weekday', v_weekday,
    'enabled', true,
    'openMinute', 480,
    'closeMinute', 1320
  ));
  if v_result->>'updated' is distinct from 'true' then
    raise exception 'Initial weekday schedule write failed: %', v_result;
  end if;

  -- A second PUT must update the same (court, weekday) row, not duplicate it.
  v_result := pdl_booking.operations('ops_schedule_put', jsonb_build_object(
    'actorId', v_actor,
    'courtId', 'court-3',
    'weekday', v_weekday,
    'enabled', false,
    'openMinute', 540,
    'closeMinute', 1260
  ));
  if v_result->>'updated' is distinct from 'true' then
    raise exception 'Existing weekday schedule update failed: %', v_result;
  end if;

  v_result := pdl_booking.operations('ops_calendar', jsonb_build_object('actorId', v_actor));
  select schedule.value into v_saved
  from jsonb_array_elements(v_result->'weekdays') as schedule(value)
  where schedule.value->>'courtId' = 'court-3'
    and (schedule.value->>'weekday')::integer = v_weekday;

  if v_saved is null
    or v_saved->>'enabled' is distinct from 'false'
    or (v_saved->>'openMinute')::integer is distinct from 540
    or (v_saved->>'closeMinute')::integer is distinct from 1260 then
    raise exception 'Updated weekday schedule was not persisted and returned by calendar readback: %', v_saved;
  end if;

  -- Invalid updates must return a validation result and leave the saved row intact.
  v_result := pdl_booking.operations('ops_schedule_put', jsonb_build_object(
    'actorId', v_actor,
    'courtId', 'court-3',
    'weekday', v_weekday,
    'enabled', true,
    'openMinute', 600,
    'closeMinute', 540
  ));
  if v_result->>'error' is distinct from 'invalid_weekday_schedule' then
    raise exception 'Invalid weekday range was not rejected: %', v_result;
  end if;

  v_result := pdl_booking.operations('ops_calendar', jsonb_build_object('actorId', v_actor));
  select schedule.value into v_saved
  from jsonb_array_elements(v_result->'weekdays') as schedule(value)
  where schedule.value->>'courtId' = 'court-3'
    and (schedule.value->>'weekday')::integer = v_weekday;

  if v_saved->>'enabled' is distinct from 'false'
    or (v_saved->>'openMinute')::integer is distinct from 540
    or (v_saved->>'closeMinute')::integer is distinct from 1260 then
    raise exception 'Rejected invalid update changed the persisted weekday schedule: %', v_saved;
  end if;

  raise notice 'PDL_EDIT_SCHEDULE_ROLLBACK_PASS';
end $$;

rollback;
