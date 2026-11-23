-- PDL operational calendar & policy persistence. Apply only after staged database validation.

-- Operational data belongs only to Paseo; nothing is seeded as approved.
create table pdl_booking.weekday_hours (
  court_code text not null references pdl_booking.courts(code),
  weekday integer not null check (weekday between 0 and 6),
  enabled boolean not null,
  open_minute integer not null check (open_minute between 0 and 1380),
  close_minute integer not null check (close_minute between 60 and 1440 and close_minute > open_minute),
  updated_at timestamptz not null default now(),
  primary key (court_code,weekday)
);
create table pdl_booking.maintenance_blocks (
  id uuid primary key default gen_random_uuid(),
  court_code text not null references pdl_booking.courts(code),
  day date not null,
  start_minute integer not null check (start_minute between 0 and 1439 and start_minute % 30=0),
  end_minute integer not null check (end_minute between 1 and 1440 and end_minute % 30=0 and end_minute>start_minute),
  created_at timestamptz not null default now()
);
create index maintenance_by_court_day on pdl_booking.maintenance_blocks(court_code,day,start_minute);
create table pdl_booking.operational_policies (
  id boolean primary key default true check (id),
  reservation_lead_hours integer not null default 0 check (reservation_lead_hours between 0 and 72),
  arrival_grace_minutes integer not null default 15 check (arrival_grace_minutes between 0 and 60),
  public_notice text not null default '' check (char_length(public_notice)<=240),
  updated_at timestamptz not null default now()
);
insert into pdl_booking.operational_policies(id) values(true);

alter table pdl_booking.weekday_hours enable row level security;
alter table pdl_booking.maintenance_blocks enable row level security;
alter table pdl_booking.operational_policies enable row level security;
revoke all on pdl_booking.weekday_hours,pdl_booking.maintenance_blocks,pdl_booking.operational_policies from public,anon,authenticated;
grant select,insert,update,delete on pdl_booking.weekday_hours,pdl_booking.maintenance_blocks,pdl_booking.operational_policies to service_role;

-- Existing courts remain disabled; unconfigured weekday schedules inherit court-wide hours.
-- Maintenance blocks participate in quote, availability, and final submit validation.
create or replace function pdl_booking.is_valid_interval(
 p_court_code text,p_date date,p_start integer,p_duration integer
) returns boolean language sql stable security invoker set search_path='' as $$
 select exists (
  select 1 from pdl_booking.courts c
  left join pdl_booking.weekday_hours w on w.court_code=c.code
    and w.weekday=extract(dow from p_date)::integer
  where c.code=p_court_code and c.enabled
    and coalesce(w.enabled,true)
    and p_date >= (now() at time zone 'Asia/Manila')::date
    and p_date < (now() at time zone 'Asia/Manila')::date+14
    and p_start >= coalesce(w.open_minute,c.open_minute)
    and p_start % 30=0 and p_duration in (60,90,120)
    and p_start+p_duration <= coalesce(w.close_minute,c.close_minute)
 )
$$;
create or replace function pdl_booking.is_available(
 p_court_code text,p_date date,p_start integer,p_duration integer
) returns boolean language sql stable security invoker set search_path='' as $$
 select pdl_booking.is_valid_interval(p_court_code,p_date,p_start,p_duration)
  and not exists (select 1 from pdl_booking.maintenance_blocks m
    where m.court_code=p_court_code and m.day=p_date
      and m.start_minute<p_start+p_duration and m.end_minute>p_start)
  and not exists (select 1 from pdl_booking.reservations r
    where r.court_code=p_court_code and r.reservation_date=p_date
      and r.booking_status in ('pending_verification','confirmed')
      and r.start_minute<p_start+p_duration and r.start_minute+r.duration_minutes>p_start)
$$;
revoke all on function pdl_booking.is_valid_interval(text,date,integer,integer),pdl_booking.is_available(text,date,integer,integer) from public,anon,authenticated;
grant execute on function pdl_booking.is_valid_interval(text,date,integer,integer),pdl_booking.is_available(text,date,integer,integer) to service_role;

