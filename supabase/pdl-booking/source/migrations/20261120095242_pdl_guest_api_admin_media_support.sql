-- PDL isolated media + administrator read/update gateway extension.
-- This migration only modifies the PDL gateway and creates a distinct private QR bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('pdl-payment-qr','pdl-payment-qr',false,2097152,
  array['image/jpeg','image/png'])
on conflict(id) do nothing;

create or replace function public.pdl_backend_v1(p_action text,p_payload jsonb default '{}'::jsonb)
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
