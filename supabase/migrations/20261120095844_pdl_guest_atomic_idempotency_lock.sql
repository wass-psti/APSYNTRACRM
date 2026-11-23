-- PDL-specific concurrency correction: serialize same-key retries regardless of court.
-- Does not modify APSYNTRA schemas, roles, tables, or reservations.
create or replace function pdl_booking.submit(p jsonb) returns jsonb
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
  -- Serialize identical idempotency keys globally, including submissions targeting
  -- different courts or dates. This avoids a unique-key race across court locks.
  perform pg_advisory_xact_lock(hashtextextended('pdl-idempotency:'||v_key::text,0));
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

revoke all on function pdl_booking.submit(jsonb) from public,anon,authenticated;
grant execute on function pdl_booking.submit(jsonb) to service_role;;