-- A closed weekday must not invalidate existing confirmed or pending reservations.
-- Availability validation is slot-by-slot, allowing later weekday opening hours.
create or replace function pdl_booking.availability(p jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
  select case
    when not exists (
      select 1 from pdl_booking.courts c
      left join pdl_booking.weekday_hours w on w.court_code=c.code
        and w.weekday=extract(dow from (p->>'date')::date)::integer
      where c.code=p->>'courtId' and c.enabled and coalesce(w.enabled,true)
        and (p->>'date')::date >= (now() at time zone 'Asia/Manila')::date
        and (p->>'date')::date < (now() at time zone 'Asia/Manila')::date+14
        and (p->>'durationMinutes')::integer in (60,90,120)
    ) then jsonb_build_object('error','invalid_schedule')
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
grant execute on function pdl_booking.availability(jsonb) to service_role;

-- One small service-role gateway for the three operational resources.
create function pdl_booking.operations(p_action text,p_payload jsonb)
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
      from pdl_booking.maintenance_blocks
      where day between (now() at time zone 'Asia/Manila')::date-30
        and (now() at time zone 'Asia/Manila')::date+44),'[]'::jsonb));
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
revoke all on function pdl_booking.operations(text,jsonb) from public,anon,authenticated;
grant execute on function pdl_booking.operations(text,jsonb) to service_role;


