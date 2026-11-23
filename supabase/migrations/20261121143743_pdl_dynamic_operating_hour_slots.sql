-- PDL-BE-02: make the availability slot grid follow the effective venue schedule.
-- Replace only the Paseo availability function; preserve all tables, data,
-- booking/quote rules, storage, authentication, and existing execute grants.
create or replace function pdl_booking.availability(p jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
  with request as (
    select p->>'courtId' as court_id,
      (p->>'date')::date as booking_date,
      (p->>'durationMinutes')::integer as duration_minutes
  ), effective_hours as (
    select coalesce(w.open_minute,c.open_minute) as open_minute,
      coalesce(w.close_minute,c.close_minute) as close_minute
    from request r
    join pdl_booking.courts c on c.code=r.court_id
    left join pdl_booking.weekday_hours w on w.court_code=c.code
      and w.weekday=extract(dow from r.booking_date)::integer
    where c.enabled and coalesce(w.enabled,true)
      and r.booking_date >= (now() at time zone 'Asia/Manila')::date
      and r.booking_date < (now() at time zone 'Asia/Manila')::date+14
      and r.duration_minutes in (60,90,120)
  )
  select case
    when not exists (select 1 from effective_hours) then
      jsonb_build_object('error','invalid_schedule')
    when not exists (
      select 1 from pdl_booking.rates rate
      where rate.court_code=r.court_id
        and rate.duration_minutes=r.duration_minutes and rate.enabled
    ) then jsonb_build_object('error','rates_not_configured')
    else jsonb_build_object(
      'courtId',r.court_id,'date',to_char(r.booking_date,'YYYY-MM-DD'),
      'durationMinutes',r.duration_minutes,'source','server',
      'slots',coalesce((
        select jsonb_agg(jsonb_build_object(
          'startMinute',start_minute,
          'status',case when pdl_booking.is_available(
            r.court_id,r.booking_date,start_minute,r.duration_minutes)
            then 'available' else 'unavailable' end
        ) order by start_minute)
        from effective_hours hours
        cross join lateral generate_series(
          ((hours.open_minute + 29) / 30) * 30,
          hours.close_minute - r.duration_minutes,
          30
        ) as starts(start_minute)
      ),'[]'::jsonb)
    )
  end from request r
$$;

revoke all on function pdl_booking.availability(jsonb) from public,anon,authenticated;
grant execute on function pdl_booking.availability(jsonb) to service_role;;
