-- PDL-GUEST-BE shared Supabase foundation: deliberately isolated from APSYNTRACRM.
-- No changes to existing public tables, auth identities, CRM policies or functions.
-- All Paseo reservations start disabled until venue-authorized rates and court policies exist.
create schema if not exists pdl_booking;
revoke all on schema pdl_booking from public, anon, authenticated;
grant usage on schema pdl_booking to service_role;

create table pdl_booking.courts (
  code text primary key check (code ~ '^court-[1-9][0-9]*$'),
  title text not null,
  enabled boolean not null default false,
  open_minute integer not null default 480 check (open_minute between 0 and 1439),
  close_minute integer not null default 1320 check (close_minute between 1 and 1440 and close_minute > open_minute),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table pdl_booking.rates (
  court_code text not null references pdl_booking.courts(code),
  duration_minutes integer not null check (duration_minutes in (60,90,120)),
  amount_minor integer not null check (amount_minor > 0),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (court_code, duration_minutes)
);
create table pdl_booking.quotes (
  id uuid primary key default gen_random_uuid(),
  court_code text not null references pdl_booking.courts(code),
  reservation_date date not null,
  start_minute integer not null,
  duration_minutes integer not null,
  amount_minor integer not null,
  currency text not null default 'PHP' check (currency = 'PHP'),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  created_at timestamptz not null default now()
);
create index quotes_expiry_idx on pdl_booking.quotes (expires_at);

create table pdl_booking.reservations (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references pdl_booking.quotes(id),
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  receipt_token text not null unique,
  court_code text not null references pdl_booking.courts(code),
  reservation_date date not null,
  start_minute integer not null,
  duration_minutes integer not null,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'PHP' check (currency='PHP'),
  full_name text not null,
  email text not null,
  phone text not null,
  payment_method text not null check (payment_method in ('gcash','maya','bpi')),
  transaction_reference text not null default '',
  proof_path text not null unique,
  proof_mime text not null check (proof_mime in ('image/jpeg','image/png','application/pdf')),
  proof_sha256 text not null,
  booking_status text not null default 'pending_verification'
    check (booking_status in ('pending_verification','confirmed','rejected','cancelled')),
  payment_status text not null default 'submitted'
    check (payment_status in ('submitted','verified','rejected')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_minute >= 0 and start_minute < 1440 and duration_minutes in (60,90,120)),
  check (start_minute + duration_minutes <= 1440)
);
create index reservations_calendar_idx on pdl_booking.reservations(court_code,reservation_date,start_minute)
  where booking_status in ('pending_verification','confirmed');
create index reservations_created_idx on pdl_booking.reservations(created_at desc);
create index reservations_search_name_idx on pdl_booking.reservations(lower(full_name));

create table pdl_booking.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table pdl_booking.payment_methods (
  method text primary key check (method in ('gcash','maya','bpi')),
  recipient text not null,
  qr_object_path text,
  updated_at timestamptz not null default now()
);
create table pdl_booking.audit_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references pdl_booking.reservations(id),
  actor_id uuid not null,
  action text not null,
  old_booking_status text,
  old_payment_status text,
  new_booking_status text,
  new_payment_status text,
  created_at timestamptz not null default now()
);
create index audit_reservation_idx on pdl_booking.audit_events(reservation_id,created_at desc);

insert into pdl_booking.courts(code,title,enabled) values
 ('court-1','Court 1',false),('court-2','Court 2',false),('court-3','Court 3',false);
insert into pdl_booking.payment_methods(method,recipient) values
 ('gcash','AL*X S.'),('maya','Alex Señagan'),('bpi','LomboyPeak');
-- No enabled rates are seeded: real money collection stays unavailable until venue approval.

-- Every PDL data table is private. Only a narrowly scoped service-role gateway can
-- reach these routines. No direct anon/authenticated database table access.
alter table pdl_booking.courts enable row level security;
alter table pdl_booking.rates enable row level security;
alter table pdl_booking.quotes enable row level security;
alter table pdl_booking.reservations enable row level security;
alter table pdl_booking.admin_users enable row level security;
alter table pdl_booking.payment_methods enable row level security;
alter table pdl_booking.audit_events enable row level security;
revoke all on all tables in schema pdl_booking from public,anon,authenticated;
grant select,insert,update,delete on all tables in schema pdl_booking to service_role;

-- Dedicated private proof storage. No public read/write policies are created.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('pdl-payment-proofs','pdl-payment-proofs',false,5242880,
  array['image/jpeg','image/png','application/pdf'])
on conflict(id) do nothing;

create function pdl_booking.is_valid_interval(
  p_court_code text,p_date date,p_start integer,p_duration integer
) returns boolean language sql stable set search_path='' as $$
  select exists(
    select 1 from pdl_booking.courts c
    where c.code=p_court_code and c.enabled=true
      and p_date >= (now() at time zone 'Asia/Manila')::date
      and p_date < (now() at time zone 'Asia/Manila')::date + 14
      and p_start >= c.open_minute and p_start % 30=0
      and p_duration in (60,90,120)
      and p_start + p_duration <= c.close_minute
  )
