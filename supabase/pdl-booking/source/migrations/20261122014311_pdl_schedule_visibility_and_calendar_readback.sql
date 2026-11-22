-- PDL schedule visibility: show saved operating-hour slots even while a court or
-- its rates are not enabled. Such slots remain unavailable until existing venue
-- activation and rate configuration are complete. Booking validation is unchanged.
create or replace function pdl_booking.availability(p jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
  with request as (
    select p->>'courtId' as court_id,
      (p->>'date')::date as booking_date,
      (p->>'durationMinutes')::integer as duration_minutes
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
    where r.booking_date >= (now() at time zone 'Asia/Manila')::date
      and r.booking_date < (now() at time zone 'Asia/Manila')::date+14
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

-- Keep the existing calendar CRUD behavior and membership checks. The readback
-- now returns every saved maintenance block, not only a rolling date window.
create or replace function pdl_booking.operations(p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_court text; v_day date; v_start integer; v_end integer;
  v_weekday integer; v_enabled boolean; v_open integer; v_close integer;
  v_id uuid; v_lead integer; v_grace integer; v_notice text;
begin
 if not exists(select 1 from pdl_booking.admin_users a
   where a.user_id=(p_payload->>'actorId')::uuid and a.active) then
   return jsonb_build_object('error','administrator_not_configured');
 end if;
 if p_action='ops_calendar' then
  return jsonb_build_object(
    'weekdays',coalesce((select jsonb_agg(jsonb_build_object(
      'courtId',court_code,'weekday',weekday,'enabled',enabled,
      'openMinute',open_minute,'closeMinute',close_minute) order by court_code,weekday)
      from pdl_booking.weekday_hours),'[]'::jsonb),
    'blocks',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'courtId',court_code,'date',to_char(day,'YYYY-MM-DD'),
      'startMinute',start_minute,'endMinute',end_minute) order by day,court_code,start_minute)
      from pdl_booking.maintenance_blocks),'[]'::jsonb));
 elsif p_action='ops_schedule_put' then
  v_court:=p_payload->>'courtId';
  v_weekday:=(p_payload->>'weekday')::integer;
  v_enabled:=(p_payload->>'enabled')::boolean;
  v_open:=(p_payload->>'openMinute')::integer;
  v_close:=(p_payload->>'closeMinute')::integer;
  if v_weekday not between 0 and 6 or v_open not between 0 and 1380
    or v_close not between 60 and 1440 or v_open>=v_close
    or not exists(select 1 from pdl_booking.courts where code=v_court) then
    return jsonb_build_object('error','invalid_weekday_schedule');
  end if;
  -- Existing paid/pending bookings take precedence over an administrator's
  -- subsequent schedule change. Serialize the next 14 booking dates with submit().
  for v_day in select generate_series(
    (now() at time zone 'Asia/Manila')::date,
    (now() at time zone 'Asia/Manila')::date+13,
    interval '1 day')::date loop
    perform pg_advisory_xact_lock(hashtextextended('pdl:'||v_court||':'||v_day::text,0));
  end loop;
  if exists(select 1 from pdl_booking.reservations r
    where r.court_code=v_court and r.booking_status in ('pending_verification','confirmed')
      and r.reservation_date between (now() at time zone 'Asia/Manila')::date
        and (now() at time zone 'Asia/Manila')::date+13
      and extract(dow from r.reservation_date)::integer=v_weekday
      and (not v_enabled or r.start_minute<v_open or r.start_minute+r.duration_minutes>v_close)) then
    return jsonb_build_object('error','weekday_booking_conflict');
  end if;
  insert into pdl_booking.weekday_hours(court_code,weekday,enabled,open_minute,close_minute)
   values(v_court,v_weekday,v_enabled,v_open,v_close)
   on conflict(court_code,weekday) do update set
     enabled=excluded.enabled,open_minute=excluded.open_minute,
     close_minute=excluded.close_minute,updated_at=now();
  return jsonb_build_object('updated',true);
 elsif p_action='ops_block_add' then
  v_court:=p_payload->>'courtId'; v_day:=(p_payload->>'date')::date;
  v_start:=(p_payload->>'startMinute')::integer;
  v_end:=(p_payload->>'endMinute')::integer;
  if not exists(select 1 from pdl_booking.courts where code=v_court)
    or v_day not between (now() at time zone 'Asia/Manila')::date
      and (now() at time zone 'Asia/Manila')::date+365
    or v_start not between 0 and 1439 or v_end not between 1 and 1440
    or v_start%30<>0 or v_end%30<>0 or v_start>=v_end then
    return jsonb_build_object('error','invalid_maintenance_block');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pdl:'||v_court||':'||v_day::text,0));
  if exists(select 1 from pdl_booking.maintenance_blocks m
      where m.court_code=v_court and m.day=v_day
      and m.start_minute<v_end and m.end_minute>v_start)
     or exists(select 1 from pdl_booking.reservations r
      where r.court_code=v_court and r.reservation_date=v_day
        and r.booking_status in ('pending_verification','confirmed')
        and r.start_minute<v_end and r.start_minute+r.duration_minutes>v_start) then
    return jsonb_build_object('error','maintenance_conflict');
  end if;
  insert into pdl_booking.maintenance_blocks(court_code,day,start_minute,end_minute)
  values(v_court,v_day,v_start,v_end) returning id into v_id;
  return jsonb_build_object('id',v_id,'created',true);
 elsif p_action='ops_block_remove' then
  v_id:=(p_payload->>'id')::uuid;
  delete from pdl_booking.maintenance_blocks where id=v_id;
  if not found then return jsonb_build_object('error','maintenance_not_found'); end if;
  return jsonb_build_object('removed',true);
 elsif p_action='ops_policy_get' then
  return coalesce((select jsonb_build_object(
    'reservationLeadHours',reservation_lead_hours,
    'arrivalGraceMinutes',arrival_grace_minutes,
    'publicNotice',public_notice,'updatedAt',updated_at)
    from pdl_booking.operational_policies where id=true),
    jsonb_build_object('error','policy_not_found'));
 elsif p_action='ops_policy_put' then
  v_lead:=(p_payload->>'reservationLeadHours')::integer;
  v_grace:=(p_payload->>'arrivalGraceMinutes')::integer;
  v_notice:=trim(coalesce(p_payload->>'publicNotice',''));
  if v_lead not between 0 and 72 or v_grace not between 0 and 60
     or char_length(v_notice)>240 then
    return jsonb_build_object('error','invalid_operational_policy');
  end if;
  update pdl_booking.operational_policies set reservation_lead_hours=v_lead,
    arrival_grace_minutes=v_grace,public_notice=v_notice,updated_at=now() where id=true;
  return jsonb_build_object('updated',true);
 end if;
 return jsonb_build_object('error','unsupported_operation');
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
 return jsonb_build_object('error','invalid_operational_input');
end $$;
