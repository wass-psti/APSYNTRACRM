-- Disposable synthetic scope and source writer fixture. Real signed acceptance is separate.
create schema if not exists auth;
do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
end$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('mrh.fixture_actor',true),'')::uuid$$;
create function public.work_board_access(uuid,text) returns boolean language sql stable as $$select auth.uid() is not null and ($2='view' or current_setting('mrh.fixture_edit',true)='yes')$$;
create function private.mrh_sourcing_scope(uuid,uuid) returns uuid language plpgsql stable as $$
declare w uuid;
begin
 select b.workspace_id into w from public.work_boards b join public.work_board_items i on i.board_id=b.id where b.id=$1 and i.id=$2;
 if w is null or not public.work_board_access($1,'view') or current_setting('mrh.fixture_commercial',true) is distinct from 'yes' then
  raise exception 'denied' using errcode='42501';end if;
 return w;
end$$;
create function public.mrh_sourcing_board_viewer_read(uuid,uuid) returns jsonb language plpgsql stable as $$
begin
 if not public.work_board_access($1,'view') or not exists(select 1 from public.work_board_items where board_id=$1 and id=$2 and archived_at is null) then
  raise exception 'denied' using errcode='42501';end if;
 return '{}'::jsonb;
end$$;
create function public.wm_set_board_cell_if_current(p_item uuid,p_col uuid,p_val jsonb,p_expected jsonb)
returns void language plpgsql as $$
declare old jsonb;
begin
 select value into old from public.work_board_item_values where item_id=p_item and column_id=p_col;
 if coalesce(old,'null'::jsonb) is distinct from coalesce(p_expected,'null'::jsonb) then raise exception 'stale public' using errcode='PT409';end if;
 insert into public.work_board_item_values(item_id,column_id,value) values(p_item,p_col,p_val)
 on conflict(item_id,column_id) do update set value=excluded.value,updated_at=clock_timestamp();
