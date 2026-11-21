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
    else return jsonb_build_object('error','unsupported_operation');
  end case;
end $$;

revoke all on function public.pdl_backend_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.pdl_backend_v1(text,jsonb) to service_role;