-- PDL gateway invocation is controlled by EXECUTE privilege, not by legacy JWT GUCs.
-- Both anon and authenticated have no EXECUTE grant; service_role alone may call.
create or replace function public.pdl_backend_v1(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  -- PostgREST enforces the gateway EXECUTE grant to service_role only.
  case p_action
    when 'quote' then return pdl_booking.quote(p_payload);
    when 'submit' then return pdl_booking.submit(p_payload);
    when 'receipt' then return pdl_booking.receipt(p_payload);
    when 'availability' then return pdl_booking.availability(p_payload);
    when 'verify' then return pdl_booking.verify(p_payload);
    when 'list' then
      if not exists (select 1 from pdl_booking.admin_users a
        where a.user_id=(p_payload->>'actorId')::uuid and a.active) then
        return jsonb_build_object('error','administrator_not_configured');
      end if;
      return jsonb_build_object('reservations',coalesce((
        select jsonb_agg(to_jsonb(t)) from (
          select id,court_code, reservation_date,start_minute,duration_minutes,amount_minor,
            full_name,email,phone,payment_method,booking_status,payment_status,
            version,created_at
          from pdl_booking.reservations
          where (p_payload->>'q' is null or lower(full_name) like '%'||lower(left(p_payload->>'q',80))||'%'
                 or id::text like left(p_payload->>'q',80)||'%')
          order by created_at desc limit 100
        ) t),'[]'::jsonb));
    when 'admin_check' then return jsonb_build_object('allowed',exists(
      select 1 from pdl_booking.admin_users where user_id=(p_payload->>'actorId')::uuid and active
    ));
    when 'payment_methods' then return jsonb_build_object('methods',coalesce(
      (select jsonb_agg(jsonb_build_object('method',method,'recipient',recipient,
        'imageUrl',case when qr_object_path is null then null else '/v1/payment-methods/'||method||'/image' end))
       from pdl_booking.payment_methods),'[]'::jsonb));
    when 'proof_meta' then
      if not exists (select 1 from pdl_booking.admin_users a
        where a.user_id=(p_payload->>'actorId')::uuid and a.active) then
        return jsonb_build_object('error','administrator_not_configured');
      end if;
      return coalesce((select jsonb_build_object('proofPath',r.proof_path,
        'proofMime',r.proof_mime) from pdl_booking.reservations r
        where r.id=(p_payload->>'reservationId')::uuid),
        jsonb_build_object('error','proof_not_found'));
    when 'update_qr' then
      if not exists (select 1 from pdl_booking.admin_users a
        where a.user_id=(p_payload->>'actorId')::uuid and a.active) then
        return jsonb_build_object('error','administrator_not_configured');
      end if;
      if p_payload->>'method' not in ('gcash','maya','bpi')
        or length(trim(p_payload->>'recipient')) not between 2 and 100
        or p_payload->>'imagePath' !~ '^(gcash|maya|bpi)/[0-9a-f-]{36}\.(png|jpg)$'
      then return jsonb_build_object('error','invalid_payment_method'); end if;
      update pdl_booking.payment_methods
        set recipient=trim(p_payload->>'recipient'),
            qr_object_path=p_payload->>'imagePath',updated_at=now()
        where method=p_payload->>'method';
      return jsonb_build_object('updated',true,'method',p_payload->>'method',
        'recipient',trim(p_payload->>'recipient'));
    when 'qr_meta' then
      return coalesce((select jsonb_build_object(
        'path',m.qr_object_path,
        'mime',case when right(m.qr_object_path,4)='.png' then 'image/png' else 'image/jpeg' end)
        from pdl_booking.payment_methods m
        where m.method=p_payload->>'method' and m.qr_object_path is not null),
        jsonb_build_object('error','qr_not_configured'));
    when 'configure_court' then
      if not exists (select 1 from pdl_booking.admin_users a
        where a.user_id=(p_payload->>'actorId')::uuid and a.active) then
        return jsonb_build_object('error','administrator_not_configured');
      end if;
      if (p_payload->>'courtId') not in ('court-1','court-2','court-3') or
        (p_payload->>'openMinute')::integer not between 0 and 1380 or
        (p_payload->>'closeMinute')::integer not between 60 and 1440 or
        (p_payload->>'openMinute')::integer >= (p_payload->>'closeMinute')::integer or
        p_payload->>'enabled' not in ('true','false')
      then return jsonb_build_object('error','invalid_court_config'); end if;
      update pdl_booking.courts set
        enabled=(p_payload->>'enabled')::boolean,
        open_minute=(p_payload->>'openMinute')::integer,
        close_minute=(p_payload->>'closeMinute')::integer,
        updated_at=now()
      where code=p_payload->>'courtId';
      return jsonb_build_object('updated',true);
    when 'configure_rate' then
      if not exists (select 1 from pdl_booking.admin_users a
        where a.user_id=(p_payload->>'actorId')::uuid and a.active) then
        return jsonb_build_object('error','administrator_not_configured');
      end if;
      if p_payload->>'courtId' not in ('court-1','court-2','court-3') or
        (p_payload->>'durationMinutes')::integer not in (60,90,120) or
        (p_payload->>'amountMinor')::integer not between 1 and 10000000 or
        p_payload->>'enabled' not in ('true','false')
      then return jsonb_build_object('error','invalid_rate_config'); end if;
      insert into pdl_booking.rates(court_code,duration_minutes,amount_minor,enabled)
      values (p_payload->>'courtId',(p_payload->>'durationMinutes')::integer,
        (p_payload->>'amountMinor')::integer,(p_payload->>'enabled')::boolean)
      on conflict(court_code,duration_minutes)
      do update set amount_minor=excluded.amount_minor,enabled=excluded.enabled,updated_at=now();
      return jsonb_build_object('updated',true);
    when 'admin_courts' then
      if not exists (select 1 from pdl_booking.admin_users a
        where a.user_id=(p_payload->>'actorId')::uuid and a.active) then
        return jsonb_build_object('error','administrator_not_configured');
      end if;
      return jsonb_build_object('courts',coalesce(
        (select jsonb_agg(jsonb_build_object('courtId',c.code,'name',c.title,
          'enabled',c.enabled,'openMinute',c.open_minute,'closeMinute',c.close_minute,
          'rates',coalesce((select jsonb_agg(jsonb_build_object(
            'durationMinutes',r.duration_minutes,'amountMinor',r.amount_minor,
            'enabled',r.enabled) order by r.duration_minutes)
            from pdl_booking.rates r where r.court_code=c.code),'[]'::jsonb))
          order by c.code) from pdl_booking.courts c),'[]'::jsonb));
    when 'ops_calendar' then return pdl_booking.operations('ops_calendar',p_payload);
    when 'ops_schedule_put' then return pdl_booking.operations('ops_schedule_put',p_payload);
    when 'ops_block_add' then return pdl_booking.operations('ops_block_add',p_payload);
    when 'ops_block_remove' then return pdl_booking.operations('ops_block_remove',p_payload);
    when 'ops_policy_get' then return pdl_booking.operations('ops_policy_get',p_payload);
    when 'ops_policy_put' then return pdl_booking.operations('ops_policy_put',p_payload);
    else return jsonb_build_object('error','unsupported_operation');
  end case;
end $$;

revoke all on function public.pdl_backend_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.pdl_backend_v1(text,jsonb) to service_role;;