$$;
create function pdl_booking.is_available(
  p_court_code text,p_date date,p_start integer,p_duration integer
) returns boolean language sql stable set search_path='' as $$
  select pdl_booking.is_valid_interval(p_court_code,p_date,p_start,p_duration)
    and not exists(
      select 1 from pdl_booking.reservations r
      where r.court_code=p_court_code and r.reservation_date=p_date
        and r.booking_status in ('pending_verification','confirmed')
        and r.start_minute < p_start+p_duration
        and r.start_minute+r.duration_minutes > p_start
    )
$$;

create function pdl_booking.public_receipt(r pdl_booking.reservations)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'reservationId',r.id,'receiptAccessToken',r.receipt_token,
    'createdAt',to_char(r.created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'courtId',r.court_code,'date',to_char(r.reservation_date,'YYYY-MM-DD'),
    'startMinute',r.start_minute,'durationMinutes',r.duration_minutes,
    'fullName',r.full_name,'email',r.email,'phone',r.phone,
    'amountMinor',r.amount_minor,'currency',r.currency,'paymentMethod',r.payment_method,
    'bookingStatus',r.booking_status,'paymentStatus',r.payment_status
  )
$$;

create function pdl_booking.quote(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_court text := p->>'courtId';
  v_day date; v_start integer; v_duration integer;
  v_rate integer; v_id uuid; v_expiry timestamptz;
begin
  begin
    v_day:=(p->>'date')::date;
    v_start:=(p->>'startMinute')::integer;
    v_duration:=(p->>'durationMinutes')::integer;
  exception when others then return jsonb_build_object('error','invalid_schedule'); end;
  if not pdl_booking.is_valid_interval(v_court,v_day,v_start,v_duration) then
    return jsonb_build_object('error','invalid_schedule');
  end if;
  select amount_minor into v_rate from pdl_booking.rates
    where court_code=v_court and duration_minutes=v_duration and enabled;
  if v_rate is null then return jsonb_build_object('error','rates_not_configured'); end if;
  if not pdl_booking.is_available(v_court,v_day,v_start,v_duration) then
    return jsonb_build_object('error','slot_unavailable');
  end if;
  insert into pdl_booking.quotes(court_code,reservation_date,start_minute,duration_minutes,amount_minor)
  values (v_court,v_day,v_start,v_duration,v_rate) returning id,expires_at into v_id,v_expiry;
  return jsonb_build_object('courtId',v_court,'date',to_char(v_day,'YYYY-MM-DD'),
    'startMinute',v_start,'durationMinutes',v_duration,'amountMinor',v_rate,
    'currency','PHP','quoteToken',v_id::text,'expiresAt',
    to_char(v_expiry,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end $$;

create function pdl_booking.submit(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_key uuid; v_quote_id uuid; v_quote pdl_booking.quotes%rowtype;
  v_prior pdl_booking.reservations%rowtype; v_saved pdl_booking.reservations%rowtype;
  v_hash text; v_rate integer; v_name text; v_email text; v_phone text;
  v_method text; v_ref text; v_proof text; v_mime text; v_sha text; v_token text;
begin
  begin
    v_key:=(p->>'idempotencyKey')::uuid;
    v_quote_id:=(p->>'quoteToken')::uuid;
  exception when others then return jsonb_build_object('error','invalid_submission'); end;
  v_name:=trim(p->>'fullName'); v_email:=trim(p->>'email'); v_phone:=trim(p->>'phone');
  v_method:=p->>'paymentMethod'; v_ref:=coalesce(p->>'transactionReference','');
  v_proof:=p->>'proofPath'; v_mime:=p->>'proofMime'; v_sha:=p->>'proofSha256';
  if length(v_name) not between 2 and 100 or length(v_email) not between 3 and 254
    or length(v_phone) not between 7 and 30 or length(v_ref)>100
    or v_method not in ('gcash','maya','bpi')
    or v_mime not in ('image/jpeg','image/png','application/pdf')
    or length(v_proof)<8 or length(v_proof)>300 or length(v_sha)<>64
    or v_sha !~ '^[a-f0-9]{64}$'
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then return jsonb_build_object('error','invalid_submission'); end if;
  v_hash:=encode(extensions.digest(
    coalesce(v_quote_id::text,'')||'|'||v_name||'|'||v_email||'|'||v_phone||'|'||
    v_method||'|'||v_ref||'|'||v_sha,'sha256'),'hex');
  -- Same-key retry returns the original token/record even if the quote expired.
  select * into v_prior from pdl_booking.reservations where idempotency_key=v_key;
  if found then
    if v_prior.request_fingerprint<>v_hash then return jsonb_build_object('error','idempotency_conflict'); end if;
    return jsonb_build_object('receipt',pdl_booking.public_receipt(v_prior),'replayed',true);
  end if;
  select * into v_quote from pdl_booking.quotes where id=v_quote_id;
  if not found or v_quote.expires_at <= now() then return jsonb_build_object('error','quote_expired'); end if;
  -- Serialize all writers on one court/day across parallel backend instances.
  perform pg_advisory_xact_lock(hashtextextended('pdl:'||v_quote.court_code||':'||v_quote.reservation_date::text,0));
  select * into v_prior from pdl_booking.reservations where idempotency_key=v_key;
  if found then
    if v_prior.request_fingerprint<>v_hash then return jsonb_build_object('error','idempotency_conflict'); end if;
    return jsonb_build_object('receipt',pdl_booking.public_receipt(v_prior),'replayed',true);
  end if;
  select amount_minor into v_rate from pdl_booking.rates where court_code=v_quote.court_code
    and duration_minutes=v_quote.duration_minutes and enabled;
  if v_rate is distinct from v_quote.amount_minor or not pdl_booking.is_available(
    v_quote.court_code,v_quote.reservation_date,v_quote.start_minute,v_quote.duration_minutes)
  then return jsonb_build_object('error','slot_or_rate_changed'); end if;
  if exists(select 1 from pdl_booking.reservations where quote_id=v_quote_id) then
    return jsonb_build_object('error','quote_consumed');
  end if;
  v_token:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into pdl_booking.reservations(
    quote_id,idempotency_key,request_fingerprint,receipt_token,court_code,reservation_date,
    start_minute,duration_minutes,amount_minor,full_name,email,phone,payment_method,
    transaction_reference,proof_path,proof_mime,proof_sha256
  ) values (
    v_quote_id,v_key,v_hash,v_token,v_quote.court_code,v_quote.reservation_date,
    v_quote.start_minute,v_quote.duration_minutes,v_quote.amount_minor,v_name,v_email,v_phone,
    v_method,v_ref,v_proof,v_mime,v_sha
  ) returning * into v_saved;
  return jsonb_build_object('receipt',pdl_booking.public_receipt(v_saved),'replayed',false);
end $$;

create function pdl_booking.receipt(p jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(
    (select pdl_booking.public_receipt(r) from pdl_booking.reservations r
      where r.id=(p->>'reservationId')::uuid
        and r.receipt_token=p->>'receiptAccessToken'),
    jsonb_build_object('error','receipt_not_found'))
$$;
create function pdl_booking.availability(p jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
  select case when not pdl_booking.is_valid_interval(
    p->>'courtId',(p->>'date')::date,480,(p->>'durationMinutes')::integer)
    then jsonb_build_object('error','invalid_schedule')
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

create function pdl_booking.verify(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_actor uuid; v_decision text; v_id uuid; v_version integer;
  v_before pdl_booking.reservations%rowtype; v_after pdl_booking.reservations%rowtype;
begin
  begin
    v_actor:=(p->>'actorId')::uuid; v_id:=(p->>'reservationId')::uuid;
    v_version:=(p->>'expectedVersion')::integer;
  exception when others then return jsonb_build_object('error','invalid_verification'); end;
  v_decision:=p->>'decision';
  if v_decision not in ('verified','rejected') then return jsonb_build_object('error','invalid_verification'); end if;
  if not exists(select 1 from pdl_booking.admin_users where user_id=v_actor and active)
    then return jsonb_build_object('error','administrator_not_configured'); end if;
  select * into v_before from pdl_booking.reservations where id=v_id for update;
  if not found or v_before.payment_status<>'submitted' or v_before.version<>v_version
    then return jsonb_build_object('error','verification_conflict'); end if;
  update pdl_booking.reservations
  set booking_status=case when v_decision='verified' then 'confirmed' else 'rejected' end,
      payment_status=v_decision, version=version+1,updated_at=now()
  where id=v_id returning * into v_after;
  insert into pdl_booking.audit_events(
    reservation_id,actor_id,action,old_booking_status,old_payment_status,
    new_booking_status,new_payment_status
  ) values (v_id,v_actor,v_decision,v_before.booking_status,v_before.payment_status,
      v_after.booking_status,v_after.payment_status);
  return jsonb_build_object('updated',true,'decision',v_decision);
end $$;

-- Service-role only gateway; the private schema is never exposed to anon.
-- PostgreSQL function EXECUTE defaults to PUBLIC, so revoke explicitly.
create function public.pdl_backend_v1(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
  v_role:=current_setting('request.jwt.claim.role',true);
  if v_role is distinct from 'service_role' then
    raise exception 'pdl service endpoint only' using errcode='42501';
  end if;
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
        'imageUrl',case when qr_object_path is null then null else qr_object_path end))
       from pdl_booking.payment_methods),'[]'::jsonb));
    else return jsonb_build_object('error','unsupported_operation');
  end case;
end $$;
revoke all on function public.pdl_backend_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.pdl_backend_v1(text,jsonb) to service_role;
revoke all on all functions in schema pdl_booking from public,anon,authenticated;
grant execute on all functions in schema pdl_booking to service_role;;
