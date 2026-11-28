-- CP-MS-CRM-04B.5 candidate only; NOT APPLIED.
-- Requires B.1-B.4 and the dedicated http transport candidate.
-- Raw provider JSON is parsed in PostgreSQL numeric, never through JS floats.
create function private.mrh_fx_provider_row(p_body text,p_base text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v jsonb; d text; r text;
begin
 if p_base is null or p_base not in ('USD','EUR') or p_body is null or octet_length(p_body)>16384 then
  raise exception 'FX provider response invalid' using errcode='PT502';end if;
 begin v:=p_body::jsonb;
 exception when invalid_text_representation then raise exception 'FX provider response invalid' using errcode='PT502';end;
 if jsonb_typeof(v) is distinct from 'object' or v->>'base' is distinct from p_base
  or v->>'quote' is distinct from 'PHP' or jsonb_typeof(v->'rate') is distinct from 'number'
  or jsonb_typeof(v->'date') is distinct from 'string' then
  raise exception 'FX provider pair invalid' using errcode='PT502';end if;
 d:=v->>'date';
 if d !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or length(d)<>10 then
  raise exception 'FX provider date invalid' using errcode='PT502';end if;
 begin
  if to_char(d::date,'YYYY-MM-DD')<>d then raise exception 'FX date invalid' using errcode='PT502';end if;
 exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'FX provider date invalid' using errcode='PT502';end;
 r:=trim_scale((v->>'rate')::numeric)::text;
 if private.mrh_fx_parse_rate(r) is null then raise exception 'FX provider precision or rate invalid' using errcode='PT502';end if;
 return jsonb_build_object('date',d,'rate',r);
end $$;

create function private.mrh_fx_provider_pair(p_usd text,p_eur text,p_retrieved timestamptz)
returns jsonb language plpgsql immutable set search_path='' set timezone='UTC' as $$
declare u jsonb; e jsonb; d date;
begin
 u:=private.mrh_fx_provider_row(p_usd,'USD');e:=private.mrh_fx_provider_row(p_eur,'EUR');
 if u->>'date' is distinct from e->>'date' then raise exception 'FX observation dates do not match; retry later' using errcode='PT502';end if;
 d:=(u->>'date')::date;
 if p_retrieved is null or not isfinite(p_retrieved) or d>p_retrieved::date or d<p_retrieved::date-7 then
  raise exception 'FX observation is future-dated or older than seven calendar days' using errcode='PT502';end if;
 -- Midnight UTC encodes the provider's calendar date, not a claimed publication time.
 return jsonb_build_object('usd',u->>'rate','eur',e->>'rate','provider','Frankfurter v2 / ECB',
  'observationRef','frankfurter-v2:ECB:'||(u->>'date')||':USD/PHP+EUR/PHP',
  'observedAt',d::timestamp at time zone 'UTC','retrievedAt',p_retrieved);
end $$;

-- Only two fixed HTTPS endpoints. No item or workspace IDs transmitted.
-- Per-request timeout bounds: 1.5s connect / 3.5s total, two requests.
create function private.mrh_fx_fetch_latest()
returns jsonb language plpgsql volatile set search_path=pg_catalog,mrh_fx_http,pg_temp set timezone='UTC'
as $$
declare us int; es int; uc text; ec text; ut text; et text;
 original_options jsonb; opt record; failed boolean:=false; cancelled boolean:=false;
begin
 -- Hosted HTTP 1.6 accepts callable options even when function-level SET is denied.
 select coalesce(jsonb_object_agg(curlopt,value),'{}'::jsonb)
 into original_options from mrh_fx_http.http_list_curlopt();
 begin
  if mrh_fx_http.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','1500') is distinct from true
   or mrh_fx_http.http_set_curlopt('CURLOPT_TIMEOUT_MS','3500') is distinct from true
   or mrh_fx_http.http_set_curlopt('CURLOPT_SSL_VERIFYPEER','1') is distinct from true
   or mrh_fx_http.http_set_curlopt('CURLOPT_SSL_VERIFYHOST','2') is distinct from true then
   raise exception 'FX HTTP configuration unavailable' using errcode='PT502';end if;
  select status,content,content_type into us,uc,ut from mrh_fx_http.http_get('https://api.frankfurter.dev/v2/rate/USD/PHP?providers=ECB'::varchar);
  if us is distinct from 200 or ut is null or lower(split_part(ut,';',1))<>'application/json' then
   raise exception 'FX provider USD response unavailable' using errcode='PT502';end if;
  select status,content,content_type into es,ec,et from mrh_fx_http.http_get('https://api.frankfurter.dev/v2/rate/EUR/PHP?providers=ECB'::varchar);
  if es is distinct from 200 or et is null or lower(split_part(et,';',1))<>'application/json' then
   raise exception 'FX provider EUR response unavailable' using errcode='PT502';end if;
 exception when query_canceled then cancelled:=true;
 when others then failed:=true;
 end;
 -- Restore the caller's options before validating or returning the provider pair.
 if mrh_fx_http.http_reset_curlopt() is distinct from true then
  raise exception 'FX HTTP configuration reset failed' using errcode='PT502';end if;
 for opt in select key,value from jsonb_each_text(original_options) loop
  if mrh_fx_http.http_set_curlopt(opt.key::varchar,opt.value::varchar) is distinct from true then
   raise exception 'FX HTTP configuration restoration failed' using errcode='PT502';end if;
 end loop;
 if cancelled then raise exception 'FX provider request cancelled' using errcode='57014';end if;
 if failed then raise exception 'FX provider unavailable; no new snapshot was saved' using errcode='PT502';end if;
 return private.mrh_fx_provider_pair(uc,ec,clock_timestamp());
end $$;

-- Existing commercial edit authority, checked before network and immediately
-- before capture. No arbitrary URL, rates, dates or provider accepted from browser.
create function public.mrh_capture_latest_fx(p_item uuid)
returns jsonb language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare b constant uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 w uuid; payload jsonb; v_snapshot uuid;
begin
 w:=private.mrh_sourcing_scope(b,p_item);
 if not coalesce(public.work_board_access(b,'edit'),false) then raise exception 'FX capture denied' using errcode='42501';end if;
 if not exists(select 1 from public.work_board_items i where i.id=p_item and i.board_id=b
  and i.group_id='21566a87-b287-4a61-b521-bb233956e09e' and archived_at is null) then
  raise exception 'Material unavailable' using errcode='PT409';end if;
 -- Network outside item locks. Existing immutable capture acquires scope locks.
 payload:=private.mrh_fx_fetch_latest();
 if private.mrh_sourcing_scope(b,p_item) is distinct from w or not coalesce(public.work_board_access(b,'edit'),false) then
  raise exception 'FX capture denied' using errcode='42501';end if;
 if private.mrh_fx_material_workspace(p_item) is distinct from w then raise exception 'Material scope changed' using errcode='PT409';end if;
 v_snapshot:=private.mrh_fx_capture_provider(p_item,payload->>'usd',payload->>'eur',payload->>'provider',
  payload->>'observationRef',(payload->>'observedAt')::timestamptz,(payload->>'retrievedAt')::timestamptz);
 return private.mrh_fx_read(w,p_item,v_snapshot);
end $$;
revoke all on function private.mrh_fx_provider_row(text,text),private.mrh_fx_provider_pair(text,text,timestamptz),
 private.mrh_fx_fetch_latest() from public,anon,authenticated;
revoke all on function public.mrh_capture_latest_fx(uuid) from public,anon,authenticated;
grant execute on function public.mrh_capture_latest_fx(uuid) to authenticated;
