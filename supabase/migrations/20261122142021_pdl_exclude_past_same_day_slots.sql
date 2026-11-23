-- CP-PDL-BOOKING-AVAILABILITY-03: never advertise or quote a slot that has
-- already started in the venue's Asia/Manila timezone.
-- Preserve the live response contract, tables, rates, reservations, gateway and grants.

create or replace function pdl_booking.is_valid_interval(
  p_court_code text,p_date date,p_start integer,p_duration integer
) returns boolean language sql stable set search_path='' as $$
 select exists (
  select 1 from pdl_booking.courts c
  left join pdl_booking.weekday_hours w on w.court_code=c.code
    and w.weekday=extract(dow from p_date)::integer
  where c.code=p_court_code and c.enabled
    and coalesce(w.enabled,true)
    and p_date >= (now() at time zone 'Asia/Manila')::date
    and p_date < (now() at time zone 'Asia/Manila')::date+14
    and (p_date > (now() at time zone 'Asia/Manila')::date
      or p_start > extract(hour from (now() at time zone 'Asia/Manila'))::integer*60
        + extract(minute from (now() at time zone 'Asia/Manila'))::integer)
    and p_start >= coalesce(w.open_minute,c.open_minute)
    and p_start % 30=0 and p_duration in (60,90,120)
    and p_start+p_duration <= coalesce(w.close_minute,c.close_minute)
 )
$$;

create or replace function pdl_booking.availability(p jsonb) returns jsonb
language sql stable set search_path='' as $$
  with request as (
    select p->>'courtId' as court_id,
      (p->>'date')::date as booking_date,
      (p->>'durationMinutes')::integer as duration_minutes,
      (now() at time zone 'Asia/Manila')::date as today,
      extract(hour from (now() at time zone 'Asia/Manila'))::integer*60
        + extract(minute from (now() at time zone 'Asia/Manila'))::integer as current_minute
  ), schedule as (
    select c.enabled as court_enabled,
      coalesce(w.enabled,true) as weekday_enabled,
      coalesce(w.open_minute,c.open_minute) as open_minute,
      coalesce(w.close_minute,c.close_minute) as close_minute,
      exists (
        select 1 from pdl_booking.rates rate
        where rate.court_code=c.code
          and rate.duration_minutes=r.duration_minutes and rate.enabled
      ) as rate_enabled
    from request r
    join pdl_booking.courts c on c.code=r.court_id
    left join pdl_booking.weekday_hours w on w.court_code=c.code
      and w.weekday=extract(dow from r.booking_date)::integer
    where r.booking_date >= r.today and r.booking_date < r.today+14
      and r.duration_minutes in (60,90,120)
  ), candidates as (
    select r.court_id,r.booking_date,r.duration_minutes,
      s.court_enabled,s.rate_enabled,starts.start_minute
    from request r
    join schedule s on true
    cross join lateral generate_series(
      ((s.open_minute + 29) / 30) * 30,
      s.close_minute - r.duration_minutes,
      30
    ) as starts(start_minute)
    where s.weekday_enabled
      and (r.booking_date > r.today or starts.start_minute > r.current_minute)
  ), slots as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'startMinute',start_minute,
      'status',case when court_enabled and rate_enabled and
        pdl_booking.is_available(court_id,booking_date,start_minute,duration_minutes)
        then 'available' else 'unavailable' end
    ) order by start_minute),'[]'::jsonb) as values
    from candidates
  )
  select case
    when not exists (select 1 from schedule) then
      jsonb_build_object('error','invalid_schedule')
    else jsonb_build_object(
      'courtId',r.court_id,
      'date',to_char(r.booking_date,'YYYY-MM-DD'),
      'durationMinutes',r.duration_minutes,
      'source','server',
      'bookingEnabled',s.court_enabled and s.weekday_enabled and s.rate_enabled,
      'availabilityReason',case
        when not s.court_enabled then 'court_not_enabled'
        when not s.weekday_enabled then 'weekday_closed'
        when not s.rate_enabled then 'rates_not_configured'
        else null end,
      'slots',case when s.weekday_enabled then slots.values else '[]'::jsonb end
    )
  end
  from request r
  left join schedule s on true
  cross join slots
$$;

revoke all on function pdl_booking.is_valid_interval(text,date,integer,integer),
  pdl_booking.availability(jsonb) from public,anon,authenticated;
grant execute on function pdl_booking.is_valid_interval(text,date,integer,integer),
  pdl_booking.availability(jsonb) to service_role;;
