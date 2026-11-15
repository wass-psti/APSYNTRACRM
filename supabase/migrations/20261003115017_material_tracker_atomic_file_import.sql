-- Material Tracker production import subsystem: server preflight + atomic commit.
-- Adds active-name uniqueness and fail-closed import RPCs without changing host identity/session semantics.

create unique index if not exists material_tracker_materials_workspace_active_name_uidx
  on public.material_tracker_materials (workspace_id, lower(btrim(name)))
  where archived_at is null;

create or replace function private.material_tracker_import_row_error(p_row jsonb)
returns text
language plpgsql
immutable
set search_path = public, private, pg_temp
as $$
declare
  p jsonb := coalesce(p_row->'payload','{}'::jsonb);
  v text;
  n numeric;
begin
  if jsonb_typeof(p_row) <> 'object' then return 'row must be an object'; end if;
  v := btrim(coalesce(p_row->>'id',''));
  if v <> '' and (length(v) > 128 or v !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') then return 'invalid Material ID'; end if;
  v := btrim(coalesce(p_row->>'name',''));
  if v = '' then return 'Part Number is required'; end if;
  if length(v) > 200 then return 'Part Number exceeds 200 characters'; end if;
  if coalesce(p_row->>'groupId','') not in ('new_group','topics') then return 'invalid Group'; end if;
  if jsonb_typeof(p) <> 'object' then return 'payload must be an object'; end if;
  if coalesce(p->>'sourceType','') not in ('Local','Import') then return 'invalid Source Type'; end if;
  if btrim(coalesce(p->>'materialDescription','')) = '' or length(p->>'materialDescription') > 4000 then return 'invalid Material Description'; end if;
  if btrim(coalesce(p->>'brand','')) = '' or length(p->>'brand') > 200 then return 'invalid Brand'; end if;
  v := coalesce(p->>'quantity',''); if v !~ '^[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$' then return 'invalid Quantity'; end if;
  n := v::numeric; if n <= 0 or n > 1000000000 then return 'Quantity out of range'; end if;
  v := coalesce(p->>'buyingPrice',''); if v !~ '^[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$' then return 'invalid Buying Price'; end if;
  n := v::numeric; if n <= 0 or n > 1000000000000000 then return 'Buying Price out of range'; end if;
  if coalesce(p->>'currency','') not in ('PHP','USD','EUR') then return 'invalid Currency'; end if;
  if p ? 'shippingCost' and p->'shippingCost' <> 'null'::jsonb then
    v := p->>'shippingCost'; if v !~ '^[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$' then return 'invalid Shipping Cost'; end if;
    n := v::numeric; if n < 0 or n > 1000000000000000 then return 'Shipping Cost out of range'; end if;
  end if;
  if p ? 'shippingCostCurrency' and coalesce(p->>'shippingCostCurrency','') not in ('PHP','USD','EUR') then return 'invalid Shipping Currency'; end if;
  if p ? 'leadtimeInWeeks' and p->'leadtimeInWeeks' <> 'null'::jsonb then
    v := p->>'leadtimeInWeeks'; if v !~ '^[0-9]+$' then return 'invalid Lead Time'; end if;
    n := v::numeric; if n < 0 or n > 5200 then return 'Lead Time out of range'; end if;
  end if;
  if p ? 'dateRequired' and coalesce(p->>'dateRequired','') <> '' then
    v := p->>'dateRequired'; if v !~ '^\d{4}-\d{2}-\d{2}$' then return 'Date Required must be YYYY-MM-DD'; end if;
    begin if to_char(v::date,'YYYY-MM-DD') <> v then return 'invalid Date Required'; end if; exception when others then return 'invalid Date Required'; end;
  end if;
  if length(coalesce(p->>'rfqRefNo','')) > 200 then return 'RFQ Ref No exceeds 200 characters'; end if;
  if length(coalesce(p->>'vendorDetails','')) > 500 then return 'Vendor Details exceeds 500 characters'; end if;
  if p ? 'accounts' and jsonb_typeof(p->'accounts'->'linkedItems') <> 'array' then return 'invalid Account References'; end if;
  if p ? 'supplierPoNo' and jsonb_typeof(p->'supplierPoNo'->'linkedItems') <> 'array' then return 'invalid Supplier PO References'; end if;
  return null;
exception when others then
  return 'malformed import row';
end $$;

create or replace function private.material_tracker_import_fingerprint(p_workspace_id uuid, p_rows jsonb)
returns text
language sql
stable security definer
set search_path = public, private, pg_temp
as $$
with input as (
  select nullif(btrim(x->>'id'),'') id, lower(btrim(coalesce(x->>'name',''))) nm
  from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) x
), relevant as (
  select m.id, m.name, m.updated_at
  from public.material_tracker_materials m
  where m.workspace_id=p_workspace_id and m.archived_at is null
    and (m.id in (select id from input where id is not null) or lower(btrim(m.name)) in (select nm from input where nm <> ''))
)
select md5(coalesce(string_agg(id||'|'||lower(btrim(name))||'|'||updated_at::text,';' order by id),'empty')) from relevant;
$$;

