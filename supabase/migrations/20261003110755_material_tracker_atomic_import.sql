-- Material Tracker production data exchange: atomic bulk import and active Part Number uniqueness.
-- Client preview performs detailed classification; this RPC revalidates server-side and commits all-or-nothing.

create unique index if not exists material_tracker_materials_workspace_active_name_uq
on public.material_tracker_materials (workspace_id, lower(btrim(name)))
where archived_at is null;

create or replace function private.material_tracker_import_validate_fields(p_fields jsonb)
returns jsonb
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  required text[] := array['name','sourceType','materialDescription','brand','quantity','buyingPrice','currency'];
  allowed text[] := array['name','sourceType','materialDescription','brand','quantity','buyingPrice','currency','shippingCost','shippingCostCurrency','leadtimeInWeeks','dateRequired','rfqRefNo','vendorDetails','exRateUsd','exRateEur','accounts','supplierPoNo'];
  k text; n numeric; d date;
begin
  if jsonb_typeof(f) <> 'object' then raise exception 'Import fields must be a JSON object' using errcode='22023'; end if;
  for k in select jsonb_object_keys(f) loop
    if not (k = any(allowed)) then raise exception 'Unsupported import field: %', k using errcode='22023'; end if;
  end loop;
  foreach k in array required loop
    if not (f ? k) or nullif(btrim(coalesce(f->>k,'')),'') is null then raise exception 'Required import field missing: %', k using errcode='22023'; end if;
  end loop;
  if length(btrim(f->>'name')) > 240 then raise exception 'Part Number exceeds 240 characters' using errcode='22023'; end if;
  if length(btrim(f->>'materialDescription')) > 4000 then raise exception 'Material Description exceeds 4000 characters' using errcode='22023'; end if;
  if length(btrim(f->>'brand')) > 240 then raise exception 'Brand exceeds 240 characters' using errcode='22023'; end if;
  if length(coalesce(f->>'rfqRefNo','')) > 240 then raise exception 'RFQ Ref No exceeds 240 characters' using errcode='22023'; end if;
  if length(coalesce(f->>'vendorDetails','')) > 1000 then raise exception 'Vendor Details exceeds 1000 characters' using errcode='22023'; end if;
  if f->>'sourceType' not in ('Local','Import') then raise exception 'Source Type must be Local or Import' using errcode='22023'; end if;
  if upper(f->>'currency') not in ('PHP','USD','EUR') then raise exception 'Currency must be PHP, USD, or EUR' using errcode='22023'; end if;
  if coalesce(f->>'shippingCostCurrency','PHP') not in ('PHP','USD','EUR') then raise exception 'Shipping Currency must be PHP, USD, or EUR' using errcode='22023'; end if;
  begin n := (f->>'quantity')::numeric; exception when others then raise exception 'Quantity must be numeric' using errcode='22023'; end;
  if n <= 0 or n > 1000000000 then raise exception 'Quantity must be > 0 and <= 1000000000' using errcode='22023'; end if;
  begin n := (f->>'buyingPrice')::numeric; exception when others then raise exception 'Buying Price must be numeric' using errcode='22023'; end;
  if n <= 0 or n > 1000000000000 then raise exception 'Buying Price must be > 0 and <= 1000000000000' using errcode='22023'; end if;
  if f ? 'shippingCost' and f->'shippingCost' <> 'null'::jsonb then
    begin n := (f->>'shippingCost')::numeric; exception when others then raise exception 'Shipping Cost must be numeric' using errcode='22023'; end;
    if n < 0 or n > 1000000000000 then raise exception 'Shipping Cost must be >= 0 and <= 1000000000000' using errcode='22023'; end if;
  end if;
  if f ? 'leadtimeInWeeks' and f->'leadtimeInWeeks' <> 'null'::jsonb then
    begin n := (f->>'leadtimeInWeeks')::numeric; exception when others then raise exception 'Lead Time Weeks must be an integer' using errcode='22023'; end;
    if n <> trunc(n) or n < 0 or n > 5200 then raise exception 'Lead Time Weeks must be a whole number from 0 to 5200' using errcode='22023'; end if;
  end if;
  foreach k in array array['exRateUsd','exRateEur'] loop
    if f ? k and f->k <> 'null'::jsonb then
      begin n := (f->>k)::numeric; exception when others then raise exception '% must be numeric', k using errcode='22023'; end;
      if n <= 0 or n > 1000000 then raise exception '% must be > 0 and <= 1000000', k using errcode='22023'; end if;
    end if;
  end loop;
  if f ? 'dateRequired' and nullif(f->>'dateRequired','') is not null then
    if (f->>'dateRequired') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Date Required must use YYYY-MM-DD' using errcode='22023'; end if;
    begin d := (f->>'dateRequired')::date; exception when others then raise exception 'Date Required is invalid' using errcode='22023'; end;
  end if;
  foreach k in array array['accounts','supplierPoNo'] loop
    if f ? k and f->k <> 'null'::jsonb then
      if jsonb_typeof(f->k) <> 'object' or jsonb_typeof(coalesce(f->k->'linkedItems','[]'::jsonb)) <> 'array' then raise exception '% must contain a linkedItems array', k using errcode='22023'; end if;
      if exists(select 1 from jsonb_array_elements(coalesce(f->k->'linkedItems','[]'::jsonb)) x where jsonb_typeof(x) <> 'object' or nullif(btrim(coalesce(x->>'name','')),'') is null) then raise exception '% linkedItems require nonblank names', k using errcode='22023'; end if;
    end if;
  end loop;
  f := jsonb_set(f,'{name}',to_jsonb(btrim(f->>'name')),true);
  f := jsonb_set(f,'{sourceType}',to_jsonb(f->>'sourceType'),true);
  f := jsonb_set(f,'{materialDescription}',to_jsonb(btrim(f->>'materialDescription')),true);
  f := jsonb_set(f,'{brand}',to_jsonb(btrim(f->>'brand')),true);
  f := jsonb_set(f,'{currency}',to_jsonb(upper(f->>'currency')),true);
  if f ? 'shippingCostCurrency' and f->'shippingCostCurrency' <> 'null'::jsonb then f := jsonb_set(f,'{shippingCostCurrency}',to_jsonb(upper(f->>'shippingCostCurrency')),true); end if;
  return f;
