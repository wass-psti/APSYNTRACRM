-- Isolated Paseo-only change: a server slot is not available without an approved rate.
create or replace function pdl_booking.availability(p jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
  select case
    when not pdl_booking.is_valid_interval(
      p->>'courtId',(p->>'date')::date,480,(p->>'durationMinutes')::integer)
    then jsonb_build_object('error','invalid_schedule')
    when not exists (
      select 1 from pdl_booking.rates r where r.court_code=p->>'courtId'
        and r.duration_minutes=(p->>'durationMinutes')::integer and r.enabled
    ) then jsonb_build_object('error','rates_not_configured')
    else jsonb_build_object(
      'courtId',p->>'courtId','date',p->>'date',
      'durationMinutes',(p->>'durationMinutes')::integer,'source','server',
      'slots',(select jsonb_agg(jsonb_build_object('startMinute',s.n,
        'status',case when pdl_booking.is_available(p->>'courtId',(p->>'date')::date,
          s.n,(p->>'durationMinutes')::integer) then 'available' else 'unavailable' end)
        order by s.n)
        from generate_series(480,1290,30) as s(n)))
    end
$$;
revoke all on function pdl_booking.availability(jsonb) from public,anon,authenticated;
grant execute on function pdl_booking.availability(jsonb) to service_role;;