create or replace function public.material_tracker_import_preflight(p_workspace_id uuid, p_rows jsonb, p_mode text default 'create')
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  r jsonb; out_rows jsonb := '[]'::jsonb; err text; rid text; nm text; rn integer;
  by_id public.material_tracker_materials%rowtype; by_name public.material_tracker_materials%rowtype;
  id_count integer; name_count integer; mode text := lower(coalesce(p_mode,'create'));
begin
  if not private.material_tracker_can_write(p_workspace_id) then raise exception 'Material Tracker import denied' using errcode='42501'; end if;
  if mode not in ('create','upsert') then raise exception 'Unsupported import mode' using errcode='22023'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Import rows must be an array' using errcode='22023'; end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 1000 then raise exception 'Import must contain 1 to 1000 selected rows' using errcode='22023'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    rn := coalesce((r->>'rowNumber')::integer,0); rid := nullif(btrim(r->>'id'),''); nm := btrim(coalesce(r->>'name','')); err := private.material_tracker_import_row_error(r);
    select count(*) into name_count from jsonb_array_elements(p_rows) x where lower(btrim(x->>'name'))=lower(nm);
    select count(*) into id_count from jsonb_array_elements(p_rows) x where rid is not null and nullif(btrim(x->>'id'),'')=rid;
    if err is not null then out_rows := out_rows || jsonb_build_array(jsonb_build_object('rowNumber',rn,'status','invalid','code','server_validation','message',err)); continue; end if;
    if name_count > 1 or id_count > 1 then out_rows := out_rows || jsonb_build_array(jsonb_build_object('rowNumber',rn,'status','duplicate','code','duplicate_in_batch','message','Duplicate Material ID or Part Number exists in the selected batch.')); continue; end if;
    by_id := null; by_name := null;
    if rid is not null then select * into by_id from public.material_tracker_materials where workspace_id=p_workspace_id and id=rid and archived_at is null; end if;
    select * into by_name from public.material_tracker_materials where workspace_id=p_workspace_id and lower(btrim(name))=lower(nm) and archived_at is null limit 1;
    if mode='create' then
      if by_id.id is not null or by_name.id is not null then out_rows := out_rows || jsonb_build_array(jsonb_build_object('rowNumber',rn,'status','conflicting','code','existing_material','existingId',coalesce(by_id.id,by_name.id),'message','Material ID or Part Number already exists.')); else out_rows := out_rows || jsonb_build_array(jsonb_build_object('rowNumber',rn,'status','valid','action','create')); end if;
    else
      if by_id.id is not null then
        if by_name.id is not null and by_name.id <> by_id.id then out_rows := out_rows || jsonb_build_array(jsonb_build_object('rowNumber',rn,'status','conflicting','code','name_owned_by_other','existingId',by_name.id,'message','Part Number belongs to a different Material ID.')); else out_rows := out_rows || jsonb_build_array(jsonb_build_object('rowNumber',rn,'status','valid','action','update','existingId',by_id.id)); end if;
      elsif rid is not null and by_name.id is not null then out_rows := out_rows || jsonb_build_array(jsonb_build_object('rowNumber',rn,'status','conflicting','code','name_owned_by_other','existingId',by_name.id,'message','Part Number already belongs to another Material ID.'));
      elsif rid is null and by_name.id is not null then out_rows := out_rows || jsonb_build_array(jsonb_build_object('rowNumber',rn,'status','duplicate','code','existing_name_without_id','existingId',by_name.id,'message','Part Number already exists. Export/re-import with its Material ID to update it safely.'));
      else out_rows := out_rows || jsonb_build_array(jsonb_build_object('rowNumber',rn,'status','valid','action','create')); end if;
    end if;
  end loop;
  return jsonb_build_object('rows',out_rows,'fingerprint',private.material_tracker_import_fingerprint(p_workspace_id,p_rows),'mode',mode);
end $$;

