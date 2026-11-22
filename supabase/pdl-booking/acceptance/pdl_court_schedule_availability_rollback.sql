-- Disposable PostgreSQL acceptance only. The weekday fixtures are rolled back.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

do $$
declare
  v_date date := (now() at time zone 'Asia/Manila')::date + 1;
  v_weekday integer;
  v_court_one jsonb;
  v_court_two jsonb;
  v_court_three jsonb;
  v_one_starts integer[];
  v_two_starts integer[];
  v_three_starts integer[];
begin
  v_weekday := extract(dow from v_date)::integer;

  -- Give each court a distinct operating window for the same weekday.
  insert into pdl_booking.weekday_hours(
    court_code, weekday, enabled, open_minute, close_minute
  ) values
    ('court-1', v_weekday, true, 480, 600),
    ('court-2', v_weekday, true, 600, 750),
    ('court-3', v_weekday, true, 720, 900)
  on conflict (court_code, weekday) do update set
    enabled = excluded.enabled,
    open_minute = excluded.open_minute,
    close_minute = excluded.close_minute;

  v_court_one := pdl_booking.availability(jsonb_build_object(
    'courtId', 'court-1', 'date', v_date, 'durationMinutes', 60
  ));
  v_court_two := pdl_booking.availability(jsonb_build_object(
    'courtId', 'court-2', 'date', v_date, 'durationMinutes', 60
  ));
  v_court_three := pdl_booking.availability(jsonb_build_object(
    'courtId', 'court-3', 'date', v_date, 'durationMinutes', 60
  ));

  select array_agg((slot.value->>'startMinute')::integer order by (slot.value->>'startMinute')::integer)
  into v_one_starts from jsonb_array_elements(v_court_one->'slots') as slot(value);
  select array_agg((slot.value->>'startMinute')::integer order by (slot.value->>'startMinute')::integer)
  into v_two_starts from jsonb_array_elements(v_court_two->'slots') as slot(value);
  select array_agg((slot.value->>'startMinute')::integer order by (slot.value->>'startMinute')::integer)
  into v_three_starts from jsonb_array_elements(v_court_three->'slots') as slot(value);

  if v_court_one->>'courtId' is distinct from 'court-1'
    or v_one_starts is distinct from array[480,510,540]::integer[] then
    raise exception 'Court 1 availability did not use its own 8 AM–10 AM schedule: %', v_court_one;
  end if;
  if v_court_two->>'courtId' is distinct from 'court-2'
    or v_two_starts is distinct from array[600,630,660,690]::integer[] then
    raise exception 'Court 2 availability did not use its own 10 AM–12:30 PM schedule: %', v_court_two;
  end if;
  if v_court_three->>'courtId' is distinct from 'court-3'
    or v_three_starts is distinct from array[720,750,780,810,840]::integer[] then
    raise exception 'Court 3 availability did not use its own 12 PM–3 PM schedule: %', v_court_three;
  end if;

  raise notice 'PDL_COURT_SCHEDULE_AVAILABILITY_ROLLBACK_PASS';
end $$;

rollback;
