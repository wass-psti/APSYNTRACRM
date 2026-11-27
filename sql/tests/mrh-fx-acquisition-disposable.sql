-- B.1-B.4 already loaded in disposable PostgreSQL. Stub only the transport,
-- not the validation, capture, pricing persistence or historical readback.
create schema mrh_fx_http;
create table mrh_fx_http.calls(url text);
create function mrh_fx_http.http_get(url varchar)
returns table(status integer,content_type varchar,content text)
language plpgsql as $$
declare d text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD');
 mode text:=current_setting('mrh.fx_mode',true);
 is_usd boolean:=url='https://api.frankfurter.dev/v2/rate/USD/PHP?providers=ECB';
begin
 if not is_usd and url<>'https://api.frankfurter.dev/v2/rate/EUR/PHP?providers=ECB' then raise exception 'unexpected URL';end if;
 insert into mrh_fx_http.calls values(url);
 if mode='timeout' then raise exception 'synthetic timeout';end if;
 status:=case when mode='unavailable' and not is_usd then 503 else 200 end;
 content_type:=case when mode='html' then 'text/html' else 'application/json; charset=utf-8' end;
 if mode='mismatch' and not is_usd then d:=((d::date)-1)::text;end if;
 content:=jsonb_build_object('base',case when is_usd then 'USD' else 'EUR' end,'quote','PHP','date',d,
  'rate',case when is_usd and mode='changed' then 64.45000001 when is_usd then 64.45000000 else 71.12345678 end)::text;
 return next;
end $$;
\i /tmp/mrh-fx-acquisition.sql
select set_config('mrh.fixture_actor','99999999-9999-4999-8999-999999999999',false);
select set_config('mrh.fixture_edit','yes',false);
select set_config('mrh.fixture_commercial','yes',false);
do $$
declare
 i constant uuid:='55555555-5555-4555-8555-555555555555';
 j constant uuid:='66666666-6666-4666-8666-666666666666';
 receipt jsonb; repeated jsonb; ctx jsonb; version jsonb; old_version jsonb;
 fx uuid; n int; calls int; mode text; bad text; d text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD');
 us text; es text;
 draft constant jsonb:='{"quantity":"4.000001","source":"Import","buyingPrice":"120.360001","currency":"USD","shipping":"20.000001","shipCurrency":"USD"}';
begin
 us:=jsonb_build_object('date',d,'base','USD','quote','PHP','rate',64.12345678)::text;
 es:=jsonb_build_object('date',d,'base','EUR','quote','PHP','rate',71.12345678)::text;
 if private.mrh_fx_provider_pair(us,es,clock_timestamp())->>'usd'<>'64.12345678' then raise exception 'exact provider rate';end if;
 foreach bad in array array['{}','[]','null','{','{"date":"2026-02-30","base":"USD","quote":"PHP","rate":1}',
  replace(us,'64.12345678','0'),replace(us,'64.12345678','-1'),replace(us,'64.12345678','64.123456789'),
  replace(us,'64.12345678','"64.12345678"'),replace(us,'"USD"','"EUR"'),replace(us,'"PHP"','"JPY"')] loop
  begin perform private.mrh_fx_provider_pair(bad,es,clock_timestamp());raise exception 'bad provider response accepted';
  exception when sqlstate 'PT502' then null;end;
 end loop;
 begin perform private.mrh_fx_provider_pair(replace(us,d,(d::date-8)::text),replace(es,d,(d::date-8)::text),clock_timestamp());
  raise exception 'stale pair accepted';exception when sqlstate 'PT502' then null;end;
 begin perform private.mrh_fx_provider_pair(replace(us,d,(d::date+1)::text),replace(es,d,(d::date+1)::text),clock_timestamp());
  raise exception 'future pair accepted';exception when sqlstate 'PT502' then null;end;
 select count(*) into n from private.mrh_fx_snapshots where item_id=i;
 receipt:=public.mrh_capture_latest_fx(i);
 fx:=(receipt->>'snapshotId')::uuid;
 if receipt->>'provider'<>'Frankfurter v2 / ECB' or receipt->>'provenance'<>'provider_reported'
  or receipt->>'usd'<>'64.45000000' or receipt->>'eur'<>'71.12345678'
  or left(receipt->>'observedAt',10)<>d or receipt->>'observationRef' is distinct from ('frankfurter-v2:ECB:'||d||':USD/PHP+EUR/PHP') or fx is null then raise exception 'provider receipt %',receipt;end if;
 repeated:=public.mrh_capture_latest_fx(i);
 if repeated is distinct from receipt or (select count(*) from private.mrh_fx_snapshots where item_id=i)<>n+1 then raise exception 'provider replay changed snapshot';end if;
 ctx:=public.mrh_pricing_context(i,fx,null);
 if not exists(select 1 from jsonb_array_elements(ctx->'snapshots') s where s->>'snapshotId'=fx::text
  and s->>'provider'=receipt->>'provider' and s->>'observationRef'=receipt->>'observationRef'
  and s->>'observedAt'=receipt->>'observedAt' and s->>'retrievedAt'=receipt->>'retrievedAt') then raise exception 'FX context metadata';end if;
 version:=public.mrh_save_pricing_atomic(i,fx,ctx->'state',draft);
 if version->>'fxSnapshotId'<>fx::text or version->'pricingInputs'->>'usd'<>'64.45000000' then raise exception 'combined pricing save';end if;
 foreach mode in array array['timeout','unavailable','html','mismatch'] loop
  perform set_config('mrh.fx_mode',mode,true);
  begin perform public.mrh_capture_latest_fx(i);raise exception 'failed provider created snapshot';
  exception when sqlstate 'PT502' then null;end;
  if (select count(*) from private.mrh_fx_snapshots where item_id=i)<>n+1 then raise exception 'partial FX persisted';end if;
 end loop;
 perform set_config('mrh.fx_mode','changed',true);
 repeated:=public.mrh_capture_latest_fx(i);
 if repeated->>'snapshotId'=fx::text or repeated->>'usd'<>'64.45000001' then raise exception 'changed provider value not versioned';end if;
 old_version:=public.mrh_pricing_context(i,fx,(version->>'pricingVersionId')::uuid)->'receipt';
 if old_version is distinct from version or private.mrh_fx_read((receipt->>'workspaceId')::uuid,i,fx) is distinct from receipt then raise exception 'historical price mutated';end if;
 select count(*) into calls from mrh_fx_http.calls;
 perform set_config('mrh.fixture_commercial','no',true);
 begin perform public.mrh_capture_latest_fx(i);raise exception 'viewer acquired FX';exception when insufficient_privilege then null;end;
 if (select count(*) from mrh_fx_http.calls)<>calls then raise exception 'denied request reached provider';end if;
 if public.mrh_pricing_context(i,fx,null)->>'itemId'<>i::text then raise exception 'viewer history lost';end if;
 perform set_config('mrh.fixture_commercial','yes',true);
 perform set_config('mrh.fixture_edit','no',true);
 begin perform public.mrh_capture_latest_fx(i);raise exception 'noneditor acquired FX';exception when insufficient_privilege then null;end;
 perform set_config('mrh.fixture_actor','',true);
 begin perform public.mrh_capture_latest_fx(i);raise exception 'anonymous acquired FX';exception when insufficient_privilege then null;end;
 raise notice 'CP_MS_CRM_04B5_PROVIDER_CAPTURE_REPLAY_FAILURE_HISTORY_PASS';
end $$;