end $$;

revoke all on function private.material_tracker_import_validate_fields(jsonb) from public, anon, authenticated;

create or replace function public.material_tracker_import_materials_atomic(p_workspace_id uuid,p_rows jsonb,p_spec_version text default '1.0') returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  caller uuid := auth.uid(); elem jsonb; fields jsonb; action_name text; material_id text; group_id text; nm text;
  m public.material_tracker_materials%rowtype; created_count integer := 0; updated_count integer := 0; row_no integer := 0; results jsonb := '[]'::jsonb;
begin
  if not private.material_tracker_can_write(p_workspace_id) then raise exception 'Material Tracker bulk import denied' using errcode='42501'; end if;
  if p_spec_version <> '1.0' then raise exception 'Unsupported Material Tracker import specification version: %', p_spec_version using errcode='22023'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Import rows must be a JSON array' using errcode='22023'; end if;
  if jsonb_array_length(p_rows) < 1 then raise exception 'Import contains no commit-eligible rows' using errcode='22023'; end if;
  if jsonb_array_length(p_rows) > 10000 then raise exception 'Import exceeds 10000-row transaction limit' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('material-tracker-import:' || p_workspace_id::text, 0));
  if exists (select 1 from (select lower(btrim(x->'fields'->>'name')) as name_key, count(*) c from jsonb_array_elements(p_rows) x group by lower(btrim(x->'fields'->>'name')) having count(*) > 1) d) then raise exception 'Import batch contains duplicate Part Numbers' using errcode='23505'; end if;
  for elem in select value from jsonb_array_elements(p_rows) loop
    row_no := row_no + 1; action_name := lower(coalesce(elem->>'action',''));
    if action_name not in ('create','update') then raise exception 'Import row % has invalid action', row_no using errcode='22023'; end if;
    group_id := coalesce(nullif(elem->>'groupId',''),'new_group'); if group_id not in ('new_group','topics') then raise exception 'Import row % has invalid group', row_no using errcode='22023'; end if;
    begin fields := private.material_tracker_import_validate_fields(elem->'fields'); exception when others then raise exception 'Import row % rejected: %', row_no, sqlerrm using errcode='22023'; end;
    nm := fields->>'name'; material_id := nullif(elem->>'materialId','');
    if action_name='create' then
      if material_id is not null then raise exception 'Import row % create action must not include Material ID', row_no using errcode='22023'; end if;
      if exists(select 1 from public.material_tracker_materials where workspace_id=p_workspace_id and archived_at is null and lower(btrim(name))=lower(btrim(nm))) then raise exception 'Import row % conflicts with existing Part Number %', row_no, nm using errcode='23505'; end if;
    else
      if material_id is null then raise exception 'Import row % update action requires Material ID', row_no using errcode='22023'; end if;
      if not exists(select 1 from public.material_tracker_materials where workspace_id=p_workspace_id and id=material_id and archived_at is null) then raise exception 'Import row % Material ID not found', row_no using errcode='P0002'; end if;
      if exists(select 1 from public.material_tracker_materials where workspace_id=p_workspace_id and archived_at is null and id<>material_id and lower(btrim(name))=lower(btrim(nm))) then raise exception 'Import row % Part Number conflicts with another material', row_no using errcode='23505'; end if;
    end if;
  end loop;
  row_no := 0;
  for elem in select value from jsonb_array_elements(p_rows) loop
    row_no := row_no + 1; action_name := lower(elem->>'action'); group_id := coalesce(nullif(elem->>'groupId',''),'new_group'); fields := private.material_tracker_import_validate_fields(elem->'fields'); nm := fields->>'name'; material_id := nullif(elem->>'materialId','');
    if action_name='create' then
      insert into public.material_tracker_materials(workspace_id,name,group_id,group_title,payload,creator_user_id) values(p_workspace_id,nm,group_id,private.material_tracker_group_title(group_id),fields-'name',caller) returning * into m;
      insert into public.material_tracker_activity(workspace_id,material_id,text,actor_user_id) values(p_workspace_id,m.id,'Material created by atomic import.',caller); created_count := created_count + 1;
    else
      select * into m from public.material_tracker_materials where workspace_id=p_workspace_id and id=material_id and archived_at is null for update;
      update public.material_tracker_materials set name=nm,group_id=group_id,group_title=private.material_tracker_group_title(group_id),payload=(payload || (fields-'name')),updated_at=now() where workspace_id=p_workspace_id and id=material_id returning * into m;
      insert into public.material_tracker_activity(workspace_id,material_id,text,actor_user_id) values(p_workspace_id,m.id,'Material updated by atomic import.',caller); updated_count := updated_count + 1;
    end if;
    results := results || jsonb_build_array(private.material_tracker_material_json(m));
  end loop;
  perform private.material_tracker_record_metric(p_workspace_id);
  return jsonb_build_object('ok',true,'created',created_count,'updated',updated_count,'total',created_count+updated_count,'items',results,'specVersion',p_spec_version);
end $$;

revoke all on function public.material_tracker_import_materials_atomic(uuid,jsonb,text) from public, anon;
grant execute on function public.material_tracker_import_materials_atomic(uuid,jsonb,text) to authenticated;;
