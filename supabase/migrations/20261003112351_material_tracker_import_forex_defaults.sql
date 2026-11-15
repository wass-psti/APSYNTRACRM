-- Preserve normal Material Tracker forex semantics during atomic import.
-- Blank exchange-rate cells are omitted client-side. Creates inherit current workspace rates; updates preserve existing rates.
create or replace function public.material_tracker_import_materials_atomic(
  p_workspace_id uuid,
  p_rows jsonb,
  p_spec_version text default '1.0'
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  caller uuid := auth.uid();
  elem jsonb; fields jsonb; action_name text; material_id text; group_id text; nm text;
  m public.material_tracker_materials%rowtype;
  fx public.material_tracker_forex_rates%rowtype;
  created_count integer := 0; updated_count integer := 0; row_no integer := 0;
  results jsonb := '[]'::jsonb;
begin
  if not private.material_tracker_can_write(p_workspace_id) then raise exception 'Material Tracker bulk import denied' using errcode='42501'; end if;
  if p_spec_version <> '1.0' then raise exception 'Unsupported Material Tracker import specification version: %', p_spec_version using errcode='22023'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Import rows must be a JSON array' using errcode='22023'; end if;
  if jsonb_array_length(p_rows) < 1 then raise exception 'Import contains no commit-eligible rows' using errcode='22023'; end if;
  if jsonb_array_length(p_rows) > 10000 then raise exception 'Import exceeds 10000-row transaction limit' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('material-tracker-import:' || p_workspace_id::text, 0));
  if exists (
    select 1 from (
      select lower(btrim(x->'fields'->>'name')) as name_key, count(*) c
      from jsonb_array_elements(p_rows) x
      group by lower(btrim(x->'fields'->>'name'))
      having count(*) > 1
    ) d
  ) then raise exception 'Import batch contains duplicate Part Numbers' using errcode='23505'; end if;

  for elem in select value from jsonb_array_elements(p_rows) loop
    row_no := row_no + 1;
    action_name := lower(coalesce(elem->>'action',''));
    if action_name not in ('create','update') then raise exception 'Import row % has invalid action', row_no using errcode='22023'; end if;
    group_id := coalesce(nullif(elem->>'groupId',''),'new_group');
    if group_id not in ('new_group','topics') then raise exception 'Import row % has invalid group', row_no using errcode='22023'; end if;
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

  select * into fx from public.material_tracker_forex_rates where workspace_id=p_workspace_id;
  row_no := 0;
  for elem in select value from jsonb_array_elements(p_rows) loop
    row_no := row_no + 1;
    action_name := lower(elem->>'action'); group_id := coalesce(nullif(elem->>'groupId',''),'new_group');
    fields := private.material_tracker_import_validate_fields(elem->'fields'); nm := fields->>'name'; material_id := nullif(elem->>'materialId','');
    if action_name='create' then
      if not (fields ? 'exRateUsd') and fx.usd is not null then fields:=jsonb_set(fields,'{exRateUsd}',to_jsonb(to_char(fx.usd,'FM999999990.00')),true); end if;
      if not (fields ? 'exRateEur') and fx.eur is not null then fields:=jsonb_set(fields,'{exRateEur}',to_jsonb(to_char(fx.eur,'FM999999990.00')),true); end if;
      insert into public.material_tracker_materials(workspace_id,name,group_id,group_title,payload,creator_user_id)
      values(p_workspace_id,nm,group_id,private.material_tracker_group_title(group_id),fields-'name',caller)
      returning * into m;
      insert into public.material_tracker_activity(workspace_id,material_id,text,actor_user_id) values(p_workspace_id,m.id,'Material created by atomic import.',caller);
      created_count := created_count + 1;
    else
      select * into m from public.material_tracker_materials where workspace_id=p_workspace_id and id=material_id and archived_at is null for update;
      update public.material_tracker_materials set
        name=nm,
        group_id=group_id,
        group_title=private.material_tracker_group_title(group_id),
        payload=(payload || (fields-'name')),
        updated_at=now()
      where workspace_id=p_workspace_id and id=material_id returning * into m;
      insert into public.material_tracker_activity(workspace_id,material_id,text,actor_user_id) values(p_workspace_id,m.id,'Material updated by atomic import.',caller);
      updated_count := updated_count + 1;
    end if;
    results := results || jsonb_build_array(private.material_tracker_material_json(m));
  end loop;
  perform private.material_tracker_record_metric(p_workspace_id);
  return jsonb_build_object('ok',true,'created',created_count,'updated',updated_count,'total',created_count+updated_count,'items',results,'specVersion',p_spec_version);
end $$;

revoke all on function public.material_tracker_import_materials_atomic(uuid,jsonb,text) from public, anon;
grant execute on function public.material_tracker_import_materials_atomic(uuid,jsonb,text) to authenticated;;
