-- PDL-APS-NATIVE-05. Extend the isolated Paseo API without altering legacy RPCs.
-- Do not activate venue rates, alter public booking access or claim refunds.
create or replace function public.pdl_admin_lifecycle_v1(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid; v_id uuid; v_expected integer; v_record pdl_booking.reservations%rowtype;
  v_limit integer; v_before timestamptz; v_before_id uuid; v_q text;
  v_rows jsonb; v_next jsonb;
begin
  begin
    v_actor := (p_payload->>'actorId')::uuid;
  exception when others then return jsonb_build_object('error','invalid_administrator'); end;
  if v_actor is null or not exists(select 1 from pdl_booking.admin_users
    where user_id=v_actor and active) then
    return jsonb_build_object('error','administrator_not_configured');
  end if;

  if p_action='page' then
    begin
      v_limit := coalesce((p_payload->>'limit')::integer,25);
      if v_limit not between 1 and 50 then return jsonb_build_object('error','invalid_page'); end if;
      v_before := nullif(p_payload->>'beforeCreatedAt','')::timestamptz;
      v_before_id := nullif(p_payload->>'beforeId','')::uuid;
    exception when others then return jsonb_build_object('error','invalid_page'); end;
    if (v_before is null) <> (v_before_id is null) then
      return jsonb_build_object('error','invalid_page');
    end if;
    v_q := lower(left(trim(coalesce(p_payload->>'q','')),80));
    with selected as (
      select r.id,r.court_code,r.reservation_date,r.start_minute,r.duration_minutes,
        r.amount_minor,r.full_name,r.email,r.phone,r.payment_method,
        r.booking_status,r.payment_status,r.version,r.created_at
      from pdl_booking.reservations r
      where (v_q='' or lower(r.full_name) like '%'||v_q||'%'
        or r.id::text like v_q||'%')
        and (v_before is null or (r.created_at,r.id)<(v_before,v_before_id))
      order by r.created_at desc,r.id desc
      limit v_limit+1
    ), page as (
      select * from selected order by created_at desc,id desc limit v_limit
    )
    select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc,page.id desc),'[]'::jsonb)
      into v_rows from page;
    if jsonb_array_length(v_rows)=v_limit and exists (
      select 1 from pdl_booking.reservations r
      where (v_q='' or lower(r.full_name) like '%'||v_q||'%'
          or r.id::text like v_q||'%')
        and (r.created_at,r.id)<((v_rows->(v_limit-1)->>'created_at')::timestamptz,
                                  (v_rows->(v_limit-1)->>'id')::uuid)
    ) then
      v_next:=jsonb_build_object('beforeCreatedAt',v_rows->(v_limit-1)->>'created_at',
        'beforeId',v_rows->(v_limit-1)->>'id');
    end if;
    return jsonb_build_object('reservations',v_rows,'nextCursor',v_next);
  end if;

  if p_action='cancel' then
    begin
      v_id := (p_payload->>'reservationId')::uuid;
      v_expected := (p_payload->>'expectedVersion')::integer;
    exception when others then return jsonb_build_object('error','invalid_cancellation'); end;
    if v_id is null or v_expected is null or v_expected<1 then
      return jsonb_build_object('error','invalid_cancellation');
    end if;
    select * into v_record from pdl_booking.reservations where id=v_id for update;
    if not found then return jsonb_build_object('error','reservation_not_found'); end if;
    if v_record.version<>v_expected or v_record.booking_status<>'pending_verification'
       or v_record.payment_status<>'submitted' then
      return jsonb_build_object('error','cancellation_conflict');
    end if;
    -- A cancellation releases court inventory but does NOT mark the payment refunded.
    -- Submitted payment evidence and beneficiary reconciliation remain unchanged.
    update pdl_booking.reservations set booking_status='cancelled',version=version+1,
      updated_at=now() where id=v_id;
    insert into pdl_booking.audit_events(reservation_id,actor_id,action,
      old_booking_status,old_payment_status,new_booking_status,new_payment_status)
    values(v_id,v_actor,'cancelled',v_record.booking_status,v_record.payment_status,
      'cancelled',v_record.payment_status);
    return jsonb_build_object('updated',true,'bookingStatus','cancelled',
      'paymentStatus',v_record.payment_status,'version',v_record.version+1,
      'refundStatus','not_processed');
  end if;
  return jsonb_build_object('error','unsupported_operation');
end $$;

revoke all on function public.pdl_admin_lifecycle_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.pdl_admin_lifecycle_v1(text,jsonb) to service_role;;