create or replace function public.material_tracker_import_commit(p_workspace_id uuid, p_rows jsonb, p_mode text, p_expected_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  caller uuid:=auth.uid(); r jsonb; err text; rid text; nm text; gid text; clean jsonb; mode text:=lower(coalesce(p_mode,'create'));
  m public.material_tracker_materials%rowtype; by_name public.material_tracker_materials%rowtype; fx public.material_tracker_forex_rates%rowtype;
  created integer:=0; updated integer:=0; results jsonb:='[]'::jsonb; known_keys text[]:=array['sourceType','materialDescription','brand','quantity','buyingPrice','currency','shippingCost','shippingCostCurrency','leadtimeInWeeks','dateRequired','rfqRefNo','vendorDetails','accounts','supplierPoNo'];
begin
  if caller is null or not private.material_tracker_can_write(p_workspace_id) then raise exception 'Material Tracker import denied' using errcode='42501'; end if;
  if mode not in ('create','upsert') then raise exception 'Unsupported import mode' using errcode='22023'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>1000 then raise exception 'Import must contain 1 to 1000 rows' using errcode='22023'; end if;
  if coalesce(p_expected_fingerprint,'') <> private.material_tracker_import_fingerprint(p_workspace_id,p_rows) then raise exception 'Import preview is stale; run preflight again before committing' using errcode='40001'; end if;
  if exists(select 1 from (select lower(btrim(x->>'name')) k,count(*) c from jsonb_array_elements(p_rows) x group by 1 having count(*)>1) q) then raise exception 'Selected import contains duplicate Part Numbers' using errcode='22023'; end if;
  if exists(select 1 from (select nullif(btrim(x->>'id'),'') k,count(*) c from jsonb_array_elements(p_rows) x where nullif(btrim(x->>'id'),'') is not null group by 1 having count(*)>1) q) then raise exception 'Selected import contains duplicate Material IDs' using errcode='22023'; end if;
  select * into fx from public.material_tracker_forex_rates where workspace_id=p_workspace_id;
  for r in select value from jsonb_array_elements(p_rows) loop
    err:=private.material_tracker_import_row_error(r); if err is not null then raise exception 'Import row % invalid: %',coalesce(r->>'rowNumber','?'),err using errcode='22023'; end if;
    rid:=nullif(btrim(r->>'id'),''); nm:=btrim(r->>'name'); gid:=r->>'groupId'; clean:=r->'payload';
    select * into by_name from public.material_tracker_materials where workspace_id=p_workspace_id and archived_at is null and lower(btrim(name))=lower(nm) limit 1;
    m:=null; if rid is not null then select * into m from public.material_tracker_materials where workspace_id=p_workspace_id and id=rid and archived_at is null; end if;
    if mode='create' then if m.id is not null or by_name.id is not null then raise exception 'Import conflict for Part Number %',nm using errcode='23505'; end if;
    elsif m.id is not null then if by_name.id is not null and by_name.id<>m.id then raise exception 'Import Part Number conflict for %',nm using errcode='23505'; end if;
    elsif by_name.id is not null then raise exception 'Import Part Number conflict for %',nm using errcode='23505'; end if;
    clean := clean - 'exRateUsd' - 'exRateEur';
    if m.id is not null then
      update public.material_tracker_materials set name=nm,group_id=gid,group_title=private.material_tracker_group_title(gid),payload=(m.payload - known_keys) || clean,updated_at=now() where workspace_id=p_workspace_id and id=m.id returning * into m;
      insert into public.material_tracker_activity(workspace_id,material_id,text,actor_user_id) values(p_workspace_id,m.id,'Material updated by atomic file import.',caller); updated:=updated+1;
    else
      if fx.usd is not null then clean:=jsonb_set(clean,'{exRateUsd}',to_jsonb(to_char(fx.usd,'FM999999990.00')),true); end if;
      if fx.eur is not null then clean:=jsonb_set(clean,'{exRateEur}',to_jsonb(to_char(fx.eur,'FM999999990.00')),true); end if;
      if rid is null then insert into public.material_tracker_materials(workspace_id,name,group_id,group_title,payload,creator_user_id) values(p_workspace_id,nm,gid,private.material_tracker_group_title(gid),clean,caller) returning * into m;
      else insert into public.material_tracker_materials(workspace_id,id,name,group_id,group_title,payload,creator_user_id) values(p_workspace_id,rid,nm,gid,private.material_tracker_group_title(gid),clean,caller) returning * into m; end if;
      insert into public.material_tracker_activity(workspace_id,material_id,text,actor_user_id) values(p_workspace_id,m.id,'Material created by atomic file import.',caller); created:=created+1;
    end if;
    results:=results||jsonb_build_array(private.material_tracker_material_json(m));
  end loop;
  perform private.material_tracker_record_metric(p_workspace_id);
  return jsonb_build_object('ok',true,'created',created,'updated',updated,'count',created+updated,'items',results);
end $$;

revoke all on function public.material_tracker_import_preflight(uuid,jsonb,text) from public, anon;
revoke all on function public.material_tracker_import_commit(uuid,jsonb,text,text) from public, anon;
grant execute on function public.material_tracker_import_preflight(uuid,jsonb,text) to authenticated;
grant execute on function public.material_tracker_import_commit(uuid,jsonb,text,text) to authenticated;;