end$$;
create function public.mrh_sourcing_sensitive_write(p_board uuid,p_item uuid,p_name text,p_val jsonb,p_rev bigint)
returns jsonb language plpgsql as $$
declare w uuid; r bigint;
begin
 w:=private.mrh_sourcing_scope(p_board,p_item);
 if current_setting('mrh.fixture_fail',true)='yes' and p_name='Shipping Cost' then raise exception 'synthetic writer failure' using errcode='22023';end if;
 if current_setting('mrh.fixture_normalize',true)='yes' and p_name='Buying Price' then p_val:=to_jsonb(round((p_val#>>'{}')::numeric,5));end if;
 if p_rev is null then
  insert into private.mrh_sourcing_sensitive_cells(board_id,workspace_id,item_id,field_name,value,revision)
   values(p_board,w,p_item,p_name,p_val,1) on conflict do nothing returning revision into r;
 else update private.mrh_sourcing_sensitive_cells set value=p_val,revision=revision+1
  where board_id=p_board and item_id=p_item and field_name=p_name and revision=p_rev returning revision into r;
 end if;
 if r is null then raise exception 'stale private' using errcode='PT409';end if;
 return jsonb_build_object('field_name',p_name,'revision',r);
end$$;
\i /tmp/mrh-atomic-edit.sql
\i /tmp/mrh-pricing-interface.sql
select set_config('mrh.fixture_actor','99999999-9999-4999-8999-999999999999',false);
select set_config('mrh.fixture_edit','yes',false);
select set_config('mrh.fixture_commercial','yes',false);
do $$
declare
 i constant uuid:='55555555-5555-4555-8555-555555555555';
 j constant uuid:='66666666-6666-4666-8666-666666666666';
 w constant uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 q constant uuid:='10000000-0000-4000-8000-000000000001';
 fx uuid; ctx jsonb; receipt jsonb; first_receipt jsonb; before_count int;
 draft constant jsonb:='{"quantity":"4.000001","source":"Import","buyingPrice":"120.360001","currency":"USD","shipping":"20.000001","shipCurrency":"USD"}';
begin
 select id into fx from private.mrh_fx_snapshots where item_id=i and observation_ref='pricing-concurrent';
 ctx:=public.mrh_pricing_context(i,fx,null);
 if ctx->>'workspaceId'<>w::text or ctx->'state'->>'fxSnapshotId'<>fx::text or jsonb_array_length(ctx->'snapshots')<1 then raise exception 'context mismatch';end if;
 before_count:=(select count(*) from private.mrh_pricing_versions where item_id=i);
 first_receipt:=public.mrh_save_pricing_atomic(i,fx,ctx->'state',draft);
 if first_receipt->'calculation'->>'status'<>'complete'
  or first_receipt->'pricingInputs'->>'quantity'<>'4.000001'
  or first_receipt->'pricingInputs'->>'buyingPrice'<>'120.360001'
  or first_receipt->'pricingInputs'->>'shipping'<>'20.000001'
  or (select count(*) from private.mrh_pricing_versions where item_id=i)<>before_count+1
  then raise exception 'exact save %',first_receipt;end if;
 begin perform public.mrh_save_pricing_atomic(i,fx,ctx->'state',draft);raise exception 'stale expected accepted';
 exception when sqlstate 'PT409' then null;end;
 ctx:=public.mrh_pricing_context(i,fx,(first_receipt->>'pricingVersionId')::uuid);
 if ctx->'receipt' is distinct from first_receipt then raise exception 'historical readback';end if;
 receipt:=public.mrh_save_pricing_atomic(i,fx,ctx->'state',draft);
 if receipt is distinct from first_receipt then raise exception 'no-op duplicated';end if;
 perform set_config('mrh.fixture_fail','yes',true);
 begin perform public.mrh_save_pricing_atomic(i,fx,ctx->'state',draft||'{"quantity":"9","buyingPrice":"123","shipping":"21"}');
  raise exception 'writer failure accepted';exception when sqlstate '22023' then null;end;
 perform set_config('mrh.fixture_fail','no',true);
 if private.mrh_pricing_input_state(i,fx) is distinct from ctx->'state'
 or (select count(*) from private.mrh_pricing_versions where item_id=i)<>before_count+1 then raise exception 'partial pricing save leaked';end if;
 perform set_config('mrh.fixture_normalize','yes',true);
 begin perform public.mrh_save_pricing_atomic(i,fx,ctx->'state',draft||'{"buyingPrice":"120.360002"}');
  raise exception 'rounded input drift accepted';exception when sqlstate 'PT409' then null;end;
 perform set_config('mrh.fixture_normalize','no',true);
 if private.mrh_pricing_input_state(i,fx) is distinct from ctx->'state'
 or (select count(*) from private.mrh_pricing_versions where item_id=i)<>before_count+1 then raise exception 'input drift rollback leaked';end if;
 begin perform public.mrh_save_pricing_atomic(i,fx,ctx->'state',draft||'{"shipping":"0.0000001"}');
  raise exception 'invalid precision accepted';exception when sqlstate '22023' then null;end;
 begin perform public.mrh_pricing_context(j,fx,null);raise exception 'foreign FX exposed';
 exception when sqlstate 'PT409' then null;end;
 perform set_config('mrh.fixture_commercial','no',true);
 if public.mrh_pricing_context(i,fx,null)->>'itemId'<>i::text then raise exception 'viewer lost read';end if;
 begin perform public.mrh_save_pricing_atomic(i,fx,ctx->'state',draft);raise exception 'viewer write accepted';
 exception when insufficient_privilege then null;end;
 perform set_config('mrh.fixture_actor','',true);
 begin perform public.mrh_pricing_context(i,fx,null);raise exception 'anonymous history exposed';
 exception when insufficient_privilege then null;end;
 raise notice 'CP_MS_CRM_04B4_ATOMIC_DRAFT_READBACK_ROLLBACK_PASS';
end$$;
-- Cross-language parity: output actual PostgreSQL oracle responses for JS test.
\pset format unaligned
\pset tuples_only on
\o /tmp/mrh-pricing-preview-oracle.jsonl
with base as (
 select jsonb_build_object('quantity',q,'buyingPrice',b,'currency',c,'shipping',h,'shipCurrency',hc,
  'usd','65.12345678','eur','72.98765432','source',s) input
 from unnest(array['Local','Import','Unknown']) s cross join unnest(array['PHP','USD','EUR']) c
 cross join unnest(array['PHP','USD','EUR']) hc
 cross join (values ('1.234567','10.075','0.005'),('0.000001','0.005','0.015'),('4.5','0','0')) x(q,b,h)
), edge as (
 select '{"quantity":"4","buyingPrice":"120.36","currency":"USD","shipping":"20","shipCurrency":"USD","usd":"64.45","eur":"71","source":"Import"}'::jsonb input
), cases as (
 select input from base union all select input from edge
 union all select input-k from edge cross join unnest(array['quantity','buyingPrice','currency','shipping','shipCurrency','usd','eur','source']) k
 union all select input||jsonb_build_object(k,v) from edge cross join (values
  ('quantity','"0"'::jsonb),('usd','"0"'),('shipping','"0.0000001"'),('eur','"1.000000001"'),('source','null'),
  ('source','"Other"'),('currency','"GBP"'),('buyingPrice','42'),('shipping','"0"'),('quantity','"99999999999999.999999"'),
  ('buyingPrice','"99999999999999.999999"'),('legacySelling','"99"'),('shipping','"1e3"'),('source','42')) x(k,v)
)
select jsonb_build_object('input',input,'result',private.mrh_calculate_pricing_v1(input)) from cases;
\o
