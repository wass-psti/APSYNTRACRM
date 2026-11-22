-- Disposable PostgreSQL 17 acceptance only. Every fixture is rolled back.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

do $$
declare
  v_actor uuid := gen_random_uuid();
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_date date;
  v_result jsonb;
  v_status text;
  v_blocks jsonb;
begin
  v_date := v_today + ((7 - extract(dow from v_today)::integer) % 7);
  if v_date = v_today then
    v_date := v_date + 7;
  end if;

  insert into auth.users(id) values (v_actor);
  insert into pdl_booking.admin_users(user_id) values (v_actor);

  update pdl_booking.courts set enabled = false where code = 'court-1';
  delete from pdl_booking.rates where court_code = 'court-1';

  insert into pdl_booking.weekday_hours(
    court_code, weekday, enabled, open_minute, close_minute
  ) values (
    'court-1', extract(dow from v_date)::integer, true, 480, 1320
  );

  -- Saved operating hours are visible even while the court is not enabled.
  v_result := pdl_booking.availability(jsonb_build_object(
    'courtId', 'court-1',
    'date', v_date::text,
    'durationMinutes', 60
  ));
  if v_result->>'source' is distinct from 'server'
    or (v_result->>'bookingEnabled')::boolean is distinct from false
    or v_result->>'availabilityReason' is distinct from 'court_not_enabled'
    or jsonb_array_length(v_result->'slots') <> 27
    or exists (
      select 1 from jsonb_array_elements(v_result->'slots') slot
      where slot->>'status' <> 'unavailable'
    ) then
    raise exception 'Disabled court did not return visible, non-bookable operating-hour slots: %', v_result;
  end if;

  -- Enabling the court alone must not make it bookable without an approved rate.
  update pdl_booking.courts set enabled = true where code = 'court-1';
  v_result := pdl_booking.availability(jsonb_build_object(
    'courtId', 'court-1',
    'date', v_date::text,
    'durationMinutes', 60
  ));
  if (v_result->>'bookingEnabled')::boolean is distinct from false
    or v_result->>'availabilityReason' is distinct from 'rates_not_configured'
    or exists (
      select 1 from jsonb_array_elements(v_result->'slots') slot
      where slot->>'status' <> 'unavailable'
    ) then
    raise exception 'Missing rate did not keep displayed operating-hour slots unavailable: %', v_result;
  end if;

  -- With an enabled court and rate, maintenance still blocks overlapping slots.
  insert into pdl_booking.rates(court_code, duration_minutes, amount_minor, enabled)
  values ('court-1', 60, 10000, true);
  insert into pdl_booking.maintenance_blocks(court_code, day, start_minute, end_minute)
  values ('court-1', v_date, 600, 660);

  v_result := pdl_booking.availability(jsonb_build_object(
    'courtId', 'court-1',
    'date', v_date::text,
    'durationMinutes', 60
  ));
  if (v_result->>'bookingEnabled')::boolean is distinct from true
    or v_result->>'availabilityReason' is not null then
    raise exception 'Configured court/rate should enable availability evaluation: %', v_result;
  end if;
  select slot->>'status' into v_status
  from jsonb_array_elements(v_result->'slots') slot
  where (slot->>'startMinute')::integer = 480;
  if v_status is distinct from 'available' then
    raise exception 'An unblocked start time should remain available.';
  end if;
  select slot->>'status' into v_status
  from jsonb_array_elements(v_result->'slots') slot
  where (slot->>'startMinute')::integer = 570;
  if v_status is distinct from 'unavailable' then
    raise exception 'A start time overlapping maintenance should be unavailable.';
  end if;
  select slot->>'status' into v_status
  from jsonb_array_elements(v_result->'slots') slot
  where (slot->>'startMinute')::integer = 660;
  if v_status is distinct from 'available' then
    raise exception 'A start time after maintenance should remain available.';
  end if;

  -- Closed weekdays return a clear reason and no selectable time slots.
  update pdl_booking.weekday_hours
  set enabled = false
  where court_code = 'court-1' and weekday = extract(dow from v_date)::integer;
  v_result := pdl_booking.availability(jsonb_build_object(
    'courtId', 'court-1',
    'date', v_date::text,
    'durationMinutes', 60
  ));
  if v_result->>'availabilityReason' is distinct from 'weekday_closed'
    or jsonb_array_length(v_result->'slots') <> 0 then
    raise exception 'A closed weekday should return no slots and a closed reason: %', v_result;
  end if;

  -- The admin readback must include historical and far-future saved blocks.
  insert into pdl_booking.maintenance_blocks(court_code, day, start_minute, end_minute)
  values
    ('court-2', v_date - 60, 600, 660),
    ('court-3', v_date + 60, 780, 840);

  v_result := pdl_booking.operations('ops_calendar', jsonb_build_object('actorId', v_actor));
  v_blocks := v_result->'blocks';
  if jsonb_array_length(v_blocks) <> 3
    or not exists (
      select 1 from jsonb_array_elements(v_blocks) block
      where (block->>'date')::date = v_date - 60
    )
    or not exists (
      select 1 from jsonb_array_elements(v_blocks) block
      where (block->>'date')::date = v_date + 60
    ) then
    raise exception 'Calendar readback omitted a saved maintenance block outside the former rolling window: %', v_blocks;
  end if;

  raise notice 'PDL_SCHEDULE_VISIBILITY_ROLLBACK_PASS';
end $$;

rollback;
